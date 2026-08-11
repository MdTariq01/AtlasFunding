import { navigate } from "../main.js";
import { api, isLoggedIn } from "../api.js";


export async function renderHome(el) {
  el.innerHTML = `
    <!-- Split Hero -->
    <div style="background: var(--bg-main); border-bottom: 1px solid var(--border-light); padding: 80px 0;">
      <div class="container grid-2" style="align-items: center; gap: 48px;">
        
        <!-- Left: Copy -->
        <div>
          <div class="badge mb-24">
            <div class="badge-dot"></div>
            EDUCATION FUNDING INTELLIGENCE
          </div>
          
          <h1 class="heading-editorial" style="font-size: clamp(3rem, 5vw, 4.5rem); margin-bottom: 24px;">
            A student should never search for scholarships.
            <span class="text-primary">They should answer questions.</span>
          </h1>
          
          <p style="font-size: 1.1rem; max-width: 500px; margin-bottom: 32px; color: var(--text-secondary);">
            Atlas matches your profile against every scholarship, grant, fellowship, bursary, fee waiver, stipend and loan subsidy in the repository — then tells you what you will actually win, what it is worth, and in what order to apply.
          </p>
        </div>

        <!-- Right: Calculator Preview Card -->
        <div>
          <div class="card" style="box-shadow: 0 12px 32px rgba(0,0,0,0.06); padding: 0;">
            <div style="padding: 16px 24px; border-bottom: 1px solid var(--border-light); font-size: 0.75rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em;">
              QUESTION 1 OF 15
            </div>
            
            <div style="padding: 24px;">
              <h3 style="font-size: 1.5rem; font-weight: 800; color: var(--text-main); margin-bottom: 8px;">What is your current education level?</h3>
              <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 24px;">This anchors every rule the engine evaluates against you.</p>
              
              <div class="grid-2" style="gap: 12px;">
                <div style="padding: 12px; border: 1px solid var(--border-strong); border-radius: 6px; font-size: 0.9rem;">School (Class 8–12)</div>
                <div style="padding: 12px; border: 1px solid var(--border-strong); border-radius: 6px; font-size: 0.9rem;">Diploma / Polytechnic</div>
                <div style="padding: 12px; border: 1px solid var(--border-strong); border-radius: 6px; font-size: 0.9rem;">Undergraduate</div>
                <div style="padding: 12px; border: 1px solid var(--border-strong); border-radius: 6px; font-size: 0.9rem;">Postgraduate</div>
                <div style="padding: 12px; border: 1px solid var(--border-strong); border-radius: 6px; font-size: 0.9rem;">Doctorate / Research</div>
              </div>
            </div>

            <div class="flex-between" style="padding: 16px 24px; background: #faf8f5; border-top: 1px solid var(--border-light); border-bottom-left-radius: 8px; border-bottom-right-radius: 8px;">
              <span style="font-size: 0.9rem; color: var(--text-muted);">← Back</span>
              <button class="btn btn-primary" id="hero-cta" style="opacity: 0.5;">Continue →</button>
            </div>
          </div>
        </div>
        
      </div>
    </div>

    <!-- Stats Row -->
    <div style="border-bottom: 1px solid var(--border-light);">
      <div class="container flex" style="gap: 16px; padding: 24px;">
        <div class="card" style="padding: 16px 24px; border-radius: 6px;">
          <div id="home-opportunities-stats" style="font-weight: 800; font-size: 1.25rem; color: var(--primary);">25</div>
          <div style="font-size: 0.65rem; font-weight: 700; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.05em; margin-top: 4px;">OPPORTUNITIES LIVE</div>
        </div>
        <div class="card" style="padding: 16px 24px; border-radius: 6px;">
          <div id="home-value-stats" style="font-weight: 800; font-size: 1.25rem; color: var(--primary);">₹6.58 crore</div>
          <div style="font-size: 0.65rem; font-weight: 700; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.05em; margin-top: 4px;">REPOSITORY VALUE</div>
        </div>
        <div class="card" style="padding: 16px 24px; border-radius: 6px;">
          <div style="font-weight: 800; font-size: 1.25rem; color: var(--primary);">90 sec</div>
          <div style="font-size: 0.65rem; font-weight: 700; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.05em; margin-top: 4px;">TO FULL REPORT</div>
        </div>
        
        <div style="display: flex; align-items: center; gap: 24px; margin-left: auto;">
          <button class="btn btn-ghost" id="home-browse" style="background: white;">Browse the repository</button>
          <a href="#/advisor" style="font-weight: 600; font-size: 0.9rem;">Ask the funding advisor →</a>
        </div>
      </div>
    </div>

    <!-- Schema Section -->
    <div class="section container">
      <h2 style="font-size: 2.25rem; font-weight: 800; margin-bottom: 16px;">Every funding source, one schema</h2>
      <p style="font-size: 1rem; color: var(--text-secondary); max-width: 800px; margin-bottom: 48px;">
        Each opportunity is normalised into 38 fields and compiled into machine-readable eligibility logic — income ceilings, merit gates, category rules, domicile, disability, defence, sports and research conditions.
      </p>

      <div class="grid-3 mb-48">
        ${[
          { icon: "🏛️", title: "Government", desc: "NSP, state portals, AICTE, UGC, DST, ICMR, CSIR, DRDO, welfare boards" },
          { icon: "🎓", title: "Universities", desc: "IITs, IIMs, NITs, private and international institutional aid" },
          { icon: "🏢", title: "Corporate CSR", desc: "Reliance, Tata, HDFC, Kotak, Infosys, Wipro, Aditya Birla, LIC, SBI" },
          { icon: "🌍", title: "International", desc: "Fulbright, Chevening, Commonwealth, DAAD, Erasmus, Australia Awards" },
          { icon: "❤️", title: "NGO & trusts", desc: "Inlaks, JN Tata, K.C. Mahindra, foundations and community trusts" },
          { icon: "🎯", title: "Crawler", desc: "Continuous normalisation into one universal funding schema" }
        ].map(c => `
          <div class="card" style="padding: 24px;">
            <div style="font-size: 1.5rem; margin-bottom: 12px; color: var(--primary);">${c.icon}</div>
            <h4 style="font-size: 1rem; font-weight: 700; margin-bottom: 8px;">${c.title}</h4>
            <p style="font-size: 0.85rem; color: var(--text-muted);">${c.desc}</p>
          </div>
        `).join("")}
      </div>
    </div>

    <!-- Dark Footer Strip -->
    <div style="background: var(--bg-dark); color: white; padding: 60px 0;">
      <div class="container grid-3">
        <div>
          <div style="color: var(--primary); font-weight: 700; font-size: 0.85rem; margin-bottom: 8px;">01</div>
          <h3 style="color: white; font-size: 1.25rem; margin-bottom: 12px;">Eligibility graph</h3>
          <p style="font-size: 0.85rem; color: #a09d98;">AND, OR, nested and weighted conditions with fuzzy matching produce a match percentage and named blockers for every scheme.</p>
        </div>
        <div>
          <div style="color: var(--primary); font-weight: 700; font-size: 0.85rem; margin-bottom: 8px;">02</div>
          <h3 style="color: white; font-size: 1.25rem; margin-bottom: 12px;">Funding optimisation</h3>
          <p style="font-size: 0.85rem; color: #a09d98;">Maximum, likely and guaranteed funding, stacking combinations, loan reduction and the optimal application sequence by return on effort.</p>
        </div>
        <div>
          <div style="color: var(--primary); font-weight: 700; font-size: 0.85rem; margin-bottom: 8px;">03</div>
          <h3 style="color: white; font-size: 1.25rem; margin-bottom: 12px;">Application readiness</h3>
          <p style="font-size: 0.85rem; color: #a09d98;">Consolidated document checklist, deadline calendar, renewal requirements and backup plans, ranked and dated.</p>
        </div>
      </div>
    </div>
    
    <div style="padding: 24px 0; border-top: 1px solid rgba(0,0,0,0.1); background: var(--bg-main);">
      <div class="container">
        <p style="font-size: 0.8rem; color: var(--text-muted);">Atlas Funding — building the definitive global education funding intelligence infrastructure.</p>
      </div>
    </div>
  `;

  document.getElementById("hero-cta")?.addEventListener("click", () =>
    navigate(isLoggedIn() ? "/calculator" : "/auth?next=calculator")
  );
  document.getElementById("home-browse")?.addEventListener("click", () => navigate("/repository"));

  // Fetch real stats to sync landing page counts
  api.repository.list({ limit: 1 })
    .then(data => {
      if (data && data.stats) {
        const oppsEl = document.getElementById("home-opportunities-stats");
        const valEl = document.getElementById("home-value-stats");
        if (oppsEl && data.stats.total_opportunities !== undefined) {
          oppsEl.textContent = data.stats.total_opportunities;
        }
        if (valEl && data.stats.total_award_value_crore !== undefined) {
          valEl.textContent = `₹${data.stats.total_award_value_crore} crore`;
        }
      }
    })
    .catch(err => {
      console.error("Failed to load repository stats for home page:", err);
    });
}
