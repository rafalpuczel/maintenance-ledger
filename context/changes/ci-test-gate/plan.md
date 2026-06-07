# CI Test Gate Implementation Plan

## Overview

Wire the existing automated test suite and a type-check step into the GitHub Actions CI job so that a regression fails the pipeline. Today `.github/workflows/ci.yml` runs only `lint` + `build`; the ~93 existing tests are green but never enforced. This change adds `astro check` (type verification) and `npm test` (the vitest unit suite) to the same `ci` job, after the existing build step.

Roadmap slice **S-14 (`ci-test-gate`)**. Driver: 10xBuilder certificate criterion #6 — "Pipeline CI/CD — building the app and verifying quality automatically."

## Current State Analysis

- **`.github/workflows/ci.yml`** runs on push to `master` and PRs to `master`: `actions/checkout@v4` → `actions/setup-node@v4` (node 22, npm cache) → `npm ci` → `npx astro sync` → `npm run lint` → `npm run build`. No test or typecheck step.
- **`package.json`** scripts: `test` → `vitest run` (unit), `test:workers` → `astro build && vitest run --config vitest.workers.config.ts` (integration), plus `lint`, `build`. `@astrojs/check` is a dependency (`^0.9.8`) but no script invokes it and CI never runs it.
- **Unit tier** (`vitest.config.ts:8`): `include: ["src/**/*.test.ts"]`, `environment: "node"`. Plain Node, no external services — deterministic and self-contained. This is the tier this plan gates on.
- **Workers tier** (`vitest.workers.config.ts`): builds first, boots the ~10 MiB worker, loads creds from gitignored `.dev.vars` via `test/load-dev-vars.ts`. Tests `skipIf(!hasCreds)` / `describe.skipIf(!canRun)` (`login.workers.test.ts:72`, `send.workers.test.ts:142`) and also probe Supabase reachability — so they self-skip without secrets. **Out of scope** for this change (see "What We're NOT Doing").
- **E2E tier** (`playwright.config.ts`): needs a running app at `localhost:4321`, a `storageState` auth fixture (`playwright/.auth/user.json`), live Supabase, and a browser install. No graceful skip. **Out of scope.**

### Key Discoveries:

- The CI runner already has node 22 + npm cache + a clean `npm ci` install, so adding a step that runs `vitest run` / `astro check` needs no new setup — just two more `- run:` lines (`ci.yml:18-21`).
- `astro check` type-checks files that ESLint ignores (e.g. `src/types/database.types.ts`), per `lessons.md` — so it covers a gap `npm run lint` structurally cannot. This is why it's worth adding alongside tests.
- The existing CI job already runs `npx astro sync` before lint/build; `astro check` depends on the synced types being present, so it must run after `astro sync` (it already would, being later in the job).
- `lessons.md` (load-bearing): judge a lint/build/test/check command **by its exit code**, never by grepping output — a crash exits non-zero with no "error" line. The CI `- run:` steps already do this correctly (a non-zero exit fails the job).
- Local-vs-CI tool-version drift has bitten this repo before (eslint 9.29 local vs 9.39 in CI surfaced real violations only in CI). The same risk applies to `astro check` / `vitest` — the first CI run with these steps may surface latent issues that pass locally. Expected and acceptable; that's the point of the gate.

## Desired End State

Every push to `master` and every pull request to `master` runs, in one job, in order: install → `astro sync` → `lint` → `build` → `astro check` → `npm test`. Any non-zero exit fails the pipeline. A code change that breaks a unit test or introduces a type error can no longer merge or deploy green.

Verify by: the workflow YAML contains the two new steps in the correct order; a CI run on a branch shows the `astro check` and test steps executing and passing; deliberately breaking a unit test on a throwaway branch turns the CI run red.

## What We're NOT Doing

- **Not** running the workers integration tier (`npm run test:workers`) in CI. It needs CI secrets (`TEST_LOGIN_PASSWORD`, Supabase keys) and a reachable live Supabase, or it self-skips to a no-op. Deferred — see future-work note below.
- **Not** running the Playwright e2e tier in CI. It needs a started app server, an auth `storageState` fixture, live Supabase, and a `playwright install` step. Deferred.
- **Not** adding a `wrangler deploy` step — deploy stays on Cloudflare Workers Builds (auto-deploy on push to `master`), unchanged.
- **Not** adding new `package.json` scripts, new test files, or touching any application code. CI already exposes `npm test`; `astro check` runs via `npx`.
- **Not** changing triggers, runner, node version, or the existing lint/build steps.

**Future work (deferred tiers — documented, not implemented):**
- *Workers tier:* add GitHub Actions secrets (`TEST_LOGIN_PASSWORD` + the Supabase publishable/secret keys the harness reads), then a `- run: npm run test:workers` step. The harness already prefers a real env var over `.dev.vars` (`test/load-dev-vars.ts:24`) and self-skips when creds/Supabase are absent, so the step is safe to add incrementally; it only becomes meaningful once secrets + a reachable test DB exist.
- *E2E tier:* add `npx playwright install --with-deps chromium`, start the app (preview server or `wrangler dev`), generate/commit the auth `storageState`, point `baseURL` at the started server, then `- run: npx playwright test`. Largest lift; needs the same Supabase + secret provisioning.

## Implementation Approach

A single-phase, single-file change: append two steps to the existing `ci` job in `.github/workflows/ci.yml`, after `npm run build`, in the order `astro check` then `npm test`. Build runs first so a compile failure surfaces before the type-check and tests; this also mirrors `test:workers`, which builds before testing. No other files change.

## Phase 1: Add typecheck + unit tests to the CI job

### Overview

Extend the `ci` job in `.github/workflows/ci.yml` with a type-check step (`npx astro check`) and a unit-test step (`npm test`), placed after the existing `npm run build` step.

### Changes Required:

#### 1. CI workflow

**File**: `.github/workflows/ci.yml`

**Intent**: After the existing `- run: npm run build` step, add two new steps that gate the pipeline on type-correctness and the unit test suite, so a type error or a failing unit test fails CI. Order: `astro check` first (type verification), then `npm test` (unit suite).

**Contract**: Two appended steps in the single `ci` job's `steps:` list, after `npm run build`:
- `- run: npx astro check` — type-checks the project (including lint-ignored files); exits non-zero on any type error.
- `- run: npm test` — runs `vitest run` over `src/**/*.test.ts`; exits non-zero on any failing test.

No changes to triggers, runner, node setup, caching, or the existing `npm ci` / `astro sync` / `lint` / `build` steps. The job-level pass/fail is by step exit code (GitHub Actions default), satisfying the lessons.md "judge by exit code" rule with no extra handling.

### Success Criteria:

#### Automated Verification:

- The workflow file is valid YAML and the `ci` job contains both new steps in order (`astro check` before `npm test`, both after `build`).
- Locally, `npx astro check` exits 0 (no pre-existing type errors that would red the first CI run).
- Locally, `npm test` exits 0 (the unit suite passes from a clean checkout).
- A CI run triggered on a branch shows the `astro check` and test steps executing and passing.

#### Manual Verification:

- On a throwaway branch, deliberately break one unit-test assertion, push, and confirm the CI run goes red on the test step (proves the gate actually gates).
- Confirm the deploy behavior is unchanged — Workers Builds still auto-deploys on push to `master`; this CI workflow does not deploy.

**Implementation Note**: After the automated verification passes (valid YAML, local `astro check` + `npm test` green, branch CI run green), pause for the human to run the manual "break a test → CI goes red" check before considering the phase done. The `- [ ]` checkboxes live in `## Progress` below.

---

## Testing Strategy

### Manual Testing Steps:

1. Run `npx astro check` locally → expect exit 0. If it surfaces latent type errors (local-vs-CI drift is a known repo hazard), fix or triage them before merging so the first CI run is green.
2. Run `npm test` locally → expect exit 0.
3. Open a PR (or push a branch) → confirm the CI run executes lint → build → astro check → test, all green.
4. On a throwaway branch, break a unit test assertion, push → confirm CI fails on the test step → revert.

## Migration Notes

None. No data, schema, or app-code changes. Reverting is deleting the two added steps.

## References

- Roadmap slice: `context/foundation/roadmap.md` → S-14 (`ci-test-gate`)
- Lessons (priors applied): `context/foundation/lessons.md` — "Judge lint/build by exit code"; "`supabase gen types` … verify with `astro check`" (why `astro check` covers a lint gap)
- Current CI: `.github/workflows/ci.yml:18-21`
- Unit config: `vitest.config.ts:8`
- Deferred tiers: `vitest.workers.config.ts`, `test/load-dev-vars.ts:24`, `playwright.config.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Add typecheck + unit tests to the CI job

#### Automated

- [x] 1.1 Workflow is valid YAML; `ci` job has both new steps in order (astro check before npm test, both after build) — cf59acf
- [x] 1.2 Local `npx astro check` exits 0 — cf59acf
- [x] 1.3 Local `npm test` exits 0 — cf59acf
- [x] 1.4 Branch CI run shows astro check + test steps passing

#### Manual

- [x] 1.5 Break a unit test on a throwaway branch → CI goes red on the test step → revert
- [x] 1.6 Deploy behavior unchanged — Workers Builds still auto-deploys; this workflow does not deploy
