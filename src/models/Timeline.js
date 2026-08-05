const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema({
  task: { type: String, required: true },
  due: { type: String }, // YYYY-MM-DD
  completed: { type: Boolean, default: false },
});

const timelineSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    scholarship_id: { type: mongoose.Schema.Types.ObjectId, ref: "Scholarship", required: true },
    deadline: { type: String }, // YYYY-MM-DD
    priority_rank: { type: Number, default: 99 },
    status: {
      type: String,
      enum: ["pending", "in_progress", "submitted", "completed"],
      default: "pending",
    },
    task_list: { type: [taskSchema], default: [] },
    reminder_sent_30_days: { type: Boolean, default: false },
    reminder_sent_7_days: { type: Boolean, default: false },
    reminder_sent_1_day: { type: Boolean, default: false },
  },
  { timestamps: true }
);

timelineSchema.index({ user_id: 1, deadline: 1 });
timelineSchema.index({ user_id: 1, status: 1 });

module.exports = mongoose.model("Timeline", timelineSchema);
