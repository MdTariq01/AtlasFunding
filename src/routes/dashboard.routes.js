const express = require("express");
const router = express.Router();
const Match = require("../models/Match");
const Scholarship = require("../models/Scholarship");
const { protect } = require("../middleware/auth");
const { authUserLimiter } = require("../config/rate-limit");

// All dashboard endpoints require auth — apply the loose authenticated-user limiter.
router.use(authUserLimiter);

function daysUntil(dateStr) {
  if (!dateStr) return null;
  return Math.round((new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24));
}

// GET /api/dashboard
router.get("/", protect, async (req, res) => {
  try {
    const userId = req.user._id;

    const [
      totalEligible,
      totalSaved,
      totalApplied,
      valueResult,
      upcomingMatches,
      allScholarshipCount,
    ] = await Promise.all([
      Match.countDocuments({ user_id: userId, eligible: true }),
      Match.countDocuments({ user_id: userId, saved_at: { $exists: true, $ne: null } }),
      Match.countDocuments({ user_id: userId, applied_at: { $exists: true, $ne: null } }),
      Match.aggregate([
        { $match: { user_id: userId, eligible: true } },
        { $group: { _id: null, total: { $sum: "$expected_value" }, avg_win: { $avg: "$win_probability" } } },
      ]),
      Match.find({ user_id: userId, eligible: true })
        .sort({ expected_value: -1 })
        .limit(5)
        .populate("scholarship_id", "name deadline amount_string cover_type country application_url")
        .lean(),
      Scholarship.countDocuments({}),
    ]);

    const totalExpectedValue = valueResult[0]?.total || 0;
    const avgWinOdds = Math.round(valueResult[0]?.avg_win || 0);

    const upcoming = upcomingMatches
      .map((m) => {
        const sch = m.scholarship_id;
        if (!sch) return null;
        const days = daysUntil(sch.deadline);
        return {
          id: sch._id,
          name: sch.name,
          deadline: sch.deadline,
          amount: sch.amount_string,
          cover_type: sch.cover_type,
          country: sch.country,
          match_score: m.match_score,
          win_odds: m.win_probability,
          expected_value: m.expected_value,
          days_remaining: days,
          urgency:
            days === null ? "unknown" : days <= 0 ? "expired" : days <= 7 ? "critical" : days <= 30 ? "high" : "normal",
          application_url: sch.application_url,
        };
      })
      .filter(Boolean);

    res.json({
      success: true,
      user: {
        email: req.user.email,
        profile_completion: req.user.profile_completion_score || 0,
        calculator_completed: req.user.calculator_completed,
        field_of_study: req.user.field_of_study,
        target_education_level: req.user.target_education_level,
      },
      stats: {
        total_eligible_scholarships: totalEligible,
        total_scholarships_in_db: allScholarshipCount,
        total_potential_funding_lakhs: (totalExpectedValue / 100000).toFixed(1),
        average_win_odds: avgWinOdds,
        saved_count: totalSaved,
        applied_count: totalApplied,
      },
      top_opportunities: upcoming,
      quick_actions: [
        { label: "Browse All Scholarships", route: "/repository", icon: "grid" },
        { label: "Search Scholarships", route: "/repository?search=true", icon: "search" },
        { label: "View My Roadmap", route: "/roadmap", icon: "map" },
        { label: "Ask AI Advisor", route: "/advisor", icon: "sparkles" },
        { label: "View Calendar", route: "/calendar", icon: "calendar" },
      ],
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
