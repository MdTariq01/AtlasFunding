import "./style.css";
import { renderNavbar } from "./components/navbar.js";
import { renderHome } from "./pages/home.js";
import { renderSearch } from "./pages/search.js";
import { renderAuth } from "./pages/auth.js";
import { renderCalculator } from "./pages/calculator.js";
import { renderResults } from "./pages/results.js";
import { renderRepository } from "./pages/repository.js";
import { renderDetail } from "./pages/detail.js";
import { renderRoadmap } from "./pages/roadmap.js";
import { renderCalendar } from "./pages/calendar.js";
import { renderAdvisor } from "./pages/advisor.js";
import { renderDashboard } from "./pages/dashboard.js";

const app = document.getElementById("app");

const routes = {
  "/": renderHome,
  "/search": renderSearch,
  "/auth": renderAuth,
  "/calculator": renderCalculator,
  "/results": renderResults,
  "/repository": renderRepository,
  "/detail": renderDetail,
  "/roadmap": renderRoadmap,
  "/calendar": renderCalendar,
  "/advisor": renderAdvisor,
  "/dashboard": renderDashboard,
};

function getRoute() {
  const hash = window.location.hash.slice(1) || "/";
  const [path] = hash.split("?");
  return path || "/";
}

export function navigate(path) {
  window.location.hash = path;
}

export function getParams() {
  const hash = window.location.hash.slice(1);
  const idx = hash.indexOf("?");
  if (idx === -1) return {};
  return Object.fromEntries(new URLSearchParams(hash.slice(idx + 1)));
}

export function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3200);
}

async function render() {
  const path = getRoute();
  const renderFn = routes[path] || renderHome;

  app.innerHTML = `
    <nav class="navbar" id="navbar"></nav>
    <main id="main-content"></main>
  `;

  renderNavbar(document.getElementById("navbar"));

  const main = document.getElementById("main-content");
  try {
    await renderFn(main);
  } catch (err) {
    main.innerHTML = `
      <div class="container section text-center">
        <div style="padding: 60px; background: white; border-radius: 12px; border: 1px solid var(--danger);">
          <h3 style="color: var(--danger); margin-bottom: 16px;">Something went wrong</h3>
          <p>${err.message}</p>
          <button class="btn btn-primary mt-16" onclick="window.location.hash='/'">Go Home</button>
        </div>
      </div>
    `;
    console.error(err);
  }

  window.scrollTo({ top: 0, behavior: "instant" });
}

window.addEventListener("hashchange", render);
window.addEventListener("load", render);
