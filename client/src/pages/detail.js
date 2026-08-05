import { api, isLoggedIn } from "../api.js";
import { navigate, showToast, getParams } from "../main.js";

export async function renderDetail(el) {
  const { id } = getParams();
  if (!id) { navigate("/repository"); return; }

  el.innerHTML = `
    <div class="page">
      <div class="container section" style="max-width: 800px;">
        <div id="detail-loading" class="text-center" style="padding: 80px 0;">
          <h2 class="heading-editorial" style="font-size: 2rem; margin-bottom: 8px;">Loading scholarship details...</h2>
        </div>
        <div id="detail-content" class="hidden"></div>
      </div>
    </div>
  `;

  try {
    const data = await api.repository.get(id);
    const sch = data.scholarship;
    const elig = data.eligibility;
    const checklist = data.application_checklist || [];

    document.getElementById("detail-loading").classList.add("hidden");
    const content = document.getElementById("detail-content");
    content.classList.remove("hidden");

    content.innerHTML = `
      <button class="btn btn-ghost btn-sm mb-24" onclick="history.back()">← Back</button>

      <!-- Header -->
      <div class="mb-32">
        <div class="badge mb-16">
          <div class="badge-dot"></div>
          ${sch.provider_type || "Scholarship"}
        </div>
        <h1 class="heading-editorial" style="font-size: 3rem; margin-bottom: 12px; line-height: 1.1;">${sch.name}</h1>
        <p style="font-size: 1.1rem; color: var(--text-secondary); margin-bottom: 16px;">${sch.provider || ""}</p>
        
        <div class="flex" style="gap: 24px; align-items: baseline;">
          <div>
            <div style="font-size: 2.5rem; font-weight: 800; color: var(--primary); line-height: 1;">${sch.amount_string || "Amount varies"}</div>
            <div style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-top: 8px;">${sch.cover_type === 'full' ? 'FULL COVER' : 'PARTIAL COVER'}</div>
          </div>
          ${sch.deadline ? `
            <div style="margin-left: auto; text-align: right;">
              <div style="font-size: 1.5rem; font-weight: 700; color: var(--text-main);">${sch.deadline}</div>
              <div style="font-size: 0.75rem; font-weight: 700; color: var(--warning); text-transform: uppercase; letter-spacing: 0.05em; margin-top: 4px;">DEADLINE</div>
            </div>
          ` : ""}
        </div>
      </div>

      <!-- Eligibility Card -->
      ${isLoggedIn() && elig ? `
        <div class="card mb-32" style="border-color: ${elig.eligible ? 'var(--success)' : 'var(--danger)'}; background: ${elig.eligible ? 'var(--success-light)' : 'var(--danger-light)'};">
          <h3 style="font-size: 1.25rem; font-weight: 800; margin-bottom: 16px; color: ${elig.eligible ? 'var(--success)' : 'var(--danger)'};">
            ${elig.eligible ? "✓ You meet all eligibility criteria" : "❌ You do not meet the eligibility criteria"}
          </h3>
          
          <div class="repo-metrics" style="background: white;">
            <div class="repo-metric">
              <div class="repo-metric-val" style="color: ${elig.matchScore >= 70 ? 'var(--success)' : 'var(--warning)'}">${elig.matchScore}%</div>
              <div class="repo-metric-lbl">MATCH SCORE</div>
            </div>
            <div class="repo-metric">
              <div class="repo-metric-val" style="color: var(--primary);">${elig.winOdds}%</div>
              <div class="repo-metric-lbl">WIN PROBABILITY</div>
            </div>
            <div class="repo-metric">
              <div class="repo-metric-val" style="color: var(--text-main);">₹${((elig.expectedValue || 0) / 100000).toFixed(1)}L</div>
              <div class="repo-metric-lbl">EXPECTED VALUE</div>
            </div>
          </div>

          ${elig.blockedReasons?.length ? `
            <div style="margin-top: 16px;">
              <div style="font-size: 0.8rem; font-weight: 700; color: var(--danger); text-transform: uppercase; margin-bottom: 8px;">⚠️ Blockers</div>
              ${elig.blockedReasons.map((b) => `
                <div style="font-size: 0.9rem; color: var(--text-main); margin-bottom: 4px;">
                  • ${b.reason} ${b.user_value ? `(yours: ${b.user_value})` : ""}
                </div>`).join("")}
            </div>
          ` : ""}
        </div>
      ` : !isLoggedIn() ? `
        <div class="card mb-32 text-center" style="background: var(--bg-section);">
          <p style="margin-bottom: 16px; font-weight: 500;">Login to see your personalised eligibility score and win probability.</p>
          <button class="btn btn-primary" onclick="window.location.hash='/auth'">Sign In — It's Free</button>
        </div>
      ` : ""}

      <!-- Details -->
      <div class="grid-2 mb-32">
        <div class="card">
          <h4 style="font-size: 0.85rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 16px; border-bottom: 1px solid var(--border-light); padding-bottom: 8px;">Scholarship Details</h4>
          <div class="flex-col gap-12">
            ${[
              { label: "Education Level", value: sch.education_level || "Any" },
              { label: "Fields of Study", value: (sch.field_of_study || ["All"]).join(", ") },
              { label: "Country", value: sch.country || "India" },
              { label: "Awards per Year", value: sch.awards_per_year ? `~${sch.awards_per_year}` : "Not specified" },
              { label: "Competition", value: sch.competitive_ratio ? `${sch.competitive_ratio} ratio` : "Not specified" },
            ].map((r) => `
              <div class="flex-between">
                <span style="color: var(--text-muted); font-size: 0.9rem;">${r.label}</span>
                <span style="font-weight: 600; font-size: 0.9rem; text-align:right;">${r.value}</span>
              </div>
            `).join("")}
          </div>
        </div>

        <div class="card">
          <h4 style="font-size: 0.85rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 16px; border-bottom: 1px solid var(--border-light); padding-bottom: 8px;">Eligibility Requirements</h4>
          <div class="flex-col gap-12">
            ${[
              { label: "Citizenship", value: sch.citizenship || "Any" },
              { label: "Gender", value: sch.required_gender || "Any" },
              { label: "Min GPA", value: sch.min_gpa ? `${sch.min_gpa}%` : "No minimum" },
              { label: "Max Family Income", value: sch.max_income_annual ? `₹${(sch.max_income_annual / 100000).toFixed(1)} lakh/year` : "No limit" },
              { label: "Disability Required", value: sch.requires_disability ? "Yes" : "No" },
            ].map((r) => `
              <div class="flex-between">
                <span style="color: var(--text-muted); font-size: 0.9rem;">${r.label}</span>
                <span style="font-weight: 600; font-size: 0.9rem; text-align:right;">${r.value}</span>
              </div>
            `).join("")}
          </div>
        </div>
      </div>

      <!-- Checklist -->
      ${checklist.length ? `
        <div class="card mb-32">
          <h4 style="font-size: 1.25rem; font-weight: 800; margin-bottom: 8px;">Application Checklist</h4>
          <p style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 24px;">
            Estimated effort: <strong>${sch.application_effort_hours || 5} hours</strong> · Method: <strong>${sch.application_method || "Online"}</strong>
          </p>
          <div class="flex-col gap-12">
            ${checklist.map((item, i) => `
              <div class="flex" style="align-items: center; gap: 16px; padding-bottom: 12px; border-bottom: 1px solid var(--border-light);">
                <div style="width: 28px; height: 28px; border-radius: 50%; background: var(--bg-section); color: var(--text-main); font-weight: 700; font-size: 0.85rem; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                  ${i + 1}
                </div>
                <div>
                  <div style="font-weight: 600; font-size: 0.95rem;">${item.document}</div>
                  ${item.due_by ? `<div style="font-size: 0.8rem; color: var(--warning); margin-top: 2px;">Due: ${item.due_by}</div>` : ""}
                </div>
              </div>
            `).join("")}
          </div>
        </div>
      ` : ""}

      ${sch.notes ? `
        <div class="card mb-32" style="background: var(--bg-section);">
          <h4 style="font-size: 0.85rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">Tips & Notes</h4>
          <p style="font-size: 0.95rem; color: var(--text-main);">${sch.notes}</p>
        </div>
      ` : ""}

      <!-- Actions -->
      <div class="flex gap-16">
        ${sch.application_url ? `
          <a href="${sch.application_url}" target="_blank" rel="noopener" class="btn btn-primary btn-lg">
            Apply Now →
          </a>
        ` : ""}
        ${isLoggedIn() ? `
          <button class="btn btn-secondary btn-lg" id="save-btn">Save to Roadmap</button>
        ` : ""}
      </div>
    `;

    document.getElementById("save-btn")?.addEventListener("click", async () => {
      try {
        await api.roadmap.save(id);
        showToast("Added to your roadmap!", "success");
      } catch (err) {
        showToast(err.message, "error");
      }
    });

  } catch (err) {
    document.getElementById("detail-loading").innerHTML = `
      <div style="padding: 40px; text-align: center; color: var(--danger);">
        <h3>Could not load scholarship</h3>
        <p>${err.message}</p>
        <button class="btn btn-primary mt-16" onclick="history.back()">Go Back</button>
      </div>
    `;
  }
}
