const mongoose = require("mongoose");

const scholarshipSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    provider: { type: String, trim: true },

    // Amount
    amount_value: { type: Number, default: 0 },
    amount_currency: { type: String, default: "INR" },
    amount_string: { type: String }, // Display string e.g. "₹50,000/year"

    cover_type: {
      type: String,
      enum: ["full", "partial", "tuition_only", "varies"],
      default: "partial",
    },
    cover_details: { type: String },

    // Education
    education_level: {
      type: String,
      enum: ["school", "diploma", "undergrad", "postgrad", "doctorate", "any"],
      default: "any",
    },
    field_of_study: { type: [String], default: ["All"] },

    // Location
    country: { type: String, default: "India" },
    study_location: {
      type: String,
      enum: ["India", "Abroad", "Both"],
      default: "Both",
    },

    // Eligibility blockers
    max_income_annual: { type: Number, default: null }, // in INR, null = no limit
    min_gpa: { type: Number, default: null }, // in %, null = no minimum
    requires_disability: { type: Boolean, default: false },
    citizenship: { type: String, default: "Any" }, // "Indian", "NRI", "OCI", "Any"
    min_work_experience: { type: Number, default: 0 }, // years
    required_gender: { type: String, default: "Any" }, // "Female", "Male", "Any"
    field_restriction: { type: String, default: null },

    // Application details
    deadline: { type: String }, // YYYY-MM-DD
    application_url: { type: String },
    required_documents: { type: [String], default: [] },
    application_effort_hours: { type: Number, default: 5 },
    application_method: { type: String, default: "Online" },
    selection_criteria: { type: String, default: "Merit-based" },

    // Provider
    provider_type: {
      type: String,
      enum: ["government", "corporate", "ngo", "university", "international"],
      default: "government",
    },
    contact_email: { type: String },
    provider_website: { type: String },

    // Stats
    awards_per_year: { type: Number, default: null },
    competitive_ratio: { type: String, default: null }, // "1:100"

    // Metadata
    verified: { type: Boolean, default: false },
    last_verified: { type: Date },
    source_url: { type: String },
    // Raw URL the record was scraped FROM. Used for dedup even when the displayed
    // source_url is nulled (e.g. records mined from an aggregator we don't link
    // users to) — without it, the same aggregator page would re-ingest every run.
    scraped_from_url: { type: String },
    notes: { type: String },
  },
  { timestamps: true }
);

// Text index for keyword search
scholarshipSchema.index({
  name: "text",
  provider: "text",
  field_of_study: "text",
  notes: "text",
  cover_details: "text",
});

// Compound indexes for common queries
scholarshipSchema.index({ education_level: 1, country: 1 });
scholarshipSchema.index({ provider_type: 1 });
scholarshipSchema.index({ deadline: 1 });
scholarshipSchema.index({ verified: 1 });

module.exports = mongoose.model("Scholarship", scholarshipSchema);
