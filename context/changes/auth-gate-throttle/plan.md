# Auth route-gate + credential-stuffing throttle — Test Rollout Phase 1 (Risk #2) Implementation Plan

## Overview

Stand up the **first wiring/integration test layer** for Risk #2 of `context/foundation/test-plan.md`: the deny-by-default route gate (an unauthenticated visitor must never reach a gated route) and the credential-stuffing throttle orchestration (a legitimate user is never hard-locked; failures still record and clear correctly). The bulk of the coverage is delivered as **plain-Node Vitest** tests behind a thin extraction seam; a timeboxed **workerd-harness spike** then proves the fail-closed and cookie-flag behaviors against the *real* login route and leaves behind a **reusable harness bootstrap** that sibling Phase-1 risks (#1 save→PDF, #6 `[id]` RLS-bypass) will import.

## Current State Analysis

- **The gate is deny-by-default, not an allowlist.** `src/middleware.ts:21-23` redirects *everything* to `/login` unless the path is in `PUBLIC_PATHS` (`/login`, `/api/auth/login`, `/api/auth/logout`) or matches a `PUBLIC_PREFIXES` entry (`/_astro/`, `/favicon`). The predicate is already a standalone function `isPublic(pathname)` (`middleware.ts:9-14`). The PRD mandates exactly this model — "every page except the login page requires an authenticated session" (`prd.md:45`) — so the oracle is *"any non-public path → 302 /login"*, never an enumerated protected list.
- **All 28 gated routes rely 100% on the middleware** (research §A): no handler reads `locals.authenticated`, calls `verifySession`, or returns 401/403. The gate is a single choke point.
- **The login route's throttle wiring is untested**, and the route hard-imports virtual modules that do **not** resolve under plain-Node Vitest: `import { env } from "cloudflare:workers"` (`login.ts:4`) and four secrets from `astro:env/server` (`login.ts:5`). The middleware likewise imports `astro:middleware` + `astro:env/server` (`middleware.ts:1-2`). Importing either module as-is into a Vitest file fails at module resolution.
- **The throttle helpers are already injectable.** `recordFailure(kv, ip)`, `clearFailures(kv, ip)`, `currentDelay(kv, ip)` all take a `KVLike` (`throttle.ts:12-54`); `throttle.test.ts` already drives them with a fake KV. The *gap* is the route's orchestration of these calls (which call fires on which branch), not the helpers themselves.
- **Existing unit coverage to NOT re-assert** (research §D): delay schedule + monotonicity + KV accumulate/clear (`throttle.test.ts`); credential accept/reject matrix (`credentials.test.ts`); session sign/verify/expiry/tamper (`session.test.ts`).
- **Vitest config is bare**: `vitest.config.ts` = `{ include: ["src/**/*.test.ts"], environment: "node" }`. No `@/` alias (S-06 lesson — import siblings relatively), no virtual-module stubs, no second project. `wrangler ^4.90.0` is installed; `@cloudflare/vitest-pool-workers` is **not**.
- **No prior automated route test exists** to extend — the original auth slice verified the gate/throttle manually via curl/browser (research §"Historical Context"). This layer is genuinely net-new and is the canonical reference test-plan §6.2 owes the rollout.

## Desired End State

`npm test` runs a green suite that, beyond the existing unit tests, proves:

- **G1** any non-public path (including an unknown/made-up one) → 302 `/login`; each public path + a `/_astro/` asset → pass-through.
- **G2** a failed login records a throttle failure; **G3** a successful login clears it; **G4** a `null` CF-Connecting-IP applies `MAX_DELAY_MS` against the `"untrusted"` bucket.
- **G6** wrong-username and wrong-password are observably identical (same generic error, same code path).
- **G8** logout deletes the session cookie.
- **G5** (workerd) malformed/non-form body and a KV outage produce a clean 302 to `/login` — never a 500, never an authenticated outcome; **G7** (workerd) the issued cookie carries `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age`.

A **reusable workerd harness helper** exists (the chosen runner's bootstrap), documented in `test-plan.md §6.2`, ready for risks #1/#6 to import. `test-plan.md` §3 Phase-1 status and §6.5 notes are updated.

**Verification**: `npm test` exits 0 with the new tests present; `npm run lint` and `npx astro check` exit 0; the workerd suite (Phase 3) runs green via its npm script; `test-plan.md` §6.2/§6.5/§3 reflect the shipped harness.

### Key Discoveries:

- The gate predicate is already extracted (`middleware.ts:9` `isPublic`) — G1 can test it **directly** with no virtual-module import and no runtime (research §E option (a)).
- The login route's `cloudflare:workers` + `astro:env/server` imports (`login.ts:4-5`) are the precise reason the *route* test needs workerd; the *wiring logic* must therefore be lifted into a seam that takes its dependencies as parameters (Phase 2).
- `throttle.ts` helpers already accept an injected `KVLike` (`throttle.ts:12`) — the seam reuses this, so Phase 2 needs no KV stubbing infrastructure beyond the fake already proven in `throttle.test.ts:4-19`.
- S-06 lesson (`lessons.md:33`): under Vitest, import siblings **relatively** — the new test files and any extracted module must obey this.
- Throttle is **best-effort by design** (research §C): tests assert *which calls fire* and *delay-applied-vs-not*, never a hard attempt cap; shared-IP (NAT) collateral throttling is an accepted MVP limitation — not a bug to test against.

## What We're NOT Doing

- **Not** re-asserting the delay schedule, monotonicity, HMAC compare, or session sign/verify — those are unit-covered (research §D). New tests that recompute the delay formula would be mirror/vibe tests.
- **Not** changing any production auth behavior. The only permitted production-code touch is a **behavior-preserving extraction** of the login route's throttle/credential orchestration into a testable seam (Phase 2); if extraction proves unnecessary (e.g. the seam can wrap the route without moving code), no production file changes at all.
- **Not** asserting a hard lockout / attempt ceiling, and **not** writing a test that treats NAT-shared-IP throttling as a defect (research §C).
- **Not** "fixing" the 302-to-HTML-for-API-callers behavior — it is faithful to current design; tests assert the observed 302 + `Location: /login` (research §3).
- **Not** implementing risk #1 (save→PDF) or risk #6 (`[id]` RLS-bypass) tests — only their **shared harness seam** is built here (auth-only boundary decision). Their oracle research is not yet done.
- **Not** authoring the CI YAML — Module 2 Lesson 5 owns the pipeline. `test-plan.md §5` already marks `vitest run` "required after Phase 1"; this plan only ensures the suite is CI-runnable via an npm script.
- **Not** adopting `@cloudflare/vitest-pool-workers` unconditionally — it is *spiked* in Phase 3 with a documented `unstable_startWorker` fallback.

## Implementation Approach

Two layers, cheapest-signal-first:

1. **Plain-Node logic layer (Phases 1–2)** — the gate predicate and the throttle/credential **orchestration**, tested with no runtime, no KV binding, no build. Highest signal per cost; catches the deny-by-default regression and the throttle-wiring regressions on every `npm test`. Achieved by testing already-standalone functions (`isPublic`) and by a small behavior-preserving extraction of the login route's decision logic into a seam that takes `(kv, clock, env-ish)` as inputs.

2. **Workerd route layer (Phase 3)** — the handful of behaviors that only manifest in the real runtime (the `catch` fail-closed path that depends on real `formData()`/KV throwing; the actual `Set-Cookie` attributes emitted by `context.cookies.set`). A timeboxed spike picks the runner: try `@cloudflare/vitest-pool-workers` (in-process workerd, ergonomic assertions) against the built `@astrojs/cloudflare` entry; if it won't wrap Astro SSR, fall back to the documented `unstable_startWorker` (built worker over HTTP). Either way the bootstrap is extracted into a **shared helper** for #1/#6.

Phase 4 records the recipe in the cookbook and advances rollout state.

## Critical Implementation Details

- **Virtual-module resolution is the whole reason for the split.** `login.ts:4-5` and `middleware.ts:1-2` import `cloudflare:workers` / `astro:env/server` / `astro:middleware`, none of which exist under `environment: "node"`. Phase 1 sidesteps this by importing only the pure `isPublic` predicate (no virtual imports in its transitive graph — verify before relying on it). Phase 2 sidesteps it by extracting the decision logic into a new module whose imports are all real (relative siblings + `throttle.ts`/`credentials.ts`/`session.ts`, which are themselves virtual-module-free). Phase 3 embraces workerd, where the virtual modules resolve.
- **Extraction must be behavior-preserving and minimal.** The seam in Phase 2 is a function the route delegates to — the route keeps reading `env`/secrets and passes them in. Do not relocate the `cloudflare:workers` import; pass `kv` (and the secret values) as arguments so the seam stays plain-Node-importable. Keep the route's outer `try/catch` semantics identical.
- **Clock injection for G4.** Asserting "delay applied" without a 5-second real sleep requires the seam to take an injectable sleep/clock (or to return a *decision* — "delay N ms" — that the route then applies), so the test asserts the decision, not a wall-clock wait. Prefer returning the decision over sleeping inside the seam.
- **S-06 relative-import rule** applies to every new/moved module and test (`lessons.md:33`).

## Phase 1: Gate predicate test (deny-by-default)

### Overview

Prove the deny-by-default gate (G1) and the logout teardown intent (G8, predicate-level) by testing the already-standalone `isPublic` predicate plus a focused redirect-decision assertion — no KV, no DB, no runtime.

### Changes Required:

#### 1. Middleware gate test

**File**: `src/middleware-gate.test.ts` (new; sibling of `src/middleware.ts`)

**Intent**: Assert the deny-by-default property and the explicit public set so the project's #1-leverage regression — a newly added route silently becoming public, or a public entry being mistyped — fails the suite. Test the gate **decision**, not the framework plumbing.

**Contract**: Imports the gate predicate from the production module. If `isPublic` (`middleware.ts:9`) is not exported, export it (named export, behavior-preserving) and import it **relatively** (`./middleware`) — but first confirm `./middleware`'s transitive imports (`astro:middleware`, `astro:env/server`) do not break Vitest collection; if they do, extract `isPublic` + the `PUBLIC_PATHS`/`PUBLIC_PREFIXES` constants into a new virtual-import-free module `src/lib/auth/public-paths.ts` and have `middleware.ts` import them back. Assertions:
- unknown/made-up path (e.g. `/totally-made-up`, `/api/secret`) → not public;
- one representative gated page (`/`) and one gated API route (`/api/reports/x`) → not public;
- each of `/login`, `/api/auth/login`, `/api/auth/logout` → public;
- a `/_astro/asset.js` and a `/favicon.svg` → public (prefix match);
- a near-miss (`/loginx`, `/api/auth/loginx`) → not public (guards against prefix/exact confusion).

No code snippet — this is a table of `expect(isPublic(p)).toBe(...)` cases (consider `it.each` to avoid redundant copies, per the vibe-test guidance).

### Success Criteria:

#### Automated Verification:

- [ ] Unit suite passes: `npm test`
- [ ] Lint passes: `npm run lint`
- [ ] Type-check passes: `npx astro check`
- [ ] The new test file is collected by Vitest (appears in `npm test` output) and asserts at least the unknown-path, public-set, and near-miss cases.

#### Manual Verification:

- [ ] Temporarily flipping a `PUBLIC_PATHS` entry (e.g. adding `/api/reports`) makes the test **fail** (confirms the test actually guards deny-by-default), then revert.

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 2. Phase blocks use plain bullets; the `## Progress` section owns the checkboxes.

---

## Phase 2: Throttle-wiring + no-enumeration test

### Overview

Prove the login route's throttle **orchestration** (G2 record-on-failure, G3 clear-on-success, G4 null-IP→max-delay) and the no-user-enumeration property (G6) by extracting the route's decision logic into a plain-Node-importable seam driven by an injected fake KV. Assert *which calls fire on which branch* and *the delay decision* — never the delay numbers (unit-covered).

### Changes Required:

#### 1. Extract the login decision seam

**File**: `src/lib/auth/login-flow.ts` (new) + edit `src/pages/api/auth/login.ts`

**Intent**: Lift the throttle+credential orchestration out of the route handler into a pure, dependency-injected function so it can be tested without the `cloudflare:workers`/`astro:env/server` virtual imports, while the route keeps owning the env/secret reads and the `Response`/cookie/redirect mechanics.

**Contract**: A new exported async function (e.g. `decideLogin`) that takes the inputs the route currently reads — `{ kv: KVLike, ip: string | null, username: string, password: string, creds: { expectedUsername, passwordHash, pepper } }` — and returns a discriminated decision the route applies, e.g. `{ kind: "delay", ms } | { kind: "reject" } | { kind: "accept" }` (or a shape that lets the route apply delay→verify→record/clear→redirect in the same order as today). It calls `currentDelay`/`recordFailure`/`clearFailures` (imported **relatively** from `./throttle`) and `verifyCredentials` (from `./credentials`) preserving the exact ordering: null-IP ⇒ `MAX_DELAY_MS` against the `"untrusted"` key; delay decided **before** credential check; `recordFailure` on reject; `clearFailures` on accept. `login.ts` imports `decideLogin` (`@/lib/auth/login-flow` is fine from a route — cross-module, not pulled by Vitest) and becomes a thin adapter: read `env.SESSION` + secrets, call `decideLogin`, then sleep/redirect/set-cookie exactly as before. The outer `try/catch` fail-closed semantics stay in the route, unchanged.

No snippet of the body — the contract above plus the existing `login.ts:20-64` flow is the spec. The ordering (delay-before-verify, record-on-reject, clear-on-accept) is the load-bearing invariant.

#### 2. Login-flow wiring test

**File**: `src/lib/auth/login-flow.test.ts` (new)

**Intent**: Assert the extracted seam's branch behavior against a fake KV + spies, covering G2/G3/G4/G6 with zero overlap with `throttle.test.ts`.

**Contract**: Reuses the fake-KV pattern from `throttle.test.ts:4-19` (or a spy `KVLike`). Cases:
- **G2**: wrong password → decision is `reject` AND `recordFailure` was called once with the IP key (spy assertion).
- **G3**: correct creds → decision is `accept` AND `clearFailures` was called once with the IP key; `recordFailure` not called.
- **G4**: `ip === null` → decision is `delay` with `ms === MAX_DELAY_MS` and the bucket used is `"untrusted"` (assert via the spy's recorded key); assert the seam never reads an IP from any client-supplied header (it receives `ip` as a param, so this is structural — note it in the test).
- **G6**: wrong-username-right-password and right-username-wrong-password both yield `reject` and are indistinguishable from the seam's output (same decision kind; the generic error string lives in the route constant `GENERIC_ERROR`, assert the route maps both to it — or assert at minimum the seam returns the same `reject` for both).
- Import `MAX_DELAY_MS` and helpers **relatively** (`./throttle`, `./login-flow`).

### Success Criteria:

#### Automated Verification:

- [ ] Unit suite passes: `npm test`
- [ ] Lint passes: `npm run lint`
- [ ] Type-check passes: `npx astro check`
- [ ] `npm run build` succeeds (confirms the route refactor still builds for `@astrojs/cloudflare`).
- [ ] The wiring test asserts `recordFailure`/`clearFailures` call presence via spies (not by re-reading the counter), and asserts `MAX_DELAY_MS` for null-IP without a real sleep.

#### Manual Verification:

- [ ] `npm run dev`, then exercise login manually: a correct login still redirects to `/`; a wrong password still redirects to `/login?error=…`; behavior is unchanged from before the extraction.
- [ ] Mutating the seam (e.g. swap `recordFailure`/`clearFailures`) makes the wiring test fail, then revert.

**Implementation Note**: Pause for manual confirmation before Phase 3.

---

## Phase 3: Workerd harness spike + route integration tests (fail-closed, cookie flags)

### Overview

Pick the workerd test runner via a timeboxed spike, then prove the two behaviors that only manifest in the real runtime — G5 (fail-closed `catch`) and G7 (real `Set-Cookie` attributes) — with integration tests against the **unmodified** built login route handler. These are single-route handler integration tests (the Phase-1 "integration (route handlers)" type), **not** e2e — no browser, no multi-route user journey (true e2e is rollout Phase 4's scope). Extract the runner bootstrap into a shared helper for risks #1/#6.

### Changes Required:

#### 1. Workerd runner spike (timeboxed)

**File**: `context/changes/auth-gate-throttle/spike-notes.md` (new; throwaway record) + a trial `vitest.workers.config.ts`

**Intent**: Determine, in a strict timebox (~half a session), whether `@cloudflare/vitest-pool-workers` can wrap the built `@astrojs/cloudflare` server entry (with `ASSETS`, the inlined 6.45 MiB FormePDF WASM, and `env.SESSION` KV). If it cleanly runs one trivial assertion against the worker, adopt it; otherwise fall back to `unstable_startWorker`.

**Contract**: Spike success = a single test that boots the built worker in the candidate runner and asserts a public route (`GET /login`) returns 200 and a gated route (`GET /`) returns 302 → `/login`. Record verdict (ADOPT pool / FALLBACK startWorker), the config that worked, and any gotchas (Vitest 3.2.x / Astro 6 adapter v13 compatibility — research flagged `withastro/astro#16029`, `workers-sdk#9521`). Add `@cloudflare/vitest-pool-workers` to devDependencies **only if** ADOPT (ask before installing per workflow rules).

#### 2. Route integration tests (real runtime)

**File**: `src/pages/api/auth/login.workers.test.ts` (new; naming/location per the chosen runner) + `vitest.workers.config.ts` (final) + a `test:workers` script in `package.json`

**Intent**: Assert G5 and G7 against the real login route handler in workerd (request in → response out), with a local KV binding seeded as needed.

**Contract**: Two behaviors:
- **G5 (fail-closed)**: POST `/api/auth/login` with a non-form/malformed body → response is a 302 with `Location` starting `/login` (the `?error=` generic message), status is **not** 5xx, and **no** valid `ml_session` `Set-Cookie` is issued (no authenticated outcome). Optionally simulate a KV-failure variant if the runner allows a throwing KV; if not, document that the malformed-body path is the representative fail-closed assertion.
- **G7 (cookie flags)**: POST `/api/auth/login` with valid seeded credentials → 302 to `/`, and the `Set-Cookie` for `ml_session` contains `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, and a `Max-Age` (≈ 7d). Assert `SameSite=Lax` explicitly (Strict would break the post-login redirect — research §B).
- Credentials: the worker reads `SHARED_USERNAME`/`SHARED_PASSWORD_HASH`/`SHARED_PASSWORD_PEPPER`/`SESSION_HMAC_KEY` from test-scoped vars (`.dev.vars`/pool `miniflare.bindings` or `unstable_startWorker` config). Mint the hash with the `hashPassword()` helper (CLAUDE.md) so the seeded secret matches.

#### 3. Shared harness helper

**File**: `src/test/workers-harness.ts` (new; or co-located per runner ergonomics)

**Intent**: Factor the worker-boot + binding-seed + `fetch` wrapper into one documented helper so risks #1/#6 reuse it instead of re-deriving the runner setup.

**Contract**: Exports a small API — start/boot returning a `fetch(path, init)` bound to the worker, plus a teardown — parameterized by the bindings/vars a test needs (KV namespace, `SUPABASE_URL` for #1/#6 later). For `unstable_startWorker`: wraps `{ config: "wrangler.jsonc" }` → `fetch`/`dispose`. For the pool: exports the config factory + any per-file storage-isolation note. Document the WASM/build cost so callers know to build first.

### Success Criteria:

#### Automated Verification:

- [ ] Workers suite runs green: `npm run test:workers` (boots the built worker, runs G5 + G7).
- [ ] `npm run build` succeeds before the workers suite (the suite depends on the built entry).
- [ ] G7 assertion checks all five cookie attributes including `SameSite=Lax`.
- [ ] G5 assertion confirms a malformed body yields a 302 to `/login` and **no** valid session cookie, status not 5xx.
- [ ] Lint + type-check pass on the new test/helper/config files: `npm run lint` && `npx astro check`.

#### Manual Verification:

- [ ] `spike-notes.md` records the runner verdict (ADOPT pool / FALLBACK startWorker) with the working config and the compatibility gotchas hit.
- [ ] The shared helper is importable and its docstring explains the build-first requirement; a dry run of "import helper → boot → one fetch" works from a scratch test.
- [ ] If `@cloudflare/vitest-pool-workers` was installed, confirm it was only after explicit approval.

**Implementation Note**: Pause for manual confirmation before Phase 4. If the spike hits the timebox without a clean pool result, take the `unstable_startWorker` fallback and proceed — do not extend the spike open-endedly.

---

## Phase 4: Cookbook + test-plan sync

### Overview

Record the canonical integration recipe in `test-plan.md §6.2` (the load-bearing gap that gate has flagged TBD), add a §6.5 per-phase note, and advance the Phase-1 rollout status. No production or test code changes.

### Changes Required:

#### 1. Fill the integration cookbook

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the §6.2 "TBD" with the real recipe so the next contributor (and risks #1/#6) can add an integration test without re-deriving the harness; record the two-layer split as the project pattern.

**Contract**: §6.2 gains: (a) the plain-Node seam pattern — extract decision logic into a virtual-import-free module, inject `KVLike`/clock, assert calls/decisions not unit-covered math; reference `src/middleware-gate.test.ts` and `src/lib/auth/login-flow.test.ts` as templates. (b) the workerd recipe — the chosen runner, the `npm run test:workers` script, `build`-first, the shared helper `src/test/workers-harness.ts`, and the seed-secrets-via-vars note. Append a §6.5 note capturing the spike verdict and any surprise. Update the §4 integration rows' "none yet — see §3 Phase 1" to name the adopted tooling. Do **not** edit §1–§3 strategy beyond the Phase-1 status line.

#### 2. Advance rollout + change status

**File**: `context/foundation/test-plan.md` (§3 row 1 Status) + `context/changes/auth-gate-throttle/change.md`

**Intent**: Move the Phase-1 row Status toward `complete` for the risk-#2 slice and mark the change implemented when the suite is green.

**Contract**: §3 Phase-1 Status advances per the fixed vocabulary (`implementing` → `complete` once §6.2/§6.5 are written and the suites are green); note in the row or §6.5 that #1/#6 still ride the same harness. Set `change.md` `status: implemented`, `updated: <today>`. (CI-gate YAML remains out of scope — §5 already marks `vitest run` required-after-Phase-1.)

### Success Criteria:

#### Automated Verification:

- [ ] Full suite still green: `npm test` and `npm run test:workers`.
- [ ] `test-plan.md §6.2` no longer contains "TBD — see §3 Phase 1" for the integration row.
- [ ] `test-plan.md §3` Phase-1 Status reflects the shipped state; §6.5 has a dated note.

#### Manual Verification:

- [ ] A reader can follow §6.2 to add a new integration test (plain-Node seam or workerd) without consulting this plan.
- [ ] `change.md` status is `implemented`.

**Implementation Note**: Final phase — after verification, the risk-#2 slice of Phase 1 is done; suggest opening #1 or #6 next, reusing `src/test/workers-harness.ts`.

---

## Testing Strategy

### Unit / logic tests (Phases 1–2, plain-Node Vitest):

- Gate predicate (G1): unknown path, gated samples, full public set, near-misses — via `isPublic`, `it.each` to avoid redundant copies.
- Throttle wiring (G2–G4): record-on-failure, clear-on-success, null-IP→`MAX_DELAY_MS`/`"untrusted"` — via injected fake KV + spies on the extracted seam; assert calls/decision, not delay numbers.
- No enumeration (G6): wrong-user vs wrong-pass yield identical reject.
- **Edge cases**: empty username/password (form defaults to `""` per `login.ts:27-28`) → reject path still records; near-miss public paths → gated.

### Integration tests — route handler in workerd (Phase 3):

- Fail-closed (G5): malformed body → 302 `/login`, no session cookie, not 5xx.
- Cookie flags (G7): valid login → `Set-Cookie` with HttpOnly+Secure+SameSite=Lax+Path=/+Max-Age.

### Manual Testing Steps:

1. Flip a `PUBLIC_PATHS` entry → Phase-1 test fails → revert (proves the guard).
2. After the Phase-2 extraction, exercise login in `npm run dev`: correct → `/`, wrong → `/login?error=…` (behavior unchanged).
3. Mutate a seam call (swap record/clear) → Phase-2 test fails → revert.

## Performance Considerations

The workers suite (Phase 3) requires an `astro build` and boots the worker with the inlined 6.45 MiB FormePDF WASM, so it is materially slower than the plain-Node suite — keep it a **separate `test:workers` script**, not part of the default `npm test` inner loop. The plain-Node layer (Phases 1–2) stays sub-second and is the fast feedback path.

## Migration Notes

The only production change is the behavior-preserving extraction of `login.ts`'s decision logic into `src/lib/auth/login-flow.ts` (Phase 2). Rollback = inline the seam back into the route; no data, schema, or config migration. If the extraction is judged riskier than its value during implementation, the fallback is to prove G2–G4 only in the Phase-3 workerd suite (the "Only in the workerd integration suite" option) — but that loses fast feedback, so attempt the extraction first.

## References

- Research: `context/changes/auth-gate-throttle/research.md` (oracle G1–G8, unit/integration seam §D, harness analysis §E)
- Test plan: `context/foundation/test-plan.md` §2 (Risk #2 + Risk Response Guidance), §3 Phase 1, §4 (harness open decision), §6.2 (canonical reference — filled by Phase 4)
- Live code: `src/middleware.ts:9-26` (gate + `isPublic`), `src/pages/api/auth/login.ts:20-64` (throttle wiring), `src/lib/auth/throttle.ts:12-54` (injectable helpers), `src/lib/auth/{credentials,session}.ts`
- Templates: `src/lib/auth/throttle.test.ts:4-19` (fake KV), existing `src/lib/**/*.test.ts` (collocated unit pattern)
- Lessons: `context/foundation/lessons.md` (vitest no `@/` alias — relative sibling imports; judge lint/build by exit code)
- Archive: `context/archive/2026-05-26-shared-credential-auth/` (design intent: deny-by-default fails closed, generic error, SameSite=Lax rationale, throttle best-effort)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Gate predicate test (deny-by-default)

#### Automated

- [x] 1.1 Unit suite passes: `npm test` — f135f68
- [x] 1.2 Lint passes: `npm run lint` — f135f68
- [x] 1.3 Type-check passes: `npx astro check` — f135f68
- [x] 1.4 New gate test collected by Vitest and asserts unknown-path, public-set, and near-miss cases — f135f68

#### Manual

- [x] 1.5 Flipping a `PUBLIC_PATHS` entry makes the test fail (guard confirmed), then revert — f135f68

### Phase 2: Throttle-wiring + no-enumeration test

#### Automated

- [x] 2.1 Unit suite passes: `npm test` — 2cc20ad
- [x] 2.2 Lint passes: `npm run lint` — 2cc20ad
- [x] 2.3 Type-check passes: `npx astro check` — 2cc20ad
- [x] 2.4 `npm run build` succeeds (route refactor still builds) — 2cc20ad
- [x] 2.5 Wiring test asserts record/clear via spies and null-IP `MAX_DELAY_MS` without a real sleep — 2cc20ad

#### Manual

- [x] 2.6 Manual login in dev unchanged (correct → `/`, wrong → `/login?error=…`) — 2cc20ad
- [x] 2.7 Mutating a seam call makes the wiring test fail, then revert — 2cc20ad

### Phase 3: Workerd harness spike + route integration tests (fail-closed, cookie flags)

#### Automated

- [x] 3.1 Workers suite runs green: `npm run test:workers` (G5 + G7)
- [x] 3.2 `npm run build` succeeds before the workers suite
- [x] 3.3 G7 checks all five cookie attributes including `SameSite=Lax`
- [x] 3.4 G5 confirms malformed body → 302 `/login`, no valid session cookie, not 5xx
- [x] 3.5 Lint + type-check pass on new test/helper/config files

#### Manual

- [x] 3.6 `spike-notes.md` records runner verdict + working config + gotchas
- [x] 3.7 Shared helper importable; build-first documented; scratch boot+fetch works
- [x] 3.8 `@cloudflare/vitest-pool-workers` installed only after explicit approval (if adopted) — N/A, not installed (no-install fallback)

### Phase 4: Cookbook + test-plan sync

#### Automated

- [ ] 4.1 Full suite still green: `npm test` and `npm run test:workers`
- [ ] 4.2 `test-plan.md §6.2` no longer says "TBD — see §3 Phase 1" for the integration row
- [ ] 4.3 `test-plan.md §3` Phase-1 Status updated; §6.5 has a dated note

#### Manual

- [ ] 4.4 A reader can follow §6.2 to add an integration test without this plan
- [ ] 4.5 `change.md` status is `implemented`
