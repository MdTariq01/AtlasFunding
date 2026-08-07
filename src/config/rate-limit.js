/**
 * Tiered Rate Limiting — AtlasFunding API
 *
 * Three limiters are exported and applied per-route:
 *   authLimiter   — strict, for authentication routes (register/login). Per-IP
 *                   with exponential backoff on repeated abuse.
 *   publicLimiter — moderate, for public/read-mostly endpoints (lists, search,
 *                   questions, advisor prompts).
 *   authUserLimiter — loose, for actions behind `protect` (dashboard, roadmap,
 *                   matched, advisor ask, eligibility answer/calculate).
 *   accountLimiter  — per-account companion to authLimiter; keys on the email in
 *                   the request body so distributed multi-IP attacks against a
 *                   single account are throttled too.
 *
 * Every threshold is configurable via environment variables (RATE_LIMIT_*), and
 * the defaults live below. All counters are in-memory (per-process); they reset
 * on server restart. No Redis/DB store — deliberate, see design spec.
 */

const { rateLimit, ipKeyGenerator } = require("express-rate-limit");

// ── Env helpers ────────────────────────────────────────────────────────────────
function int(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

// ── Defaults (overridable via RATE_LIMIT_* env) ────────────────────────────────
const defaults = {
  auth: {
    windowMs: int("RATE_LIMIT_AUTH_WINDOW", 15 * 60 * 1000),
    max: int("RATE_LIMIT_AUTH_MAX", 20),
  },
  public: {
    windowMs: int("RATE_LIMIT_PUBLIC_WINDOW", 60 * 1000),
    max: int("RATE_LIMIT_PUBLIC_MAX", 60),
  },
  authUser: {
    windowMs: int("RATE_LIMIT_USER_WINDOW", 60 * 1000),
    max: int("RATE_LIMIT_USER_MAX", 120),
  },
  account: {
    windowMs: int("RATE_LIMIT_ACCOUNT_WINDOW", 15 * 60 * 1000),
    max: int("RATE_LIMIT_ACCOUNT_MAX", 5),
  },
};

const MESSAGE = "Too many requests. Please try again later.";

function jsonMessage(message = MESSAGE) {
  return { success: false, message };
}

// ── IP key generator ───────────────────────────────────────────────────────────
// Uses the package's ipKeyGenerator helper so IPv6 addresses are bucketed by
// /56 subnet (preventing IPv6 users from trivially rotating addresses).
function ipKey(req) {
  return ipKeyGenerator(req.ip || req.socket?.remoteAddress || "unknown");
}

// ── Simple tiered limiter (fixed window, no backoff) ───────────────────────────
function makeLimiter(cfg, keyGen, extra = {}) {
  return rateLimit({
    windowMs: cfg.windowMs,
    limit: cfg.max,
    keyGenerator: keyGen,
    standardHeaders: true,
    legacyHeaders: false,
    message: jsonMessage(),
    validate: { xForwardedForHeader: false },
    ...extra,
  });
}

// ── Auth limiter with exponential backoff ──────────────────────────────────────
// Each blocked request doubles the wait for that key (and halves the allowed
// requests in the current window). The backoff self-heals: it decays as soon as
// the key goes quiet for a full window. This is a throttling backoff, NOT a hard
// permanent lockout.
const BACKOFF_STATE = new Map(); // key -> { level, resetAt }

function getBackoff(key, windowMs) {
  const now = Date.now();
  const rec = BACKOFF_STATE.get(key);
  if (!rec || now > rec.resetAt) {
    const fresh = { level: 0, resetAt: now + windowMs };
    BACKOFF_STATE.set(key, fresh);
    return fresh;
  }
  return rec;
}

function effectiveLimit(key, cfg) {
  const b = getBackoff(key, cfg.windowMs);
  return Math.max(1, Math.floor(cfg.max / Math.pow(2, b.level)));
}

const authLimiter = rateLimit({
  windowMs: defaults.auth.windowMs,
  limit: (req) => effectiveLimit(ipKey(req), defaults.auth),
  keyGenerator: ipKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: jsonMessage(),
  validate: { xForwardedForHeader: false },
  handler: (req, res, next, options) => {
    const key = ipKey(req);
    const rec = getBackoff(key, defaults.auth.windowMs);
    rec.level += 1;
    rec.resetAt = Date.now() + defaults.auth.windowMs * Math.pow(2, rec.level);
    BACKOFF_STATE.set(key, rec);
    res.status(options.statusCode).json(jsonMessage());
  },
});

// ── Per-account companion (keys on email in body) ──────────────────────────────
function accountKey(req) {
  const email = req.body?.email;
  return email ? `acct:${String(email).trim().toLowerCase()}` : ipKey(req);
}

const accountLimiter = makeLimiter(defaults.account, accountKey);

// ── Public & authenticated tiers ───────────────────────────────────────────────
const publicLimiter = makeLimiter(defaults.public, ipKey);
const authUserLimiter = makeLimiter(defaults.authUser, ipKey);

module.exports = {
  authLimiter,
  accountLimiter,
  publicLimiter,
  authUserLimiter,
  defaults,
};
