const mongoose = require("mongoose");

const matchSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    scholarship_id: { type: mongoose.Schema.Types.ObjectId, ref: "Scholarship", required: true },

    // Eligibility result
    eligible: { type: Boolean, required: true },
    match_score: { type: Number, default: 0 }, // 0–100
    win_probability: { type: Number, default: 0 }, // 0–100 (%)
    expected_value: { type: Number, default: 0 }, // INR
    blockers_reasons: { type: [Object], default: [] },
    application_effort_score: { type: Number, default: 0 },
    roi_rank: { type: Number }, // 1 = best ROI
    roi_score: { type: Number, default: 0 },

    // User actions
    viewed_at: { type: Date },
    saved_at: { type: Date },
    applied_at: { type: Date },
    result: {
      type: String,
      enum: ["pending", "shortlisted", "awarded", "rejected"],
    },
    notes: { type: String },
  },
  { timestamps: true }
);

matchSchema.index({ user_id: 1, scholarship_id: 1 }, { unique: true });
matchSchema.index({ user_id: 1, eligible: 1, roi_rank: 1 });
matchSchema.index({ user_id: 1, expected_value: -1 });

module.exports = mongoose.model("Match", matchSchema);
