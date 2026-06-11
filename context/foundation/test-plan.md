# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-06-11

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the team
   is worried about X, and the failure would surface somewhere in `<area>`"
   carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents *what
   could fail* and *why we believe it's likely* — drawn from documents,
   interview, and codebase *signal* (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src/pages/`, `src/lib/`, `src/components/`.

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the *evidence that surfaced
this risk* — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|--------------------------|--------|------------|---------------------------------|
| 1 | A report Save succeeds in the UI but the data is partially lost, or the regenerated PDF silently goes stale/missing — the user trusts a save that didn't fully persist, and the next cycle seeds from corrupt data. | High | High | interview Q1 (ranked #1 worry), Q4 (save→PDF chain singled out); PRD FR-017 (PDF-on-every-save coupling); hot-spot dir `src/pages/api` (50 commits/30d, 0 tests) |
| 2 | An unauthenticated visitor reaches a protected route, OR a legitimate user is locked out by the credential-stuffing throttle — the all-route gate or the throttle's no-lockout balance breaks. | High | Medium | interview Q1 (#2 worry), Q3 (auth flagged low-confidence); PRD Access Control ("no route except login reachable"), NFR (resist stuffing at scale yet no 3× lockout); hot-spot dir `src/lib/auth` (9 commits/30d) |
| 3 | A Send dispatches the wrong/stale PDF, sends to the wrong recipient, or a failed send still writes a "sent" record (or a double-click double-sends) — the agency emails a client a broken artifact, or the re-send guard is defeated. | High | Medium | interview Q1 (#3 worry); PRD FR-019/020/021 (re-send confirm + send history); archive `context/archive/2026-05-30-report-email-send/` (lesson: record only after confirmed dispatch; base64 encoding); hot-spot dir `src/components/reports` (23 commits/30d, 0 tests) |
| 4 | The client-facing PDF or email surfaces project internal notes or the internal contact email — the PRD's load-bearing no-leak guardrail fails. | High | Low | interview Q1 (ranked lowest of four by user); PRD Guardrails + NFR (no internal-notes/contact leak unless transcribed); roadmap S-13 (email-template token whitelist constraint); archive `context/archive/2026-05-30-branded-pdf-on-save/`, `context/changes/email-templates/` |
| 5 | The WP-CLI bulk-paste parser drops or mangles rows on a real-world paste, and the single-row fallback fails to fire, so the dev's pasted update table silently loses plugins. | Medium | Medium | PRD FR-015 (parser fragile by design; single-row fallback is the safety net); hot-spot dir `src/lib` (87 commits/30d); archive `context/archive/2026-05-30-wp-cli-bulk-paste/` |
| 6 | A logged-in user manipulates an `[id]` path param to read or mutate a resource the route should reject — the service key bypasses RLS, so a missing or incorrect ownership/existence check in the handler is the only gap. | Medium | Medium | abuse lens (mandatory — auth + user input present); `CLAUDE.md` / tech-stack.md (Worker uses `sb_secret_` service key, which bypasses RLS); `AGENTS.md` line 11 assumes RLS protects tables — a contradiction to verify; hot-spot dir `src/pages/api` (20 `[id]` routes, 0 tests) |

**Impact × Likelihood rubric.** Score both axes on a coarse High / Medium /
Low scale so two readers agree on the same row.

| Rating | Impact | Likelihood |
|--------|--------|------------|
| High   | user loses access, data, or money; failure is publicly visible | area changes weekly, or we have already been burned here |
| Medium | feature degrades, a workaround exists, only some users affected | touched occasionally, has been a source of bugs |
| Low    | cosmetic, easily reverted, no data effect | stable code, rarely touched |

Order rows by impact × likelihood. Protect High × High first. R4 is
High-impact × Low-likelihood by *user weighting* (the no-leak guardrail
already shipped and the user ranks it their lowest worry of four) — it is
kept as a cheap unit-level check, not promoted up the rollout, honest to
the interview rather than to the PRD's emphasis.

**Abuse / security lens applied.** Authorization/access → R6 (the real
surface here: `[id]` handling with a service key that bypasses RLS — not
classic per-user IDOR, since there is no per-user identity under a single
shared login). Untrusted input → R5 (parser) and R1 (save validation
parity). Secret/PII leakage → R4. Resource abuse → R2 (the throttle). All
four classes are covered.

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|------|-----------------------------|----------------|--------------------------------------|-----------------------|-----------------------|
| #1 | A save persists every section row, and on a render failure the user is NOT told "saved" with a stale PDF link — the failure is surfaced and no half-state is left behind. | "Save returned 200 ⇒ both the DB write AND the PDF regeneration succeeded." | The save→pdf ordering in the report route: is render in the same handler as the write? what response on render-throw? where does the download link point after a partial failure? is the row count after save asserted against a real DB? | integration (route handler against a real local Supabase with a real-shaped payload; stub only the FormePDF render edge, not the DB) | asserting the happy 200 only; mocking the PDF renderer so the coupling under test never actually runs; stubbing the DB so a partial-write half-state can't be observed |
| #2 | Every protected route redirects/401s an unauthenticated request; the throttle blocks the Nth rapid attempt but a 3× mistype by one IP still lets attempt 4 through. | "credentials/session unit tests pass ⇒ the gate is enforced on routes." (unit ≠ wiring) | the `PROTECTED_ROUTES` list vs the actual route tree (is any route missing?); throttle KV key/window/threshold; what middleware returns for API vs page routes | integration over middleware + a route sample (unit already covers the HMAC/throttle math) | re-testing the HMAC compare (already unit-covered); asserting throttle internals instead of the lockout-vs-block behavior |
| #3 | A send writes a send record ONLY after a confirmed dispatch; the attached PDF is the current render; re-send requires the confirm flag server-side; the recipient is the intended PM/client address. | "Final status 200 ⇒ the right PDF reached the right address and the record is trustworthy." | send handler's dispatch→record ordering; how the attachment bytes are produced (base64 encoding per the S-09 lesson); how re-send confirm is enforced server-side, not just in the UI | integration (send handler; stub the Resend boundary; assert record-write happens-after dispatch-success) | testing Resend itself; asserting a record exists without asserting it is gated on dispatch success; a UI-only confirm test |
| #4 | The client PDF/email body contains no internal-notes and no internal contact-email unless transcribed into notes-to-client; email-template tokens cannot resolve to internal fields. | "The template only references safe tokens ⇒ no leak." (verify the resolver's field whitelist, not the template copy) | which fields the PDF section-builder and the email-template renderer can reach; the token-whitelist enforcement point | unit (section-builder + token resolver: feed internal data, assert it never appears in client output) | snapshotting the whole PDF; testing template copy instead of the field-access boundary |
| #5 | A representative real paste parses to correct rows; a malformed paste lands entirely in the single-row fallback, with nothing dropped. | "Parser unit test passes ⇒ no data loss." (the fallback path is the actual safety contract) | the documented expected format + the exact condition that triggers the single-row fallback | unit (extend the existing parser test with malformed/edge inputs asserting the fallback) | testing only well-formed input; asserting parsed output without asserting nothing-lost on failure |
| #6 | Acting on a non-existent or out-of-scope `[id]` is rejected (not silently mutated via the RLS-bypassing service key); the auth gate covers the route. | "RLS protects the table." — false: the Worker's service key bypasses RLS, so the handler check is the only guard. | per-`[id]` route: is there an existence/scope check before mutate/return? what does a bad id return (404 vs 200-empty vs 500)? does any RLS policy assumed in a migration actually fire under the service key? | integration against a **real local Supabase** (route handler with a non-existent / foreign id) — a PostgREST stub cannot prove the service key bypasses RLS | assuming RLS covers it; stubbing the DB so the bypass can't surface; testing only the valid-id happy path |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|------------|------------------|----------------|------------|--------|----------------|
| 1 | Integration harness + request-path coverage | Stand up the first integration layer (route handlers + a real local-Supabase DB) and prove save→PDF, per-route auth gate, `[id]` scope checks, and the RLS-bypass guard on the highest-churn, zero-test surface. | #1, #2, #6 | integration (route handlers + real-DB) + harness bootstrap | implementing (risk #2 + shared harness complete 2026-06-02, **archived 2026-06-11**; risks #1/#6 ride the same `unstable_startWorker` harness — research not yet done) | `context/archive/2026-06-02-auth-gate-throttle/` (risk #2) |
| 2 | Send path + no-leak boundary | Prove the send record is gated on confirmed dispatch (right PDF, re-send guard) and no internal field leaks into client-facing output. | #3, #4 | integration (send handler, Resend stubbed) + unit (token/section field whitelist) | implementing (risk #3 **complete** 2026-06-04, **archived 2026-06-11** — real-DB harness + send oracle shipped; risk #4 not started) | `context/archive/2026-06-04-report-email-send-tests/` (risk #3) |
| 3 | Parser fallback hardening | Prove the WP-CLI single-row fallback never drops data on a malformed real-world paste. | #5 | unit (extend existing parser test) | not started | — |
| 4 | Quality-gates wiring + critical-flow e2e | Wire the integration suite into CI (currently lint+build only) and add one e2e on the full author→save→PDF→send loop. | #1, #3 (regression lock) | CI gate wiring + 1 e2e (critical flow only) | not started | — |

**Status vocabulary** (fixed — parser literals): `not started` → `change opened` → `researched` → `planned` → `implementing` → `complete`.

## 4. Stack

The classic test base for this project. AI-native tools (if any) carry a
`checked:` date so future readers can see which lines need re-verification.

| Layer | Tool | Version | Notes |
|-------|------|---------|-------|
| unit | Vitest | 3.2.4 | `node` env; 16 tests, all in `src/lib/**` (schemas, parsers, render-helpers, form mappers). `include: ["src/**/*.test.ts"]`. No `@/` alias in vitest — import siblings relatively (archive S-06 lesson). |
| integration (API routes) | Vitest + `unstable_startWorker` (workerd) for route handlers; plain-Node Vitest for extracted decision seams | 3.2.4 / wrangler 4.93.1 | Risk #2 shipped the first layer (§3 Phase 1): seam logic on plain-Node Vitest, the two workerd-only behaviors via `unstable_startWorker` against the built `@astrojs/cloudflare` entry. Shared harness: `test/workers-harness.ts`; recipe + gotchas in §6.2 + `auth-gate-throttle/spike-notes.md`. `@cloudflare/vitest-pool-workers` evaluated, **not adopted** (Astro-SSR support undocumented). |
| integration (real DB) | local Supabase via the `unstable_startWorker` harness (**built** by risk #3; reused by #1/#6) | wrangler 4.93.1 | Run the route handlers (+ their `src/lib/<domain>/queries.ts`) against a real local Supabase (`npx supabase start`, migrations via `migration up --local` — never `db reset`, it wipes seeds; see memory `local-supabase-dev-topology`, `local-migration-apply-no-reset`). Needed to prove R6 honestly: the Worker uses the `sb_secret_` service key, which **bypasses RLS**, so only a real DB shows whether a constraint/handler check — not a policy — is the actual guard. **The worker reads `SUPABASE_URL`/`SUPABASE_SECRET_KEY` from `.dev.vars`, NOT harness `vars`** (the Astro env layer ignores runtime `vars` — corrected by risk #3; see §6.2/§6.5). Tests use `createAdminClient()` + `isDbReachable()` (skip when down). Open: whether CI wires a Supabase service container (else CI stays stubbed and real-DB runs locally) — still open after #3; decided when CI wiring (§3 Phase 4) lands. |
| API/network mocking | Resend HTTP edge stubbed via a local intercept (risk #3); FormePDF render not stubbed (exercised live) | — | Policy: stub only the *external* network edge — never internal modules, and **not** the Supabase boundary in the real-DB layer above. Risk #3 stubs Resend with `test/resend-intercept.ts` + the `RESEND_BASE_URL` seam in `send-report.ts` (test-only, unset in prod). The risk-#2 slice needed no network mock. |
| e2e | none yet — see §3 Phase 4 | — | Playwright is the likely pick but is not installed; Phase 4 provisions it. Reserved for the single author→save→PDF→send critical flow. |
| accessibility | none (out of scope) | — | The S-10 redesign did a manual WCAG-AA pass; automated a11y suites are negative space (§7). |
| (optional) AI-native | not adopted | n/a | No AI-native test layer justified under cost × signal for a 5-user internal tool; revisit only if a DOM-unreachable surface appears. |

**Stack grounding tools (current session):**
- Docs: Context7 — available, not queried; Vitest 3 / Astro 6 / Cloudflare Workers are current with no version ambiguity that a strategy doc needs resolved. Phase 1 research should query it for the current Astro 6 SSR route-testing harness API; checked: 2026-06-01.
- Search: Exa.ai — available, not used; checked: 2026-06-01.
- Runtime/browser: Playwright MCP — **not available in current session.** The e2e layer (Phase 4) must be wired, not assumed; checked: 2026-06-01.
- Provider/platform: Supabase MCP available (read-only DB/log inspection for a future gate); Cloudflare via `wrangler tail` per `CLAUDE.md` (`cpuTime`/`wallTime` per event); checked: 2026-06-01.

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required after §3 Phase `<N>`" means the gate is enforced once that rollout
phase lands; before that, it is `planned`.

| Gate | Where | Required? | Catches |
|------|-------|-----------|---------|
| lint + typecheck (`astro sync` → `eslint` strictTypeChecked) | local (husky) + CI | required (wired today) | syntactic / type drift, react-compiler errors |
| build (`npm run build`) | CI on PR to `master` | required (wired today) | SSR build breakage |
| unit + integration (`vitest run`) | local + CI | required after §3 Phase 1 | logic + request-path regressions |
| real-DB integration | local always; CI if a Supabase service container is wired (decided in Phase 1) | required after §3 Phase 1 (locally) | query-module / migration / RLS-bypass regressions |
| e2e on the critical flow | CI on PR | required after §3 Phase 4 | broken author→save→PDF→send loop |
| post-edit hook | local (agent loop) | recommended (Module 3 Lesson 3) | regressions at edit time |
| pre-prod smoke (`wrangler tail` on deploy) | between merge + prod | optional | workerd-specific failures (CPU/wall budget, WASM init) |

The unit suite exists but is **not yet wired into CI** (`.github/workflows/ci.yml` runs `npm ci` → `astro sync` → `lint` → `build` only). Phase 1 adds `vitest run` to the gate; Phase 4 adds e2e. Configuration of the CI YAML itself is owned by Module 2 Lesson 5, not by this guide.

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section fills in once the
relevant rollout phase ships; before that it reads "TBD — see §3 Phase `<N>`."

### 6.1 Adding a unit test

- **Location**: next to the unit under test, inside its `src/lib/<domain>/` folder (e.g. `src/lib/projects/slug.test.ts`).
- **Naming**: `<module>.test.ts` (matched by `include: ["src/**/*.test.ts"]`).
- **Reference test**: `src/lib/wp-cli-paste/parser.test.ts`, `src/lib/projects/schema.test.ts`.
- **Gotcha**: no `@/` alias under vitest — import siblings relatively (archive S-06 lesson).
- **Run locally**: `npm test` (`vitest run`).

### 6.2 Adding an integration test (API route + real DB)

Phase 1 (risk #2) established a **two-layer** pattern. Pick the cheapest layer that
gives a real signal — do not default to the workerd layer.

**Layer A — plain-Node seam (default; sub-second, no build, no runtime).**
For request-path *logic* (gate decisions, throttle/credential orchestration, any
rule you can express without a real binding):

1. Extract the decision logic into a **virtual-import-free** module — no
   `astro:*` / `cloudflare:*` imports, or Vitest can't collect it (a green
   `build`/`astro check` does NOT imply a green `npm test`). See the S-06 lesson.
   The route stays a thin adapter that reads `env`/secrets and calls the seam.
2. Inject dependencies (`KVLike`, a `sleep`/clock, secret *values*) as parameters
   so the test drives them with a fake KV + spies. Assert *which calls fire on
   which branch* and *the decision* — never re-assert unit-covered math (delay
   schedule, HMAC).
3. Collocate the test next to the module; import siblings **relatively**.
- **Templates**: `src/middleware-gate.test.ts` (gate predicate via
  `src/lib/auth/public-paths.ts`), `src/lib/auth/login-flow.test.ts` (throttle
  wiring via the `decideLogin` seam + spy KV + spy sleep).
- **Run**: `npm test`.

**Layer B — workerd route integration (only for what needs the real runtime).**
For behavior that only manifests in workerd (the fail-closed `catch` that needs a
real `formData()`/KV throw; the actual `Set-Cookie` attributes; the real binding
wiring). Runner verdict: **`unstable_startWorker`** (ships inside `wrangler`, no
extra dependency). `@cloudflare/vitest-pool-workers` was evaluated and **not
adopted** (uninstalled; Astro-SSR support undocumented) — revisit only if the HTTP
layer becomes a bottleneck.

1. **Build first** — `npm run test:workers` runs `astro build` then the suite.
   Boot against the adapter-**generated** `dist/server/wrangler.json` (NOT the root
   `wrangler.jsonc`, whose `main` is the source entry and won't boot).
2. Use the shared helper **`test/workers-harness.ts`** (`startTestWorker()` →
   `{ fetch, dispose }`). It MUST live in top-level `test/`, never `src/` — a
   `wrangler` import under `src/` drags `blake3-wasm` into the Astro SSR build and
   breaks `astro build`.
3. **Secrets**: the worker reads project-root `.dev.vars` automatically. Tests read
   credentials from `process.env` (loaded by `test/load-dev-vars.ts` setup) —
   **never hardcode a secret** in a committed test; skip the case if the env var is
   absent. Note: `unstable_startWorker({ vars })` does NOT *override* `.dev.vars`
   secrets (it only adds *new* bindings like `SUPABASE_URL` for #1/#6).
4. **Edge headers**: send `CF-Connecting-IP` (else the route treats the request as
   untrusted → `MAX_DELAY_MS` 5 s sleep) and, for form-encoded POSTs, an `Origin`
   matching the host (Astro's `security.checkOrigin` returns 403 otherwise).
- **Template**: `test/login.workers.test.ts` (G5 fail-closed, G7 cookie flags).
- **Run**: `npm run test:workers`. Full runner verdict + gotchas:
  `context/changes/auth-gate-throttle/spike-notes.md`.

**Real-DB integration (built by `report-email-send-tests`; reused by risks #1/#6).**
Same Layer-B harness, plus a real local Supabase: `npx supabase start` +
`migration up --local` (never `db reset` — it wipes seeds; see memory
`local-supabase-dev-topology`, `local-migration-apply-no-reset`). **The worker reads
`SUPABASE_URL`/`SUPABASE_SECRET_KEY` from `.dev.vars` automatically — do NOT inject
them via harness `vars`** (corrects the earlier assumption: `unstable_startWorker`
`vars` reach the workerd `env` binding but do NOT surface in `astro:env/server`,
which resolves from `.dev.vars`/build-time — proven in `report-email-send-tests/spike-notes.md`).
The *test process* uses `createAdminClient()` (in `test/workers-harness.ts`) for
seeding/asserting/cleanup, and `isDbReachable()` as the skip-guard. A PostgREST stub
cannot prove the `sb_secret_` service key bypasses RLS — that is the whole reason #6
needs a real DB.

### 6.3 Adding a test for the send / no-leak boundary

**Send path (risk #3) — record-gated-on-dispatch, real DB + stubbed Resend.** Shipped
by `report-email-send-tests`; template `test/send.workers.test.ts`. Same Layer-B
workerd harness as §6.2, plus the real-DB layer and a Resend intercept:

1. **Real DB.** `npx supabase start` + `migration up --local` (never `db reset`). The
   worker reads `SUPABASE_URL`/`SUPABASE_SECRET_KEY` from `.dev.vars` automatically —
   no harness wiring. The *test process* gets its own admin client via
   `createAdminClient()` (HTTP/PostgREST, never `pg`) to seed fixtures, count rows,
   and clean up; `isDbReachable()` is the skip-guard (await it at module scope, feed
   `describe.skipIf`) so the suite **skips, not fails**, when Supabase is down.
2. **Stub the Resend edge (test-plan §7), workerd-safe.** The Resend SDK freezes its
   host from `process.env` at module-load and takes no base-URL override, so it can't
   be redirected at call time. `send-report.ts` carries a behavior-preserving seam:
   when `RESEND_BASE_URL` (from `.dev.vars`, test-only, **unset in prod**) is present,
   it POSTs the same wire payload to that host via `fetch`; otherwise it uses the SDK
   unchanged. `test/resend-intercept.ts` is the local `/emails` server — capture sends
   + force success/error. **`RESEND_BASE_URL` must come from `.dev.vars`, NOT harness
   `vars`** (the Astro env layer ignores runtime `vars` — see §6.5 + spike-notes).
3. **Assert the oracle, not the happy path.** Force a Resend error → assert the route
   returns 502 **and the `report_sends` table is unchanged** (record-on-success). Seed
   a forged `pm_email` → assert 400 + no dispatch + no row (recipient integrity). Two
   sends → assert one row (double-send pre-check + the unique-index backstop). Read
   rows with a raw count, not via `getSendSummary` (cleaner "exactly one row" oracle).
   Each case seeds unique-stamped ids and cleans up (cascade from the project row).
- **Run**: `npm run test:workers`. Full detail: `report-email-send-tests/spike-notes.md`.

**No-leak boundary (risk #4) — internal-field-never-leaks-into-client-output.**
TBD — see §3 Phase 2 (risk #4 not yet shipped; unit-test the section-builder + token
resolver field whitelist).

### 6.4 Adding an e2e test

- TBD — see §3 Phase 4.

### 6.5 Per-rollout-phase notes

(Optional. After each phase lands, `/10x-implement` appends a 2–3 line note
here capturing anything surprising the phase taught — e.g. which harness
worked on workerd, where fixtures live.)

- **2026-06-02 — Phase 1, risk #2 (auth gate + throttle) shipped.** Two-layer split
  (see §6.2): plain-Node seam tests for the gate/throttle *logic*, `unstable_startWorker`
  for the two workerd-only behaviors (fail-closed catch, cookie flags). Surprises:
  (1) a `wrangler` import under `src/` breaks `astro build` (`blake3-wasm` pulled
  into the SSR graph) — workerd test code lives in top-level `test/`; (2) boot against
  the adapter-generated `dist/server/wrangler.json`, not the root config; (3) Astro
  `checkOrigin` 403s form POSTs without a matching `Origin`; (4) `vars` injected into
  `unstable_startWorker` don't override `.dev.vars` secrets, and secrets must be read
  from env at runtime (never hardcoded — a first cut was correctly blocked at commit).
  The shared harness `test/workers-harness.ts` is ready for risks #1/#6 to import
  (add `SUPABASE_URL` via `vars` + a local Supabase). Risks #1 and #6 still ride this
  same harness; their oracle research is not yet done. Full detail:
  `context/changes/auth-gate-throttle/spike-notes.md`.

- **2026-06-04 — Phase 2, risk #3 (send path) shipped.** The send-record-gated-on-dispatch
  oracle as a real-route + real-DB + stubbed-Resend suite (`test/send.workers.test.ts`,
  9 cases). This slice **built the real-DB layer** risks #1/#6 inherit. Surprises:
  (1) the route had drifted from the archived S-09 plan — it returns **JSON**
  (`actionOk`/`actionError`), not `?ok=`/`?error=` redirects (the S-11 async-UX refactor),
  and has an undocumented **partial-success warning** path (email sent + record fails →
  200 `warning:true`); research, not the plan, was ground truth. (2) **`unstable_startWorker`
  `vars` do NOT surface in `astro:env/server`** — that layer resolves from `.dev.vars`,
  so `SUPABASE_URL`/`RESEND_BASE_URL` belong in `.dev.vars`, not `vars` (this corrects
  the §4/§6.2 wording the earlier note implied for #1/#6). (3) The Resend SDK freezes its
  host at module-load and takes no override, so a **behavior-preserving `RESEND_BASE_URL`
  fetch seam** in `send-report.ts` (prod path uses the SDK unchanged) was needed to point
  sends at `test/resend-intercept.ts`. (4) Two server guards were **added** here (not just
  tested): a PM-recipient lookup against `pm_contacts` (forged `pm_email` → 400) and a
  double-send pre-check + `report_sends` unique-index backstop; the warning path is now
  race-only and is pinned by the concurrent S6 case. (5) Skip-guard must probe DB
  **reachability** (`isDbReachable`), not just config presence — a stopped Supabase must
  skip, not fail. Full detail: `context/changes/report-email-send-tests/spike-notes.md`.

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future
contributors should respect these unless the underlying assumption changes.

- **UI look-and-feel / visual + DOM snapshots of pages** — brittle, break on every redesign tweak, catch little; a full redesign just shipped. Re-evaluate only if a visual regression actually reaches a client. (Source: Phase 2 interview Q5.)
- **Configuration itself** (`astro.config`, `wrangler.jsonc`, env schema, CI YAML) — the config is the test; assert behavior, not config values. (Source: Phase 2 interview Q5.)
- **Pure CRUD settings surfaces beyond their existing schema unit tests** (plugins-catalog, pm-contacts, brand colors) — trusted users, low blast radius. Re-evaluate if one becomes a leak or auth surface. (Source: Phase 2 interview Q5.)
- **Generated DB types** (`src/types/database.types.ts`) — the generator is the test; assert against zod schemas / contracts instead. (Source: Phase 2 interview Q5.)
- **Heavy automated mobile / a11y matrices** — the redesign did a manual a11y pass; full automated WCAG/cross-device suites exceed what a 5-user internal tool warrants. (Source: Phase 2 interview Q5.)
- **Third-party / infrastructure internals** — do not test Resend, FormePDF, or the workerd runtime themselves; test only *our* use of them at the boundary. Note the deliberate exception: we DO run our `queries.ts` modules against a real local Supabase (§4, Phase 1) — that tests *our* SQL/migrations/handler guards, not Supabase's internals, and is the only honest way to prove R6's RLS-bypass guard. (Source: Phase 2 interview Q5 — "no over-investing in infrastructure or 3rd party".)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-06-01
- Stack versions last verified: 2026-06-01
- AI-native tool references last verified: 2026-06-01

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
