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
const mongoose = require("mongoose");
const connectDB = require("../src/db/connection");
const Scholarship = require("../src/models/Scholarship");

const FIRECRAWL_KEY = process.env.FIRECRAWL_API_KEY;
const GROQ_KEY = process.env.GROQ_API_KEY;
// Optional — a free Jina API key raises scrape rate limits (~20 → 100 req/min).
const JINA_KEY = process.env.JINA_API_KEY;

// Refreshable INR exchange rates — used at ingest-time to normalize foreign
// amounts. Kept OUT of the Groq prompt so the LLM stores currency as-stated and
// these constants can be updated without touching the prompt.
const FX_RATES_INR = {
  INR: 1, USD: 83, GBP: 105, EUR: 90, AUD: 54, CAD: 61, SGD: 62, JPY: 0.56, AED: 23,
};
function convertToInr(value, currency) {
  const rate = FX_RATES_INR[(currency || "INR").toUpperCase()];
  if (!rate) return value || null;
  return Math.round((value || 0) * rate);
}

// Shared pause used across discovery loops to keep each step under its provider's
// per-minute rate limit (Firecrawl search, Jina, etc.).
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Minimum pause between source extractions. Each source = 1 Groq call, so this
// paces Groq at ~24 req/min to stay clear of on-demand TPM ceilings; the 429
// backoff in groqExtract is the safety net for any burst that still slips through.
// ponytail: fixed pacing, swap for token-aware throttling if Groq TPM is ever
// reached at this rate.
const SOURCE_DELAY_MS = 2500;

// ── Default sources to always scrape ───────────────────────────────────────────
const DEFAULT_SOURCES = [
  { url: "https://www.buddy4study.com/scholarships", name: "Buddy4Study" },
  { url: "https://www.scholarships.gov.in/", name: "NSP India Portal" },
  { url: "https://newstrides.co/new/uk-delhi/", name: "NewStrides UK Grants" },
  { url: "https://education.gov.in/scholarships", name: "Ministry of Education India" },
  { url: "https://www.tatatrusts.org/our-work/individual-grants-programme/education-grants", name: "Tata Trusts Grants" },
  { url: "https://www.scholarships.net.in/", name: "Scholarships Net India" },
  { url: "https://grad.ncsu.edu/student-funding/fellowships-and-grants/national/nationally-competitive-graduate-fellowships/", name: "NC State Graduate Fellowships" },
  { url: "https://www.pathwaystoscience.org/grad.aspx", name: "Pathways to Science STEM" },
  { url: "https://www.daad.in/en/find-funding/scholarship-database/", name: "DAAD Germany India Database" },
  { url: "https://www.chevening.org/scholarships/", name: "Chevening UK Fellowships" }
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

// ── Firecrawl search throttling ────────────────────────────────────────────────
// Search credits are the scarcest resource and Firecrawl rate-limits aggressively
// (the discovery pass once failed 15/25 queries with HTTP 429). A short fixed gap
// between queries keeps us under the per-minute window; a backoff/retry soaks up
// any residual 429s instead of dropping the query.
const SEARCH_DELAY_MS = 800;     // ~800ms between search calls
const SEARCH_MAX_RETRIES = 2;    // on 429, back off 5s/10s and retry before giving up

// Single Firecrawl /v1/search call with 429-aware backoff + retry.
async function firecrawlSearch(query, limit) {
  const body = JSON.stringify({ query, limit });
  const doRequest = () => new Promise((resolve, reject) => {
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
        // Reject before parsing so a proxy/upstream HTML error page (e.g.
        // "Bad Gateway") surfaces as a clean, actionable message — not a raw
        // JSON.parse crash.
        if (res.statusCode && res.statusCode >= 400) {
          const err = new Error(`Firecrawl search HTTP ${res.statusCode}`);
          err.statusCode = res.statusCode;
          return reject(err);
        }
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error("Firecrawl search returned a non-JSON response")); }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });

  for (let attempt = 0; attempt <= SEARCH_MAX_RETRIES; attempt++) {
    try {
      return await doRequest();
    } catch (err) {
      const retryable = err.statusCode === 429 && attempt < SEARCH_MAX_RETRIES;
      if (retryable) {
        const backoffMs = 5000 * (attempt + 1); // 5s, then 10s
        console.log(`    ↻ Rate-limited (429) — backing off ${backoffMs / 1000}s and retrying (attempt ${attempt + 1}/${SEARCH_MAX_RETRIES})...`);
        await sleep(backoffMs);
        continue;
      }
      throw err;
    }
  }
}

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

  // Reject placeholder / garbage names — Groq occasionally echoes an example
  // field ("Scholarship Name") or a generic fragment ("Undergraduate enrolment
  // tuition fee amount") instead of a real programme. These are not scholarships.
  const PLACEHOLDER_NAME_RE =
    /^(scholarship\s*name|name\s*(of|for)?\s*(the\s*)?scholarship|scholarship|grant\s*name|n\/?a|na|tbd|to\s*be\s*decided|null|undefined|-+|sample|example|test(\s*scholarship)?)(\s*\([^)]*\))?$/i;
  const name = s.name.trim();
  if (PLACEHOLDER_NAME_RE.test(name)) {
    throw new Error(`Groq returned a placeholder scholarship name: "${name}"`);
  }

  if (typeof s.amount_value === "string") {
    s.amount_value = parseFloat(String(s.amount_value).replace(/[^0-9.]/g, ""));
  }
  // Normalize any foreign-currency amount to INR at ingest time. Rates live in
  // FX_RATES_INR (refreshable) — the LLM stores currency as-stated.
  if (s.amount_value && !isNaN(Number(s.amount_value))) {
    s.amount_value = convertToInr(Number(s.amount_value), s.amount_currency);
    s.amount_currency = "INR";
  }
  // Aggregate/endowment figures ("$655 million" fund, "₹100 crore corpus") are
  // program-wide pools, not per-student awards. One such mis-parse poisons the
  // funding-pool metric (a single bad record once dominated 99% of the total).
  // No Indian scholarship award exceeds ₹50Cr, so zero these out and let
  // cover_type drive the display instead. // ponytail: absolute ceiling, refine
  // to an aggregate-keyword check only if a legit large award ever appears.
  if (s.amount_value > 500000000) {
    s.amount_value = null;
    s.amount_string = null; // regenerated below from cover_type
  }
  if (s.max_income_annual && typeof s.max_income_annual !== "number") {
    s.max_income_annual = parseFloat(String(s.max_income_annual).replace(/[^0-9.]/g, "")) || null;
  }
  // Work experience defaults to 0 (not required) when the page is silent.
  if (s.min_work_experience == null || isNaN(Number(s.min_work_experience))) {
    s.min_work_experience = 0;
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

  // Prefer the official link Groq picked from the page's outbound links over a
  // generic application_url. Only accept it if it survives the provider sanity
  // check (trust TLD, or a domain fragment matching the provider/name) — else
  // fall back to application_url or null, so users never get a wrong or
  // aggregator link.
  const official = raw.official_source_url;
  if (official && typeof official === "string" && /^https?:\/\//i.test(official)) {
    if (plausibleOfficialUrl(official, s.provider, s.name)) {
      s.application_url = official;
    } else if (!(s.application_url && /^https?:\/\//i.test(s.application_url))) {
      s.application_url = null;
    }
  }
  delete s.official_source_url; // raw prompt field, don't persist

  return s;
}

const EXTRACTION_PROMPT = `You are a data extraction engine for a student scholarship database. Given raw markdown scraped from a page (which may contain one or multiple scholarships/grants), extract ALL active scholarships and return ONLY a valid JSON object — no preamble, no markdown fences.

If the page does not describe any actual scholarship/grant/funding opportunity (nav page, index, 404, article, generic chat/forum discussion without lists, etc.), return: {"valid": false}

Otherwise use EXACTLY these enum values:
- education_level: "school" | "diploma" | "undergrad" | "postgrad" | "doctorate" | "any"
- cover_type: "full" | "partial" | "tuition_only" | "varies"
- study_location: "India" | "Abroad" | "Both"
- provider_type: "government" | "corporate" | "ngo" | "university" | "international"

Return exactly this JSON format:
{
  "valid": true,
  "scholarships": [
    {
      "name": "Official scholarship name (required)",
      "provider": "Organization providing it",
      "amount_value": <number, per student value as stated on page>,
      "amount_currency": "INR" | "USD" | "GBP" | "...",
      "amount_string": "₹50,000 per year",
      "cover_type": "partial",
      "cover_details": "What costs are covered, or null",
      "education_level": "undergrad",
      "field_of_study": ["Engineering", "Science"],
      "country": "India",
      "study_location": "India",
      "max_income_annual": <number, or null>,
      "min_gpa": <number, or null>,
      "requires_disability": false,
      "citizenship": "Indian",
      "min_work_experience": <number, default 0 if not mentioned — never null>,
      "required_gender": "Any",
      "deadline": "YYYY-MM-DD or null",
      "application_url": "https://... or null",
      "official_source_url": "the exact official application/provider URL chosen from the Outbound Links list, or null",
      "required_documents": ["Marksheets", "Income Certificate"],
      "application_effort_hours": <number, or null>,
      "provider_type": "government",
      "awards_per_year": null,
      "notes": "Any extra info, or null"
    }
  ]
}

Rules:
- Extract all valid, distinct scholarships listed on the page. Do not include expired/inactive items unless active dates are mentioned.
- Never invent data. Use null when a field isn't stated on the page.
- official_source_url: if one of the provided Outbound Links is clearly the scholarship's official application page or the provider's official site (matching the provider name), set it to that EXACT URL. If none match, set null. NEVER invent a URL that isn't in the provided list.
- If work experience isn't mentioned, default min_work_experience to 0, not null.
- Dates must be YYYY-MM-DD; if only month/year given, use the 1st of that month.
- Do NOT convert currencies — keep amount_value and amount_currency as the page states them.
- Discard/null any application urls or official source urls that point to social forums or general sharing sites (like reddit.com, facebook.com, youtube.com, x.com, linkedin.com, imgur.com), as these are social pointers, not official applications.
- For incomplete, truncated words, or messy typos from copy-pasted posts, resolve and clean them up automatically to form correct english statements.
- Return ONLY the JSON object.`;

// Fields that tend to sit BELOW a scholarship's description/story on Indian
// listing pages (eligibility, deadlines, how-to-apply). A flat front-truncation
// cuts them off, yielding valid:true records with a real name but null
// eligibility/deadline — quietly incomplete, never a crash. So instead of a
// blunt head-cut we keep the page head (name + description context) plus windows
// around the lines that carry those fields, capped so the request stays under
// Groq's TPM limit.
const FIELD_KEYWORD_RE = /eligib|deadline|last\s*date|criteria|how\s*to\s*apply|requirement|selection\s*(process|criteria)|application\s*(process|fee|form)/i;
const EXTRACTION_HEAD_CHARS = 1500; // always keep the top of the page (context)
const FIELD_WINDOW_CHARS = 2500;     // chars centered on each keyword line
const EXTRACTION_MAX_CHARS = 5500;   // hard cap to keep the request token-safe

function truncateForExtraction(md) {
  const text = String(md || "");
  const lines = text.split("\n");

  // Record each line's char offset so we can slice windows back out of the raw text.
  const offsets = [];
  let pos = 0;
  for (const ln of lines) { offsets.push(pos); pos += ln.length + 1; }

  // One centered window per keyword-bearing line, then merge overlaps.
  const windows = [];
  lines.forEach((ln, i) => {
    if (FIELD_KEYWORD_RE.test(ln)) {
      windows.push([
        Math.max(0, offsets[i] - Math.floor(FIELD_WINDOW_CHARS / 2)),
        Math.min(text.length, offsets[i] + ln.length + Math.ceil(FIELD_WINDOW_CHARS / 2)),
      ]);
    }
  });
  windows.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [s, e] of windows) {
    if (merged.length && s <= merged[merged.length - 1][1]) {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], e);
    } else {
      merged.push([s, e]);
    }
  }

  // Head + windows, skipping any window that overlaps the head, capped overall.
  let out = text.slice(0, EXTRACTION_HEAD_CHARS);
  for (const [s, e] of merged) {
    if (out.length >= EXTRACTION_MAX_CHARS) break;
    const cs = Math.max(s, EXTRACTION_HEAD_CHARS); // don't re-add the head
    if (cs >= e) continue;
    out += "\n\n" + text.slice(cs, e);
  }
  return out.slice(0, EXTRACTION_MAX_CHARS).trim();
}

// Strip common boilerplate (nav, footer, cookie banners, share widgets) so each
// Groq call uses fewer tokens and the model isn't distracted by junk.
function cleanMarkdown(md) {
  return String(md || "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/Cookie|Privacy Policy|Terms of Service|All rights reserved|Share on|Follow us|Subscribe to our newsletter/gi, "")
    .split("\n")
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .join("\n");
}

// Groq TPM can 429 mid-cooldown — the same scarcity Firecrawl search showed, and
// it costs real scholarships (whole legitimate pages lost, not just API calls).
// Retry with backoff, parsing the exact wait Groq reports ("try again in 12.99s")
// instead of guessing; fall back to a 5s/10s ramp when the message omits it.
const GROQ_MAX_RETRIES = 2;

async function groqExtract(content) {
  if (!GROQ_KEY) throw new Error("GROQ_API_KEY not set in .env");
  const Groq = require("groq-sdk");
  const groq = new Groq({ apiKey: GROQ_KEY });

  for (let attempt = 0; attempt <= GROQ_MAX_RETRIES; attempt++) {
    try {
      const completion = await groq.chat.completions.create({
        model: "llama-3.1-8b-instant",
        max_tokens: 1000,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: EXTRACTION_PROMPT },
          { role: "user", content: `Extract scholarship data from this page:\n\n${content}` },
        ],
      });
      return completion.choices[0].message.content.trim();
    } catch (err) {
      const retryable = err.status === 429 && attempt < GROQ_MAX_RETRIES;
      if (retryable) {
        const waitMatch = String(err.message || "").match(/try again in ([\d.]+)s/i);
        const waitMs = waitMatch ? parseFloat(waitMatch[1]) * 1000 + 500 : 5000 * (attempt + 1);
        console.log(`    ↻ Groq rate-limited (429) — retrying in ${(waitMs / 1000).toFixed(1)}s (attempt ${attempt + 1}/${GROQ_MAX_RETRIES})...`);
        await sleep(waitMs);
        continue;
      }
      throw err;
    }
  }
}

async function extractWithGroq(text, officialLinks = []) {
  const cleaned = cleanMarkdown(text);
  // Keyword-anchored truncation keeps the page head PLUS the eligibility/deadline
  // sections that Indian listing pages bury below the description — and caps total
  // size so the request stays under Groq's on-demand TPM limit (a flat 4000-char
  // cut was token-safe but silently dropped exactly those fields).
  const content = truncateForExtraction(cleaned);

  // Hand the model real outbound links and force it to pick, not invent. Appended
  // AFTER truncation so the list survives the keyword-window cutting.
  const linkBlock = officialLinks.length
    ? `\n\nOutbound links found on page (pick official_source_url from these ONLY):\n${officialLinks.map((l) => `- ${l.text} → ${l.url}`).join("\n")}`
    : "\n\nNo outbound links provided — official_source_url must be null.";

  const raw = await groqExtract(content + linkBlock);
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const cleanedRaw = raw.replace(/^```json?\s*/i, "").replace(/```\s*$/i, "").trim();
    const match = cleanedRaw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Groq did not return valid JSON");
    parsed = JSON.parse(match[0]);
  }

  // Early-exit gate: page isn't actually a scholarship → caller skips it.
  if (parsed.valid === false || !Array.isArray(parsed.scholarships) || parsed.scholarships.length === 0) return null;

  const sanitizedList = parsed.scholarships
    .map(item => {
      try {
        return sanitizeScholarshipData(item);
      } catch (err) {
        console.warn(`  ⚠️ Failed to sanitize extracted scholarship "${item?.name}": ${err.message}`);
        return null;
      }
    })
    .filter(Boolean);

  return sanitizedList.length > 0 ? sanitizedList : null;
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

// Free Jina Reader — returns the page as clean markdown. A free JINA_API_KEY
// raises rate limits (~20 → 100 req/min) and adds a token budget. Used first;
// Firecrawl stays as a fallback for anti-bot / JS-heavy pages.
function jinaScrape(url) {
  return new Promise((resolve, reject) => {
    const headers = { Accept: "text/markdown", "X-Timeout": "30" };
    if (JINA_KEY) headers.Authorization = `Bearer ${JINA_KEY}`;
    https.get(`https://r.jina.ai/${url}`, { headers }, (res) => {
      if (res.statusCode >= 400) {
        res.resume();
        return reject(new Error(`Jina HTTP ${res.statusCode}`));
      }
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => resolve(data));
    }).on("error", reject);
  });
}

const IS_BAD_URL = (u) => /youtube\.com|youtu\.be|facebook\.com|instagram\.com|twitter\.com|x\.com|tiktok\.com/i.test(u);

// Domains that mostly re-list links rather than host extractable scholarship
// detail — skip them when discovered (buddy4study stays a default source).
const LOW_VALUE_DOMAINS = new Set([
  "buddy4study.com", "scholarships.net.in", "getmyuni.com",
  "scholars4dev.com", "youthop.com", "sarkariresult.com",
  "collegedunia.com", "shiksha.com", "careers360.com", "edufever.com",
  "wemakescholars.com", "scholarshiptab.com", "theglobalscholarship.org", "collegementor.com",
  "edcsr.com", "scholarships.com", "bold.org", "scholarshipowl.com",
  "scholarships360.com", "topuniversities.com", "gyandhan.com", "nextclimb.in",
  "idp.com", "kcoversees.com", "amityonline.com",
]);

function hostnameOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); }
  catch { return ""; }
}

// Job/result boards (sarkari results, recruitment, admit cards) never hold
// scholarship detail and should not even be crawled. Kept separate from the
// aggregator check below so we can read aggregator detail pages as DATA while
// still refusing to link users to them.
function isJobPortalUrl(url) {
  const h = hostnameOf(url);
  return /(sarkari|recruitment|admit-card|job-)/i.test(h);
}

// Aggregator/competitor domains. Matches the registrable domain and any subdomain
// (school.careers360.com, scholarships.buddy4study.com, etc.) — exact hostname
// matching misses those.
function isAggregatorUrl(url) {
  const h = hostnameOf(url);
  return [...LOW_VALUE_DOMAINS].some(d => h === d || h.endsWith("." + d));
}

function isLowValueUrl(url) {
  return isJobPortalUrl(url) || isAggregatorUrl(url);
}

// URLs we must never surface to users as an Apply target or provenance: social /
// video pages (a YouTube clip is not an application page) and aggregator/competitor
// domains (buddy4study, wemakescholars, etc. — sending users there hands our traffic
// to a rival). Returns null so callers fall back to a real source or drop the link.
function sanitizeExternalUrl(url) {
  if (!url) return null;
  if (IS_BAD_URL(url)) return null;
  if (isLowValueUrl(url)) return null;
  return url;
}

// Pull real outbound links from scraped markdown BEFORE Groq, so the model can
// pick the scholarship's official source instead of hallucinating a URL. Excludes
// internal links, assets, and aggregator/competitor domains (no aggregator→
// aggregator chaining). Returns a short list the prompt constrains Groq to.
function extractOutboundLinks(markdown, sourceDomain) {
  const urls = [...String(markdown || "").matchAll(/\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g)]
    .map((m) => ({ text: m[1].slice(0, 80), url: m[2] }));

  const out = [];
  for (const { text, url } of urls) {
    try {
      const domain = hostnameOf(url);
      if (!domain) continue;
      if (domain === sourceDomain) continue;   // internal link
      if (isAssetUrl(url)) continue;            // images/PDFs/etc
      if (isAggregatorUrl(url)) continue;       // don't chain aggregator→aggregator
      if (isJobPortalUrl(url)) continue;
      out.push({ text: text.trim() || domain, url });
    } catch { /* skip malformed URL */ }
    if (out.length >= 15) break; // keep the prompt small
  }
  return out;
}

// Sanity check before trusting an official link the model picked: accept clear
// trust TLDs (.gov/.edu/.ac.in/.org) outright, otherwise require the URL domain
// to share a recognizable fragment of the provider/scholarship name — rejects
// generic .com links we can't tie back to the provider (ads, related articles).
function plausibleOfficialUrl(url, provider, name) {
  const domain = hostnameOf(url);
  if (!domain) return false;
  if (/(\.gov\.|\.govt\.|\.edu\.|\.ac\.in|\.nic\.in|\.org)/i.test(domain)) return true;
  const haystack = (domain + " " + (url.match(/^https?:\/\/([^/]+)/)?.[1] || "")).toLowerCase();
  for (const frag of [provider, name]) {
    const norm = String(frag || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (norm.length >= 5 && haystack.includes(norm)) return true;
  }
  return false;
}

// Binary / non-HTML URLs that can never contain scholarship detail. The markdown
// link extractor picks up image and asset links (both [label](url) and ![alt](url))
// off listing pages; scraping those wastes a Jina/Firecrawl call each and, worse,
// can feed a tiny image-scrape to Groq, which hallucinates a "scholarship".
const ASSET_EXT_RE = /\.(png|jpe?g|gif|svg|webp|bmp|ico|pdf|zip|rar|7z|tar|gz|mp4|mp3|woff2?|ttf|eot|css|js)([?#&]|$)/i;
const ASSET_HOST_RE = /(cdn|cloudfront|amazonaws\.com|^s3|static|imgcdn|images?\.|logo)/i;
const SKIP_SCHEME_RE = /^(data:|mailto:|tel:|javascript:|blob:)/i;

function isAssetUrl(url) {
  const lower = String(url || "").toLowerCase().trim();
  if (!lower || SKIP_SCHEME_RE.test(lower)) return true;
  if (ASSET_EXT_RE.test(lower)) return true;
  try {
    const u = new URL(lower);
    // CDN/static/asset hosts, or asset-looking paths (…/img/…, …/logos/…).
    if (ASSET_HOST_RE.test(u.hostname)) return true;
    if (/\/?(img|images?|logos?|static|uploads?|assets?|_next\/image)\//.test(u.pathname)) return true;
  } catch {
    return true; // unparseable → not a scrapeable HTML detail page
  }
  return false;
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
      // Throttled + 429-retried call (see firecrawlSearch above).
      const result = await firecrawlSearch(query, itemsPerQuery);

      if (result.data && Array.isArray(result.data)) {
        result.data.forEach(item => {
          if (item.url && !seenUrls.has(item.url) && !IS_BAD_URL(item.url) && !isLowValueUrl(item.url) && !isAssetUrl(item.url)) {
            seenUrls.add(item.url);
            discovered.push({ url: item.url, name: item.title || item.url });
          }
        });
      }
    } catch (err) {
      console.warn(`  ⚠️  Search query failed ("${query}"):`, err.message);
    }
    // Steady ~800ms gap between searches keeps us under Firecrawl's per-minute
    // limit. If it still 429s, raise SEARCH_DELAY_MS or drop numQueriesToUse.
    await sleep(SEARCH_DELAY_MS);
  }

  // Process official/academic sources first, then lower-value ones.
  discovered.sort((a, b) => sourceValue(b.url) - sourceValue(a.url));
  discovered.splice(limit); // honor --limit: don't discover more than we'll process

  console.log(`🌐 Site Discovery: found ${discovered.length} unique potential pages.\n`);
  return discovered;
}

// Links that plausibly point at an individual scholarship detail page (heuristic
// used when crawling listing pages — aggregators often use /scholarship/ slugs).
const DETAIL_TOKEN = /(scholarship|fellowship|grant|bursary|\/scholarship\/|\/scholarships\/|apply-)/i;

// Extract absolute URLs from Jina's markdown link syntax: [label](href).
function extractInternalLinks(markdown, baseHost) {
  const links = [];
  const seen = new Set();
  const re = /\[[^\]]*\]\(([^)\s]+)\)/g;
  let m;
  while ((m = re.exec(String(markdown))) !== null) {
    const href = m[1].replace(/[)"'<>]+$/g, "");
    let abs;
    try { abs = new URL(href, `https://${baseHost}`).href; } catch { continue; }
    if (seen.has(abs)) continue;
    seen.add(abs);
    // Drop image/CDN/static/asset links — they are never scholarship detail pages.
    if (isAssetUrl(abs)) continue;
    links.push(abs);
  }
  return links;
}

// FREE discovery: crawl the trusted listing pages (DEFAULT_SOURCES) for their
// internal detail-page links, then those get Jina-scraped individually in the
// main loop. No search credits spent. Firecrawl search remains as a fallback.
async function discoverViaCrawl(targetLimit = 100) {
  const limit = Math.min(200, Math.max(1, targetLimit || 100));
  const discovered = [];
  const seenUrls = new Set();

  console.log(`🔍 Crawling ${DEFAULT_SOURCES.length} trusted listing pages for detail links...`);

  for (const src of DEFAULT_SOURCES) {
    try {
      const baseHost = hostnameOf(src.url);
      let markdown;
      try {
        markdown = await jinaScrape(src.url);
      } catch {
        const scraped = await firecrawlScrape(src.url);
        markdown = scraped?.data?.markdown || "";
      }

      const links = extractInternalLinks(markdown, baseHost);
      console.log(`  ${src.name}: ${links.length} links found`);
      for (const url of links) {
        // Block only job portals here — aggregator detail pages are legit DATA
        // sources now (their links are stripped before users ever see them).
        if (seenUrls.has(url) || IS_BAD_URL(url) || isJobPortalUrl(url)) continue;
        seenUrls.add(url);
        // Keep only links that look like detail pages (or are already on a
        // scholarship-ish host) — drop nav/footer/social clutter.
        if (DETAIL_TOKEN.test(url) || sourceValue(url) >= 3) {
          discovered.push({ url, name: hostnameOf(url) });
        }
      }
    } catch (err) {
      console.warn(`  ⚠️  Crawl of ${src.name} failed: ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  // Official/academic detail pages first.
  discovered.sort((a, b) => sourceValue(b.url) - sourceValue(a.url));
  discovered.splice(limit);

  console.log(`🔎 Crawl Discovery: found ${discovered.length} unique potential detail pages.\n`);
  return discovered;
}

async function processSource(source) {
  console.log(`\n📄 [${source.name}] ${source.url}`);

  // Jina first (free), Firecrawl as fallback for blocked / JS-heavy pages.
  let markdown = null;
  try {
    markdown = await jinaScrape(source.url);
  } catch (jinaErr) {
    console.log(`  ⚠️  Jina failed (${jinaErr.message}) — falling back to Firecrawl.`);
    try {
      const scraped = await firecrawlScrape(source.url);
      markdown = scraped?.data?.markdown || "";
    } catch (fcErr) {
      console.log(`  ⚠️  Firecrawl also failed (${fcErr.message}) — skipping.`);
      return false;
    }
  }
  markdown = markdown || "";

  // A real scholarship detail page has far more than 400 chars; anything shorter
  // is a nav stub, error page, or image-scrape artifact that can only waste a
  // Groq call (and occasionally trigger a hallucinated entry).
  const MIN_CONTENT_CHARS = 400;
  if (!markdown || markdown.length < MIN_CONTENT_CHARS) {
    console.log(`  ⚠️  Page too short or empty (${markdown.length} chars) — skipping.`);
    return false;
  }

  console.log(`  📝 Scraped ${markdown.length.toLocaleString()} chars`);
  console.log(`  🤖 Extracting scholarship fields with Groq AI...`);

  // Aggregate the page's outbound links so Groq can pick the real application
  // URL from them (never invents one). Aggregators/details are allowed as data
  // sources, but only official links survive as application_url.
  const links = extractOutboundLinks(markdown, hostnameOf(source.url));

  const dataList = await extractWithGroq(markdown, links);
  if (!dataList || dataList.length === 0) {
    console.log(`  ⏭  No valid scholarship on page — skipping.`);
    return false;
  }

  let addedAny = false;
  for (const data of dataList) {
    data.application_url = sanitizeExternalUrl(data.application_url);
    data.source_url      = sanitizeExternalUrl(source.url);
    data.scraped_from_url = source.url;
    data.verified        = true;

    // Check if name already exists in database (names are unique indexed)
    const existing = await Scholarship.findOne({ name: data.name });
    if (existing) {
      console.log(`  ⏭  Already in database: "${data.name}"`);
      continue;
    }

    try {
      await Scholarship.create(data);
      console.log(`  ✅ Added: "${data.name}" (${data.amount_string || "amount TBD"}, ${data.education_level}, ${data.study_location})`);
      addedAny = true;
    } catch (err) {
      console.error(`  ❌ Error saving "${data.name}":`, err.message);
    }
  }

  return addedAny;
}

async function runScraper(manualUrl = null, targetLimit = 100, noSearch = false) {
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
    // Free crawl first (no credits). Firecrawl search augments coverage only if
    // a key is present and search is not disabled.
    const crawled = await discoverViaCrawl(targetLimit);
    let discovered = [...crawled];
    if (FIRECRAWL_KEY && !noSearch) {
      const searched = await discoverNewScholarshipSites(targetLimit);
      const seen = new Set(crawled.map(s => s.url));
      for (const s of searched) {
        if (!seen.has(s.url)) { seen.add(s.url); discovered.push(s); }
      }
    } else if (noSearch) {
      console.log("🚫 Skipping Firecrawl search queries to save API credits (free Jina crawl only).");
    }
    // Cap total sources processed to --limit (defaults always run first, then as
    // many discovered pages as fit). Previously the limit only narrowed discovery
    // but the processing loop ran every discovered page regardless.
    const allSources = [...DEFAULT_SOURCES, ...discovered].slice(0, targetLimit);
    console.log(`📋 Processing ${allSources.length} sources (${DEFAULT_SOURCES.length} default + ${allSources.length - DEFAULT_SOURCES.length} discovered) — capped at ${targetLimit}\n`);

    for (const source of allSources) {
      try {
        const added = await processSource(source);
        if (added) totalAdded++;
      } catch (err) {
        console.error(`  ❌ Error on "${source.name}": ${err.message}`);
      }
      await new Promise(r => setTimeout(r, SOURCE_DELAY_MS));
    }
  }

  console.log(`\n${"─".repeat(52)}`);
  console.log(`🎉 Pipeline complete — ${totalAdded} new scholarship(s) added to MongoDB.`);
  console.log(`📊 Total scholarships in DB: ${await Scholarship.countDocuments()}\n`);

  return totalAdded;
}

// Parse the --limit flag tolerating `--limit 30`, `--limit=30`, and `--limit30`.
function parseLimitArg(argv) {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--limit") {
      const n = parseInt(argv[i + 1], 10);
      if (!isNaN(n)) return n;
    }
    const eq = arg.match(/^--limit=(\d+)$/);
    if (eq) return parseInt(eq[1], 10);
    const glued = arg.match(/^--limit(\d+)$/);
    if (glued) return parseInt(glued[1], 10);
  }
  return 100;
}

if (require.main === module) {
  const urlFlagIndex = process.argv.indexOf("--url");
  const manualUrl = urlFlagIndex !== -1 ? process.argv[urlFlagIndex + 1] : null;

  // Accept --limit 30, --limit=30, and the commonly-typed --limit30 so the cap
  // actually applies (a silent miss would run an unthrottled full pass).
  const targetLimit = parseLimitArg(process.argv);
  
  const noSearch = process.argv.includes("--no-search") || process.argv.includes("--free");

  runScraper(manualUrl, targetLimit, noSearch)
    .then(async () => {
      try {
        await mongoose.disconnect();
      } catch (e) {}
      process.exit(0);
    })
    .catch(async err => {
      console.error("Scraper crashed:", err);
      try {
        await mongoose.disconnect();
      } catch (e) {}
      process.exit(1);
    });
}

module.exports = { runScraper, processSource };