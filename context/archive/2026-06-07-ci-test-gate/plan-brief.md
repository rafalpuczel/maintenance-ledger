# CI Test Gate — Plan Brief

> Full plan: `context/changes/ci-test-gate/plan.md`

## What & Why

Wire the existing test suite and a type-check step into CI so a regression fails the pipeline. Today `.github/workflows/ci.yml` runs only `lint` + `build`; the ~93 existing tests are green but never enforced. Driver: 10xBuilder certificate criterion #6 ("CI/CD — build + verify quality automatically"), which build+lint-only meets only weakly while a real test suite sits unrun.

## Starting Point

`.github/workflows/ci.yml` has one `ci` job: `npm ci → astro sync → lint → build`, on push/PR to `master`. `npm test` (vitest unit, `src/**/*.test.ts`, zero external deps) and `@astrojs/check` both already exist but neither runs in CI.

## Desired End State

Every push and PR to `master` runs `lint → build → astro check → npm test` in one job. A broken unit test or a type error can no longer merge or deploy green. Deploy (Workers Builds auto-deploy) is unchanged.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Which test tiers gate CI | Unit only (`npm test`) | Zero external deps, deterministic — fully satisfies criterion #6; workers/e2e need secrets + live Supabase | Plan |
| Add typecheck? | Yes — `npx astro check` | Cheap; catches type errors lint structurally can't see (it checks lint-ignored files) | Plan |
| Step order | After build: lint → build → astro check → test | Build proves compile before tests; mirrors `test:workers` which builds first | Plan |
| Workers + e2e tiers | Deferred, documented as future work | Both need CI secrets + live Supabase (e2e also a started app + browser); out of scope for a YAML edit | Plan |

## Scope

**In scope:** Append two steps (`npx astro check`, `npm test`) to the existing `ci` job in one file.

**Out of scope:** Workers integration tier, Playwright e2e tier, `wrangler deploy` step, any new scripts/test files, any app-code change.

## Architecture / Approach

Single-file YAML edit. Two `- run:` steps appended to the existing job's `steps:` list, after `npm run build`. The runner already has node 22 + `npm ci`, so no new setup. Pass/fail is by step exit code (GitHub Actions default) — aligns with the lessons.md "judge by exit code" rule, no extra handling.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Add typecheck + unit tests | CI gates on `astro check` + `npm test` | First run may surface latent type errors that pass locally (local-vs-CI version drift — a known repo hazard) |

**Prerequisites:** None — CI, scripts, and the test suite all already exist.
**Estimated effort:** One short session, single file.

## Open Risks & Assumptions

- `astro check` may surface pre-existing type errors that currently pass CI (lessons.md documents local-vs-CI tool drift). Mitigation: run `astro check` + `npm test` locally first and clear any failures before merging so the first CI run is green.
- Assumes the unit suite is deterministic in CI (no hidden reliance on local-only state) — true by config (`environment: "node"`, no setup files, `src/**/*.test.ts` only).

## Success Criteria (Summary)

- CI runs `lint → build → astro check → npm test` on every push/PR to `master`, all green on a clean checkout.
- Deliberately breaking a unit test turns the CI run red on the test step.
- Deploy behavior unchanged — Workers Builds still auto-deploys; this workflow does not deploy.
