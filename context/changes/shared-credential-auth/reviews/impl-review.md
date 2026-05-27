<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Shared-Credential Auth (F-01)

- **Plan**: context/changes/shared-credential-auth/plan.md
- **Scope**: Full plan — Phases 1–3 of 3
- **Date**: 2026-05-27
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical · 2 warnings · 2 observations

Core crypto is correct and every automated gate is green (16/16 unit tests, lint clean, `astro check` 0 errors, `npm run build` OK, no Supabase/bcrypt residue, zero plan drift across all 14 planned items). The findings are login-endpoint hardening, not crypto defects.

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findingst

### F1 — login endpoint can 500 instead of failing closed

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (Reliability)
- **Location**: src/pages/api/auth/login.ts:19 (and the KV awaits)
- **Detail**: `await context.request.formData()` is unguarded. A malformed or non-form POST body makes formData() reject; with no try/catch the POST handler throws → 500 instead of a clean redirect back to /login. Same exposure if a KV op throws. The middleware fails closed, but this endpoint does not — so the auth surface is not uniformly fail-closed.
- **Fix**: Wrap the handler body in try/catch; on any error do a best-effort recordFailure and redirect("/login?error=…"), mirroring verifySession's own try/catch posture.
  - Strength: One localized change; makes the login path fail closed end-to-end like the gate already does.
  - Tradeoff: Forces an explicit KV-down policy decision — let the credential check proceed unthrottled, or reject (see F3).
  - Confidence: HIGH — formData() rejection on bad bodies is well-defined; fix mirrors an in-repo pattern (verifySession's try/catch).
  - Blind spot: Didn't reproduce a live 500 against dev; inferred from the unguarded await.
- **Decision**: FIXED (Fix now)

### F2 — missing CF-Connecting-IP shares one throttle bucket

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (Security)
- **Location**: src/pages/api/auth/login.ts:11-12
- **Detail**: `headers.get("CF-Connecting-IP") ?? "local"` — when the trusted IP header is absent, every IP-less request shares the `login_fail:local` bucket. One failing client can push that bucket past threshold and impose the delay on all IP-less clients (shared soft-lock), and distributed clients can pre-warm it. The edge always sets CF-Connecting-IP, so prod is normally fine — the risk is a preview/misrouted request or local dev.
- **Fix**: Treat a missing trusted IP as untrusted — apply the max delay (or a dedicated stricter bucket) rather than one shared "local" key; never fall back to a client-supplied header (spoofable).
  - Strength: Removes shared-bucket cross-talk without trusting attacker-controlled input.
  - Tradeoff: Penalizes legitimately IP-less requests (local dev) with max delay; the alternative — skip throttling when IP is unknown — avoids cross-talk but leaves those requests unthrottled.
  - Confidence: MED — exploit needs the header absent, which shouldn't happen on the live Workers route.
  - Blind spot: Didn't confirm whether any prod path (preview deploys, custom routes) reaches the Worker without CF-Connecting-IP.
- **Decision**: FIXED (Fix now)

### F3 — KV throttle is best-effort, not a hard limit

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Security/Performance)
- **Location**: src/lib/auth/throttle.ts:41-43 + login.ts delay
- **Detail**: recordFailure is read-modify-write under KV's eventual consistency, so parallel failed bursts under-count and can exceed the threshold without tripping the delay; a KV read error yields count 0 (throttle silently off); the inline delay holds the invocation up to 5s (MAX_DELAY_MS). All consistent with the plan's deliberate "soft throttle, no hard lock" choice — recorded so the limitation is on record.
- **Fix**: Document as best-effort anti-stuffing (not a hard rate limit); if a hard guarantee is later needed, move the counter to a Durable Object or add Turnstile, and consider lowering the 5s cap.
- **Decision**: FIXED (Fix now — caveat comment added; 5s cap left as-is)

### F4 — minor pattern notes

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/auth/login.ts (env access)
- **Detail**: login.ts reads KV via `import { env } from "cloudflare:workers"` but secrets via `astro:env/server` — two env mechanisms in one file. Correct (KV bindings aren't exposed through astro:env) but easy for a future reader to "fix" wrongly. Separately, commit 080a720's message calls credentials.ts "bcrypt verify" though the code is the peppered HMAC (history artifact only; the code is compliant).
- **Fix**: Add a one-line comment in login.ts explaining why KV uses cloudflare:workers; leave the commit message as history.
- **Decision**: FIXED (Fix now — comment added; commit message left as history)

## Notes (not findings)

- **Scope**: all 5 unplanned file changes (astro.config.mjs, eslint.config.js, Layout.astro, worker-configuration.d.ts, .env.example) are justified mechanical side-effects of planned work — no scope creep.
- Plan's allowlist named "sitemap"; /sitemap-*.xml is not in PUBLIC_PATHS (fails closed). Benign — and the build skips sitemap entirely (no `site` config), so nothing is gated.
- **Crypto verified correct**: constant-time compares (no `===` on secrets), base64-decoded HMAC key import, true base64url, fail-closed verifySession (rejects bad-sig / expired / NaN-exp / malformed), HttpOnly+Secure+SameSite=Lax+Path=/+7d cookie.

## Automated verification (run during review)

- `npm run test` → 16 passed (3 files: session 7, credentials 5, throttle 4).
- `npm run lint` → clean (only benign `astro-eslint-parser projectService` notices).
- `npm run build` → Complete (one pre-existing `@astrojs/sitemap` "requires `site`" warning, unrelated to auth).
- `npm run astro check` → 0 errors (per drift sub-agent).
- Dangling-refs grep (`auth/signin|auth/signup|confirm-email|signInWithPassword|signUp|@supabase/ssr|bcrypt|locals.user`) → only an explanatory comment in credentials.ts; no live references.
