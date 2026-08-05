const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password_hash: { type: String, required: true },

    // ── 15-Question Profile ──────────────────────────────────────
    // Q1: Current education level
    education_level: {
      type: String,
      enum: ["school", "diploma", "undergrad", "postgrad", "doctorate"],
    },
    // Q2: What are you funding next? (target level)
    target_education_level: {
      type: String,
      enum: ["school", "diploma", "undergrad", "postgrad", "doctorate"],
    },
    // Q3: Field of study
    field_of_study: { type: String },

    // Q4: Preferred study countries
    preferred_countries: { type: [String], default: [] },

    // Q5: Family annual income (INR)
    family_income_annual: { type: Number },

    // Q6: GPA / Percentage
    gpa_percentage: { type: Number }, // 0–100

    // Q7: Disability
    has_disability: { type: Boolean, default: false },
    disability_type: { type: String },

    // Q8: Citizenship
    citizenship: {
      type: String,
      enum: ["Indian", "NRI", "OCI", "Foreign"],
    },

    // Q9: Gender
    gender: {
      type: String,
      enum: ["Male", "Female", "Other", "Prefer not to say"],
    },

    // Q10: Work experience (years)
    work_experience_years: { type: Number, default: 0 },

    // Q11: Study urgency
    study_timeline: {
      type: String,
      enum: ["immediately", "1_year", "2_years", "flexible"],
    },

    // Q12: Preferred study duration
    preferred_study_duration: {
      type: String,
      enum: ["1_year", "2_year", "3_year", "4_year", "any"],
    },

    // Q13: Research publications
    research_publications: { type: Number, default: 0 },

    // Q14: Preferred funding type
    preferred_funding_type: {
      type: [String],
      default: ["any"],
    },

    // Q15: Part-time work willingness
    willing_part_time_work: {
      type: String,
      enum: ["yes", "maybe", "no"],
      default: "maybe",
    },

    // Calculated fields
    profile_completion_score: { type: Number, default: 0 }, // 0–100
    calculator_completed: { type: Boolean, default: false },

    // Tracking
    last_login: { type: Date },
  },
  { timestamps: true }
);

// Hash password before save
userSchema.pre("save", async function () {
  if (!this.isModified("password_hash")) return;
  this.password_hash = await bcrypt.hash(this.password_hash, 12);
});

// Compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password_hash);
};

// Calculate profile completion
userSchema.methods.calculateCompletion = function () {
  const fields = [
    "education_level", "target_education_level", "field_of_study",
    "preferred_countries", "family_income_annual", "gpa_percentage",
    "has_disability", "citizenship", "gender", "work_experience_years",
    "study_timeline", "preferred_study_duration", "research_publications",
    "preferred_funding_type", "willing_part_time_work",
  ];
  const filled = fields.filter((f) => {
    const val = this[f];
    if (val === null || val === undefined) return false;
    if (Array.isArray(val) && val.length === 0) return false;
    return true;
  });
  return Math.round((filled.length / fields.length) * 100);
};

module.exports = mongoose.model("User", userSchema);
