const express = require("express");
const router = express.Router();
const Match = require("../models/Match");
const Timeline = require("../models/Timeline");
const Scholarship = require("../models/Scholarship");
const { protect } = require("../middleware/auth");

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const now = new Date();
  const target = new Date(dateStr);
  return Math.round((target - now) / (1000 * 60 * 60 * 24));
}

function buildTaskList(deadline) {
  if (!deadline) return [];
  const d = new Date(deadline);
  const sub = (days) => {
    const dt = new Date(d);
    dt.setDate(dt.getDate() - days);
    return dt.toISOString().split("T")[0];
  };
  return [
    { task: "Research scholarship requirements", due: sub(21), completed: false },
    { task: "Gather documents (marksheets, ID, income cert.)", due: sub(14), completed: false },
    { task: "Write Statement of Purpose / Essay", due: sub(10), completed: false },
    { task: "Get recommendation letters", due: sub(7), completed: false },
    { task: "Review and proofread application", due: sub(3), completed: false },
    { task: "Submit application", due: deadline, completed: false },
  ];
}

// GET /api/roadmap — application timeline ordered by urgency
router.get("/", protect, async (req, res) => {
  try {
    const matches = await Match.find({ user_id: req.user._id, eligible: true })
      .populate("scholarship_id")
      .lean();

    const now = new Date();
    const roadmap = matches
      .map((m) => {
        const sch = m.scholarship_id;
        if (!sch) return null;
        const days = daysUntil(sch.deadline);
        return {
          scholarship_id: sch._id,
          scholarship_name: sch.name,
          provider: sch.provider,
          amount_string: sch.amount_string,
          cover_type: sch.cover_type,
          deadline: sch.deadline,
          days_remaining: days,
          urgency: days === null ? "unknown" : days <= 0 ? "expired" : days <= 7 ? "critical" : days <= 30 ? "high" : "normal",
          match_score: m.match_score,
          win_odds: m.win_probability,
          expected_value: m.expected_value,
          roi_rank: m.roi_rank,
          application_url: sch.application_url,
          tasks: buildTaskList(sch.deadline),
        };
      })
      .filter(Boolean)
      .filter((r) => r.days_remaining === null || r.days_remaining > -30)
      .sort((a, b) => {
        if (a.days_remaining === null) return 1;
        if (b.days_remaining === null) return -1;
        return a.days_remaining - b.days_remaining;
      });

    res.json({
      success: true,
      title: "Your Funding Roadmap",
      subtitle: "Every deadline you qualify for, ordered by urgency",
      total: roadmap.length,
      deadlines: roadmap,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/roadmap/calendar — calendar-grouped deadlines
router.get("/calendar", protect, async (req, res) => {
  try {
    const matches = await Match.find({ user_id: req.user._id, eligible: true })
      .populate("scholarship_id", "name deadline amount_string cover_type application_url")
      .lean();

    const calendarData = {};
    matches.forEach((m) => {
      const sch = m.scholarship_id;
      if (!sch?.deadline) return;
      const month = sch.deadline.substring(0, 7); // YYYY-MM
      if (!calendarData[month]) calendarData[month] = [];
      calendarData[month].push({
        date: sch.deadline,
        scholarship_id: sch._id,
        scholarship: sch.name,
        amount: sch.amount_string,
        cover_type: sch.cover_type,
        expected_value: m.expected_value,
        win_odds: m.win_probability,
        application_url: sch.application_url,
        days_remaining: daysUntil(sch.deadline),
      });
    });

    // Sort within each month
    Object.keys(calendarData).forEach((month) => {
      calendarData[month].sort((a, b) => a.date.localeCompare(b.date));
    });

    res.json({
      success: true,
      title: "Funding Calendar",
      subtitle: "All your eligible scholarship deadlines. Export or set email reminders.",
      calendar: calendarData,
      months: Object.keys(calendarData).sort(),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/roadmap/save/:scholarshipId — save to personal timeline
router.post("/save/:scholarshipId", protect, async (req, res) => {
  try {
    const sch = await Scholarship.findById(req.params.scholarshipId).lean();
    if (!sch) return res.status(404).json({ success: false, message: "Scholarship not found." });

    const existing = await Timeline.findOne({
      user_id: req.user._id,
      scholarship_id: sch._id,
    });
    if (existing) return res.json({ success: true, message: "Already in your timeline.", timeline: existing });

    const timeline = await Timeline.create({
      user_id: req.user._id,
      scholarship_id: sch._id,
      deadline: sch.deadline,
      task_list: buildTaskList(sch.deadline),
    });

    // Mark as saved in match record
    await Match.findOneAndUpdate(
      { user_id: req.user._id, scholarship_id: sch._id },
      { saved_at: new Date() }
    );

    res.status(201).json({ success: true, timeline });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/roadmap/task/:timelineId — update task completion
router.patch("/task/:timelineId", protect, async (req, res) => {
  try {
    const { task_index, completed } = req.body;
    const timeline = await Timeline.findOne({ _id: req.params.timelineId, user_id: req.user._id });
    if (!timeline) return res.status(404).json({ success: false, message: "Timeline not found." });

    if (timeline.task_list[task_index] !== undefined) {
      timeline.task_list[task_index].completed = completed;
      timeline.markModified("task_list");
    }

    const allDone = timeline.task_list.every((t) => t.completed);
    if (allDone) timeline.status = "submitted";
    else if (timeline.task_list.some((t) => t.completed)) timeline.status = "in_progress";

    await timeline.save();
    res.json({ success: true, timeline });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
