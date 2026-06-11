---
date: 2026-06-02T17:19:52+0200
researcher: Rafal Puczel
git_commit: a90c529d52ff5b2b73cbfa73964b8156f1041995
branch: master
repository: 10xdev-project
topic: "Risk #2 oracle — auth route-gate + credential-stuffing throttle (test rollout Phase 1)"
tags: [research, codebase, auth, middleware, throttle, session, testing, phase-1]
status: complete
last_updated: 2026-06-02
last_updated_by: Rafal Puczel
---

# Research: Risk #2 — auth route-gate + credential-stuffing throttle

**Date**: 2026-06-02T17:19:52+0200
**Researcher**: Rafal Puczel
**Git Commit**: a90c529d52ff5b2b73cbfa73964b8156f1041995
**Branch**: master
**Repository**: 10xdev-project

## Research Question

Ground the test oracle for **Risk #2** in `context/foundation/test-plan.md` §2:

> An unauthenticated visitor reaches a protected route, OR a legitimate user is
> locked out by the credential-stuffing throttle — the all-route gate or the
> throttle's no-lockout balance breaks.

What *should* the code do (from PRD + design intent, not from the implementation
shape), where does the existing unit suite already prove it, and what is the
honest integration gap — including the Phase-1 harness decision shared with
risks #1 and #6.

## Summary

1. **The gate is deny-by-default, not a protected-route allowlist.** `src/middleware.ts`
   redirects *everything* to `/login` except a tiny public set (`PUBLIC_PATHS` +
   `PUBLIC_PREFIXES`). The PRD mandates exactly this model
   ("every page except the login page requires an authenticated session",
   `prd.md:45`); the plan recorded it as a deliberate fail-closed allowlist
   (`2026-05-26-shared-credential-auth/plan.md:46`). **The test-plan risk row's
   word "protected route" is the author's framing, not a `PROTECTED_ROUTES` list
   that exists in code.** → The gate oracle is *"any non-public path (including a
   made-up one) → 302 /login; each public path → pass-through"*. Asserting against a
   fixed protected list would be a mirror test of an implementation that doesn't
   exist and would miss the real regression: a newly added route silently becoming
   public, or a public entry being mistyped.

2. **All 28 gated routes rely 100% on the middleware** — zero in-handler auth
   checks, no route returns 401/403 for an unauthenticated caller. The gate is a
   single choke point; if it regresses, every handler runs unauthenticated.

3. **Unauthenticated API calls get a 302 to an HTML page, not a 401.** The middleware
   returns `context.redirect("/login")` uniformly. This is faithful to the current
   design (the PRD never requires a 401 JSON for API routes), but the gate test
   should assert the **observed** behavior (302 + `Location: /login`) rather than a
   401 — and the doc flags the 302-to-HTML-for-`fetch` quirk as a known property,
   not a bug to "fix" in a test.

4. **The throttle's no-lockout oracle holds:** `FREE_THRESHOLD = 5` means the first
   5 failures cost 0 ms, so "3× mistype still lets attempt 4 through" is satisfied
   with margin. Above 5, delay grows `250·2^(over−1)` capped at 5000 ms; success
   clears the counter.

5. **The unit suite already proves the *math and the KV lifecycle in isolation*;
   the gap is the *route wiring*.** Integration must prove: `recordFailure` is
   actually called on a failed login, `clearFailures` on success, the
   `null`-IP → `MAX_DELAY_MS` branch, the fail-closed `catch` (malformed body / KV
   outage → clean 302, never 500, never authenticated), and the cookie flags on a
   real issued cookie. It must **not** re-assert the delay schedule or HMAC compare.

6. **Harness: a split is the honest answer, not one runner.** The middleware gate
   and the throttle/credential *logic* are cheapest as **plain-Node Vitest** (call
   `onRequest` directly; inject a fake KV — the helpers already take one). The
   *unmodified* `login.ts` route hard-imports `cloudflare:workers` (`env.SESSION`
   KV), which only resolves inside **workerd** — so the end-to-end route test (and
   all of risk #1/#6's real-Supabase tests) belong on **`unstable_startWorker`**
   (the documented successor to the deprecated `unstable_dev`), built worker over
   HTTP. `@cloudflare/vitest-pool-workers` could later collapse those into in-process
   workerd tests, but its support for an Astro SSR app is **undocumented — spike
   before adopting**.

## Detailed Findings

### A. The route gate (deny-by-default)

**Middleware logic** ([src/middleware.ts:6-26](src/middleware.ts)):

- `PUBLIC_PATHS` (exact match): `/login`, `/api/auth/login`, `/api/auth/logout` (`:6`).
- `PUBLIC_PREFIXES` (startsWith): `/_astro/`, `/favicon` (`:7`).
- `onRequest` reads `COOKIE_NAME` from `context.cookies`, verifies it with
  `verifySession(SESSION_HMAC_KEY, cookie)`, sets `context.locals.authenticated`
  (`:17-19`), and if `!authenticated && !isPublic(pathname)` → `return context.redirect("/login")` (`:21-23`).

**Output mode**: `astro.config.mjs:11` `output: "server"`; **no `export const prerender`** in any page → every route is server-rendered and passes through middleware (no static bypass).

**Route census** — 11 page routes + 19 API routes; only the 3 auth paths above are public. Representative gated routes (full table in the route-map agent output):

- Pages: `/`, `/dashboard`, `/projects`, `/projects/[slug]`, `/projects/[slug]/reports/[id]`, `/pm-contacts`, `/plugins-catalog`, `/brand-settings`, `/email-templates` — all GATED.
- API (all GATED, all `export const POST` unless noted):
  `/api/projects` + `/[id]` + `/[id]/delete`; `/api/pm-contacts` + `/[id]` + `/[id]/delete`;
  `/api/plugins-catalog` + `/[id]` + `/[id]/delete`; `/api/project-recurring-plugins` + `/[id]/delete`;
  `/api/reports` + `/[id]` + `/[id]/delete`; `/api/reports/[id]/pdf` (`export const GET`);
  `/api/reports/[id]/send`; `/api/brand-settings`; `/api/email-templates`.

**No handler does its own auth check.** Grep across every API handler found no
`locals.authenticated`, no `verifySession`, no `COOKIE_NAME` read, no 401/403 return.
The gate is entirely the middleware's job.

**Known fail-closed corner (from archive, still true):** `plan.md` named "sitemap"
as public but `/sitemap-*.xml` is **not** in `PUBLIC_PATHS`
(`2026-05-26-shared-credential-auth/reviews/impl-review.md:76`) — benign because no
sitemap is emitted (no `site` config). The gate test must **not** assume sitemap is
public.

### B. The credential / session primitives (oracle from PRD + design)

- **Generic error / no enumeration**: `GENERIC_ERROR = "Invalid username or password"`
  ([login.ts:10](src/pages/api/auth/login.ts)); wrong username and wrong password take
  the identical redirect. `verifyCredentials` computes the password HMAC **regardless**
  of username match and uses constant-time compares on both fields
  ([credentials.ts:50-61](src/lib/auth/credentials.ts)). Design intent verbatim:
  "always compute the password HMAC even when the username doesn't match … always
  return the same generic error" (`plan.md:51`).
- **Session cookie flags**: `httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 7d`
  ([session.ts:12-20](src/lib/auth/session.ts)). `SameSite=Lax` is **load-bearing and
  intentional** — Strict would drop the cookie on the post-login 302 redirect
  (`plan.md:33`). Oracle: an issued cookie must carry exactly these five attributes;
  SameSite must be Lax.
- **Password hashing is peppered HMAC, not bcrypt** (CLAUDE.md; `credentials.ts:1-7`).
  Out of scope to re-test here — it's unit-covered (§D).

### C. The throttle (no-lockout vs resist-at-scale)

**Config** ([throttle.ts:18-21,33](src/lib/auth/throttle.ts)): `FREE_THRESHOLD = 5`,
`BASE_DELAY_MS = 250`, `MAX_DELAY_MS = 5000`, `FAILURE_TTL_SECONDS = 900`,
key `login_fail:${ip}`.

**Delay schedule** (`delayForFailures`, `:25-31`):

| failures | 0–5 | 6 | 7 | 8 | 9 | 10 | 11+ |
|----------|-----|-----|-----|------|------|------|------|
| delay ms | 0 | 250 | 500 | 1000 | 2000 | 4000 | 5000 |

→ "3 honest mistypes → attempt 4 passes free" holds with 2 extra free attempts of margin.

**Login route control flow** ([login.ts:20-64](src/pages/api/auth/login.ts)):

- IP from `CF-Connecting-IP` only (`:12-14`); `throttleKey = ip ?? "untrusted"` (`:22`).
- **Delay computed BEFORE credential check** (`:33-36`): `ip === null` → unconditional
  `MAX_DELAY_MS`; else `currentDelay(kv, key)`. Ordering matters for the oracle.
- Failure → `recordFailure(kv, key)` then redirect to `/login?error=…` (`:46-49`).
- Success → `clearFailures(kv, key)`, sign + set cookie, redirect `/` (`:51-54`).
- **Fail-closed `catch`** (`:55-63`): malformed body / KV outage / signing error →
  best-effort `recordFailure` (nested try/catch so throttle bookkeeping can't crash the
  request) → redirect `/login?error=…`. Never 500, never authenticated.

**Documented best-effort caveats** (header comment `throttle.ts:1-10`): KV is
eventually consistent (concurrent failures under-count and can slip the threshold); a
KV **read** error reads as 0 (fail-open at the helper). Note the asymmetry: the helper
fails *open* on a read error, but the route's outer `catch` fails *closed* (records a
failure) for errors that escape the helpers. → A test must **not** assert a hard attempt
ceiling; the contract is *delay growth* + *clear-on-success*, explicitly "a speed bump,
not a hard rate limit." Shared-IP (NAT) collateral throttling is an **accepted MVP
limitation** (`plan-brief.md` Open Risks) — don't write a test that treats it as a bug.

### D. Unit-covered vs integration gap (the seam)

**Already proven by unit tests — do NOT re-assert:**

- `throttle.test.ts`: delay schedule for 0–5/6/7/100, monotonicity, and KV
  accumulate-then-clear with a fake KV ([throttle.test.ts:21-56](src/lib/auth/throttle.test.ts)).
- `credentials.test.ts`: correct pair → true; wrong password / wrong username / both
  wrong / wrong pepper → false ([credentials.test.ts:14-35](src/lib/auth/credentials.test.ts)).
- `session.test.ts`: round-trip, tampered sig, tampered payload, expired, just-before-expiry
  boundary, malformed, wrong-key ([session.test.ts:6-49](src/lib/auth/session.test.ts)).

**NOT covered — the integration oracle (what new tests must add):**

| # | Behavior to prove | Where it lives | Why it matters |
|---|-------------------|----------------|----------------|
| G1 | Any non-public path → 302 `/login`; each public path → pass-through; a *new/unknown* path is gated | `middleware.ts:21-23` | the deny-by-default regression (route silently public) |
| G2 | `recordFailure` is actually invoked on a failed login (with the right key) | `login.ts:47` | if not called, stuffing is undefended |
| G3 | `clearFailures` invoked on success | `login.ts:51` | a throttled legit user can recover |
| G4 | `null` CF-Connecting-IP → `MAX_DELAY_MS`, bucket `"untrusted"`, never a client header | `login.ts:33,22` | spoof-resistance (impl-review F2, FIXED) |
| G5 | Fail-closed `catch`: malformed/non-form body and KV outage → clean 302 to `/login`, never 500, never authenticated | `login.ts:55-63` | impl-review F1 (FIXED); a 500 or an auth bypass here is the worst case |
| G6 | Wrong username and wrong password are observably identical (same code, same error) | `login.ts:46-48` + `credentials.ts:50-61` | no user enumeration |
| G7 | Issued cookie carries HttpOnly+Secure+SameSite=Lax+Path=/+Max-Age | `session.ts:12-20` set at `login.ts:53` | Lax is required for the post-login redirect |
| G8 | Logout deletes the cookie and re-gates | `logout.ts:4-7` | session teardown |

G1 and G6 are pure-logic (no KV/DB). G2–G5, G7, G8 exercise the route wiring; G2–G4 can
be proven at the logic layer with an injected fake KV, but G5/G7 against the *unmodified*
route need workerd (§E).

### E. Harness decision (shared with risks #1 and #6)

The three Phase-1 risks impose three different runtime needs:

| Test | Needs | Best harness |
|------|-------|--------------|
| (a) middleware gate G1/G8 | cookie + redirect only — **no KV, no DB** | **plain-Node Vitest**: import `onRequest`, call with a hand-built `context` (fake `cookies.get`, `url.pathname`, spy `redirect`/`next`). Cheapest, real signal, no build. |
| (b) throttle/credential logic G2–G4, G6 | injected KV | **plain-Node Vitest** with a **fake KV** — the helpers already take `kv` (`recordFailure(kv, …)`). Optionally a real local KV via `getPlatformProxy()`. |
| (b′) unmodified `login.ts` route end-to-end G5/G7 | real `cloudflare:workers` `env.SESSION` KV + secrets | **`unstable_startWorker`** (built worker over HTTP) — the bare `cloudflare:workers` import only resolves in **workerd**. |
| (c) save→PDF & `[id]` scope / RLS-bypass (risks #1/#6) | real local Supabase + `sb_secret_` service key + WASM | **`unstable_startWorker`** with `SUPABASE_URL` → `npx supabase start` (migrations via `migration up --local`, never `db reset`). |

**Why a split, not one harness:** (a)/(b) need *no* bindings and are cheapest in-process;
(b′)/(c) hard-depend on `cloudflare:workers` + KV + real Supabase, which only resolve inside
workerd. There is no in-process harness that cleanly covers all three today.

- **Astro Container API** is the **wrong tool** for the gate: it is experimental,
  scoped to `.astro` component isolation, takes `locals` as a caller-supplied input
  (the tell that it bypasses the middleware chain), and provides no Cloudflare bindings.
  *(Inference — no doc explicitly says "middleware does not run"; verify with a throwaway
  spike if anyone proposes building G1 on the Container API. The cheaper direct-`onRequest`
  call sidesteps the question entirely.)*
- **`@cloudflare/vitest-pool-workers`** would be ideal (in-process workerd + ergonomic
  assertions) and could collapse (b′)+(c), **but its support for an Astro SSR app is
  undocumented — do not adopt for Phase 1 without a spike.**

## Code References

- `src/middleware.ts:6-26` — deny-by-default gate; `PUBLIC_PATHS`/`PUBLIC_PREFIXES`; redirect-all-else.
- `src/pages/api/auth/login.ts:20-64` — throttle wiring, null-IP branch, fail-closed catch, generic error.
- `src/pages/api/auth/logout.ts:4-7` — cookie delete + redirect.
- `src/lib/auth/throttle.ts:18-54` — config, delay schedule, KV read-modify-write, best-effort caveats.
- `src/lib/auth/credentials.ts:50-61` — constant-time compares; HMAC computed regardless of username.
- `src/lib/auth/session.ts:12-78` — cookie flags; sign/verify; expiry.
- `src/lib/auth/{throttle,credentials,session}.test.ts` — the existing unit coverage (the seam).
- `astro.config.mjs:11` — `output: "server"`; `wrangler.jsonc:4` — `main: @astrojs/cloudflare/entrypoints/server`.
- `src/lib/supabase.ts:7-12` — per-request client, `sb_secret_` service key, "bypasses RLS".

## Architecture Insights

- **Single choke-point auth.** One middleware gates the whole app; handlers carry no
  auth logic. High leverage for one focused gate test (G1), high blast radius if it
  regresses → the regression to lock is "a new route becomes reachable unauthenticated."
- **Soft throttle by design.** No hard lockout anywhere; the NFR's no-3×-lockout clause
  is met by `FREE_THRESHOLD = 5` and clear-on-success. Tests assert *behavior shape*
  (growing bounded delay, counter clears), never an enforced attempt cap.
- **Two env mechanisms in one route** (`cloudflare:workers` for KV bindings,
  `astro:env/server` for secrets) — any route-level harness must satisfy both, which is
  exactly why the unmodified-route test lands on workerd.
- **The deny-by-default vs allowlist distinction is the crux of this risk.** The most
  valuable single assertion in the whole phase is G1 against an *unknown* path.

## Historical Context (from prior changes)

- `context/archive/2026-05-26-shared-credential-auth/plan.md:46` — allowlist gate "fails
  closed: anything not explicitly public redirects to login"; Phase 1 was scoped to
  unit-tested pure functions only.
- `.../plan.md:51,33` — generic-error/no-enumeration rationale; SameSite=Lax required for
  the post-login redirect.
- `.../reviews/impl-review.md` — F1 (login now wrapped fail-closed, FIXED), F2 (null-IP no
  longer shares a `local` bucket / never trust a client header, FIXED), F3 (throttle is
  best-effort under KV eventual consistency, ACCEPTED), `:76` (sitemap not actually public).
- `.../plan.md:254-321` — all route/gate/throttle-timing checks were done as **manual**
  curl/browser verification; **no prior automated route test exists** to extend. This
  research's integration tests are genuinely net-new.

## Related Research

- `context/foundation/test-plan.md` §2 (risk #2 row + Risk Response Guidance), §3 (Phase 1
  bundles #1/#2/#6), §4 (harness is Phase 1's open decision), §6.2 (canonical integration
  reference test is TBD — this phase writes it).
- Sibling Phase-1 risks #1 (save→PDF) and #6 (`[id]` RLS-bypass) will reuse the
  `unstable_startWorker` + local-Supabase harness recommended in §E.

## Open Questions

1. **Harness commitment for the binding-dependent tests**: `unstable_startWorker`
   (documented, HTTP, needs a build) vs a `@cloudflare/vitest-pool-workers` **spike**
   (in-process workerd, ergonomic, but Astro-SSR support unproven). Recommend a
   timeboxed spike of the pool against the built `@astrojs/cloudflare` entry before
   `/10x-plan` locks the choice; fall back to `unstable_startWorker` if it doesn't wrap
   cleanly. *(This decision is owned jointly by all of Phase 1, not risk #2 alone.)*
2. **G1 layer**: direct `onRequest` call (recommended, cheapest) vs a built-worker HTTP
   probe of a sample of real + unknown paths. The direct call proves the logic; one
   HTTP smoke of "unknown path → /login" in the workerd suite would additionally prove
   the middleware is actually wired into the deployed entry. Plan decides whether both
   are worth it under cost × signal.
3. **Should the gate test pin the full route census** (assert each known gated path
   redirects) **or just the deny-by-default property** (one unknown path + each public
   path)? The property test catches the real regression more cheaply; a full census is
   more redundant copies. Lean property + the explicit public set. (Plan decision.)
4. **CI vs local for the workerd/Supabase suite** — `test-plan.md:106` leaves open
   whether CI wires a Supabase service container or the real-DB suite stays local-only.
   Out of scope for risk #2's logic tests; relevant when the shared harness lands.
