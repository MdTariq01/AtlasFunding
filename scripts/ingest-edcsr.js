/**
 * AtlasFunding — Ingest edcsr.com's PUBLIC scholarship cards.
 *
 * edcsr.com/scholarships is a login-gated SPA; only a curated set of cards is
 * publicly rendered (via Jina). This parses those cards directly from the
 * rendered markdown and inserts any not already in the DB.
 *
 * We deliberately DON'T link users back to edcsr (a competitor) — source_url and
 * application_url are left null. Run:  node scripts/ingest-edcsr.js
 */
require("dotenv").config();
const connectDB = require("../src/db/connection");
const Scholarship = require("../src/models/Scholarship");

const https = require("https");
const EDCSR_LIST = "https://www.edcsr.com/scholarships";
const JINA_KEY = process.env.JINA_API_KEY;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function jinaMarkdown(url) {
  return new Promise((resolve, reject) => {
    const headers = { Accept: "text/markdown", "X-Timeout": "40" };
    if (JINA_KEY) headers.Authorization = `Bearer ${JINA_KEY}`;
    https.get(`https://r.jina.ai/${url}`, { headers }, (res) => {
      if (res.statusCode >= 400) { res.resume(); return reject(new Error(`Jina HTTP ${res.statusCode}`)); }
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve(data));
    }).on("error", reject);
  });
}

// Split rendered markdown into cards (each starts with "### "). Returns the raw
// body lines; field parsing happens below.
function splitCards(md) {
  const cards = [];
  let cur = null;
  for (const line of String(md || "").split("\n")) {
    if (/^###\s+/.test(line)) {
      if (cur) cards.push(cur);
      cur = { name: line.replace(/^###\s+/, "").trim(), body: [] };
    } else if (cur) {
      cur.body.push(line);
    }
  }
  if (cur) cards.push(cur);
  return cards;
}

// Card body order is fixed: provider, "N selected from M applicants", amount,
// deadline, description, "#### Key Benefits:", "#### Eligibility:", type tag.
function parseCard(card) {
  const lines = card.body.map((l) => l.trim()).filter((l) => l.length > 0);
  const s = { name: card.name };

  let mode = "head";
  let inBenefits = false, inEligibility = false;
  const benefits = [], eligibility = [], prose = [];

  for (const line of lines) {
    // Field patterns first — the type tag ("Government Open") sits right after
    // the Eligibility bullets, so it must be caught before the section bullets
    // swallow it.
    const mSel  = line.match(/^([\d,]+)\s+selected from\s+([\d,]+)\s+applicants/i);
    if (mSel) { s.awards_per_year = parseInt(mSel[1].replace(/,/g, ""), 10); continue; }

    const mDate = line.match(/^(\d{4}-\d{2}-\d{2})$/);
    if (mDate) { s.deadline = mDate[1]; continue; }

    // Ranges ("₹50,000 - ₹2,00,000") and combined ("₹7,000/month + ₹28,000
    // annual") carry ₹ / + / - inside, so allow those.
    const mAmt = line.match(/^₹[\d,\s₹+ -]+(?:per\s+(?:year|month))?$/i);
    if (mAmt) { s.amount_string = line; continue; }

    const mTag = line.match(/^(Government|State|Private|International|NGO|Corporate)\s+(Open|Closed)$/i);
    if (mTag) { s.provider_type = mTag[1].toLowerCase() === "state" || mTag[1].toLowerCase() === "government" ? "government" : mTag[1].toLowerCase() === "private" ? "corporate" : "ngo"; continue; }

    if (line.startsWith("#### Key Benefits:")) { inBenefits = true; inEligibility = false; mode = "benefits"; continue; }
    if (line.startsWith("#### Eligibility:")) { inBenefits = false; inEligibility = true; mode = "eligibility"; continue; }
    if (inBenefits) { benefits.push(line); continue; }
    if (inEligibility) { eligibility.push(line); continue; }

    // First remaining line that isn't a section/known field = provider.
    if (mode === "head" && !s.provider && line !== "Markdown Content:") { s.provider = line; mode = "prose"; continue; }
    prose.push(line);
  }

  // Fallbacks.
  s.provider = s.provider || "Unknown";
  s.description = prose.join(" ").trim();

  // Amount value = the largest number in the amount string (upper bound).
  const nums = String(s.amount_string || "").match(/\d[\d,]*/g) || [];
  const maxNum = Math.max(0, ...nums.map((n) => parseInt(n.replace(/,/g, ""), 10)));
  s.amount_value = maxNum || null;
  s.amount_currency = "INR";

  s.cover_type = /full\s*(tuition|fee)|fully\s*funded|complete\s*fee|full\s*tuition/i.test((s.description + " " + benefits.join(" "))) ? "full" : "partial";

  s.study_location = "India";
  s.country = "India";
  s.citizenship = "Indian";
  s.min_work_experience = 0;

  // Light education-level inference.
  const text = (s.name + " " + s.description + " " + eligibility.join(" ")).toLowerCase();
  if (/ph\.?d|doctorate|doctoral|research\s*fellow/i.test(text)) s.education_level = "doctorate";
  else if (/post.?matric|under.?graduate|bachelor|professional course|engineering|medical|ug|degree/i.test(text)) s.education_level = "undergrad";
  else if (/class\s*(vi|x|xi|ix|vii|viii)|school|secondary/i.test(text)) s.education_level = "school";
  else s.education_level = "any";

  // Compose a notes blob from the card's structure.
  s.notes = [s.description, "Key benefits: " + benefits.join("; "), "Eligibility: " + eligibility.join("; ")].filter(Boolean).join("\n").slice(0, 2000) || null;
  s.required_documents = [];
  s.field_of_study = ["All"];

  return s;
}

// Programmes deliberately not in the DB (e.g. discontinued) — never re-ingest.
// Also includes edcsr demo cards that duplicate programs already held under
// fuller names (our official versions are better than these stale demo cards).
const SKIP_NAMES = [
  "Kishore Vaigyanik Protsahan Yojana (KVPY)",
  "KVPY Fellowship (Kishore Vaigyanik Protsahan Yojana)",
  "Begum Hazrat Mahal Scholarship",
  "Inspire Scholarship for Higher Education",
  "Reliance Foundation Scholarship",
  "Sitaram Jindal Foundation Scholarship",
];

async function run() {
  await connectDB();
  console.log(`📥 Ingesting public scholarships from ${EDCSR_LIST}...`);

  const md = await jinaMarkdown(EDCSR_LIST);
  const cards = splitCards(md);
  console.log(`Parsed ${cards.length} cards.\n`);

  let added = 0, skipped = 0;
  for (const card of cards) {
    // Skip the non-scholarship help banner at the end of the page.
    if (/Can't Find the Right Scholarship|education counselors/i.test(card.name)) continue;
    if (SKIP_NAMES.includes(card.name)) { console.log(`  ⏭  Skipping (discontinued): "${card.name}"`); skipped++; continue; }

    const s = parseCard(card);
    // Sanity: a real card always has an amount or deadline.
    if (!s.amount_value && !s.deadline) { console.log(`  ⏭  Skipping (no amount/deadline): "${s.name}"`); skipped++; continue; }

    const existing = await Scholarship.findOne({ name: s.name });
    if (existing) { console.log(`  ⏭  Already in DB: "${s.name}"`); skipped++; continue; }

    await Scholarship.create(s);
    console.log(`  ✅ Added: "${s.name}" (${s.amount_string || "amount TBD"}, ${s.deadline || "TBA"})`);
    added++;
  }

  console.log(`\nDone — ${added} added, ${skipped} skipped. Total in DB: ${await Scholarship.countDocuments()}`);
}

if (require.main === module) {
  run().then(() => process.exit(0)).catch((e) => { console.error("Ingest failed:", e.message); process.exit(1); });
}

module.exports = { run, parseCard };
