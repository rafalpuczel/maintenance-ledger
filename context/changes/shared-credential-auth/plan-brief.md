# Shared-Credential Auth (F-01) — Plan Brief

> Full plan: `context/changes/shared-credential-auth/plan.md`

## What & Why

Replace the starter's Supabase Auth with a single shared-credential login (PRD FR-001). The agency runs one username/password pair; the server verifies it (bcryptjs) and issues a stateless HMAC-signed session cookie, and middleware gates **every route except login**. This is roadmap **F-01** — the universal auth gate that unlocks every later slice (S-01…S-09).

## Starting Point

The repo ships the 10x-astro-starter Supabase Auth: middleware protects only `/dashboard` via `supabase.auth.getUser()`, with signin/signup/confirm-email pages, three Supabase auth endpoints, and `locals.user` typed as a Supabase `User`. All FR-001 secrets (`SHARED_USERNAME=admin`, cost-12 `SHARED_PASSWORD_HASH`, base64 `SESSION_HMAC_KEY`) are already provisioned in prod and `.dev.vars`; `bcryptjs` is installed; a `SESSION` KV namespace exists but is undeclared in `wrangler.jsonc`.

## Desired End State

Any path other than `/login` redirects to login without a valid cookie. Correct `admin` + password sets a 7-day HttpOnly/Secure/SameSite=Lax HMAC cookie and lands on `/`; logout clears it. Wrong credentials show a generic error, three mistypes don't lock anyone out, and bursts from one IP get a growing delay. No Supabase Auth code remains; build, lint, typecheck, and Vitest unit tests pass.

## Key Decisions Made

| Decision                     | Choice                                             | Why (1 sentence)                                                                 | Source |
| ---------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------- | ------ |
| Session token                | Stateless HMAC cookie (Web Crypto)                 | Matches roadmap's literal spec; no per-request KV; `SESSION_HMAC_KEY` exists for it. | Plan   |
| Credential-stuffing defense  | KV per-IP soft throttle (growing delay, no lock)   | Resists stuffing at scale while honest mistypes only see a small delay (the NFR). | Plan   |
| Session lifetime             | Fixed 7-day; HttpOnly+Secure+SameSite=Lax          | Simple, bounded blast radius; Lax lets the post-login redirect carry the cookie. | Plan   |
| Login identifier             | Generic username field                             | Shared cred is `admin`; the old email regex would reject it.                     | Plan   |
| Public route policy          | Allowlist (login page + login POST + assets)       | Fails closed — new routes are protected by default (FR-001 guardrail).           | Plan   |
| Supabase removal             | Remove all Auth surfaces, keep `supabase-js` dep   | No dead auth code, but don't delete the data client S-01 needs next.             | Plan   |
| Testing                      | Add Vitest for the pure crypto/session units       | Auth is security-critical and the functions are trivially unit-testable.         | Plan   |

## Scope

**In scope:** HMAC session lib, bcrypt credential check, KV throttle, `/login` page + form, login/logout endpoints, allowlist middleware, `locals` reshape, Supabase Auth rip-out + UI cleanup, Vitest.

**Out of scope:** user accounts/roles/signup/reset, session revocation, Turnstile/WAF, projects/data work, Supabase data-client setup, multi-tenancy, in-app credential editing.

## Architecture / Approach

`src/lib/auth/{session,credentials,throttle}.ts` hold pure primitives (Web Crypto HMAC-SHA256, bcryptjs compare, KV-injected throttle). `POST /api/auth/login` verifies + throttles + sets the cookie; `POST /api/auth/logout` clears it. `middleware.ts` becomes an allowlist gate that verifies the cookie and sets `locals.authenticated`. The `SESSION` KV is declared in `wrangler.jsonc` for the throttle.

## Phases at a Glance

| Phase                         | What it delivers                              | Key risk                                              |
| ----------------------------- | --------------------------------------------- | ----------------------------------------------------- |
| 1. Auth core library          | Tested HMAC/credential/throttle primitives    | Getting constant-time verify + base64 key decode right |
| 2. Wire login + gate          | Working shared-credential auth + all-route gate | bcrypt cost-12 CPU vs free-tier 10 ms limit           |
| 3. Rip out Supabase + UI      | No dead auth code; clean build                | Missing a dangling reference; login-page assets pre-auth |

**Prerequisites:** none — secrets + KV namespace already provisioned; `bcryptjs` installed.
**Estimated effort:** ~2-3 after-hours sessions across 3 phases.

## Open Risks & Assumptions

- **bcryptjs cost-12 is pure-CPU (~100ms+)** and likely exceeds the free-tier 10 ms CPU/request budget on login — measure via `wrangler tail`; mitigation is Workers Paid (CLAUDE.md-sanctioned) or a lower cost factor.
- Per-IP throttle is coarse under NAT/shared IPs (accepted for MVP).
- Stateless cookie can't be revoked before expiry; rotation = redeploy with a new HMAC key (the accepted MVP model).
- Assumes Astro middleware + the `ASSETS` binding let the login page's `/_astro/*` assets load pre-auth.

## Success Criteria (Summary)

- Every route except `/login` is unreachable without a valid session; correct creds log in, logout clears the session.
- Three mistypes never lock a user out; automated stuffing is slowed.
- No Supabase Auth code remains; build/lint/typecheck/unit tests all green.
