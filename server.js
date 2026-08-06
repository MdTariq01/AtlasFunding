require("dotenv").config();
const express = require("express");
const cors    = require("cors");
const morgan  = require("morgan");
const path    = require("path");
const cron    = require("node-cron");

const connectDB    = require("./src/db/connection");
const { runScraper }  = require("./scripts/scrape");
const { runCleanup }  = require("./scripts/cleanup");

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ──────────────────────────────────────────────────────────────────
app.use(cors({
  origin: [
    process.env.CLIENT_URL || "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:3000",
  ],
  credentials: true,
}));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
if (process.env.NODE_ENV !== "test") app.use(morgan("dev"));

// ── API Routes ──────────────────────────────────────────────────────────────────
app.use("/api/auth",        require("./src/routes/auth.routes"));
app.use("/api/eligibility", require("./src/routes/eligibility.routes"));
app.use("/api/repository",  require("./src/routes/scholarships.routes"));
app.use("/api/roadmap",     require("./src/routes/roadmap.routes"));
app.use("/api/advisor",     require("./src/routes/advisor.routes"));
app.use("/api/dashboard",   require("./src/routes/dashboard.routes"));

// ── Health check ────────────────────────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString(), env: process.env.NODE_ENV });
});

// ── Serve Vite build in production ─────────────────────────────────────────────
if (process.env.NODE_ENV === "production") {
  const clientDist = path.join(__dirname, "client", "dist");
  app.use(express.static(clientDist));
  app.get("/{*splat}", (req, res) => res.sendFile(path.join(clientDist, "index.html")));
}

// ── Error handler ───────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal server error",
  });
});

// ── DB + Cron + Server Startup ──────────────────────────────────────────────────
const Scholarship = require("./src/models/Scholarship");
const seedData    = require("./src/seeds/scholarships.seed");

connectDB().then(async () => {

  // Auto-seed if DB is empty on first run
  const count = await Scholarship.countDocuments();
  if (count === 0) {
    console.log("🌱 Database empty — seeding initial scholarships...");
    await Scholarship.insertMany(seedData);
    console.log(`✅ Seeded ${seedData.length} scholarships.\n`);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // CRON JOB 1 — Scrape & discover new scholarships every 2 days at 00:00 AM
  // Schedule: "0 0 */2 * *"  →  At midnight, every 2nd day
  // ────────────────────────────────────────────────────────────────────────────
  cron.schedule("0 0 */2 * *", async () => {
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("⏰ [CRON JOB 1] Scholarship Discovery & Scraping Pipeline");
    console.log(`   🕐 Triggered at: ${new Date().toLocaleString("en-IN")}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    try {
      const added = await runScraper();
      console.log(`✅ [CRON JOB 1] Done — ${added} new scholarship(s) added.\n`);
    } catch (err) {
      console.error("❌ [CRON JOB 1] Scraper error:", err.message, "\n");
    }
  }, { timezone: "Asia/Kolkata" });

  // ────────────────────────────────────────────────────────────────────────────
  // CRON JOB 2 — Remove expired scholarships every 2 days at 01:00 AM
  // Schedule: "0 1 */2 * *"  →  At 1 AM, every 2nd day (1 hour after scraping)
  //           Runs AFTER the scraper to avoid deleting freshly added schemes
  // ────────────────────────────────────────────────────────────────────────────
  cron.schedule("0 1 */2 * *", async () => {
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("⏰ [CRON JOB 2] Expired Scholarship Cleanup");
    console.log(`   🕐 Triggered at: ${new Date().toLocaleString("en-IN")}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    try {
      const { deleted, matchesDeleted } = await runCleanup();
      console.log(`✅ [CRON JOB 2] Done — ${deleted} expired scholarship(s) removed, ${matchesDeleted} match record(s) cleaned.\n`);
    } catch (err) {
      console.error("❌ [CRON JOB 2] Cleanup error:", err.message, "\n");
    }
  }, { timezone: "Asia/Kolkata" });

  // Log the full scheduler status on boot
  console.log("\n┌─────────────────────────────────────────────────────┐");
  console.log("│          ⏱  AUTOMATED SCHEDULER ACTIVE              │");
  console.log("├─────────────────────────────────────────────────────┤");
  console.log("│ CRON JOB 1 │ Discover + scrape new scholarships     │");
  console.log("│            │ Every 2 days at 00:00 AM (IST)         │");
  console.log("├─────────────────────────────────────────────────────┤");
  console.log("│ CRON JOB 2 │ Remove expired scholarships            │");
  console.log("│            │ Every 2 days at 01:00 AM (IST)         │");
  console.log("└─────────────────────────────────────────────────────┘\n");

  app.listen(PORT, () => {
    console.log(`🚀 AtlasFunding API → http://localhost:${PORT}`);
    console.log(`📊 Health check    → http://localhost:${PORT}/api/health\n`);
  });
});
