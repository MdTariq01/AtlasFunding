/**
 * Manual verification of the rate-limit middleware without a DB or external
 * services. Run with: node scripts/rate-limit.test.js
 */
process.env.NODE_ENV = "test";
const express = require("express");
const {
  authLimiter,
  accountLimiter,
  publicLimiter,
} = require("../src/config/rate-limit");

const app = express();
app.use(express.json());

app.post("/api/auth/login", authLimiter, accountLimiter, (req, res) => res.json({ ok: true }));
app.get("/api/public", publicLimiter, (req, res) => res.json({ ok: true }));

const server = app.listen(3999, () => console.log("test server on 3999"));

const BASE = "http://127.0.0.1:3999";

async function hit(path, opts = {}) {
  const fetchOpts = {
    method: opts.method || "POST",
    headers: { "Content-Type": "application/json" },
  };
  if (!opts.noBody) fetchOpts.body = JSON.stringify(opts.body || {});
  const res = await fetch(BASE + path, fetchOpts);
  return { status: res.status, headers: Object.fromEntries(res.headers) };
}

async function run() {
  let pass = true;
  const check = (name, cond) => {
    console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
    if (!cond) pass = false;
  };

  // 1. Auth per-IP: exceed default auth max (20) → 429
  console.log("\n— Auth per-IP tier —");
  let lastStatus = 0;
  for (let i = 0; i < 25; i++) {
    lastStatus = (await hit("/api/auth/login", { body: { email: "a@b.com", password: "x" } })).status;
  }
  check("login blocked after >20 requests", lastStatus === 429);
  const authHeaders = await hit("/api/auth/login", { body: { email: "a@b.com", password: "x" } });
  check("auth returns RateLimit headers", "ratelimit-limit" in authHeaders.headers);
  check("auth returns Retry-After", "retry-after" in authHeaders.headers);

  // 2. Public tier is looser: same IP, different limiter, should not yet be blocked
  console.log("\n— Public tier —");
  let pubStatus = 0;
  for (let i = 0; i < 30; i++) pubStatus = (await hit("/api/public", { method: "GET", noBody: true })).status;
  check("public allows >20 (looser than auth)", pubStatus === 200);

  // 3. Per-account: account limiter keys on email → 5 attempts then 429 even for fresh IP-ish
  console.log("\n— Per-account tier —");
  // account max is 5; hammer same email
  let acctStatus = 0;
  for (let i = 0; i < 6; i++) {
    acctStatus = (await hit("/api/auth/login", { body: { email: "victim@x.com", password: "y" } })).status;
  }
  check("same email blocked after >5 attempts", acctStatus === 429);

  server.close();
  console.log(pass ? "\nALL TESTS PASSED" : "\nSOME TESTS FAILED");
  process.exit(pass ? 0 : 1);
}

run().catch((e) => { console.error(e); process.exit(1); });
