const express = require("express");
const router = express.Router();
const Match = require("../models/Match");
const Scholarship = require("../models/Scholarship");
const { protect } = require("../middleware/auth");

// Clear any old in-memory cache on reload
const advisorCache = new Map();

function getGroqClient() {
  if (!process.env.GROQ_API_KEY) return null;
  try {
    const Groq = require("groq-sdk");
    return new Groq({ apiKey: process.env.GROQ_API_KEY });
  } catch {
    return null;
  }
}

// POST /api/advisor/ask
router.post("/ask", protect, async (req, res) => {
  try {
    const { question, messages = [] } = req.body;
    if (!question || question.trim().length < 2) {
      return res.status(400).json({ success: false, message: "Please type a question." });
    }

    const user = req.user;
    const cacheKey = `${user._id}:${question.trim().toLowerCase()}`;

    if (advisorCache.has(cacheKey)) {
      const cachedVal = advisorCache.get(cacheKey);
      const replyStr = typeof cachedVal === "string" ? cachedVal : JSON.stringify(cachedVal);
      return res.json({ success: true, cached: true, reply: replyStr });
    }

    // Fetch user's matched scholarships
    const topMatches = await Match.find({ user_id: user._id, eligible: true })
      .sort({ roi_rank: 1 })
      .limit(15)
      .populate("scholarship_id")
      .lean();

    const now = new Date();

    const matchLines = topMatches.map((m, i) => {
      const s = m.scholarship_id;
      if (!s) return null;
      const daysLeft = s.deadline
        ? Math.round((new Date(s.deadline) - now) / (1000 * 60 * 60 * 24))
        : null;
      return `${i + 1}. ${s.name} | Amount: ${s.amount_string || "Varies"} | Match: ${m.match_score}% | Win odds: ${m.win_probability || 0}% | Expected: ₹${((m.expected_value || 0) / 100000).toFixed(1)}L | Deadline: ${s.deadline || "TBA"}${daysLeft !== null && !isNaN(daysLeft) ? ` (${daysLeft} days away)` : ""}`;
    }).filter(Boolean).join("\n");

    const urgentDeadlines = topMatches
      .map((m) => {
        const s = m.scholarship_id;
        if (!s?.deadline) return null;
        const days = Math.round((new Date(s.deadline) - now) / (1000 * 60 * 60 * 24));
        if (isNaN(days)) return null;
        return { name: s.name, days, deadline: s.deadline, amount: s.amount_string };
      })
      .filter((d) => d && d.days >= 0 && d.days <= 90)
      .sort((a, b) => a.days - b.days);

    const calendarLines = urgentDeadlines.length
      ? urgentDeadlines.map((d) => `- ${d.name}: due ${d.deadline} (${d.days} days left) — ${d.amount || "varies"}`).join("\n")
      : "No specific upcoming deadlines in the next 90 days.";

    const systemPrompt = `You are Maester Atlas — a sharp, helpful, and wittily respectful scholarship advisor for Indian students.

== STUDENT PROFILE ==
Education: ${user.target_education_level || "Not specified"} (${user.current_class_or_year || ""})
Field: ${user.field_of_study || "Not specified"}
GPA: ${user.gpa_percentage ? user.gpa_percentage + "%" : "Not specified"}
Income: ${user.family_income_annual ? "₹" + (user.family_income_annual / 100000).toFixed(1) + "L/yr" : "Not specified"}
Category: ${user.category || "General"} | Domicile: ${user.state || "India"}

== ELIGIBLE SCHOLARSHIPS (${topMatches.length} matches) ==
${matchLines || "No matches yet. User needs to run the eligibility calculator."}

== UPCOMING DEADLINES ==
${calendarLines}

== INSTRUCTIONS ==
- Answer directly and conversationally using Markdown (**bold**, bullet points).
- Refer to their ACTUAL scholarships and deadlines by name and exact date when answering.
- Keep responses under 200 words.`;

    const groq = getGroqClient();
    let reply = "";

    if (groq) {
      try {
        const conversationMessages = [
          { role: "system", content: systemPrompt },
          ...messages.slice(-6).map((m) => ({
            role: m.role === "user" ? "user" : "assistant",
            content: String(m.content || ""),
          })),
          { role: "user", content: question },
        ];

        const completion = await groq.chat.completions.create({
          model: "llama-3.1-8b-instant",
          max_tokens: 450,
          temperature: 0.6,
          messages: conversationMessages,
        });

        reply = completion.choices[0]?.message?.content?.trim() || "";
      } catch (err) {
        console.warn("Groq API error:", err.message);
      }
    }

    if (!reply) {
      reply = buildSmartFallback(question, user, topMatches, urgentDeadlines);
    }

    advisorCache.set(cacheKey, reply);
    res.json({ success: true, reply });
  } catch (err) {
    console.error("Advisor route error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

function buildSmartFallback(question, user, topMatches, urgentDeadlines) {
  const q = question.toLowerCase();
  const top3 = topMatches.slice(0, 3);

  if (q.match(/^(hi|hello|hey|greetings|namaste)/)) {
    return `Greetings! I am **Maester Atlas**. 📜\n\nI have loaded your profile and found **${topMatches.length} eligible scholarships** for you. How may I assist your quest today?`;
  }

  if (q.match(/deadline|urgent|calendar|when|due/)) {
    if (urgentDeadlines.length) {
      const list = urgentDeadlines.slice(0, 5).map(d => `- **${d.name}** — due **${d.deadline}** (${d.days} days remaining)`).join("\n");
      return `Here are your most urgent deadlines:\n\n${list}\n\nMake sure to prepare your income certificate and marksheets early!`;
    }
    return `You have **${topMatches.length} eligible scholarships**! Most currently have flexible or TBA deadlines. Check the Repository page for details.`;
  }

  if (q.match(/roi|best|first|top|priority|recommend/)) {
    if (top3.length) {
      const list = top3.map((m, i) => `${i + 1}. **${m.scholarship_id?.name}** — ${m.scholarship_id?.amount_string || "Varies"} (${m.match_score}% match)`).join("\n");
      return `Here are your top recommended scholarships by ROI:\n\n${list}\n\nStart with these for the highest probability of funding!`;
    }
    return `Please complete the 15-question Eligibility Calculator first so I can rank scholarships specifically for your profile!`;
  }

  if (topMatches.length) {
    const names = topMatches.slice(0, 3).map(m => `**${m.scholarship_id?.name}**`).join(", ");
    return `Based on your profile, you qualify for ${topMatches.length} opportunities including ${names}. Focus on assembling your documents (income certificate, marksheets, ID) so you can apply promptly!`;
  }

  return `To get personalized recommendations, please complete the **Eligibility Calculator** first!`;
}

router.get("/prompts", protect, async (req, res) => {
  res.json({
    success: true,
    prompts: [
      "Which 3 scholarships give me the highest ROI?",
      "What are my urgent deadlines?",
      "What documents should I prepare first?",
      "How do I improve my win probability?",
    ],
  });
});

module.exports = router;
