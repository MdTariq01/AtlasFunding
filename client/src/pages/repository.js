import { api, isLoggedIn } from "../api.js";
import { navigate, showToast } from "../main.js";

const FILTERS = ["All", "Government", "University", "Corporate", "International", "Ngo"];

let currentFilter = "all";
let searchQuery = "";
let searchTimeout = null;

export async function renderRepository(el) {
  currentFilter = "all";
  searchQuery = "";
  if (searchTimeout) clearTimeout(searchTimeout);

  el.innerHTML = `
    <div class="page">
      <div class="container section">
        
        <!-- Header -->
        <div class="flex-between mb-32" style="align-items: flex-end; flex-wrap: wrap; gap: 16px;">
          <div>
            <h1 class="heading-editorial" style="font-size: 2.5rem; margin-bottom: 8px;">Funding repository</h1>
            <p style="font-size: 1rem; color: var(--text-secondary);" id="repo-header-stats">
              Loading...
            </p>
          </div>
          <div>
            <button id="add-url-btn" class="btn btn-secondary" style="font-size: 0.85rem;">+ Scrape & Add Website</button>
          </div>
        </div>

        <!-- Scraping URL Bar (Hidden by default) -->
        <div id="url-scrape-box" class="card hidden mb-32" style="padding: 20px; background: var(--bg-card); border: 1.5px solid var(--primary);">
          <div style="font-weight: 700; font-size: 0.95rem; margin-bottom: 8px; color: var(--text-main);">
            🕷️ Scrape & Ingest Scholarship Webpage
          </div>
          <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 12px;">
            Paste any scholarship or university grant webpage URL below. Groq AI will parse and extract details into the active database.
          </p>
          <form id="url-scrape-form" class="flex gap-12">
            <input type="url" id="scrape-url-input" class="input" placeholder="https://example.com/scholarship-details" style="flex: 1; margin-bottom: 0;" required />
            <button type="submit" class="btn btn-primary" id="scrape-submit-btn" style="white-space: nowrap;">Extract & Add →</button>
          </form>
        </div>

        <!-- Search & Filters -->
        <div class="flex-between mb-32" style="gap: 16px; flex-wrap: wrap;">
          
          <div style="flex: 1; max-width: 500px; position: relative;">
            <svg style="position: absolute; left: 16px; top: 14px; color: var(--text-muted);" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input type="text" id="repo-search" class="input" placeholder="Search by name, provider, state or tag" style="padding-left: 44px; background: transparent; border-color: var(--border-strong);" />
          </div>

          <div class="flex gap-8" id="repo-filters">
            ${FILTERS.map(f => `
              <button class="filter-chip ${f.toLowerCase() === currentFilter.toLowerCase() ? "active" : ""}" data-filter="${f.toLowerCase()}">${f}</button>
            `).join("")}
          </div>
        </div>

        <!-- Grid -->
        <div id="repo-grid" class="grid-2"></div>
      </div>
    </div>
  `;

  // Toggle Scrape Box
  document.getElementById("add-url-btn").addEventListener("click", () => {
    const box = document.getElementById("url-scrape-box");
    box.classList.toggle("hidden");
    if (!box.classList.contains("hidden")) {
      document.getElementById("scrape-url-input").focus();
    }
  });

  // Handle URL Scrape Submit using api.repository.scrapeUrl
  document.getElementById("url-scrape-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("scrape-url-input");
    const btn = document.getElementById("scrape-submit-btn");
    const url = input.value.trim();

    if (!url) return;

    btn.disabled = true;
    btn.textContent = "Scraping & Extracting...";

    try {
      const data = await api.repository.scrapeUrl(url);
      showToast(data.message || "Scholarship processed!", data.added ? "success" : "warning");
      input.value = "";
      document.getElementById("url-scrape-box").classList.add("hidden");
      await loadData();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "Extract & Add →";
    }
  });

  document.getElementById("repo-filters").addEventListener("click", (e) => {
    if (e.target.tagName !== "BUTTON") return;
    currentFilter = e.target.dataset.filter;
    document.querySelectorAll(".filter-chip").forEach(c => c.classList.remove("active"));
    e.target.classList.add("active");
    loadData();
  });

  document.getElementById("repo-search").addEventListener("input", (e) => {
    searchQuery = e.target.value.trim();
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(loadData, 500);
  });

  await loadData();
}

async function loadData() {
  const grid = document.getElementById("repo-grid");
  const statsEl = document.getElementById("repo-header-stats");

  grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">Loading scholarships...</div>`;

  try {
    let data;
    if (searchQuery) {
      data = await api.repository.search(searchQuery);
    } else {
      data = await api.repository.list({ filter: currentFilter, limit: 100 });
    }

    const items = data.scholarships || [];
    const stats = data.stats || {};

    if (statsEl) {
      statsEl.textContent = `${stats.total_opportunities || items.length} verified schemes · ₹${stats.total_award_value_crore || '0'} Cr total pool`;
    }

    if (!items.length) {
      grid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 60px 0; color: var(--text-muted);">
          <h3>No scholarships found</h3>
          <p style="margin-top: 8px;">Try clearing filters or search query.</p>
        </div>
      `;
      return;
    }

    renderCards(items, grid);

  } catch (err) {
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--danger);">
        Failed to load scholarships: ${err.message}
      </div>
    `;
  }
}

export function renderCards(items, container) {
  container.innerHTML = items.map((s) => {
    const isEligible = s.eligible !== false;
    const matchScore = s.match_score !== undefined ? s.match_score : null;
    const winOdds = s.win_odds !== undefined ? s.win_odds : null;

    let displayAmount = s.amount_string;
    if (
      !displayAmount ||
      displayAmount === "₹0 per year" ||
      displayAmount === "₹0" ||
      displayAmount === "0" ||
      displayAmount.toLowerCase() === "varies" ||
      displayAmount.toLowerCase() === "amount tbd"
    ) {
      if (s.cover_type === "full" || (s.cover_details && /full|100%|tuition/i.test(s.cover_details))) {
        displayAmount = "Fully Funded";
      } else if (s.cover_type === "tuition_only") {
        displayAmount = "Full Tuition Waiver";
      } else if (s.amount_value && s.amount_value > 0) {
        displayAmount = `₹${s.amount_value.toLocaleString("en-IN")}/year`;
      } else {
        displayAmount = "Varies / Variable";
      }
    }

    const applyUrl = s.application_url || s.source_url;

    let blockedHTML = "";
    const blockers = s.blockedReasons || s.blockers || [];
    if (blockers.length) {
      const reasons = blockers.map(r => typeof r === "string" ? r : r.reason).join(" · ");
      blockedHTML = `<div class="repo-blocked">
        <strong>Blocked by:</strong> ${reasons}
      </div>`;
    }

    return `
      <div class="card repo-card" style="padding: 24px;">
        <div class="flex-between mb-16">
          <span class="repo-type">${s.provider_type || "General"}</span>
          <span style="font-size: 0.8rem; font-weight: 600; color: var(--text-muted);">📅 ${s.deadline || "TBA"}</span>
        </div>

        <h3 style="font-size: 1.15rem; font-weight: 700; color: var(--text-main); margin-bottom: 8px;">
          <a href="#/detail?id=${s._id}" style="color: var(--text-main); text-decoration: none;">${s.name}</a>
        </h3>
        
        <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 16px;">
          Provided by <strong style="color: var(--text-secondary);">${s.provider || "Unknown"}</strong>
        </div>

        <div style="margin-bottom: 20px;">
          <div style="font-size: 1.5rem; font-weight: 800; color: var(--primary);">${displayAmount}</div>
          <div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 4px;">${s.cover_details || (s.cover_type + " funding")}</div>
        </div>

        <div class="repo-metrics mb-16">
          <div class="repo-metric">
            <div class="repo-metric-val">${matchScore !== null ? matchScore + "%" : "--"}</div>
            <div class="repo-metric-lbl">MATCH SCORE</div>
          </div>
          <div class="repo-metric">
            <div class="repo-metric-val">${winOdds !== null ? winOdds + "%" : "--"}</div>
            <div class="repo-metric-lbl">WIN ODDS</div>
          </div>
          <div class="repo-metric">
            <div class="repo-metric-val">${s.country || "India"}</div>
            <div class="repo-metric-lbl">LOCATION</div>
          </div>
        </div>

        ${blockedHTML}

        <div class="flex gap-8 mt-16" style="justify-content: flex-end;">
          <a href="#/detail?id=${s._id}" class="btn btn-ghost btn-sm">Details →</a>
          ${applyUrl ? `<a href="${applyUrl}" target="_blank" rel="noopener" class="btn btn-primary btn-sm">Apply ↗</a>` : `<a href="#/detail?id=${s._id}" class="btn btn-primary btn-sm">Apply</a>`}
        </div>
      </div>
    `;
  }).join("");
}
