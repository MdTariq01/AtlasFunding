import { isLoggedIn, getUser, clearAuth } from "../api.js";
import { navigate } from "../main.js";

export function renderNavbar(el) {
  const user = getUser();
  const loggedIn = isLoggedIn();

  el.innerHTML = `
    <div class="navbar-inner">
      <div class="nav-brand" id="nav-brand">
        <div class="nav-logo-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon>
            <circle cx="12" cy="12" r="10"></circle>
          </svg>
        </div>
        <div>Atlas<span>Funding</span></div>
      </div>

      <div class="nav-links">
        <div class="nav-link" data-route="/">Home</div>
        <div class="nav-link" data-route="/search">Search</div>
        <div class="nav-link" data-route="/repository">Repository</div>
        <div class="nav-link" data-route="/calculator">Eligibility</div>
        ${loggedIn ? `
          <div class="nav-link" data-route="/roadmap">Roadmap</div>
          <div class="nav-link" data-route="/calendar">Calendar</div>
          <div class="nav-link" data-route="/advisor">Advisor</div>
          <div class="nav-link" data-route="/dashboard">Dashboard</div>
        ` : ``}
      </div>

      <div>
        ${loggedIn ? `
          <button class="btn btn-ghost btn-sm" id="nav-logout">Sign Out</button>
        ` : `
          <button class="btn btn-ghost btn-sm" data-route="/auth">Sign In</button>
        `}
      </div>
    </div>
  `;

  const current = window.location.hash.slice(1).split("?")[0] || "/";
  el.querySelectorAll("[data-route]").forEach((btn) => {
    if (btn.dataset.route === current) btn.classList.add("active");
    btn.addEventListener("click", () => navigate(btn.dataset.route));
  });

  document.getElementById("nav-brand")?.addEventListener("click", () => navigate("/"));

  document.getElementById("nav-logout")?.addEventListener("click", () => {
    clearAuth();
    navigate("/");
    window.location.reload();
  });
}
