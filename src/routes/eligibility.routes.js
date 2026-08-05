const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Scholarship = require("../models/Scholarship");
const Match = require("../models/Match");
const EligibilityEngine = require("../engine/eligibility-engine");
const { protect } = require("../middleware/auth");

const engine = new EligibilityEngine();

// The 15 questions
const QUESTIONS = [
  {
    q: 1,
    field: "education_level",
    text: "Where are you studying right now?",
    description: "This sets the base layer of your eligibility graph.",
    type: "single_select",
    options: [
      { label: "School (Class 8–12)", value: "school" },
      { label: "Diploma / Polytechnic", value: "diploma" },
      { label: "Undergraduate (B.Tech, B.Sc, BA…)", value: "undergrad" },
      { label: "Postgraduate (M.Tech, MBA, M.Sc…)", value: "postgrad" },
      { label: "Doctorate / Research", value: "doctorate" },
    ],
  },
  {
    q: 2,
    field: "target_education_level",
    text: "What are you funding next?",
    description: "The level you want a scholarship for.",
    type: "single_select",
    options: [
      { label: "Completing school years", value: "school" },
      { label: "Diploma / Polytechnic", value: "diploma" },
      { label: "Bachelor's degree", value: "undergrad" },
      { label: "Master's degree", value: "postgrad" },
      { label: "PhD / Research programme", value: "doctorate" },
    ],
  },
  {
    q: 3,
    field: "field_of_study",
    text: "What's your field of study?",
    description: "Many scholarships are field-specific.",
    type: "single_select",
    options: [
      { label: "Computer Science / IT", value: "Computer Science" },
      { label: "Engineering", value: "Engineering" },
      { label: "Medicine / Health Sciences", value: "Medicine" },
      { label: "Law", value: "Law" },
      { label: "Business / Management", value: "Business" },
      { label: "Arts & Humanities", value: "Arts & Humanities" },
      { label: "Pure Sciences", value: "Science" },
      { label: "Data Science / AI", value: "Data Science" },
      { label: "Agriculture", value: "Agriculture" },
      { label: "Other", value: "Other" },
    ],
  },
  {
    q: 4,
    field: "preferred_countries",
    text: "Where do you want to study?",
    description: "Select all that apply.",
    type: "multi_select",
    options: [
      { label: "India", value: "India" },
      { label: "USA", value: "USA" },
      { label: "Canada", value: "Canada" },
      { label: "UK", value: "UK" },
      { label: "Australia", value: "Australia" },
      { label: "Germany", value: "Germany" },
      { label: "Singapore", value: "Singapore" },
      { label: "Anywhere", value: "Any" },
    ],
  },
  {
    q: 5,
    field: "family_income_annual",
    text: "What's your family's annual income?",
    description: "Used to check income-based eligibility. We never share this.",
    type: "single_select",
    options: [
      { label: "Less than ₹5 lakh", value: 300000 },
      { label: "₹5–10 lakh", value: 750000 },
      { label: "₹10–25 lakh", value: 1750000 },
      { label: "₹25–50 lakh", value: 3750000 },
      { label: "More than ₹50 lakh", value: 6000000 },
    ],
  },
  {
    q: 6,
    field: "gpa_percentage",
    text: "What's your current GPA or percentage?",
    description: "Enter as a percentage (0–100) or convert your 4.0 GPA × 25.",
    type: "number",
    unit: "% (e.g. 85 or 92.5)",
    min: 0,
    max: 100,
  },
  {
    q: 7,
    field: "has_disability",
    text: "Do you have any disability?",
    description: "Several scholarships are exclusively for persons with disabilities.",
    type: "single_select",
    options: [
      { label: "No", value: false },
      { label: "Yes – Physical", value: true, disability_type: "Physical" },
      { label: "Yes – Visual", value: true, disability_type: "Visual" },
      { label: "Yes – Hearing", value: true, disability_type: "Hearing" },
      { label: "Yes – Other", value: true, disability_type: "Other" },
      { label: "Prefer not to say", value: false },
    ],
  },
  {
    q: 8,
    field: "citizenship",
    text: "What's your citizenship status?",
    description: "Determines which country-specific scholarships you qualify for.",
    type: "single_select",
    options: [
      { label: "Indian Citizen", value: "Indian" },
      { label: "NRI (Non-Resident Indian)", value: "NRI" },
      { label: "OCI Card Holder", value: "OCI" },
      { label: "Foreign National", value: "Foreign" },
    ],
  },
  {
    q: 9,
    field: "gender",
    text: "What's your gender?",
    description: "Some scholarships prefer or are exclusive to specific genders.",
    type: "single_select",
    options: [
      { label: "Male", value: "Male" },
      { label: "Female", value: "Female" },
      { label: "Other", value: "Other" },
      { label: "Prefer not to say", value: "Prefer not to say" },
    ],
  },
  {
    q: 10,
    field: "work_experience_years",
    text: "How many years of work experience do you have?",
    description: "Some postgrad scholarships require prior work experience.",
    type: "number",
    unit: "years (0 if none)",
    min: 0,
    max: 40,
  },
  {
    q: 11,
    field: "study_timeline",
    text: "How urgently do you need to start studying?",
    description: "Helps us prioritise scholarships with near deadlines.",
    type: "single_select",
    options: [
      { label: "Immediately (next 6 months)", value: "immediately" },
      { label: "Within 1 year", value: "1_year" },
      { label: "Within 2 years", value: "2_years" },
      { label: "Flexible / No set deadline", value: "flexible" },
    ],
  },
  {
    q: 12,
    field: "preferred_study_duration",
    text: "How long is your target programme?",
    description: "Helps filter scholarships by coverage period.",
    type: "single_select",
    options: [
      { label: "1 year", value: "1_year" },
      { label: "2 years", value: "2_year" },
      { label: "3 years", value: "3_year" },
      { label: "4+ years", value: "4_year" },
      { label: "Any duration", value: "any" },
    ],
  },
  {
    q: 13,
    field: "research_publications",
    text: "How many research papers have you published?",
    description: "Research scholarships favour applicants with prior publications.",
    type: "number",
    unit: "count (0 if none)",
    min: 0,
    max: 200,
  },
  {
    q: 14,
    field: "preferred_funding_type",
    text: "What type of funding are you looking for?",
    description: "Select all that apply.",
    type: "multi_select",
    options: [
      { label: "Full scholarship (covers everything)", value: "full" },
      { label: "Partial scholarship", value: "partial" },
      { label: "Any funding helps", value: "any" },
    ],
  },
  {
    q: 15,
    field: "willing_part_time_work",
    text: "Are you willing to do part-time work alongside studies?",
    description: "Some scholarships come with teaching/research assistantships.",
    type: "single_select",
    options: [
      { label: "Yes, preferred", value: "yes" },
      { label: "Maybe / Open to it", value: "maybe" },
      { label: "No, full-time student only", value: "no" },
    ],
  },
];

// GET /api/eligibility/questions
router.get("/questions", (req, res) => {
  res.json({ success: true, total: QUESTIONS.length, questions: QUESTIONS });
});

// POST /api/eligibility/answer — save one answer
router.post("/answer", protect, async (req, res) => {
  try {
    const { question_num, answer } = req.body;
    if (!question_num || answer === undefined || answer === null)
      return res.status(400).json({ success: false, message: "question_num and answer are required." });

    const question = QUESTIONS.find((q) => q.q === parseInt(question_num));
    if (!question)
      return res.status(400).json({ success: false, message: "Invalid question number." });

    const update = { [question.field]: answer };

    // Special case: disability_type
    if (question_num === 7 && answer === true && req.body.disability_type) {
      update.disability_type = req.body.disability_type;
    }

    await User.findByIdAndUpdate(req.user._id, update);

    const nextQ = QUESTIONS.find((q) => q.q === parseInt(question_num) + 1);
    if (!nextQ) {
      return res.json({
        success: true,
        done: true,
        message: "All questions answered. Ready to calculate matches.",
      });
    }

    res.json({ success: true, done: false, next_question: nextQ });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/eligibility/calculate — run full matching engine
router.post("/calculate", protect, async (req, res) => {
  try {
    const userProfile = await User.findById(req.user._id);
    const scholarships = await Scholarship.find({});

    if (!scholarships.length)
      return res.status(404).json({ success: false, message: "No scholarships in database yet." });

    // Run eligibility engine
    const ranked = engine.rankScholarships(userProfile.toObject(), scholarships.map((s) => s.toObject()));

    // Upsert match records
    const bulkOps = ranked.map((r) => ({
      updateOne: {
        filter: { user_id: userProfile._id, scholarship_id: r.scholarship._id },
        update: {
          $set: {
            eligible: r.eligible,
            match_score: r.matchScore,
            win_probability: r.winOdds,
            expected_value: r.expectedValue,
            blockers_reasons: r.blockedReasons,
            application_effort_score: r.applicationEffort,
            roi_rank: r.roi_rank,
            roi_score: r.roi_score,
          },
        },
        upsert: true,
      },
    }));

    // Also insert ineligible ones
    const allResults = scholarships.map((s) => {
      const match = ranked.find((r) => r.scholarship._id.toString() === s._id.toString());
      if (match) return match;
      const result = engine.checkEligibility(userProfile.toObject(), s.toObject());
      return { scholarship: s.toObject(), ...result };
    });

    const allBulkOps = allResults.map((r) => ({
      updateOne: {
        filter: { user_id: userProfile._id, scholarship_id: r.scholarship._id },
        update: {
          $set: {
            eligible: r.eligible,
            match_score: r.matchScore,
            win_probability: r.winOdds,
            expected_value: r.expectedValue,
            blockers_reasons: r.blockedReasons,
            application_effort_score: r.applicationEffort,
            roi_rank: r.roi_rank || null,
            roi_score: r.roi_score || 0,
          },
        },
        upsert: true,
      },
    }));

    if (allBulkOps.length) await Match.bulkWrite(allBulkOps);

    // Update user profile completion
    const completion = userProfile.calculateCompletion();
    await User.findByIdAndUpdate(userProfile._id, {
      profile_completion_score: completion,
      calculator_completed: true,
    });

    const totalEligible = ranked.length;
    const totalExpectedValue = ranked.reduce((s, r) => s + (r.expectedValue || 0), 0);
    const top10 = ranked.slice(0, 10).map((r) => ({
      id: r.scholarship._id,
      name: r.scholarship.name,
      provider: r.scholarship.provider,
      amount_string: r.scholarship.amount_string,
      cover_type: r.scholarship.cover_type,
      country: r.scholarship.country,
      deadline: r.scholarship.deadline,
      match_score: r.matchScore,
      win_odds: r.winOdds,
      expected_value: r.expectedValue,
      roi_rank: r.roi_rank,
      blockers: r.blockedReasons,
    }));

    res.json({
      success: true,
      summary: {
        total_eligible: totalEligible,
        total_scholarships_checked: scholarships.length,
        total_potential_funding: totalExpectedValue,
        profile_completion: completion,
      },
      top_matches: top10,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
