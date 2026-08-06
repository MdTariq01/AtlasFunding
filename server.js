require("dotenv").config();
const express = require("express");
const cors    = require("cors");
const morgan  = require("morgan");
const path    = require("path");
const crypto  = require("crypto");

const connectDB    = require("./src/db/connection");
const { runScraper }  = require("./scripts/scrape");
const { runCleanup }  = require("./scripts/cleanup");

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ──────────────────────────────────────────────────────────────────
app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    const clientUrl = (process.env.CLIENT_URL || "").replace(/\/$/, "");
    if (
      origin === clientUrl ||
      /\.vercel\.app$/.test(origin) ||
      origin.includes("localhost")
    ) {
      return callback(null, true);
    }
    return callback(null, true);
  },
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

// ── Health & Root check ─────────────────────────────────────────────────────────
app.get(["/", "/api/health"], (req, res) => {
  res.json({ status: "ok", service: "AtlasFunding API", timestamp: new Date().toISOString(), env: process.env.NODE_ENV });
});

// ── Cron Trigger (external scheduler → this endpoint) ───────────────────────────
// The scheduled scraper/cleanup jobs are invoked by GitHub Actions POSTing here.
// Auth is header-only (x-cron-secret) against CRON_SECRET, plus a per-IP rate limit.

function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a || "")).digest();
  const hb = crypto.createHash("sha256").update(String(b || "")).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// Minimal in-memory fixed-window limiter (per-IP). Replaced by a proper
// rate-limiting store when global rate limiting is added in a later pass.
const cronLimitStore = new Map();
function checkCronRateLimit(key, limit = 5, windowMs = 15 * 60 * 1000) {
  const now = Date.now();
  const rec = cronLimitStore.get(key) || { count: 0, resetAt: now + windowMs };
  if (now > rec.resetAt) {
    rec.count = 0;
    rec.resetAt = now + windowMs;
  }
  rec.count += 1;
  cronLimitStore.set(key, rec);
  // Opportunistic cleanup so the map doesn't grow without bound
  if (cronLimitStore.size > 1000) {
    for (const [k, r] of cronLimitStore) if (r.resetAt < now) cronLimitStore.delete(k);
  }
  return rec.count <= limit;
}

// POST /api/cron/trigger?job=scraper|cleanup|both
app.post("/api/cron/trigger", async (req, res) => {
  const secret = req.headers["x-cron-secret"];

  if (!process.env.CRON_SECRET) {
    if (process.env.NODE_ENV === "production") {
      return res.status(500).json({ success: false, message: "CRON_SECRET is not configured on the server." });
    }
    // Dev: allow without a secret so local runs are easy
  } else if (!secret || !safeEqual(secret, process.env.CRON_SECRET)) {
    return res.status(403).json({ success: false, message: "Invalid or missing CRON_SECRET." });
  }

  const ip = req.ip || req.socket?.remoteAddress || "unknown";
  if (!checkCronRateLimit(ip)) {
    return res.status(429).json({ success: false, message: "Too many cron trigger requests. Try again later." });
  }

  const job = (req.query.job || req.body?.job || "both").toLowerCase();
  const results = {};

  try {
    if (job === "scraper" || job === "both") {
      console.log("🔧 [MANUAL] Running scraper...");
      const added = await runScraper();
      results.scraper = { ran: true, added };
      console.log(`✅ [MANUAL] Scraper done — ${added} new scholarship(s).`);
    }

    if (job === "cleanup" || job === "both") {
      console.log("🔧 [MANUAL] Running cleanup...");
      const { deleted, matchesDeleted } = await runCleanup();
      results.cleanup = { ran: true, deleted, matchesDeleted };
      console.log(`✅ [MANUAL] Cleanup done — ${deleted} expired removed.`);
    }

    res.json({ success: true, message: `Cron job(s) '${job}' completed.`, results });
  } catch (err) {
    console.error("❌ [MANUAL] Cron trigger error:", err.stack || err.message);
    res.status(500).json({ success: false, message: "Cron job failed on the server." });
  }
});

// ── Serve Vite build in production (if built in monorepo) ──────────────────────
if (process.env.NODE_ENV === "production") {
  const fs = require("fs");
  const clientDist = path.join(__dirname, "client", "dist");
  if (fs.existsSync(path.join(clientDist, "index.html"))) {
    app.use(express.static(clientDist));
    app.get("/{*splat}", (req, res) => res.sendFile(path.join(clientDist, "index.html")));
  }
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

  // NOTE: In-process scheduled scraping/cleanup (node-cron) has been removed.
  // Runs are now triggered by the GitHub Actions workflows in .github/workflows/
  // which POST to /api/cron/trigger?job=scraper|cleanup (see README for setup).

  app.listen(PORT, () => {
    console.log(`🚀 AtlasFunding API → http://localhost:${PORT}`);
    console.log(`📊 Health check    → http://localhost:${PORT}/api/health\n`);
  });
});
