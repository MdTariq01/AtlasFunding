/**
 * AtlasFunding — Automated Scholarship Discovery & Scraping Pipeline
 *
 * Usage:
 *   node scripts/scrape.js                          — Auto-discover + scrape all default sources
 *   node scripts/scrape.js --url https://example.com — Manually scrape a specific URL
 *
 * Requires: FIRECRAWL_API_KEY and GROQ_API_KEY in .env
 */
require("dotenv").config();
const https = require("https");
const http = require("http");
const connectDB = require("../src/db/connection");
const Scholarship = require("../src/models/Scholarship");

const FIRECRAWL_KEY = process.env.FIRECRAWL_API_KEY;
const GROQ_KEY = process.env.GROQ_API_KEY;

// ── Default sources to always scrape ───────────────────────────────────────────
const DEFAULT_SOURCES = [
  { url: "https://www.buddy4study.com/scholarships", name: "Buddy4Study" },
  { url: "https://www.scholarships.gov.in/", name: "NSP India Portal" },
  { url: "https://newstrides.co/new/uk-delhi/", name: "NewStrides UK Grants" },
  { url: "https://education.gov.in/scholarships", name: "Ministry of Education India" },
  { url: "https://www.tatatrusts.org/our-work/individual-grants-programme/education-grants", name: "Tata Trusts Grants" },
  { url: "https://www.scholarships.net.in/", name: "Scholarships Net India" }
];

// ── 75+ Categorized Search Queries covering fields, states & degrees ──────────
const SEARCH_QUERY_POOL = [
  // General & National Portals
  "latest scholarship application 2026 apply online India",
  "national scholarship portal NSP active schemes 2026 2027",
  "state government merit scholarship scheme 2026 India",

  // Disciplines & Fields
  "engineering BTech B-E student scholarship 2026 apply online",
  "medical MBBS BDS nursing student scholarship 2026 India",
  "law LLB LLM student grant scholarship 2026 India",
  "management MBA PGDM student scholarship financial aid 2026",
  "pure science BSc MSc physics chemistry math KVPY INSPIRE scholarship 2026",
  "agriculture BSc Agri veterinary dairy scholarship 2026 India",
  "arts humanities fine arts design architecture scholarship 2026",

  // Demographics & Social Categories
  "girl child women single girl child scholarship 2026 India",
  "SC ST OBC EWS minority student post matric scholarship 2026",
  "disabled PwD divyangjan student scholarship application 2026",
  "single parent orphan low income family scholarship 2026 India",
  "defense personnel ex-servicemen police martyr child PMSS scholarship 2026",

  // Corporate CSR & Top Foundations
  "corporate CSR foundation education scholarship 2026 India",
  "Tata trusts Reliance HDFC SBI LIC ONGC scholarship 2026",
  "Kotak Kanya Aditya Birla Jindal Foundation scholarship 2026",
  "Google Microsoft Amazon female tech coding fellowship 2026 India",

  // Academic Levels
  "class 10th 12th passed student merit scholarship 2026",
  "undergraduate UG bachelor degree scholarship application 2026",
  "postgraduate masters PG student scholarship fellowship 2026",
  "PhD doctoral research fellowship CSIR UGC DST ICMR 2026",

  // Study Abroad & Fellowships
  "study abroad scholarship for Indian students 2026 UK USA Canada",
  "Chevening Commonwealth Fulbright Rhodes scholarship 2026 2027",
  "DAAD Germany Eiffel France MEXT Japan Australia Awards 2026",
  "fully funded masters scholarship abroad for Indian students 2026",

  // State Specific Portals
  "Mahadbt Maharashtra SSP Karnataka Oasis WB scholarship 2026",
  "e-Kalyan Bihar Jharkhand Digital Gujarat MPTAAS MP scholarship 2026",
  "Tamil Nadu Pudhumai Penn Kerala scholarship 2026",
  "UP scholarship postmatric portal scholarship.up.gov.in 2026",

  // ── More State Portals ──────────────────────────────────────────────
  "Odisha post matric scholarship OSAP application 2026",
  "Rajasthan SJE post matric scholarship scheme 2026",
  "Gujarat government post matric scholarship 2026",
  "Punjab education scholarship scheme merit 2026",
  "Haryana post matric scholarship apply online 2026",
  "Kerala scholarship LBS centre state scheme 2026",
  "Telangana welfare scholarship post matric 2026",
  "Assam government scholarship scheme 2026",
  "Chhattisgarh scholarship pre matric post matric 2026",
  "Andhra Pradesh AP scholarship online apply 2026",
  "Himachal Pradesh merit scholarship scheme 2026",
  "Uttarakhand scholarship scheme government 2026",
  "Jammu Kashmir scholarship scheme students 2026",
  "Goa Manipur Meghalaya Mizoram scholarship scheme 2026",

  // ── More Disciplines & Fields ───────────────────────────────────────
  "dentistry BDS MDS scholarship 2026 India apply online",
  "veterinary BVSc animal husbandry scholarship India 2026",
  "pharmacy BPharm DPharm scholarship 2026 India",
  "nursing GNM BSc nursing scholarship India 2026",
  "physiotherapy occupational therapy scholarship 2026",
  "journalism mass communication media studies scholarship 2026 India",
  "sports quota student athlete education scholarship India 2026",
  "teacher training B.Ed D.El.Ed scholarship 2026 India",
  "hotel management hospitality tourism scholarship India 2026",
  "fashion design textile design scholarship India 2026",
  "music performing arts fine arts scholarship India 2026",

  // ── More Demographics & Social Categories ───────────────────────────
  "transgender TG community education scholarship India 2026",
  "tribal student ST scholarship pre matric post matric 2026",
  "minority community education scholarship India 2026",
  "first generation learner education scholarship India 2026",
  "EWS economically weaker section scholarship 2026 India",
  "war widow defence dependent education scholarship India",
  "farmer family student scholarship scheme India 2026",

  // ── International & Research ────────────────────────────────────────
  "Erasmus Mundus scholarship for Indian students 2026 2027",
  "New Zealand Ireland study scholarship Indian students 2026",
  "UGC NET JRF research fellowship 2026 India",
  "ISRO IISc research fellowship scholarship 2026",
  "Atal innovation mission scholarship fellowship 2026",
  "Oxford Cambridge Harvard fully funded scholarship Indian student 2026",

  // ── Corporate & CSR ─────────────────────────────────────────────────
  "ICICI Foundation LIC HDFC Bank education scholarship 2026",
  "Birla SBI ONGC NTPC CSR education scholarship 2026",
  "Mahindra YES Bank engineering scholarship 2026 India"
];

// ── VALID ENUM VALUES (must exactly match Scholarship.js model) ─────────────────
const VALID_ENUMS = {
  education_level: ["school", "diploma", "undergrad", "postgrad", "doctorate", "any"],
  cover_type:      ["full", "partial", "tuition_only", "varies"],
  study_location:  ["India", "Abroad", "Both"],
  provider_type:   ["government", "corporate", "ngo", "university", "international"],
};

const EDUCATION_MAP = {
  school: "school", class: "school", "10th": "school", "12th": "school", secondary: "school",
  diploma: "diploma", polytechnic: "diploma",
  undergraduate: "undergrad", undergrad: "undergrad", ug: "undergrad", bachelor: "undergrad",
  graduation: "undergrad", graduate: "undergrad", degree: "undergrad", btech: "undergrad",
  postgraduate: "postgrad", postgrad: "postgrad", pg: "postgrad", master: "postgrad", mba: "postgrad",
  doctorate: "doctorate", phd: "doctorate", doctoral: "doctorate",
  any: "any", all: "any",
};

const COVER_MAP = {
  full: "full", "full scholarship": "full", "fully funded": "full", complete: "full",
  partial: "partial", "partial scholarship": "partial",
  tuition: "tuition_only", "tuition only": "tuition_only", "tuition fee": "tuition_only",
  varies: "varies", variable: "varies",
};

const LOCATION_MAP = {
  india: "India", domestic: "India", "within india": "India",
  abroad: "Abroad", international: "Abroad", overseas: "Abroad", uk: "Abroad",
  ireland: "Abroad", dubai: "Abroad", usa: "Abroad",
  both: "Both", "india|abroad|both": "Both", any: "Both",
};

const PROVIDER_MAP = {
  government: "government", govt: "government", central: "government", state: "government",
  ministry: "government", national: "government",
  corporate: "corporate", company: "corporate", industry: "corporate", foundation: "corporate",
  ngo: "ngo", "non-profit": "ngo", trust: "ngo", charitable: "ngo",
  university: "university", college: "university", institution: "university",
  international: "international", global: "international",
};

function normalizeEnum(value, map, fallback) {
  if (!value) return fallback;
  const lower = String(value).toLowerCase().trim();
  if (map[lower]) return map[lower];
  for (const [key, mapped] of Object.entries(map)) {
    if (lower.includes(key)) return mapped;
  }
  return fallback;
}

function sanitizeScholarshipData(raw) {
  const s = { ...raw };

  s.education_level = normalizeEnum(s.education_level, EDUCATION_MAP, "any");
  s.cover_type      = normalizeEnum(s.cover_type,      COVER_MAP,      "partial");
  s.study_location  = normalizeEnum(s.study_location,  LOCATION_MAP,   "Both");
  s.provider_type   = normalizeEnum(s.provider_type,   PROVIDER_MAP,   "government");

  if (!s.name || typeof s.name !== "string" || s.name.trim().length < 3) {
    throw new Error("Groq extraction returned no valid scholarship name.");
  }

  if (s.amount_value && typeof s.amount_value !== "number") {
    s.amount_value = parseFloat(String(s.amount_value).replace(/[^0-9.]/g, "")) || 0;
  }
  if (s.max_income_annual && typeof s.max_income_annual !== "number") {
    s.max_income_annual = parseFloat(String(s.max_income_annual).replace(/[^0-9.]/g, "")) || null;
  }

  if (typeof s.requires_disability !== "boolean") {
    s.requires_disability = Boolean(s.requires_disability);
  }

  if (!Array.isArray(s.field_of_study)) {
    s.field_of_study = s.field_of_study ? [String(s.field_of_study)] : ["All"];
  }
  if (!Array.isArray(s.required_documents)) {
    s.required_documents = s.required_documents ? [String(s.required_documents)] : [];
  }

  s.name     = s.name.trim().substring(0, 200);
  s.provider = s.provider ? String(s.provider).trim() : "Unknown";

  if (!s.amount_string || s.amount_string === "₹0 per year" || s.amount_string === "₹0" || s.amount_string === "0" || s.amount_string.toLowerCase() === "varies") {
    if (s.cover_type === "full") {
      s.amount_string = "Fully Funded";
    } else if (s.cover_type === "tuition_only") {
      s.amount_string = "Full Tuition Waiver";
    } else if (s.amount_value && s.amount_value > 0) {
      s.amount_string = `₹${s.amount_value.toLocaleString("en-IN")}/year`;
    } else {
      s.amount_string = "Variable Award";
    }
  }

  return s;
}

const EXTRACTION_PROMPT = `You are a scholarship data extraction engine for an Indian student platform.

Extract scholarship details from the provided page content and return ONLY a valid JSON object.

IMPORTANT — use EXACTLY these values for enum fields:
- education_level: must be one of: "school", "diploma", "undergrad", "postgrad", "doctorate", "any"
- cover_type: must be one of: "full", "partial", "tuition_only", "varies"
- study_location: must be one of: "India", "Abroad", "Both"
- provider_type: must be one of: "government", "corporate", "ngo", "university", "international"

Return this exact JSON structure:
{
  "name": "Official scholarship name (required)",
  "provider": "Organization providing the scholarship",
  "amount_value": 50000,
  "amount_currency": "INR",
  "amount_string": "₹50,000 per year",
  "cover_type": "partial",
  "cover_details": "What costs are covered",
  "education_level": "undergrad",
  "field_of_study": ["Engineering", "Science"],
  "country": "India",
  "study_location": "India",
  "max_income_annual": 800000,
  "min_gpa": 60,
  "requires_disability": false,
  "citizenship": "Indian",
  "min_work_experience": 0,
  "required_gender": "Any",
  "deadline": "2026-12-31",
  "application_url": "https://example.com/apply",
  "required_documents": ["Marksheets", "Income Certificate"],
  "application_effort_hours": 4,
  "provider_type": "government",
  "awards_per_year": null,
  "notes": "Any extra information"
}

Rules:
- Use null for unknown numeric fields
- Convert all amounts to INR (1 USD = 83 INR, 1 GBP = 105 INR)
- Deadline format: YYYY-MM-DD, default to 2027-03-31 if not found
- Return ONLY the JSON object, no markdown fences, no extra text`;

async function extractWithGroq(text) {
  if (!GROQ_KEY) throw new Error("GROQ_API_KEY not set in .env");
  const Groq = require("groq-sdk");
  const groq = new Groq({ apiKey: GROQ_KEY });

  const completion = await groq.chat.completions.create({
    model: "llama-3.1-8b-instant",
    max_tokens: 1000,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: EXTRACTION_PROMPT },
      { role: "user", content: `Extract scholarship data from this page:\n\n${text.substring(0, 8000)}` },
    ],
  });

  const raw = completion.choices[0].message.content.trim();
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const cleaned = raw.replace(/^```json?\s*/i, "").replace(/```\s*$/i, "").trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Groq did not return valid JSON");
    parsed = JSON.parse(match[0]);
  }

  return sanitizeScholarshipData(parsed);
}

function firecrawlScrape(url) {
  return new Promise((resolve, reject) => {
    if (!FIRECRAWL_KEY) return reject(new Error("FIRECRAWL_API_KEY not set in .env"));
    const body = JSON.stringify({ url, formats: ["markdown"] });
    const req = https.request({
      hostname: "api.firecrawl.dev",
      path: "/v1/scrape",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${FIRECRAWL_KEY}`,
        "Content-Length": Buffer.byteLength(body),
      },
    }, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error("Failed to parse Firecrawl response")); }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

const IS_BAD_URL = (u) => /youtube\.com|youtu\.be|facebook\.com|instagram\.com|twitter\.com|x\.com|tiktok\.com/i.test(u);

// Domains that mostly re-list links rather than host extractable scholarship
// detail — skip them when discovered (buddy4study stays a default source).
const LOW_VALUE_DOMAINS = new Set([
  "buddy4study.com", "scholarships.net.in", "getmyuni.com",
  "scholars4dev.com", "youthop.com", "sarkariresult.com",
  "collegedunia.com", "shiksha.com", "careers360.com", "edufever.com",
]);

function hostnameOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); }
  catch { return ""; }
}

// Skip generic job/result aggregators that don't hold scholarship detail.
function isLowValueUrl(url) {
  const h = hostnameOf(url);
  return LOW_VALUE_DOMAINS.has(h) || /(sarkari|recruitment|admit-card|job-)/i.test(h);
}

// Prefer official/academic sources when ranking discovered pages.
function sourceValue(url) {
  const h = hostnameOf(url);
  let score = 0;
  if (/\.gov\.in$|\.ac\.in$|\.nic\.in$/.test(h)) score += 3; // official portals
  if (/\.edu$|\.org$/.test(h)) score += 2;                    // universities / NGOs
  if (/(scholarship|grant|fellowship|foundation|trust)/i.test(h)) score += 1;
  return score;
}

async function discoverNewScholarshipSites(targetLimit = 100) {
  if (!FIRECRAWL_KEY) {
    console.log("  ⚠️  FIRECRAWL_API_KEY not set — skipping site discovery.");
    return [];
  }

  // Guard against absurd values passed via --limit.
  const limit = Math.min(200, Math.max(1, targetLimit || 100));

  // Shuffle search query pool so subsequent runs search DIFFERENT topics and find new results
  const shuffledQueries = [...SEARCH_QUERY_POOL].sort(() => 0.5 - Math.random());
  // Spread across more queries for better category coverage, pulling enough
  // results per query so the total approaches ~limit unique pages.
  const numQueriesToUse = Math.min(25, shuffledQueries.length);
  const selectedQueries = shuffledQueries.slice(0, numQueriesToUse);
  const itemsPerQuery = Math.max(4, Math.ceil(limit / numQueriesToUse));

  console.log(`🔍 Discovering new scholarship pages using ${selectedQueries.length} randomized search queries (~${itemsPerQuery} links each)...`);

  const discovered = [];
  const seenUrls = new Set();

  for (const query of selectedQueries) {
    try {
      const result = await new Promise((resolve, reject) => {
        const body = JSON.stringify({ query, limit: itemsPerQuery });
        const req = https.request({
          hostname: "api.firecrawl.dev",
          path: "/v1/search",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${FIRECRAWL_KEY}`,
            "Content-Length": Buffer.byteLength(body),
          },
        }, (res) => {
          let data = "";
          res.on("data", c => data += c);
          res.on("end", () => {
            try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
          });
        });
        req.on("error", reject);
        req.write(body);
        req.end();
      });

      if (result.data && Array.isArray(result.data)) {
        result.data.forEach(item => {
          if (item.url && !seenUrls.has(item.url) && !IS_BAD_URL(item.url) && !isLowValueUrl(item.url)) {
            seenUrls.add(item.url);
            discovered.push({ url: item.url, name: item.title || item.url });
          }
        });
      }
    } catch (err) {
      console.warn(`  ⚠️  Search query failed ("${query}"):`, err.message);
    }
  }

  // Process official/academic sources first, then lower-value ones.
  discovered.sort((a, b) => sourceValue(b.url) - sourceValue(a.url));

  console.log(`🌐 Site Discovery: found ${discovered.length} unique potential pages.\n`);
  return discovered;
}

async function processSource(source) {
  console.log(`\n📄 [${source.name}] ${source.url}`);

  const scraped = await firecrawlScrape(source.url);
  const markdown = scraped?.data?.markdown || "";

  if (!markdown || markdown.length < 100) {
    console.log(`  ⚠️  Page too short or empty (${markdown.length} chars) — skipping.`);
    return false;
  }

  console.log(`  📝 Scraped ${markdown.length.toLocaleString()} chars`);
  console.log(`  🤖 Extracting scholarship fields with Groq AI...`);

  const data = await extractWithGroq(markdown);
  data.source_url = source.url;
  data.verified   = true;

  const existing = await Scholarship.findOne({
    $or: [{ name: data.name }, { source_url: source.url }]
  });
  if (existing) {
    console.log(`  ⏭  Already in database: "${data.name}"`);
    return false;
  }

  await Scholarship.create(data);
  console.log(`  ✅ Added: "${data.name}" (${data.amount_string || "amount TBD"}, ${data.education_level}, ${data.study_location})`);
  return true;
}

async function runScraper(manualUrl = null, targetLimit = 100) {
  await connectDB();
  console.log("\n🕷️  AtlasFunding — Scholarship Scraping Pipeline\n" + "─".repeat(52));

  let totalAdded = 0;

  if (manualUrl) {
    const name = new URL(manualUrl).hostname;
    console.log(`\n🎯 Manual mode — scraping single URL: ${manualUrl}\n`);
    try {
      const added = await processSource({ url: manualUrl, name });
      if (added) totalAdded++;
    } catch (err) {
      console.error(`  ❌ Failed: ${err.message}`);
    }
  } else {
    const discovered = await discoverNewScholarshipSites(targetLimit);
    const allSources = [...DEFAULT_SOURCES, ...discovered];
    console.log(`📋 Processing ${allSources.length} sources (${DEFAULT_SOURCES.length} default + ${discovered.length} discovered)\n`);

    for (const source of allSources) {
      try {
        const added = await processSource(source);
        if (added) totalAdded++;
      } catch (err) {
        console.error(`  ❌ Error on "${source.name}": ${err.message}`);
      }
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  console.log(`\n${"─".repeat(52)}`);
  console.log(`🎉 Pipeline complete — ${totalAdded} new scholarship(s) added to MongoDB.`);
  console.log(`📊 Total scholarships in DB: ${await Scholarship.countDocuments()}\n`);

  return totalAdded;
}

if (require.main === module) {
  const urlFlagIndex = process.argv.indexOf("--url");
  const manualUrl = urlFlagIndex !== -1 ? process.argv[urlFlagIndex + 1] : null;

  const limitFlagIndex = process.argv.indexOf("--limit");
  const targetLimit = limitFlagIndex !== -1 ? parseInt(process.argv[limitFlagIndex + 1]) || 100 : 100;

  runScraper(manualUrl, targetLimit)
    .then(() => process.exit(0))
    .catch(err => {
      console.error("Scraper crashed:", err);
      process.exit(1);
    });
}

module.exports = { runScraper, processSource };

