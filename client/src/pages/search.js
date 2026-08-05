import { api, isLoggedIn } from "../api.js";
import { navigate, showToast } from "../main.js";
import { renderCards } from "./repository.js";

let searchTimeout = null;

export async function renderSearch(el) {
  el.innerHTML = `
    <div class="page">
      <div class="container section">
        
        <div class="mb-48">
          <h1 class="heading-editorial" style="font-size: 2.5rem; margin-bottom: 8px;">Funding intelligence search</h1>
          <p style="font-size: 1rem; color: var(--text-secondary);">Ask in plain language. Atlas searches the normalised repository by meaning, not keywords.</p>
        </div>

        <div class="card" style="padding: 32px; border-radius: 12px; box-shadow: 0 12px 32px rgba(0,0,0,0.04);">
          
          <div style="display: flex; gap: 16px; margin-bottom: 16px;">
            <div style="flex: 1; position: relative;">
              <svg style="position: absolute; left: 16px; top: 18px; color: var(--text-muted);" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <input type="text" id="ai-search-input" class="input" placeholder="e.g. fully funded masters in Canada for computer science" style="padding: 16px 16px 16px 48px; font-size: 1.05rem;" />
            </div>
            <button class="btn btn-primary" id="btn-ai-search" style="padding: 0 32px; font-weight: 700;">
              <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="margin-right: 8px;">
                <path d="m21 21-4.35-4.35"/><circle cx="11" cy="11" r="8"/>
              </svg>
              Search
            </button>
          </div>

          <div class="grid-2 mb-24" style="gap: 16px;">
            <input type="text" class="input" placeholder="Country (optional)" style="background: var(--bg-main);" />
            <input type="text" class="input" placeholder="Education level (optional)" style="background: var(--bg-main);" />
          </div>

          <div class="flex" style="flex-wrap: wrap; gap: 12px;" id="search-suggestions">
            <button class="filter-chip">PhD funding in Canada for computer science</button>
            <button class="filter-chip">scholarships for girls from low income families in Maharashtra</button>
            <button class="filter-chip">fully funded masters in Germany with living stipend</button>
            <button class="filter-chip">corporate CSR scholarship for engineering diploma students</button>
          </div>

        </div>

        <div id="search-results" class="grid-2 mt-48"></div>

      </div>
    </div>
  `;

  document.getElementById("search-suggestions").addEventListener("click", (e) => {
    if (e.target.tagName !== "BUTTON") return;
    document.getElementById("ai-search-input").value = e.target.textContent;
    performSearch();
  });

  document.getElementById("btn-ai-search").addEventListener("click", performSearch);
  document.getElementById("ai-search-input").addEventListener("keypress", (e) => {
    if (e.key === "Enter") performSearch();
  });
}

async function performSearch() {
  const query = document.getElementById("ai-search-input").value.trim();
  if (!query) return;

  const btn = document.getElementById("btn-ai-search");
  const resultsDiv = document.getElementById("search-results");
  
  btn.disabled = true;
  btn.textContent = "Searching...";
  resultsDiv.innerHTML = `<div style="grid-column: 1 / -1; padding: 40px; text-align: center; color: var(--text-muted);">Analyzing query semantic intent...</div>`;

  try {
    const data = await api.repository.search(query);
    renderCards(data.scholarships || [], resultsDiv);
  } catch (err) {
    resultsDiv.innerHTML = `<div style="grid-column: 1 / -1; color: var(--danger); padding: 40px; text-align: center;">${err.message}</div>`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="margin-right: 8px;"><path d="m21 21-4.35-4.35"/><circle cx="11" cy="11" r="8"/></svg> Search`;
  }
}
