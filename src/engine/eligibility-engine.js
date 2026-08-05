/**
 * EligibilityEngine — Pure code, zero AI cost per user
 * Checks if a user qualifies for a scholarship and scores the match.
 */

class EligibilityEngine {
  /**
   * Convert any currency amount to INR
   */
  convertToRupees(value, currency) {
    if (!value) return 0;
    const rates = { INR: 1, USD: 83, GBP: 104, EUR: 90, AUD: 55, CAD: 62, SGD: 62, JPY: 0.56 };
    return value * (rates[currency] || 1);
  }

  /**
   * Parse income bracket strings from the frontend form
   */
  parseIncomeRange(incomeString) {
    if (!incomeString) return null;
    const map = {
      "< ₹5 lakh": 500000,
      "₹5-10 lakh": 750000,
      "₹10-25 lakh": 1750000,
      "₹25-50 lakh": 3750000,
      "> ₹50 lakh": 6000000,
    };
    return map[incomeString] || null;
  }

  /**
   * Core eligibility check
   * @param {Object} userProfile  — from User model
   * @param {Object} scholarship  — from Scholarship model
   * @returns {{ eligible, matchScore, blockedReasons, winOdds, expectedValue, roi }}
   */
  checkEligibility(userProfile, scholarship) {
    const blockedReasons = [];
    let matchScore = 100;

    // ── HARD BLOCKERS (automatic disqualification) ─────────────────────────────

    // 1. Income check
    if (scholarship.max_income_annual && userProfile.family_income_annual) {
      if (userProfile.family_income_annual > scholarship.max_income_annual) {
        blockedReasons.push({
          reason: "Income exceeds limit",
          user_value: `₹${(userProfile.family_income_annual / 100000).toFixed(1)}L`,
          scholarship_limit: `₹${(scholarship.max_income_annual / 100000).toFixed(1)}L`,
          severity: "hard",
        });
      }
    }

    // 2. GPA / percentage check
    if (scholarship.min_gpa && userProfile.gpa_percentage) {
      if (userProfile.gpa_percentage < scholarship.min_gpa) {
        blockedReasons.push({
          reason: "Academic score too low",
          user_value: `${userProfile.gpa_percentage}%`,
          scholarship_requirement: `${scholarship.min_gpa}%`,
          severity: "hard",
        });
      }
    }

    // 3. Education level check
    if (
      scholarship.education_level &&
      scholarship.education_level !== "any" &&
      userProfile.target_education_level &&
      scholarship.education_level !== userProfile.target_education_level
    ) {
      blockedReasons.push({
        reason: "Education level mismatch",
        user_level: userProfile.target_education_level,
        scholarship_requirement: scholarship.education_level,
        severity: "hard",
      });
    }

    // 4. Citizenship check
    if (scholarship.citizenship && scholarship.citizenship !== "Any") {
      const userCitizenship = userProfile.citizenship;
      if (userCitizenship && userCitizenship !== scholarship.citizenship) {
        // NRI check — Indian scholarship may accept both Indian + NRI
        const isIndianVariant =
          ["Indian", "NRI", "OCI"].includes(userCitizenship) &&
          scholarship.citizenship === "Indian";
        if (!isIndianVariant) {
          blockedReasons.push({
            reason: "Citizenship not eligible",
            user_citizenship: userCitizenship,
            scholarship_requirement: scholarship.citizenship,
            severity: "hard",
          });
        }
      }
    }

    // 5. Work experience check
    if (scholarship.min_work_experience && scholarship.min_work_experience > 0) {
      const userExp = userProfile.work_experience_years || 0;
      if (userExp < scholarship.min_work_experience) {
        blockedReasons.push({
          reason: "Insufficient work experience",
          user_experience: `${userExp} years`,
          scholarship_requirement: `${scholarship.min_work_experience}+ years`,
          severity: "hard",
        });
      }
    }

    // If any hard blocker triggered → not eligible
    if (blockedReasons.some((b) => b.severity === "hard")) {
      return {
        eligible: false,
        matchScore: 0,
        blockedReasons,
        winOdds: 0,
        expectedValue: 0,
        applicationEffort: scholarship.application_effort_hours || 5,
        roi: 0,
      };
    }

    // ── SOFT BLOCKERS (reduce score, but doesn't disqualify) ───────────────────

    // Gender preference
    if (
      scholarship.required_gender &&
      scholarship.required_gender !== "Any" &&
      userProfile.gender &&
      userProfile.gender !== scholarship.required_gender &&
      userProfile.gender !== "Prefer not to say"
    ) {
      blockedReasons.push({
        reason: `Preference for ${scholarship.required_gender} applicants`,
        severity: "soft",
      });
      matchScore -= 20;
    }

    // Disability requirement
    if (scholarship.requires_disability && !userProfile.has_disability) {
      blockedReasons.push({
        reason: "Preference for applicants with disability",
        severity: "soft",
      });
      matchScore -= 25;
    }

    // Field of study restriction
    if (
      scholarship.field_of_study &&
      !scholarship.field_of_study.includes("All") &&
      userProfile.field_of_study
    ) {
      const fieldMatch = scholarship.field_of_study.some(
        (f) =>
          f.toLowerCase() === userProfile.field_of_study.toLowerCase() ||
          f.toLowerCase().includes(userProfile.field_of_study.toLowerCase())
      );
      if (!fieldMatch) {
        blockedReasons.push({
          reason: "Field of study not in preference list",
          user_field: userProfile.field_of_study,
          scholarship_fields: scholarship.field_of_study,
          severity: "soft",
        });
        matchScore -= 30;
      }
    }

    // ── PREFERENCE BONUSES (boost score) ───────────────────────────────────────

    // Country preference match
    if (
      userProfile.preferred_countries?.length &&
      scholarship.country &&
      userProfile.preferred_countries.includes(scholarship.country)
    ) {
      matchScore += 10;
    }

    // Field of study exact match bonus
    if (
      scholarship.field_of_study?.includes("All") ||
      scholarship.field_of_study?.some(
        (f) => f.toLowerCase() === userProfile.field_of_study?.toLowerCase()
      )
    ) {
      matchScore += 10;
    }

    // Full scholarship bonus (user wants full funding)
    if (
      userProfile.preferred_funding_type?.includes("full") &&
      scholarship.cover_type === "full"
    ) {
      matchScore += 10;
    }

    // Income well within limit (user is a strong candidate by income)
    if (scholarship.max_income_annual && userProfile.family_income_annual) {
      const incomeRatio = userProfile.family_income_annual / scholarship.max_income_annual;
      if (incomeRatio < 0.5) matchScore += 5; // income is well below limit
    }

    // ── WIN PROBABILITY ─────────────────────────────────────────────────────────
    let winOdds = 5; // Base: 5% (competitive defaults)

    if (scholarship.competitive_ratio) {
      const parts = scholarship.competitive_ratio.split(":");
      if (parts.length === 2) {
        const ratio = parseInt(parts[0]) / parseInt(parts[1]);
        winOdds = ratio * 100;
      }
    } else {
      // Estimate based on cover type
      const baseOdds = {
        full: 3,
        tuition_only: 8,
        partial: 12,
        varies: 10,
      };
      winOdds = baseOdds[scholarship.cover_type] || 5;
    }

    // Scale winOdds by match score
    winOdds = (matchScore / 100) * winOdds;

    // Cap values
    matchScore = Math.max(0, Math.min(100, Math.round(matchScore)));
    winOdds = Math.max(0, Math.min(99, Math.round(winOdds)));

    // ── EXPECTED VALUE ──────────────────────────────────────────────────────────
    const amountInRupees = this.convertToRupees(
      scholarship.amount_value,
      scholarship.amount_currency
    );
    const expectedValue = Math.round((amountInRupees * winOdds) / 100);
    const effort = scholarship.application_effort_hours || 5;
    const roi = expectedValue / effort;

    return {
      eligible: matchScore > 0,
      matchScore,
      blockedReasons,
      winOdds,
      expectedValue,
      applicationEffort: effort,
      roi: Math.round(roi),
    };
  }

  /**
   * Rank all scholarships for a user by ROI
   */
  rankScholarships(userProfile, scholarships) {
    const evaluated = scholarships.map((sch) => {
      const result = this.checkEligibility(userProfile, sch);
      return {
        scholarship: sch,
        ...result,
        roi_score: result.expectedValue / (result.applicationEffort || 1),
      };
    });

    return evaluated
      .filter((s) => s.eligible)
      .sort((a, b) => b.roi_score - a.roi_score)
      .map((s, idx) => ({ ...s, roi_rank: idx + 1 }));
  }
}

module.exports = EligibilityEngine;
