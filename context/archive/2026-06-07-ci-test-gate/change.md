---
change_id: ci-test-gate
title: Run the test suite in CI, not just lint + build
status: archived
created: 2026-06-07
updated: 2026-06-11
archived_at: 2026-06-11T14:37:52Z
---

## Notes

Roadmap S-14 (infra). Driver: 10xBuilder certificate criterion #6 — "Pipeline CI/CD — building the app and verifying quality automatically". The current `.github/workflows/ci.yml` runs `npm ci → astro sync → lint → build` only; the ~93 existing tests (vitest unit + Playwright e2e + workers integration) are green but never enforced in CI. Wire the test suite into the existing `ci` job so a regression fails the pipeline.

Decisions deferred to `/10x-plan` (see roadmap S-14 Unknowns):
- Which test tiers run in CI. `npm test` (vitest unit, `src/**/*.test.ts`) needs no external services — the certain win. `test:workers` and Playwright e2e need a live Supabase + secrets (and e2e needs the app running), so those are a stretch goal requiring GitHub Actions secrets / a test DB.
- Whether to also add typecheck (`astro check`) to the same job — `@astrojs/check` is installed but never run in CI.
