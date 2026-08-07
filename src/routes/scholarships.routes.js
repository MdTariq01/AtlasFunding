const express = require("express");
const path = require("path");
const router = express.Router();
const Scholarship = require("../models/Scholarship");
const Match = require("../models/Match");
const EligibilityEngine = require("../engine/eligibility-engine");
const ScholarshipSearchEngine = require("../engine/search-engine");
const { protect, optionalAuth } = require("../middleware/auth");
const { publicLimiter, authUserLimiter } = require("../config/rate-limit");

const engine = new EligibilityEngine();

function getGroqClient() {
  if (!process.env.GROQ_API_KEY) return null;
  const Groq = require("groq-sdk");
  return new Groq({ apiKey: process.env.GROQ_API_KEY });
}

// POST /api/repository/scrape-url — Scrape and add any URL directly to running DB instance
router.post("/scrape-url", authUserLimiter, optionalAuth, async (req, res) => {
  try {
    const { url } = req.body;
    if (!url || !url.startsWith("http")) {
      return res.status(400).json({ success: false, message: "Valid URL starting with http:// or https:// is required." });
    }

    const { processSource } = require(path.resolve(__dirname, "../../scripts/scrape"));
    const hostname = new URL(url).hostname;
    const added = await processSource({ url, name: hostname });

    if (!added) {
      const existing = await Scholarship.findOne({ source_url: url }).lean();
      return res.json({
        success: true,
        message: existing ? `Scholarship "${existing.name}" already exists in database!` : "Could not extract scholarship from page.",
        added: false,
        scholarship: existing,
      });
    }

    const newScholarship = await Scholarship.findOne({ source_url: url }).sort({ createdAt: -1 }).lean();

    res.json({
      success: true,
      message: `Successfully scraped and added "${newScholarship?.name || 'New Scholarship'}"!`,
      added: true,
      scholarship: newScholarship,
    });
  } catch (err) {
    console.error("Scrape URL endpoint error:", err);
    res.status(500).json({ success: false, message: err.message || "Failed to scrape URL" });
  }
});

// POST /api/repository/add — Add one or multiple scholarships manually via JSON payload
router.post("/add", authUserLimiter, optionalAuth, async (req, res) => {
  try {
    const items = Array.isArray(req.body) ? req.body : [req.body];
    let created = 0;
    let skipped = 0;
    const addedList = [];

    for (const item of items) {
      if (!item.name) continue;
      const existing = await Scholarship.findOne({ name: item.name });
      if (existing) {
        skipped++;
        continue;
      }
      const newDoc = await Scholarship.create({ ...item, verified: true });
      addedList.push(newDoc);
      created++;
    }

    res.json({
      success: true,
      message: `Added ${created} scholarship(s) to database. (${skipped} skipped as duplicate)`,
      created,
      skipped,
      scholarships: addedList,
    });
  } catch (err) {
    console.error("Add scholarship error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/repository — browse all scholarships
router.get("/", publicLimiter, optionalAuth, async (req, res) => {
  try {
    const {
      filter = "all",
      education_level,
      country,
      field_of_study,
      min_amount,
      cover_type,
      sort_by = "amount",
      page = 1,
      limit = 20,
    } = req.query;

    const query = {};

    if (filter && filter.toLowerCase() !== "all") query.provider_type = filter.toLowerCase();
    if (education_level) query.$or = [{ education_level }, { education_level: "any" }];
    if (country) query.country = country;
    if (field_of_study) query.field_of_study = { $in: [field_of_study, "All"] };
    if (min_amount) query.amount_value = { $gte: Number(min_amount) };
    if (cover_type) query.cover_type = cover_type;

    const sortMap = {
      amount: { amount_value: -1 },
      deadline: { deadline: 1 },
      recent: { updatedAt: -1 },
    };
    const sortObj = sortMap[sort_by] || sortMap.amount;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [scholarships, total] = await Promise.all([
      Scholarship.find(query).sort(sortObj).skip(skip).limit(parseInt(limit)).lean(),
      Scholarship.countDocuments(query),
    ]);

    let enriched = scholarships;
    if (req.user) {
      enriched = scholarships.map((s) => {
        const result = engine.checkEligibility(req.user.toObject ? req.user.toObject() : req.user, s);
        return {
          ...s,
          match_score: result.matchScore,
          win_odds: result.winOdds,
          eligible: result.eligible,
        };
      });
    }

    const allScholarships = await Scholarship.find({}).select("amount_value").lean();
    const totalFunding = allScholarships.reduce((sum, s) => sum + (s.amount_value || 0), 0);

    res.json({
      success: true,
      stats: {
        total_opportunities: total,
        total_award_value_crore: (totalFunding / 10000000).toFixed(2),
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
      scholarships: enriched,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/repository/search — semantic search
router.get("/search", publicLimiter, optionalAuth, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ success: false, message: "Query parameter 'q' is required." });

    const searchEngine = new ScholarshipSearchEngine(getGroqClient());
    const allScholarships = await Scholarship.find({}).lean();
    const { parsedQuery, matches } = await searchEngine.search(q, allScholarships, req.user);

    let enriched = matches;
    if (req.user) {
      enriched = matches.map((s) => {
        const result = engine.checkEligibility(req.user.toObject ? req.user.toObject() : req.user, s);
        return { ...s, match_score: result.matchScore, win_odds: result.winOdds, eligible: result.eligible };
      });
    }

    res.json({
      success: true,
      query: q,
      parsed_intent: parsedQuery,
      total_results: enriched.length,
      scholarships: enriched.slice(0, 50),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/repository/matched/me — user's matched scholarships
router.get("/matched/me", authUserLimiter, protect, async (req, res) => {
  try {
    const { eligible_only = "true", sort_by = "roi", page = 1, limit = 20 } = req.query;

    const matchQuery = { user_id: req.user._id };
    if (eligible_only === "true") matchQuery.eligible = true;

    const sortMap = {
      roi: { roi_rank: 1 },
      value: { expected_value: -1 },
      score: { match_score: -1 },
    };
    const sortObj = sortMap[sort_by] || sortMap.roi;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [matches, total] = await Promise.all([
      Match.find(matchQuery)
        .sort(sortObj)
        .skip(skip)
        .limit(parseInt(limit))
        .populate("scholarship_id")
        .lean(),
      Match.countDocuments(matchQuery),
    ]);

    res.json({
      success: true,
      total,
      page: parseInt(page),
      matches: matches
        .filter((m) => m.scholarship_id !== null)
        .map((m) => ({
          ...m.scholarship_id,
          match_score: m.match_score,
          win_odds: m.win_probability,
          expected_value: m.expected_value,
          roi_rank: m.roi_rank,
          blockers: m.blockers_reasons,
        })),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/repository/:id — single scholarship
router.get("/:id", publicLimiter, optionalAuth, async (req, res) => {
  try {
    const scholarship = await Scholarship.findById(req.params.id).lean();
    if (!scholarship) return res.status(404).json({ success: false, message: "Scholarship not found." });

    let eligibilityData = null;
    if (req.user) {
      eligibilityData = engine.checkEligibility(
        req.user.toObject ? req.user.toObject() : req.user,
        scholarship
      );
    }

    const deadlineDate = scholarship.deadline ? new Date(scholarship.deadline) : null;
    const checklist = (scholarship.required_documents || []).map((doc, i) => {
      let dueDate = null;
      if (deadlineDate && !isNaN(deadlineDate)) {
        const daysBefore = Math.max(7, 14 - i * 2);
        dueDate = new Date(deadlineDate);
        dueDate.setDate(dueDate.getDate() - daysBefore);
        dueDate = dueDate.toISOString().split("T")[0];
      }
      return { document: doc, due_by: dueDate, status: "pending" };
    });

    res.json({
      success: true,
      scholarship,
      eligibility: eligibilityData,
      application_checklist: checklist,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
