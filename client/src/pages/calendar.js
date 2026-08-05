import { api, isLoggedIn } from "../api.js";
import { navigate, showToast } from "../main.js";

export async function renderCalendar(el) {
  if (!isLoggedIn()) { navigate("/auth?next=calendar"); return; }

  el.innerHTML = `
    <div class="page">
      <div class="container section" style="max-width: 900px;">
        
        <div class="mb-48">
          <h1 class="heading-editorial" style="font-size: 2.5rem; margin-bottom: 8px;">Application Calendar</h1>
          <p style="font-size: 1rem; color: var(--text-secondary);">Deadlines for your eligible opportunities, grouped by month</p>
        </div>

        <div id="calendar-loading" class="text-center" style="padding: 40px;">
          <p style="color: var(--text-muted);">Loading calendar...</p>
        </div>

        <div id="calendar-content" class="hidden"></div>
      </div>
    </div>
  `;

  try {
    const data = await api.roadmap.calendar();
    
    document.getElementById("calendar-loading").classList.add("hidden");
    const content = document.getElementById("calendar-content");
    content.classList.remove("hidden");

    const months = data.months || [];

    if (!months.length) {
      content.innerHTML = `
        <div class="card text-center" style="padding: 60px; background: var(--bg-section);">
          <div style="font-size: 3rem; margin-bottom: 16px;">🗓️</div>
          <h3 style="font-size: 1.5rem; font-weight: 700; margin-bottom: 8px;">No upcoming deadlines</h3>
          <p style="color: var(--text-secondary); margin-bottom: 24px;">Complete the eligibility calculator to see your deadlines here.</p>
          <button class="btn btn-primary" onclick="window.location.hash='/calculator'">Start Calculator</button>
        </div>
      `;
      return;
    }

    const calendar = data.calendar || {};
    content.innerHTML = months.map(month => {
      const items = calendar[month] || [];
      const label = new Date(month + "-01").toLocaleDateString("en-IN", { month: "long", year: "numeric" });
      return `
        <div style="margin-bottom: 48px;">
          <h2 style="font-size: 1.1rem; font-weight: 800; color: var(--text-main); text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 2px solid var(--border-light); padding-bottom: 12px; margin-bottom: 24px;">${label}</h2>
          <div style="border-left: 2px solid var(--border-light); padding-left: 24px; margin-left: 12px;">
            ${items.map(item => `
              <div style="position: relative; margin-bottom: 24px;">
                <div style="position: absolute; left: -31px; top: 8px; width: 12px; height: 12px; border-radius: 50%; background: var(--primary); border: 2px solid var(--bg-main);"></div>
                <div class="card" style="padding: 20px;">
                  <div class="flex-between mb-8">
                    <a href="#/detail?id=${item.scholarship_id}" style="font-weight: 700; font-size: 1.05rem; color: var(--text-main);">${item.scholarship}</a>
                    <span style="font-size: 0.8rem; font-weight: 700; color: ${(item.days_remaining || 99) <= 7 ? 'var(--danger)' : 'var(--warning)'}; background: ${(item.days_remaining || 99) <= 7 ? 'var(--danger-light)' : 'var(--warning-light)'}; padding: 4px 10px; border-radius: 4px;">
                      ${item.date} · ${item.days_remaining !== null ? item.days_remaining + 'd left' : 'TBA'}
                    </span>
                  </div>
                  <div class="flex gap-16" style="font-size: 0.85rem; color: var(--text-muted);">
                    <span style="font-weight: 600; color: var(--primary);">${item.amount || "Varies"}</span>
                    <span>Win Odds: ${item.win_odds || '--'}%</span>
                    <span>Expected: ₹${item.expected_value ? (item.expected_value / 100000).toFixed(1) + 'L' : '0'}</span>
                  </div>
                </div>
              </div>
            `).join("")}
          </div>
        </div>
      `;
    }).join("");

  } catch (err) {
    document.getElementById("calendar-loading").innerHTML = `
      <div style="color: var(--danger); padding: 40px; text-align: center;">${err.message}</div>
    `;
  }
}
