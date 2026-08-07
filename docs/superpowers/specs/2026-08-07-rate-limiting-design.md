# Rate Limiting — Design

**Date:** 2026-08-07
**Status:** Approved

## Goal

Add tiered, configurable HTTP rate limiting to the AtlasFunding API to prevent abuse
(login spamming, data scraping) without adding new infrastructure.

## Decisions (confirmed with user)

- **In-memory store** — use `express-rate-limit`'s default in-memory store. No Redis / DB / new service.
- **Package** — `express-rate-limit` (battle-tested), not hand-written middleware.
- **Config** — thresholds live in `src/config/rate-limit.js` with `.env` overrides.
- **Backoff** — exponential backoff for the auth tier (self-healing, not a hard permanent lockout).

## Architecture

A single config file defines per-tier limits. Three reusable `express-rate-limit`
middleware instances are exported and applied per-route in `server.js` and
`auth.routes.js`.

- `src/config/rate-limit.js` — config + factory for the limiters.
- Applied in `server.js` at the router level for public/authenticated tiers.
- Applied in `src/routes/auth.routes.js` for the strict auth tier (with per-account keying).

## Tiers → endpoints

| Tier | Middleware | Applies to | Limit | Window |
|------|-----------|------------|-------|--------|
| Strict / auth | `authLimiter` | `/api/auth/register`, `/api/auth/login` | 20 | 15 min |
| Moderate / public | `publicLimiter` | `eligibility/questions`, scholarships list/search/detail, advisor prompts | 60 | 1 min |
| Loose / authenticated | `authUserLimiter` | roadmap, dashboard, matched, advisor ask, eligibility answer/calculate | 120 | 1 min |

## Requirements coverage

- **Stricter auth / moderate public / looser authenticated** — three tiers.
- **Per-IP** — `express-rate-limit` keys on `req.ip` by default.
- **Per-account** — a second limiter on the auth tier keys on normalized `email` from
  the request body, stopping distributed multi-IP attacks against one account.
- **Exponential backoff** — auth limiter multiplies cooldown per blocked attempt
  (e.g. 15m → 30m → 1h); self-heals when the account goes quiet. Not a hard lockout.
- **Configurable** — all thresholds in config file, overridable via env.

## Response & errors

- `429` JSON: `{ success: false, message: "Too many requests. Please try again later." }`
- `Retry-After` + `RateLimit-*` headers via `standardHeaders: true`.

## Out of scope (YAGNI)

- No Redis / DB-backed store.
- No password-reset route (doesn't exist yet) — auth tier is ready to cover it when added.
- No distributed / multi-instance store.

## Testing

- Run server locally; POST `/login` >20× within the window → expect 429 + headers.
- Confirm public vs auth tiers behave differently.
- Confirm env override changes the limit.
