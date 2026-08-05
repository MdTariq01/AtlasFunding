import { api, isLoggedIn } from "../api.js";
import { navigate, showToast } from "../main.js";
import { renderCards } from "./repository.js";

export async function renderResults(el) {
  if (!isLoggedIn()) { navigate("/auth?next=results"); return; }

  el.innerHTML = `
    <div class="page">
      <div class="container section">
        
        <div id="results-loading" class="text-center" style="padding: 60px 0;">
          <h2 class="heading-editorial" style="font-size: 2.5rem; margin-bottom: 8px;">Loading your matches...</h2>
          <p style="font-size: 1rem; color: var(--text-secondary);">Fetching your personalised scholarship list</p>
        </div>
        
        <div id="results-content" class="hidden"></div>
      </div>
    </div>
  `;

  try {
    // Fetch both matched scholarships and dashboard stats in parallel
    const [matchData, dashData] = await Promise.all([
      api.repository.matched({ eligible_only: "true", sort_by: "roi", limit: 50 }),
      api.dashboard.get().catch(() => ({ stats: {} }))
    ]);

    const matches = matchData.matches || [];
    const total = matchData.total || matches.length;
    const stats = dashData.stats || {};

    document.getElementById("results-loading").classList.add("hidden");
    const content = document.getElementById("results-content");
    content.classList.remove("hidden");

    content.innerHTML = `
      <div class="mb-48">
        <div class="badge mb-16">
          <div class="badge-dot"></div>
          🎉 ${total} OPPORTUNITIES MATCHED
        </div>
        <h1 class="heading-editorial" style="font-size: 3rem; margin-bottom: 16px;">Your Eligibility Results</h1>
        <p style="font-size: 1.1rem; color: var(--text-secondary); max-width: 600px;">These scholarships match your profile, ranked by highest expected return on effort.</p>
      </div>

      <div class="grid-3 mb-48">
        <div class="card text-center" style="padding: 24px;">
          <div style="font-size: 2.5rem; font-weight: 800; color: var(--primary);">${total}</div>
          <div style="font-size: 0.7rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-top: 8px;">YOU QUALIFY FOR</div>
        </div>
        <div class="card text-center" style="padding: 24px;">
          <div style="font-size: 2.5rem; font-weight: 800; color: var(--primary);">₹${parseFloat(stats.total_potential_funding_lakhs || 0).toFixed(1)}L</div>
          <div style="font-size: 0.7rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-top: 8px;">POTENTIAL FUNDING</div>
        </div>
        <div class="card text-center" style="padding: 24px;">
          <div style="font-size: 2.5rem; font-weight: 800; color: var(--primary);">${stats.average_win_odds || 0}%</div>
          <div style="font-size: 0.7rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-top: 8px;">AVG WIN PROBABILITY</div>
        </div>
      </div>

      <h2 style="font-size: 1.5rem; font-weight: 800; margin-bottom: 24px; border-bottom: 2px solid var(--border-light); padding-bottom: 12px;">Your Matches — Ranked by ROI</h2>
      
      <div id="matches-list" class="grid-2 mb-48"></div>

      ${matches.length === 0 ? `
        <div style="padding: 40px; text-align: center; color: var(--text-muted);">
          <h3 style="margin-bottom: 8px;">No matches yet</h3>
          <p style="margin-bottom: 24px;">Try completing the eligibility calculator or browse all scholarships below.</p>
          <div class="flex gap-16" style="justify-content: center;">
            <button class="btn btn-primary" onclick="window.location.hash='/calculator'">Start Calculator</button>
            <button class="btn btn-secondary" onclick="window.location.hash='/repository'">Browse All</button>
          </div>
        </div>
      ` : ""}

      <div class="flex gap-16">
        <button class="btn btn-primary btn-lg" onclick="window.location.hash='/dashboard'">Go to Dashboard →</button>
        <button class="btn btn-secondary btn-lg" onclick="window.location.hash='/roadmap'">View My Roadmap</button>
      </div>
    `;

    // The matches from /matched/me already have match_score, win_odds etc. merged into scholarship fields
    renderCards(matches, document.getElementById("matches-list"));

  } catch (err) {
    document.getElementById("results-loading").innerHTML = `
      <div style="padding: 60px; text-align: center; color: var(--danger);">
        <h3 style="margin-bottom: 8px;">Could not load results</h3>
        <p style="margin-bottom: 24px;">${err.message}</p>
        <button class="btn btn-primary" onclick="window.location.hash='/calculator'">Recalculate</button>
      </div>
    `;
  }
}
