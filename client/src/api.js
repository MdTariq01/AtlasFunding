// ── Auth state ─────────────────────────────────────────────────────────────────
let _token = localStorage.getItem("af_token") || null;
let _user = JSON.parse(localStorage.getItem("af_user") || "null");

export function getToken() { return _token; }
export function getUser() { return _user; }
export function isLoggedIn() { return !!_token && !!_user; }

export function setAuth(token, user) {
  _token = token;
  _user = user;
  localStorage.setItem("af_token", token);
  localStorage.setItem("af_user", JSON.stringify(user));
}

export function clearAuth() {
  _token = null;
  _user = null;
  localStorage.removeItem("af_token");
  localStorage.removeItem("af_user");
}

// ── Base fetch wrapper ─────────────────────────────────────────────────────────
const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

async function request(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (_token) headers["Authorization"] = `Bearer ${_token}`;

  const res = await fetch(`${API_BASE}/api${path}`, { ...options, headers });

  let data = {};
  try {
    data = await res.json();
  } catch (err) {
    data = { message: `Server error (${res.status}). Please ensure backend is running.` };
  }

  if (!res.ok) {
    throw new Error(data.message || `API error ${res.status}`);
  }
  return data;
}

// ── Auth ───────────────────────────────────────────────────────────────────────
export const api = {
  auth: {
    register: (email, password) =>
      request("/auth/register", { method: "POST", body: JSON.stringify({ email, password }) }),
    login: (email, password) =>
      request("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
    me: () => request("/auth/me"),
  },

  eligibility: {
    questions: () => request("/eligibility/questions"),
    answer: (question_num, answer, disability_type) =>
      request("/eligibility/answer", {
        method: "POST",
        body: JSON.stringify({ question_num, answer, disability_type }),
      }),
    calculate: () => request("/eligibility/calculate", { method: "POST" }),
  },

  repository: {
    list: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return request(`/repository${qs ? "?" + qs : ""}`);
    },
    search: (q) => request(`/repository/search?q=${encodeURIComponent(q)}`),
    get: (id) => request(`/repository/${id}`),
    scrapeUrl: (url) =>
      request("/repository/scrape-url", { method: "POST", body: JSON.stringify({ url }) }),
    matched: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return request(`/repository/matched/me${qs ? "?" + qs : ""}`);
    },
  },

  roadmap: {
    get: () => request("/roadmap"),
    calendar: () => request("/roadmap/calendar"),
    save: (scholarshipId) => request(`/roadmap/save/${scholarshipId}`, { method: "POST" }),
    updateTask: (timelineId, task_index, completed) =>
      request(`/roadmap/task/${timelineId}`, {
        method: "PATCH",
        body: JSON.stringify({ task_index, completed }),
      }),
  },

  advisor: {
    ask: (question, messages = []) =>
      request("/advisor/ask", { method: "POST", body: JSON.stringify({ question, messages }) }),
    prompts: () => request("/advisor/prompts"),
  },

  dashboard: {
    get: () => request("/dashboard"),
  },
};
