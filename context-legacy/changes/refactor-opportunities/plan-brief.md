# Media-Editor State-Model Glue Collapse (Opportunity #1) — Plan Brief

> Full plan: `context/changes/refactor-opportunities/plan.md`
> Research: `context/changes/refactor-opportunities/research.md`

## What & Why

Collapse the **accidental complexity in the glue** of `@wordpress/media-editor`'s state model — the only one of the research's three candidate seams that is genuine structural debt whose fix breaks neither the layer rule nor an external contract. The debt is real and recurring: every new state field today needs hand-edits to the reducer *plus two equality functions*, and the type system doesn't catch a miss. We gather the glue while leaving the intentional, load-bearing seams (pure geometry core; editor-session semantics) intact.

## Starting Point

The package runs two parallel state systems (a 4-layer cropper/composite React stack + a separate `@wordpress/data` modal store) plus `core-data`. The research verified all three top-level splits are **intentional and load-bearing** — the accidental complexity is in the glue between layers, not the splits. `mediaEditorReducer` and `buildCropperSetters` have **zero direct tests**; layer enforcement is human-only (dependency-cruiser is dormant in CI).

## Desired End State

State behaves identically (same undo/redo, gesture coalescing, dirty-tracking, aspect-ratio reshape), but: the inscribed-rect reshape has **one behavioral owner** (the reducer, not also the view); the dirty-baseline and `stateRef` idioms are defined once; and the two equality functions are **shielded** so a new field can't silently desync history dedup. Two untested surfaces gain direct tests.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Which opportunities | **#1 only** (state-model glue); defer #2 | Tightest focus, one package, one owner; #2 is layer-safe but different package, its own change | Plan |
| #1 ambition | **Gather glue, keep both hooks** | Every step reversible, no public-contract change; matches research's "collapse glue not seams" | Plan |
| Reshape home (B1+B2) | **Reducer owns it; view dispatches** | State transitions own geometry, view goes dumb, keeps the atomic-undo contract | Plan |
| `transforms/pipeline.ts` (S3b) | **Audit early, don't touch** | De-risks the "3 not 1" correction without scope creep; pure core is the keep-point anyway | Research |
| Phase-1 test depth | **Reducer + equality + setters** | Pins exactly the surfaces #1 moves; closes the two 0-test gaps | Plan |

## Scope

**In scope:** characterization tests for `mediaEditorReducer`/`areMediaEditorStatesEqual` + `buildCropperSetters`; single-sourcing the inscribed-rect reshape into the reducer; consolidating the dirty-baseline + `stateRef` idiom; shielding the equality functions. All inside `media-editor/src`.

**Out of scope (each a named follow-up):** opportunity #2 (block-library dedup); save-path characterization (P1/C-C); retiring the standalone `useCropperReducer` hook; the C-B and C-C seams (layer-forced / external Core REST contract — rejected); the middleware-over-pure-core redesign (invents a missing abstraction, highest risk).

## Architecture / Approach

Test-first, one reversible commit per phase, coordinate with Ramon throughout. Phase 1 writes the safety net (strong enough to catch a dedup regression from *either* later phase). Phase 2 makes the composite reducer the sole reshape authority; the view dispatches a viewport change instead of re-deriving (epsilon dedup is the loop-breaker). Phase 3 deduplicates the baseline + `stateRef` idiom and adds an equality shield. The pure geometry core (`cropperReducer`, layer A) stays the single reducer and the convergence point for its three in-package importers.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Characterization net | Golden test (reducer + explicit dedup invariant) + setter test + pipeline audit | Pinning a latent bug as "intended" — mitigated by Ramon sign-off |
| 2. Single-source reshape | View stops re-deriving; reducer is sole reshape owner | **Render-loop on resize** — explicit manual check, not assumed |
| 3. Consolidate glue + shield equality | One `stateRef`/baseline definition; equality can't silently desync | Subtle change to undo/gesture semantics — caught by Phase-1 net + existing hook tests |

**Prerequisites:** Phase-1 tests merged before any Phase-2/3 touch; coordination with Ramon (composite-reducer author) — a hard feasibility constraint (P5: 2-person crew).
**Estimated effort:** ~3 sessions across 3 phases (Phase 1 the largest by test volume; Phases 2–3 small but careful).

## Open Risks & Assumptions

- **Render-loop** when the view dispatches viewport reshape instead of computing it (Phase 2) — assumed broken by existing epsilon dedup; must be verified manually.
- **`transforms/pipeline.ts`** assumed to consume pure geometry only; if the audit shows otherwise, STOP and re-scope before Phase 2.
- **Human-only layer enforcement** — no CI guard; the JS unit suite + lint + type-check + TS boundaries are the entire net.
- **Owner coordination** — Ramon's review is a per-phase prerequisite, not optional.

## Success Criteria (Summary)

- Full `npm run test:unit packages/media-editor` green (incl. new Phase-1 tests), lint + type-check clean, `image.spec.js:244` crop e2e still passing.
- `computeInscribedRect` no longer called from `cropper.tsx`; one behavioral reshape owner.
- Adding an unhandled state field fails compile or test (equality shield proven).
- Undo/redo, gesture coalescing, dirty-tracking, and standalone `useCropperReducer` behave identically to pre-refactor.
