/**
 * ScholarshipSearchEngine
 * Primary: Groq semantic parsing
 * Fallback: Keyword/regex matching (no API call)
 */

class ScholarshipSearchEngine {
  constructor(groqClient = null) {
    this.groq = groqClient;
    this.queryCache = new Map(); // In-memory cache keyed by query string
  }

  // ── PUBLIC API ─────────────────────────────────────────────────────────────

  /**
   * Main search entry point
   */
  async search(query, scholarships, userProfile = null) {
    if (!query || query.trim().length < 2) return { parsedQuery: null, matches: scholarships };

    const cacheKey = `${query.toLowerCase().trim()}`;
    let parsedQuery;

    if (this.queryCache.has(cacheKey)) {
      parsedQuery = this.queryCache.get(cacheKey);
    } else if (this.groq) {
      try {
        parsedQuery = await this.parseWithGroq(query, userProfile);
        this.queryCache.set(cacheKey, parsedQuery);
      } catch (err) {
        console.warn("Groq search failed, using keyword fallback:", err.message);
        parsedQuery = this.keywordFallback(query);
      }
    } else {
      parsedQuery = this.keywordFallback(query);
    }

    const matches = this.matchScholarships(parsedQuery, scholarships, query);
    return { parsedQuery, matches };
  }

  // ── GROQ PARSING ───────────────────────────────────────────────────────────

  async parseWithGroq(query, userProfile) {
    const contextStr = userProfile
      ? `User context: education=${userProfile.target_education_level}, field=${userProfile.field_of_study}, country preferences=${userProfile.preferred_countries?.join(", ")}`
      : "No user context.";

    const completion = await this.groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      max_tokens: 300,
      temperature: 0,
      messages: [
        {
          role: "system",
          content: `You parse scholarship search queries into structured JSON. ${contextStr}
Return ONLY a valid JSON object, no explanation:
{
  "keywords": ["string"],
  "education_level": "school|diploma|undergrad|postgrad|doctorate|null",
  "preferred_countries": ["India","USA","Canada","UK","Germany","Australia"],
  "fields": ["Computer Science","Engineering","Medicine","Law","Business","Arts","Science"],
  "funding_type": "full|partial|any",
  "provider_type": "government|corporate|ngo|university|international|any"
}`,
        },
        { role: "user", content: `Query: "${query}"` },
      ],
    });

    const text = completion.choices[0].message.content.trim();
    return JSON.parse(text);
  }

  // ── KEYWORD FALLBACK ───────────────────────────────────────────────────────

  keywordFallback(query) {
    const lower = query.toLowerCase();

    return {
      keywords: query.split(/\s+/).filter((w) => w.length > 2),
      education_level: this._detectEducationLevel(lower),
      preferred_countries: this._detectCountries(lower),
      fields: this._detectFields(lower),
      funding_type: lower.includes("full") ? "full" : lower.includes("partial") ? "partial" : "any",
      provider_type: this._detectProviderType(lower),
    };
  }

  _detectEducationLevel(q) {
    if (q.match(/\b(master|mtech|msc|mba|postgrad|pg)\b/)) return "postgrad";
    if (q.match(/\b(bachelor|btech|bsc|undergrad|ug|degree)\b/)) return "undergrad";
    if (q.match(/\b(phd|ph\.d|doctorate|doctoral|research fellow)\b/)) return "doctorate";
    if (q.match(/\b(school|class 10|class 12|10th|12th|matric|inter)\b/)) return "school";
    if (q.match(/\b(diploma|polytechnic)\b/)) return "diploma";
    return null;
  }

  _detectCountries(q) {
    const countryMap = {
      "\\busa\\b|united states|america": "USA",
      "\\buk\\b|united kingdom|britain|england": "UK",
      "\\bcanada\\b": "Canada",
      "\\bgermany\\b|deutsch": "Germany",
      "\\baustralia\\b": "Australia",
      "\\bindia\\b": "India",
      "\\bswitzerland\\b": "Switzerland",
      "\\bsingapore\\b": "Singapore",
      "\\bjapan\\b": "Japan",
      "\\beurope\\b": "Europe",
    };
    return Object.entries(countryMap)
      .filter(([pattern]) => new RegExp(pattern, "i").test(q))
      .map(([, country]) => country);
  }

  _detectFields(q) {
    const fieldMap = {
      "\\b(cs|computer science|software|coding|programming|it\\b)": "Computer Science",
      "\\b(engineering|mechanical|electrical|civil|chemical)": "Engineering",
      "\\b(medicine|mbbs|doctor|medical|health|pharmacy)": "Medicine",
      "\\b(law|legal|llb|llm)": "Law",
      "\\b(mba|business|management|commerce|finance)": "Business",
      "\\b(arts|humanities|literature|history|philosophy)": "Arts & Humanities",
      "\\b(science|biology|chemistry|physics|maths|mathematics)": "Science",
      "\\b(data science|machine learning|ai|artificial intelligence)": "Data Science",
      "\\b(design|architecture|fashion)": "Design",
      "\\b(agriculture|farming)": "Agriculture",
    };
    return Object.entries(fieldMap)
      .filter(([pattern]) => new RegExp(pattern, "i").test(q))
      .map(([, field]) => field);
  }

  _detectProviderType(q) {
    if (q.match(/\b(government|govt|ministry|national|state)\b/)) return "government";
    if (q.match(/\b(university|college|academic|institution)\b/)) return "university";
    if (q.match(/\b(corporate|company|tata|infosys|wipro|reliance)\b/)) return "corporate";
    if (q.match(/\b(ngo|trust|foundation|charity)\b/)) return "ngo";
    if (q.match(/\b(international|foreign|global|overseas)\b/)) return "international";
    return "any";
  }

  // ── MATCHING ───────────────────────────────────────────────────────────────

  matchScholarships(parsedQuery, scholarships, rawQuery) {
    if (!parsedQuery) return scholarships;

    const scored = scholarships.map((sch) => {
      let score = 0;

      // Keyword match in name/provider/notes
      const searchableText = [sch.name, sch.provider, sch.notes, sch.cover_details]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      parsedQuery.keywords?.forEach((kw) => {
        if (searchableText.includes(kw.toLowerCase())) score += 2;
      });

      // Education level match
      if (
        parsedQuery.education_level &&
        (sch.education_level === parsedQuery.education_level || sch.education_level === "any")
      ) {
        score += 3;
      }

      // Country match
      if (parsedQuery.preferred_countries?.length) {
        if (parsedQuery.preferred_countries.includes(sch.country)) score += 3;
      }

      // Field of study match
      if (parsedQuery.fields?.length && sch.field_of_study) {
        const schFields = sch.field_of_study.map((f) => f.toLowerCase());
        const hasAll = schFields.includes("all");
        const hasMatch = parsedQuery.fields.some((f) =>
          schFields.some((sf) => sf.includes(f.toLowerCase()) || f.toLowerCase().includes(sf))
        );
        if (hasAll || hasMatch) score += 3;
      }

      // Funding type match
      if (parsedQuery.funding_type && parsedQuery.funding_type !== "any") {
        if (sch.cover_type === parsedQuery.funding_type) score += 2;
      }

      // Provider type match
      if (parsedQuery.provider_type && parsedQuery.provider_type !== "any") {
        if (sch.provider_type === parsedQuery.provider_type) score += 2;
      }

      // Raw query name contains
      if (rawQuery && sch.name.toLowerCase().includes(rawQuery.toLowerCase())) score += 5;

      return { scholarship: sch, searchScore: score };
    });

    // Return scholarships with score > 0, sorted by score descending
    return scored
      .filter((s) => s.searchScore > 0)
      .sort((a, b) => b.searchScore - a.searchScore)
      .map((s) => s.scholarship);
  }
}

module.exports = ScholarshipSearchEngine;
