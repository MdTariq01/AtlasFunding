import { api, isLoggedIn } from "../api.js";
import { navigate, showToast } from "../main.js";

export async function renderDashboard(el) {
  if (!isLoggedIn()) { navigate("/auth?next=dashboard"); return; }

  el.innerHTML = `
    <div class="page">
      <div class="container section">
        <div id="dash-loading" class="text-center" style="padding: 60px 0;">
          <h2 class="heading-editorial" style="font-size: 2rem;">Loading your dashboard...</h2>
        </div>
        <div id="dash-content" class="hidden"></div>
      </div>
    </div>
  `;

  try {
    const data = await api.dashboard.get();
    const stats = data.stats || {};
    const user = data.user || {};
    const topOpps = data.top_opportunities || [];
    const quickActions = data.quick_actions || [];

    document.getElementById("dash-loading").classList.add("hidden");
    const content = document.getElementById("dash-content");
    content.classList.remove("hidden");

    content.innerHTML = `
      <div class="flex-between mb-48" style="align-items: flex-end; flex-wrap: wrap; gap: 16px;">
        <div>
          <h1 class="heading-editorial" style="font-size: 2.5rem; margin-bottom: 8px;">Dashboard</h1>
          <p style="font-size: 1rem; color: var(--text-secondary);">${user.email || ""} · Profile ${user.profile_completion || 0}% complete</p>
        </div>
        <div class="flex gap-8">
          <button class="btn btn-secondary" onclick="window.location.hash='/calculator'">Recalculate</button>
          <button class="btn btn-primary" onclick="window.location.hash='/results'">View Matches →</button>
        </div>
      </div>

      <!-- Stats Grid -->
      <div class="grid-4 mb-48">
        <div class="card" style="padding: 24px;">
          <div style="font-size: 2rem; font-weight: 800; color: var(--primary);">${stats.total_eligible_scholarships || 0}</div>
          <div style="font-size: 0.7rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-top: 8px;">ELIGIBLE OPPORTUNITIES</div>
        </div>
        <div class="card" style="padding: 24px;">
          <div style="font-size: 2rem; font-weight: 800; color: var(--primary);">₹${stats.total_potential_funding_lakhs || 0}L</div>
          <div style="font-size: 0.7rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-top: 8px;">MAX FUNDING POTENTIAL</div>
        </div>
        <div class="card" style="padding: 24px;">
          <div style="font-size: 2rem; font-weight: 800; color: var(--text-main);">${stats.average_win_odds || 0}%</div>
          <div style="font-size: 0.7rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-top: 8px;">AVERAGE WIN ODDS</div>
        </div>
        <div class="card" style="padding: 24px;">
          <div style="font-size: 2rem; font-weight: 800; color: var(--text-main);">${stats.saved_count || 0}</div>
          <div style="font-size: 0.7rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-top: 8px;">SAVED TO ROADMAP</div>
        </div>
      </div>

      <!-- Quick Actions -->
      <div class="flex gap-8 mb-48" style="flex-wrap: wrap;">
        ${quickActions.map(a => `
          <button class="btn btn-ghost" onclick="window.location.hash='${a.route}'">${a.label}</button>
        `).join("")}
      </div>

      <!-- Top Opportunities -->
      <h2 style="font-size: 1.5rem; font-weight: 800; margin-bottom: 24px; border-bottom: 2px solid var(--border-light); padding-bottom: 12px;">Top Opportunities by Expected Value</h2>
      
      <div class="flex-col gap-16">
        ${topOpps.length === 0 ? `
          <div class="card text-center" style="padding: 40px; background: var(--bg-section);">
            <p style="color: var(--text-muted); font-weight: 500; margin-bottom: 16px;">No results yet. Complete the eligibility calculator to see your matches.</p>
            <button class="btn btn-primary" onclick="window.location.hash='/calculator'">Start Calculator →</button>
          </div>
        ` : topOpps.map((opp, i) => `
          <div class="card flex-between" style="padding: 20px;">
            <div class="flex gap-16" style="align-items: center;">
              <div style="font-size: 1.5rem; font-weight: 800; color: var(--border-strong); width: 36px; text-align: center;">${i + 1}</div>
              <div>
                <a href="#/detail?id=${opp.id}" style="font-weight: 700; font-size: 1.05rem; color: var(--text-main); display: block; margin-bottom: 4px;">${opp.name}</a>
                <div class="flex gap-16" style="font-size: 0.85rem; color: var(--text-muted);">
                  <span style="color: var(--primary); font-weight: 600;">${opp.amount || "Varies"}</span>
                  <span>${opp.win_odds || '--'}% win odds</span>
                  <span>₹${opp.expected_value ? (opp.expected_value / 100000).toFixed(1) + 'L' : '0'} expected</span>
                  ${opp.days_remaining !== null && opp.days_remaining !== undefined ? `<span style="color: ${opp.days_remaining <= 7 ? 'var(--danger)' : 'var(--warning)'};">📅 ${opp.days_remaining}d left</span>` : ''}
                </div>
              </div>
            </div>
            <div class="flex gap-8">
              <button class="btn btn-ghost btn-sm" onclick="window.location.hash='/detail?id=${opp.id}'">Details</button>
            </div>
          </div>
        `).join("")}
      </div>
    `;

  } catch (err) {
    document.getElementById("dash-loading").innerHTML = `
      <div style="padding: 60px; text-align: center; color: var(--danger);">
        <h3 style="margin-bottom: 8px;">Failed to load dashboard</h3>
        <p>${err.message}</p>
        <button class="btn btn-primary mt-16" onclick="window.location.hash='/calculator'">Complete Calculator First</button>
      </div>
    `;
  }
}
