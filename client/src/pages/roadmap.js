import { api, isLoggedIn } from "../api.js";
import { navigate, showToast } from "../main.js";

export async function renderRoadmap(el) {
  if (!isLoggedIn()) { navigate("/auth?next=roadmap"); return; }

  el.innerHTML = `
    <div class="page">
      <div class="container section">
        
        <div class="flex-between mb-48" style="align-items: flex-end;">
          <div>
            <h1 class="heading-editorial" style="font-size: 2.5rem; margin-bottom: 8px;">Application Roadmap</h1>
            <p style="font-size: 1rem; color: var(--text-secondary);">Every deadline you qualify for, ordered by urgency</p>
          </div>
          <div>
            <button class="btn btn-secondary" onclick="window.location.hash='/repository'">+ Browse Scholarships</button>
          </div>
        </div>

        <div id="roadmap-loading" class="text-center" style="padding: 40px;">
          <p style="color: var(--text-muted);">Loading your roadmap...</p>
        </div>

        <div id="roadmap-content" class="hidden"></div>
      </div>
    </div>
  `;

  try {
    const data = await api.roadmap.get();
    
    document.getElementById("roadmap-loading").classList.add("hidden");
    const content = document.getElementById("roadmap-content");
    content.classList.remove("hidden");

    const deadlines = data.deadlines || [];

    if (deadlines.length === 0) {
      content.innerHTML = `
        <div class="card text-center" style="padding: 60px; background: var(--bg-section);">
          <div style="font-size: 3rem; margin-bottom: 16px;">📍</div>
          <h3 style="font-size: 1.5rem; font-weight: 700; margin-bottom: 8px;">Your roadmap is empty</h3>
          <p style="color: var(--text-secondary); margin-bottom: 24px;">Complete the eligibility calculator to populate your personal roadmap.</p>
          <button class="btn btn-primary" onclick="window.location.hash='/calculator'">Start Eligibility Calculator</button>
        </div>
      `;
      return;
    }

    const urgencyColor = (u) => ({
      critical: "var(--danger)", high: "var(--warning)", normal: "var(--success)", unknown: "var(--text-muted)", expired: "var(--text-muted)"
    }[u] || "var(--text-muted)");

    content.innerHTML = `
      <div class="flex-col gap-24">
        ${deadlines.map((item, idx) => `
          <div class="card" id="roadmap-item-${idx}" style="padding: 0; overflow: hidden;">
            
            <!-- Header -->
            <div class="flex-between" style="padding: 20px 24px; border-bottom: 1px solid var(--border-light);">
              <div>
                <div style="font-size: 0.7rem; font-weight: 700; color: ${urgencyColor(item.urgency)}; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">
                  ${item.urgency === 'critical' ? '🔴 CRITICAL' : item.urgency === 'high' ? '🟠 HIGH PRIORITY' : item.urgency === 'expired' ? '⚫ EXPIRED' : '🟢 ON TRACK'}
                  ${item.days_remaining !== null ? ' · ' + item.days_remaining + ' days remaining' : ''}
                </div>
                <a href="#/detail?id=${item.scholarship_id}" style="font-weight: 700; font-size: 1.15rem; color: var(--text-main);">${item.scholarship_name}</a>
                <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 2px;">${item.provider || ''}</div>
              </div>
              <div style="text-align: right; flex-shrink: 0; margin-left: 24px;">
                <div style="font-size: 1.25rem; font-weight: 800; color: var(--primary);">${item.amount_string || "Varies"}</div>
                <div style="font-size: 0.75rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; margin-top: 4px;">📅 ${item.deadline || "TBA"}</div>
              </div>
            </div>

            <!-- Metrics -->
            <div class="repo-metrics" style="border-bottom: 1px solid var(--border-light);">
              <div class="repo-metric">
                <div class="repo-metric-val">${item.match_score || '--'}%</div>
                <div class="repo-metric-lbl">MATCH</div>
              </div>
              <div class="repo-metric">
                <div class="repo-metric-val">${item.win_odds || '--'}%</div>
                <div class="repo-metric-lbl">WIN ODDS</div>
              </div>
              <div class="repo-metric">
                <div class="repo-metric-val">₹${item.expected_value ? (item.expected_value / 100000).toFixed(1) + 'L' : '0'}</div>
                <div class="repo-metric-lbl">EXPECTED</div>
              </div>
              <div class="repo-metric">
                <div class="repo-metric-val">#${item.roi_rank || (idx + 1)}</div>
                <div class="repo-metric-lbl">ROI RANK</div>
              </div>
            </div>

            <!-- Task List -->
            <div style="padding: 20px 24px;">
              <div style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 16px;">Application Tasks</div>
              <div class="flex-col gap-8">
                ${(item.tasks || []).map((task, ti) => `
                  <label style="display: flex; align-items: center; gap: 12px; cursor: pointer; padding: 8px; border-radius: 6px; transition: 0.15s;" onmouseover="this.style.background='var(--bg-section)'" onmouseout="this.style.background='transparent'">
                    <input type="checkbox" ${task.completed ? 'checked' : ''} style="width: 16px; height: 16px; accent-color: var(--primary); flex-shrink: 0;" />
                    <div>
                      <span style="font-size: 0.9rem; font-weight: 500; color: var(--text-main); ${task.completed ? 'text-decoration: line-through; opacity: 0.5;' : ''}">${task.task}</span>
                      ${task.due ? `<div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">Due by ${task.due}</div>` : ''}
                    </div>
                  </label>
                `).join("")}
              </div>
              ${item.application_url ? `
                <div style="margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--border-light);">
                  <a href="${item.application_url}" target="_blank" rel="noopener" class="btn btn-primary btn-sm">Apply Now →</a>
                  <button class="btn btn-ghost btn-sm" onclick="window.location.hash='/detail?id=${item.scholarship_id}'" style="margin-left: 8px;">View Details</button>
                </div>
              ` : ''}
            </div>
          </div>
        `).join("")}
      </div>
    `;

  } catch (err) {
    document.getElementById("roadmap-loading").innerHTML = `
      <div style="color: var(--danger); padding: 40px; text-align: center;">${err.message}</div>
    `;
  }
}
