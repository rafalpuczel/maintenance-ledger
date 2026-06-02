# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-06-01

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
| 1 | Integration harness + request-path coverage | Stand up the first integration layer (route handlers + a real local-Supabase DB) and prove save→PDF, per-route auth gate, `[id]` scope checks, and the RLS-bypass guard on the highest-churn, zero-test surface. | #1, #2, #6 | integration (route handlers + real-DB) + harness bootstrap | not started | — |
| 2 | Send path + no-leak boundary | Prove the send record is gated on confirmed dispatch (right PDF, re-send guard) and no internal field leaks into client-facing output. | #3, #4 | integration (send handler, Resend stubbed) + unit (token/section field whitelist) | not started | — |
| 3 | Parser fallback hardening | Prove the WP-CLI single-row fallback never drops data on a malformed real-world paste. | #5 | unit (extend existing parser test) | not started | — |
| 4 | Quality-gates wiring + critical-flow e2e | Wire the integration suite into CI (currently lint+build only) and add one e2e on the full author→save→PDF→send loop. | #1, #3 (regression lock) | CI gate wiring + 1 e2e (critical flow only) | not started | — |

**Status vocabulary** (fixed — parser literals): `not started` → `change opened` → `researched` → `planned` → `implementing` → `complete`.

## 4. Stack

The classic test base for this project. AI-native tools (if any) carry a
`checked:` date so future readers can see which lines need re-verification.

| Layer | Tool | Version | Notes |
|-------|------|---------|-------|
| unit | Vitest | 3.2.4 | `node` env; 16 tests, all in `src/lib/**` (schemas, parsers, render-helpers, form mappers). `include: ["src/**/*.test.ts"]`. No `@/` alias in vitest — import siblings relatively (archive S-06 lesson). |
| integration (API routes) | none yet — see §3 Phase 1 | — | The whole request path (`src/pages/api/**`, `src/middleware.ts`) is untested. Phase 1 picks the harness (Astro container / `app.render` vs `wrangler unstable_dev`) during `/10x-research`. |
| integration (real DB) | local Supabase — see §3 Phase 1 | — | Run the `src/lib/<domain>/queries.ts` modules against a real local Supabase (`npx supabase start`, migrations via `migration up --local` — never `db reset`, it wipes seeds; see memory `local-supabase-dev-topology`, `local-migration-apply-no-reset`). Needed to prove R6 honestly: the Worker uses the `sb_secret_` service key, which **bypasses RLS**, so only a real DB shows whether a constraint/handler check — not a policy — is the actual guard. Phase 1 research decides the seed/reset-between-tests strategy and whether CI uses a Supabase service container (else CI stays stubbed and real-DB runs locally). |
| API/network mocking | none yet — see §3 Phase 1 | — | Policy: stub only the *external* network edge (Resend HTTP, the FormePDF render boundary) — never internal modules, and **not** the Supabase boundary in the real-DB layer above. Tool chosen during Phase 1 research. |
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

- TBD — see §3 Phase 1 (this is the load-bearing gap; Phase 1 picks the harness, the local-Supabase setup/seed/reset-between-tests strategy, and writes the canonical reference test for the save→PDF, auth-gate, `[id]`-scope, and RLS-bypass patterns). Local DB lifecycle: `npx supabase start` + `migration up --local` (never `db reset`).

### 6.3 Adding a test for the send / no-leak boundary

- TBD — see §3 Phase 2 (record-gated-on-dispatch pattern; internal-field-never-leaks-into-client-output pattern).

### 6.4 Adding an e2e test

- TBD — see §3 Phase 4.

### 6.5 Per-rollout-phase notes

(Optional. After each phase lands, `/10x-implement` appends a 2–3 line note
here capturing anything surprising the phase taught — e.g. which harness
worked on workerd, where fixtures live.)

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
