# Shared-Credential Auth (F-01) Implementation Plan

## Overview

Replace the starter's Supabase Auth (signup / email-confirm / `signInWithPassword` / per-request `getUser`) with a single shared-credential login per PRD FR-001. A user submits a username + password; the server verifies them against the provisioned `SHARED_USERNAME` / `SHARED_PASSWORD_HASH` (peppered Web Crypto HMAC — `base64url(HMAC-SHA256(password, SHARED_PASSWORD_PEPPER))`, constant-time compare), then issues a **stateless HMAC-signed session cookie** (`SESSION_HMAC_KEY`, Web Crypto). Middleware verifies that cookie on every request and **redirects every route except the login page** to login. A KV-backed per-IP soft throttle resists credential-stuffing without locking out a user who mistypes a few times. All dead Supabase Auth surfaces are removed.

## Current State Analysis

- **Middleware** (`src/middleware.ts`): creates a Supabase SSR client per request, calls `supabase.auth.getUser()`, sets `context.locals.user`, and protects only `PROTECTED_ROUTES = ["/dashboard"]`. Everything else is public — the inverse of FR-001's "all routes except login require a session."
- **Supabase auth client** (`src/lib/supabase.ts`): `@supabase/ssr` `createServerClient` wired to cookie get/set. Used by middleware and all three auth endpoints.
- **Auth endpoints** (`src/pages/api/auth/{signin,signup,signout}.ts`): thin wrappers over `signInWithPassword` / `signUp` / `signOut`.
- **Auth pages/components**: `src/pages/auth/{signin,signup,confirm-email}.astro`; `src/components/auth/{SignInForm,SignUpForm}.tsx` + reusable `FormField` / `PasswordToggle` / `SubmitButton` / `ServerError`. `SignInForm` validates **email format** — which rejects the provisioned username `admin`.
- **Locals shape** (`src/env.d.ts`): `App.Locals.user: import("@supabase/supabase-js").User | null`.
- **UI reads of identity**: `Topbar.astro` and `dashboard.astro` render `user.email`; `Topbar.astro` and `Welcome.astro` link to `/auth/signin` + `/auth/signup`. With shared credentials there is **no per-user email**.
- **Secrets** (deploy-plan.md + `.dev.vars`): `SHARED_USERNAME=admin`, `SHARED_PASSWORD_HASH`, `SESSION_HMAC_KEY` (32 random bytes, base64) all set in prod and local. `SHARED_PASSWORD_PEPPER` (base64, 32 bytes) added by this change. **Note:** the originally-provisioned `SHARED_PASSWORD_HASH` was a cost-12 bcrypt hash; this change replaced bcrypt with a peppered HMAC (see Key Discoveries) so the prod secret must be re-minted.
- **KV**: a `SESSION` KV namespace was auto-provisioned (`6da5b0d1c8484b98820b32b83d2a2e5e`) for Astro's session driver but is **not declared in `wrangler.jsonc`**.
- **No test runner** is installed (`package.json` has no test script / vitest).

## Desired End State

- Visiting any path other than the login page **without a valid session cookie redirects to `/login`** (verified: `curl`/browser on `/`, `/dashboard` → 302 `/login`).
- Submitting the correct `admin` + password on `/login` sets an HMAC-signed, HttpOnly, Secure, SameSite=Lax cookie with a 7-day expiry and lands on `/`; gated routes are then reachable.
- Wrong credentials show a **generic auth failure**; three consecutive mistypes still let the user retry (no lockout); rapid repeated failures from one IP incur a growing delay.
- Logout clears the cookie and returns to `/login`.
- No Supabase **Auth** code remains; `npm run build`, `eslint`, `tsc`, and the new Vitest unit tests all pass; no source reference to `/auth/signin`, `/auth/signup`, `signInWithPassword`, `signUp`, or `@supabase/ssr` survives.

### Key Discoveries:

- HMAC must use **Web Crypto** (`crypto.subtle`, global on workerd) — `SESSION_HMAC_KEY` is **base64** and must be decoded to raw key bytes before `importKey`. `crypto.subtle.verify` is constant-time. (CLAUDE.md: workerd runtime.)
- **bcrypt was dropped for a peppered Web Crypto HMAC.** `bcryptjs` is pure-JS and CPU-bound (~100ms+ at cost 12); the Workers **free tier is 10 ms CPU/request** (CLAUDE.md), so a cost-12 `bcrypt.compare` gets the login request killed (error 1102) — not merely slow. A slow KDF buys little here: the credential is a single deploy secret, not a user-table dump, and online guessing is defended by the per-IP KV throttle. So `credentials.ts` verifies `base64url(HMAC-SHA256(password, SHARED_PASSWORD_PEPPER))` with a constant-time compare (sub-ms, native), and the free-tier CPU concern is moot.
- Astro middleware does **not** run for static assets served by the `ASSETS` binding, but the login page's `client:load` island and CSS load from `/_astro/*` — the allowlist must let those through if middleware ever sees them, and the login page itself must be reachable pre-auth.
- Real client IP on Cloudflare is `CF-Connecting-IP` (absent in local `astro dev`; throttle must degrade gracefully).
- `SameSite=Lax` is required so the post-login 302 redirect (a top-level GET navigation) carries the freshly set cookie.

## What We're NOT Doing

- No per-user accounts, roles, signup, password reset, email confirmation, or invitations (all post-MVP / Non-Goals).
- No server-side session store or session-revocation list (stateless cookie; rotation = redeploy with a new HMAC key — the accepted MVP model).
- No Cloudflare Turnstile or WAF rate-limit rule (KV soft-throttle chosen).
- No projects/data work, no Supabase **data** client setup (that's S-01) — we keep `@supabase/supabase-js` installed but unused here.
- No multi-tenancy / `agency_id` columns (explicit tech-stack lock).
- No in-app credential editing (provisioned at deploy time only).

## Implementation Approach

Build the security-critical crypto as **pure, unit-tested functions first** (Phase 1) so signature/expiry bugs surface before any wiring. Then wire the login/logout flow and the allowlist gate (Phase 2), at which point the app has working shared-credential auth. Finally remove the dead Supabase Auth surfaces and fix the UI tail (Phase 3). The allowlist gate **fails closed**: anything not explicitly public redirects to login.

## Critical Implementation Details

- **HMAC key decoding & signing**: base64-decode `SESSION_HMAC_KEY` → `Uint8Array`; `crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign","verify"])`. Sign the canonical payload string; verify with `crypto.subtle.verify` (constant-time). Cookie value = `base64url(payload) + "." + base64url(signature)`; payload carries an integer `exp` (epoch seconds). Verify rejects on bad signature OR `exp` in the past.
- **Credential check timing**: always compute the password HMAC even when the username doesn't match (no short-circuit) and always return the **same generic error**, so timing/messaging don't distinguish "bad user" from "bad password."
- **Throttle semantics**: key on `CF-Connecting-IP`; store a short-TTL failure counter in `SESSION` KV. Below threshold → no delay; above → add a bounded growing delay (e.g. capped exponential) rather than a hard lock; clear the counter on success. Three honest mistypes stay under the painful range.
- **CPU budget (resolved)**: the peppered HMAC verify is a sub-ms native Web Crypto op, so the login request stays well under the free-tier 10 ms limit — no Workers Paid upgrade needed for auth. (PDF generation remains the CPU-budget watch item per CLAUDE.md.)

---

## Phase 1: Auth core library (pure + tested)

### Overview

Create the pure, runtime-agnostic auth primitives and their unit tests. No middleware, route, or UI change yet — the app still uses Supabase Auth at the end of this phase. This isolates and proves the crypto.

### Changes Required:

#### 1. Session sign/verify + cookie codec

**File**: `src/lib/auth/session.ts` (new)

**Intent**: Provide stateless session issuance and verification: build a signed cookie value from a payload, and verify+parse it back (rejecting tampered or expired tokens). Centralize cookie name and the 7-day TTL.

**Contract**: Exports roughly `signSession(hmacKeyB64: string, now?: Date): Promise<string>` returning the cookie value, and `verifySession(hmacKeyB64: string, cookieValue: string, now?: Date): Promise<boolean>` (or a parsed result). Payload encodes `{ iat, exp }` with `exp = iat + 7d`. Uses Web Crypto HMAC-SHA256 over a canonical payload string; constant-time verify; base64url encoding. Also export the cookie name constant and the cookie attribute set (HttpOnly, Secure, SameSite=Lax, Path=/, Max-Age=7d).

#### 2. Credential verification

**File**: `src/lib/auth/credentials.ts` (new)

**Intent**: Verify a submitted username+password against the configured shared credentials with uniform timing and a generic outcome.

**Contract**: Exports `verifyCredentials(username, password, expectedUsername, passwordHash, pepperB64): Promise<boolean>` plus a `hashPassword(password, pepperB64)` helper. Computes `base64url(HMAC-SHA256(password, pepper))` via Web Crypto and constant-time-compares it to `passwordHash`; constant-time-compares the username; computes the HMAC regardless of username match. No bcrypt.

#### 3. Throttle helper (pure threshold/delay logic)

**File**: `src/lib/auth/throttle.ts` (new)

**Intent**: Encapsulate the per-IP failed-attempt accounting and the delay schedule. KV access is injected so the decision logic stays unit-testable without a live KV.

**Contract**: Exports the delay schedule as a pure function (e.g. `delayForFailures(count: number): number`) plus `recordFailure(kv, ip)`, `clearFailures(kv, ip)`, `currentDelay(kv, ip)` that take a KV-like `{ get, put, delete }`. Short TTL on the counter; bounded growing delay; no hard lock.

#### 4. Vitest setup + unit tests

**File**: `package.json`, `vitest.config.ts` (new), `src/lib/auth/session.test.ts` (new), `src/lib/auth/credentials.test.ts` (new), `src/lib/auth/throttle.test.ts` (new)

**Intent**: Add Vitest as the test runner and cover the pure logic: round-trip sign→verify, tampered-signature rejection, expired-token rejection, correct/incorrect credential outcomes, and the delay schedule (including "3 failures is not punishing").

**Contract**: Add `"test": "vitest run"` (and optionally `"test:watch"`) to `package.json` scripts; add `vitest` (and `@vitest/coverage` optional) to devDependencies. `vitest.config.ts` uses the default node/workerd-compatible environment. Tests import from `src/lib/auth/*` and rely on the global `crypto.subtle` (available under Vitest's Node).

### Success Criteria:

#### Automated Verification:

- Dependencies install cleanly: `npm install`
- Unit tests pass: `npm run test`
- Type checking passes: `npm run astro check` (or `tsc --noEmit`)
- Linting passes: `npm run lint`

#### Manual Verification:

- Reading the tests confirms they assert tamper-rejection and expiry-rejection (not just the happy path).

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 2.

---

## Phase 2: Wire login/logout flow + allowlist gate

### Overview

Introduce the real login surface, the session-issuing endpoints, and the all-route gate. At the end of this phase the app authenticates via shared credentials. The old Supabase auth pages/endpoints still exist on disk but become unreachable (gated) and are deleted in Phase 3.

### Changes Required:

#### 1. Declare the SESSION KV binding

**File**: `wrangler.jsonc`

**Intent**: Make the throttle's KV available to the Worker at runtime.

**Contract**: Add a `kv_namespaces` entry binding `SESSION` to id `6da5b0d1c8484b98820b32b83d2a2e5e` (per deploy-plan.md). Ensure local dev (`wrangler`/Astro) can resolve it; add `.dev.vars`/local KV as needed.

#### 2. Login endpoint

**File**: `src/pages/api/auth/login.ts` (new; replaces `signin.ts`)

**Intent**: Verify submitted credentials with throttle protection and issue the session cookie on success; on failure record the attempt and redirect back with a generic error.

**Contract**: `POST` handler reads `username` + `password` from form data. Resolves client IP from `CF-Connecting-IP`. Applies `currentDelay` before responding on repeated failures. On success: `signSession(...)`, `context.cookies.set(name, value, attrs)`, `clearFailures`, redirect to `/`. On failure: `recordFailure`, redirect to `/login?error=<generic>`. Reads `SHARED_USERNAME` / `SHARED_PASSWORD_HASH` / `SHARED_PASSWORD_PEPPER` / `SESSION_HMAC_KEY` from `astro:env/server`; KV via `import { env } from "cloudflare:workers"` (Astro v6 removed `locals.runtime.env`).

#### 3. Logout endpoint

**File**: `src/pages/api/auth/logout.ts` (new; replaces `signout.ts`)

**Intent**: Clear the session cookie and return to login.

**Contract**: `POST` handler deletes the session cookie (same name/path) and redirects to `/login`.

#### 4. Login page + form

**File**: `src/pages/login.astro` (new; replaces `auth/signin.astro`), `src/components/auth/LoginForm.tsx` (new; repurposes `SignInForm`)

**Intent**: Present a username+password form posting to `/api/auth/login`, reusing the existing `FormField` / `PasswordToggle` / `SubmitButton` / `ServerError` components; drop email-format validation.

**Contract**: `LoginForm` renders a `Username` text field (no email regex; required) + password field; `action="/api/auth/login"`; surfaces `?error` via `ServerError`. `login.astro` mirrors the existing signin page shell, links removed (no signup).

#### 5. Rewrite middleware as an allowlist gate

**File**: `src/middleware.ts`

**Intent**: Replace Supabase `getUser` with cookie verification and gate every non-public route.

**Contract**: Define a public allowlist — the login page (`/login`), the login POST (`/api/auth/login`), the logout POST (`/api/auth/logout`), and any asset prefixes middleware sees (`/_astro/`, `/favicon`, sitemap). Verify the session cookie via `verifySession`; set `context.locals.authenticated = boolean`. If not authenticated and the path is not in the allowlist → `redirect("/login")`. No Supabase import.

#### 6. Update Locals type

**File**: `src/env.d.ts`

**Intent**: Reflect the identity-free session.

**Contract**: Replace `user: User | null` with `authenticated: boolean`; remove the `@supabase/supabase-js` type import.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run astro check`
- Linting passes: `npm run lint`
- Build passes: `npm run build`
- Unit tests still pass: `npm run test`

#### Manual Verification:

- `GET /` and `GET /dashboard` while logged out → redirect to `/login`.
- Correct `admin` + password → lands on `/`, session cookie present (HttpOnly, Secure, SameSite=Lax, ~7-day Max-Age).
- Wrong password → generic error, no cookie; **three consecutive mistypes still allow a retry** (no lockout).
- Rapid repeated failures from one IP incur a visible growing delay (observe via response timing).
- Logout clears the cookie and returns to `/login`; gated routes redirect again.
- `wrangler tail` checked for the login request's CPU time vs the 10 ms free-tier budget (decide Workers Paid if exceeded).

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 3.

---

## Phase 3: Rip out Supabase Auth + UI cleanup

### Overview

Remove every dead Supabase Auth surface and fix the UI that referenced per-user identity or the old routes. End state: no Supabase Auth code, clean build, no dangling references.

### Changes Required:

#### 1. Delete dead auth surfaces

**File**: delete `src/pages/auth/signin.astro`, `src/pages/auth/signup.astro`, `src/pages/auth/confirm-email.astro`, `src/pages/api/auth/signin.ts`, `src/pages/api/auth/signup.ts`, `src/pages/api/auth/signout.ts`, `src/components/auth/SignUpForm.tsx`, `src/components/auth/SignInForm.tsx`, `src/lib/supabase.ts`

**Intent**: Remove the Supabase Auth flow now superseded by Phase 2. `SignInForm` is replaced by `LoginForm`; `supabase.ts` (the `@supabase/ssr` cookie-auth client) has no remaining consumer.

**Contract**: After deletion, no source file imports from `@/lib/supabase`, `@supabase/ssr`, or the deleted components/routes. Reusable `FormField`/`PasswordToggle`/`SubmitButton`/`ServerError` are kept.

#### 2. Fix identity/route references in the UI

**File**: `src/components/Topbar.astro`, `src/pages/dashboard.astro`, `src/components/Welcome.astro`

**Intent**: Stop rendering `user.email` and stop linking to removed routes.

**Contract**: `Topbar` reads `locals.authenticated`, drops the email span and the signup link, points logout at `/api/auth/logout`; the unauthenticated branch is effectively dead (only `/login` is public) so simplify accordingly. `dashboard.astro` drops the `user?.email` line. `Welcome.astro` removes the Sign In / Sign Up CTAs (and the "Supabase auth" feature-card copy).

#### 3. Retarget the config-status banner

**File**: `src/lib/config-status.ts` (and its consumer)

**Intent**: The banner currently warns when Supabase isn't configured for auth — now misleading. Retarget it to the auth secrets, or remove it if redundant.

**Contract**: Either check `SHARED_USERNAME` / `SHARED_PASSWORD_HASH` / `SHARED_PASSWORD_PEPPER` / `SESSION_HMAC_KEY` presence, or delete the module and its usage. No reference to Supabase-as-auth remains in user-facing copy.

#### 4. Drop the now-unused `@supabase/ssr` and `bcryptjs` dependencies

**File**: `package.json`

**Intent**: `@supabase/ssr` is auth-cookie specific and has no remaining use; `bcryptjs` was superseded by the peppered Web Crypto HMAC in `credentials.ts` (Phase 2) and is no longer imported anywhere. `@supabase/supabase-js` stays for S-01.

**Contract**: Remove `@supabase/ssr` and `bcryptjs` from dependencies; `@supabase/supabase-js` remains. Lockfile updated via `npm install`.

### Success Criteria:

#### Automated Verification:

- No dangling references: grep for `auth/signin`, `auth/signup`, `confirm-email`, `signInWithPassword`, `signUp`, `@supabase/ssr`, `bcrypt`, `locals.user` returns no source hits.
- Type checking passes: `npm run astro check`
- Linting passes: `npm run lint`
- Build passes: `npm run build`
- Unit tests pass: `npm run test`

#### Manual Verification:

- Logged-in navigation across `/`, `/dashboard` shows no broken links and no email placeholder.
- The login page renders its CSS/JS correctly (assets reachable pre-auth).
- No "Supabase not configured" banner appears for a correctly-provisioned deploy.

**Implementation Note**: After automated verification passes, pause for final manual confirmation.

---

## Testing Strategy

### Unit Tests (Vitest):

- `session`: sign→verify round-trip; tampered payload/signature rejected; expired `exp` rejected; near-boundary expiry.
- `credentials`: correct pair → true; wrong password → false; wrong username → false; wrong pepper → false; HMAC computed on username mismatch (timing path).
- `throttle`: `delayForFailures` schedule monotonic + bounded; 3 failures stays low; counter clears on success.

### Integration / Manual Tests:

1. Logged-out `GET /` and `GET /dashboard` → 302 `/login`.
2. Login with correct creds → `/`; inspect cookie flags + Max-Age.
3. Wrong password ×3 → still retryable; generic error each time.
4. Burst of failures from one IP → growing delay; success clears it.
5. Logout → cookie gone, routes gated again.
6. Login page assets load pre-auth.

## Performance Considerations

- **Password verify is a sub-ms native Web Crypto HMAC** (peppered HMAC-SHA256), so the login request stays well within the free-tier 10 ms CPU/request limit. bcrypt was rejected precisely because its cost-12 verify (~100ms+ CPU) would exceed that budget and get the request killed.
- Stateless cookie verification is a fast HMAC op; no per-request KV read on the hot path (throttle KV is touched only on the login endpoint).

## Migration Notes

- No data migration. Secrets already provisioned (prod + `.dev.vars`).
- `SESSION` KV binding must be added to `wrangler.jsonc` (Phase 2) — it exists in the account but is undeclared.
- Deploy is via Workers Builds on push to `master` (or `wrangler deploy`); the deploy-plan smoke probes referencing `/auth/signin` become `/login` — update opportunistically.

## References

- Roadmap item: `context/foundation/roadmap.md` (F-01)
- PRD: `context/foundation/prd.md` (FR-001, Access Control, NFRs)
- Deploy/secrets/KV: `context/deployment/deploy-plan.md`
- Project rules: `CLAUDE.md` (workerd, Supabase-over-HTTP, CPU budget)
- Current middleware: `src/middleware.ts:1`; Supabase client: `src/lib/supabase.ts:1`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Auth core library (pure + tested)

#### Automated

- [x] 1.1 Dependencies install cleanly: `npm install` — 080a720
- [x] 1.2 Unit tests pass: `npm run test` — 080a720
- [x] 1.3 Type checking passes: `npm run astro check` — 080a720
- [x] 1.4 Linting passes: `npm run lint` — 080a720

#### Manual

- [x] 1.5 Tests assert tamper-rejection and expiry-rejection (not just happy path) — 080a720

### Phase 2: Wire login/logout flow + allowlist gate

#### Automated

- [x] 2.1 Type checking passes: `npm run astro check` — e4a33ab
- [x] 2.2 Linting passes: `npm run lint` — e4a33ab
- [x] 2.3 Build passes: `npm run build` — e4a33ab
- [x] 2.4 Unit tests still pass: `npm run test` — e4a33ab

#### Manual

- [x] 2.5 Logged-out `/` and `/dashboard` redirect to `/login` — e4a33ab
- [x] 2.6 Correct creds → lands on `/`; cookie has HttpOnly/Secure/SameSite=Lax/~7d Max-Age — e4a33ab
- [x] 2.7 Wrong password ×3 still retryable (no lockout); generic error — e4a33ab
- [x] 2.8 Burst of IP failures incurs growing delay; success clears it — e4a33ab
- [x] 2.9 Logout clears cookie and re-gates routes — e4a33ab
- [x] 2.10 Login request CPU checked via `wrangler tail` vs 10 ms budget — e4a33ab

### Phase 3: Rip out Supabase Auth + UI cleanup

#### Automated

- [x] 3.1 No dangling references (grep: auth/signin, auth/signup, confirm-email, signInWithPassword, signUp, @supabase/ssr, bcrypt, locals.user) — 1c47074
- [x] 3.2 Type checking passes: `npm run astro check` — 1c47074
- [x] 3.3 Linting passes: `npm run lint` — 1c47074
- [x] 3.4 Build passes: `npm run build` — 1c47074
- [x] 3.5 Unit tests pass: `npm run test` — 1c47074

#### Manual

- [x] 3.6 Logged-in nav across `/` and `/dashboard` has no broken links / no email placeholder — 1c47074
- [x] 3.7 Login page CSS/JS load pre-auth — 1c47074
- [x] 3.8 No misleading "Supabase not configured" banner on a provisioned deploy — 1c47074
