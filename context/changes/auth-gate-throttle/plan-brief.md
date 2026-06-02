# Auth route-gate + credential-stuffing throttle — Plan Brief

> Full plan: `context/changes/auth-gate-throttle/plan.md`
> Research: `context/changes/auth-gate-throttle/research.md`

## What & Why

Risk #2 of the test rollout (`context/foundation/test-plan.md`): an unauthenticated
visitor must never reach a gated route, and a legitimate user must never be hard-locked
by the credential-stuffing throttle. This phase stands up the **first wiring/integration
test layer** on the highest-churn, zero-test surface (the request path) and writes the
canonical reference test the rest of Phase 1 (#1, #6) will reuse.

## Starting Point

The gate is **deny-by-default** (`src/middleware.ts` redirects everything except a 3-path
public allowlist); all 28 gated routes rely 100% on it. The throttle helpers are already
unit-tested in isolation, but the login route's *orchestration* of them — and the gate's
deny-by-default property — have **no automated test** (the original auth slice verified
them by hand). The login route hard-imports `cloudflare:workers` + `astro:env/server`,
which don't resolve under plain-Node Vitest — that constraint shapes the whole approach.

## Desired End State

`npm test` proves the deny-by-default gate (unknown path → 302 /login), the throttle
wiring (record-on-failure, clear-on-success, null-IP→max-delay), and no-user-enumeration —
all in fast plain-Node tests. A separate `npm run test:workers` suite proves the
fail-closed `catch` and the real cookie flags against the live route in workerd, and leaves
behind a reusable harness helper for risks #1/#6. `test-plan.md §6.2` carries the recipe.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Gate oracle | Deny-by-default, not a `PROTECTED_ROUTES` list | The middleware + PRD mandate "everything gated except a public set"; a fixed list would mirror a non-existent impl. | Research |
| Gate test shape | Property (unknown path) + explicit public set | Catches the real regression (new route silently public) with minimal redundant tests. | Plan |
| Throttle tests | Extract decision into a seam; assert calls/decision via fake KV | Proves the untested wiring with zero overlap with `throttle.test.ts`'s delay math. | Plan |
| Workerd runner | Spike `vitest-pool-workers`, fall back to `unstable_startWorker` | Try the ergonomic in-process option without betting the phase on its unproven Astro-SSR support. | Research + Plan |
| Boundary vs #1/#6 | Auth-only tests, but a **shared** harness helper | Keeps scope focused while paying the harness cost once (test-plan §6.2). | Plan |
| Layer split | Plain-Node logic first; workerd only for runtime-only behaviors | `cloudflare:workers` import forces the split; cheapest-signal-first. | Research |

## Scope

**In scope:**
- Plain-Node tests: gate predicate (G1, G8), throttle wiring (G2–G4), no-enumeration (G6).
- A behavior-preserving extraction of the login route's decision logic into a testable seam.
- Workerd route-handler integration tests: fail-closed `catch` (G5), cookie flags (G7).
- A reusable workerd harness helper + `test-plan.md §6.2/§6.5/§3` updates.

**Out of scope:**
- Re-asserting delay math / HMAC / session sign-verify (unit-covered).
- Any production auth behavior change beyond the extraction.
- Risk #1 (save→PDF) and #6 (`[id]` RLS-bypass) tests — only their shared harness seam.
- CI YAML authoring (Module 2 Lesson 5); a hard attempt-cap or NAT-collateral test.

## Architecture / Approach

Two layers, cheapest-signal-first. **Layer 1 (plain-Node, Phases 1–2):** test the
already-standalone `isPublic` predicate directly, and extract the login route's
throttle+credential orchestration into `src/lib/auth/login-flow.ts` (a virtual-import-free
function taking injected `KVLike` + secrets) so it runs with no runtime; the route becomes a
thin adapter. **Layer 2 (workerd, Phase 3):** a timeboxed spike picks the runner, then G5/G7
run against the *unmodified* built route; the runner bootstrap is factored into
`src/test/workers-harness.ts` for #1/#6. Phase 4 documents the recipe and advances rollout state.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Gate predicate test | G1 deny-by-default + public set; G8 | `isPublic`'s module pulls virtual imports under Vitest → may need a tiny constants extraction |
| 2. Throttle-wiring test | G2–G4 + G6 via injected fake KV + seam | Extraction must stay behavior-preserving; clock/delay returned as a decision, not slept |
| 3. Workerd spike + route integration | G5 fail-closed, G7 cookie flags; shared harness | Pool may not wrap Astro SSR → fall back to `unstable_startWorker`; build+WASM cost |
| 4. Cookbook + sync | `test-plan.md §6.2/§6.5/§3` + change status | Docs only; ensure suite is CI-runnable via npm script |

**Prerequisites:** `wrangler ^4.90.0` is present (✓). Phase 3 needs a build; installing
`@cloudflare/vitest-pool-workers` (only if the spike adopts it) requires approval.
**Estimated effort:** ~3–4 sessions across 4 phases (Phases 1–2 small; Phase 3 carries the spike risk).

## Open Risks & Assumptions

- `isPublic` may not be importable without dragging `astro:env/server` into Vitest — mitigated by extracting `PUBLIC_PATHS`/predicate into a virtual-import-free module if needed.
- The pool runner's Astro-SSR support is unproven (research flagged `astro#16029`, `workers-sdk#9521`) — the documented `unstable_startWorker` fallback is the safety net; the spike is timeboxed.
- A throwing-KV simulation for G5 may not be available in the chosen runner — the malformed-body path is the representative fail-closed assertion if so.

## Success Criteria (Summary)

- An unknown/new route is provably gated; flipping a public-path entry fails the suite.
- A failed login records a throttle failure and a successful one clears it; null-IP gets max delay — all without re-testing the delay numbers.
- The real login route, in workerd, fails closed on a bad body (302, no session, not 5xx) and issues a `SameSite=Lax; HttpOnly; Secure` cookie — and #1/#6 can reuse the harness.
