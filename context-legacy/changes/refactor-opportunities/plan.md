# Media-Editor State-Model Glue Collapse (Opportunity #1) Implementation Plan

## Overview

Collapse the **accidental complexity in the glue** of `@wordpress/media-editor`'s state model — without touching the intentional, load-bearing seams it sits between. Concretely: single-source the inscribed-rect reshape into the composite reducer, consolidate the duplicated dirty-baseline bookkeeping and the thrice-implemented synchronous-shadow `stateRef` idiom, and shield the two manually-synced equality functions so adding a state field can no longer silently break history dedup. Every move is behind a characterization-test safety net written first.

This plan implements **only refactor opportunity #1** from `context/changes/refactor-opportunities/research.md`. Opportunity #2 and every rejected seam are explicitly out of scope (see *What We're NOT Doing*).

## Current State Analysis

The package runs **two parallel state systems** (a 4-layer cropper/composite stack via React context, plus a separate `@wordpress/data` modal store) and `core-data` for the attachment entity. The research verified this to the letter and judged all three top-level splits **intentional and load-bearing** (architecture doc + PR descriptions + inline ADR-style comments). The accidental complexity lives **in the glue between layers**, not in the splits themselves.

The glue this plan targets (all evidence, file:line verified):

- **B1 — geometry reshape leaks UP into the composite reducer:** `state/composite-reducer.ts:64` calls `computeInscribedRect()` inside `SET_ASPECT_RATIO_VALUE`. (This is legitimate — atomic transaction. It is *kept*; the duplication below is what's collapsed.)
- **B2 — the same reshape leaks SIDEWAYS into the view:** `image-editor/react/components/cropper.tsx:332,372` independently call `computeInscribedRect()` via `adjustCropRectForViewport`, re-deriving a reshape the reducer already owns. Verified (S8): `computeInscribedRect` is called in **3 places** — `composite-reducer.ts:64`, `cropper.tsx:332`, `cropper.tsx:372` — kept consistent only by epsilon dedup.
- **B3 — dirty/baseline duplicated:** both `use-cropper-reducer.ts:109-163` and `use-media-editor-state.ts:181-220` hold their own `initialBaseline` + dirty derivation; the pure reducer also hosts `areCropperStatesEqual`/`isStateDirty` consumed only by layers above.
- **`stateRef` synchronous-shadow idiom duplicated 3×:** `use-cropper-reducer.ts:116-123`, `use-media-editor-state.ts:193,225-244`, and `use-interaction.ts:119-120` — the same load-bearing "read fresh state before React commits" pattern, three hand-rolled implementations.
- **Equality-in-sync fragility (#4):** `areMediaEditorStatesEqual` (`composite-reducer.ts:109-120`) compares **only** `cropper` + `cropOptions.aspectRatioValue` (verified S5). It must be hand-kept in sync with `MediaEditorState`'s shape and with `areCropperStatesEqual`'s fields. Adding a field to `CropOptionsSlice`/`CropperState` silently breaks both no-op dedup and undo dedup — **the type system does not catch this.**

The safety net is **human-only**: dependency-cruiser/eslint do **not** enforce media-editor layer boundaries in CI (`.dependency-cruiser.cjs` is a dormant local overlay). The real backstops are the JS unit suite, lint, type-check, and the TS type boundaries. Two of the surfaces this plan reaches have **zero direct tests today**: `mediaEditorReducer` (only tested through the hook) and `buildCropperSetters` (untested).

### Key Discoveries:

- **No class hierarchy to unwind** (S2): `MediaEditorController extends CropperController` is *structural typing*, the controller assembled by object spread (`use-media-editor-state.ts:430-431`). Partial migration has no hard knot.
- **`cropperReducer` has 3 in-package importers, not 1** (S3b correction): `use-cropper-reducer.ts:24`, `composite-reducer.ts:5`, `transforms/pipeline.ts:6`. All inside `media-editor/src`. The pure geometry core (layer A = `cropperReducer`) is the **keep-point** — these three are the paths meant to converge on it. `transforms/pipeline.ts` is the "quiet" off-axis consumer the original migration sketch missed.
- **The factory is a stable choke point** (S1b): `buildCropperSetters` (10 setters) has exactly **2 call-sites** — `use-cropper-reducer.ts:159`, `use-media-editor-state.ts:284`.
- **Atomic-transaction contract:** `SET_ASPECT_RATIO_VALUE` and `VIEWPORT_ADJUST_CROP_RECT` both reshape via the reducer (`composite-reducer.ts:64,88-96`); the aspect-ratio reshape must remain **one undo entry**. The non-recording viewport path (`use-media-editor-state.ts:389-397`, `recordHistory=false`) is how resizes avoid producing undo entries.
- **Blast radius is fully in-package:** external consumers (`editor`, dev-route) touch modal/component entry points, never the state types. Fan-in: `core/types.ts` 17 type-only importers; `composite-reducer.ts` 1 production importer.

## Desired End State

`@wordpress/media-editor` state behaves **identically** to today (same undo/redo, gesture coalescing, dirty-tracking, aspect-ratio reshape) but:

- `computeInscribedRect`-based reshape has **one behavioral owner** (the composite reducer); the view dispatches instead of re-deriving.
- Dirty-baseline bookkeeping and the `stateRef` synchronous-shadow idiom are **defined once** and reused, not hand-rolled per hook.
- `areMediaEditorStatesEqual` and `areCropperStatesEqual` are **shielded** so a new state field can no longer silently desync dedup — caught by a test (and, where feasible, by the type system).
- Two previously-untested surfaces (`mediaEditorReducer`, `buildCropperSetters`) carry direct characterization tests.

**Verification of end state:** full `npm run test:unit packages/media-editor` green (including the new Phase-1 tests), lint + type-check clean, and the existing `image.spec.js:244` crop e2e still passes. Each phase is an independently reversible commit; reverting any one leaves the package green.

## What We're NOT Doing

Each item below is a **named, deferred follow-up**, not an oversight:

- **Opportunity #2 — block-library consumer dedup** (`use-open-image-media-editor-modal.js` ↔ `site-logo/edit.js` shared open-call + `typeof id === 'number'` guard + focus-return). Layer-safe and real, but a **different package and owner**; belongs in its own change.
- **Save-path characterization** (`use-save-media-editor.ts`, the P1 / C-C collapse target, 0 tests). Highest-ROI test gap in the package, but **not touched by #1's glue-collapse** — it's a coverage change of its own.
- **Retiring the standalone `useCropperReducer` hook.** It's an **intentional Storybook/recipes/docs seam** with a real second consumer; deliberately kept. (This plan chose "gather glue, keep both hooks.")
- **The C-B modal-contract seam.** **Architecturally forced** by the layer rule (`AGENTS.md:64,78`) — block-library/block-editor legally cannot import media-editor. Not refactorable from the client. Research verdict: REJECTED.
- **The C-C save-format seam.** `[flip,rotate,crop]` is an **external WordPress Core REST contract** (`WP_REST_Attachments_Controller::edit_media_item`); the client conforms to it. "Decoupling" is cross-system redesign — the task's hard STOP boundary. Research verdict: REJECTED.
- **The middleware-over-pure-core redesign.** The research's named eventual end-state, but it **invents an abstraction the codebase lacks** and carries the highest regression risk on undo/gesture semantics. Out of scope for this plan by explicit decision.

## Implementation Approach

**Test before touch, one reversible commit per phase, coordinate with Ramon throughout.**

1. Write the characterization net first (Phase 1) — it must be strong enough to catch a dedup/equality regression introduced by *either* later phase.
2. Single-source the reshape (Phase 2): the reducer is the authority; the view dispatches. Independently reversible.
3. Consolidate the dirty-baseline + `stateRef` idiom and shield equality (Phase 3). Independently reversible.

The intentional seams (A geometry core, B′ editor-session semantics) are preserved. `cropperReducer` (layer A) stays the sole geometry reducer and the convergence point for its three importers.

## Critical Implementation Details

- **Equality is reached by both Phase 2 and Phase 3.** Phase 2 changes *who triggers* the reshape (dispatch vs re-derive), which flows through `dispatchWithHistory`'s `areMediaEditorStatesEqual` no-op check. Phase 3 changes equality's *definition home*. The Phase-1 test must therefore assert the dedup invariant **explicitly and strongly** (see Phase 1 contract), so a regression from either phase fails a named assertion, not an incidental one.
- **Render-loop risk on the viewport dispatch path (Phase 2).** Today `cropper.tsx` computes the reshaped rect locally and calls `adjustCropRectForViewport` with a finished rect; the controller's `VIEWPORT_ADJUST_CROP_RECT` dispatch is non-recording. Moving the *computation* into the reducer means the view must report its visual size / trigger a reshape on resize and consume the resulting state without re-triggering on the state it just produced. The existing epsilon dedup (`composite-reducer.ts:88-96` returns `state` when `nextCropper === state.cropper`) is the natural loop-breaker, but it must be confirmed, not assumed — flagged as an explicit manual verification step.
- **Atomic undo contract.** `SET_ASPECT_RATIO_VALUE`'s reshape must remain one undo entry (`composite-reducer.ts:44-72`). Any reshape consolidation must not split it into two history pushes.

---

## Phase 1: Characterization Safety Net

### Overview

Pin the behavior of the surfaces the later phases move, before moving anything. Purely additive and fully reversible — no production code changes. Closes the two 0-test gaps the research flagged (`mediaEditorReducer`, `buildCropperSetters`) and audits the third `cropperReducer` consumer.

### Changes Required:

#### 1. Composite reducer golden test

**File**: `packages/media-editor/src/state/test/composite-reducer.ts` (new)

**Intent**: Establish a direct, behavior-pinning test for `mediaEditorReducer` and `areMediaEditorStatesEqual` — the largest untouched behavioral surface in the state chain and the exact invariant both later phases reach.

**Contract**: Cover every reducer branch — `CROPPER` delegation (including the `nextCropper === state.cropper` no-op early-return at `:39`), atomic `SET_ASPECT_RATIO_VALUE` (both the reshape branch `:64-72` producing one composite transition and the no-reshape branch `:58-62`), `RESET_CROP_OPTIONS`, `RESTORE_SNAPSHOT`, and `VIEWPORT_ADJUST_CROP_RECT`. For `areMediaEditorStatesEqual`, the dedup invariant must be **explicit**: equal-when-only-untracked-fields-differ, unequal-when-cropper-differs, unequal-when-`aspectRatioValue`-differs, and reference-equality short-circuit. Assert these as named cases so a desync from Phase 2 or Phase 3 fails here.

#### 2. Setter factory direct test

**File**: `packages/media-editor/src/image-editor/react/hooks/test/build-cropper-setters.ts` (new)

**Intent**: Test `buildCropperSetters` directly (today only exercised through the two consuming hooks) by injecting a spy `dispatchCropperAction` and a stub `getCropperState`.

**Contract**: Assert each of the 10 setters dispatches the correct `CropperAction` shape, and that the state-reading setters (`setZoom` via `buildFocalPointZoomAction`, `toggleFlip`) read through `getCropperState` and dispatch the derived payload (including `setZoom`'s skip-when-`null`-action path at `:64-67`).

#### 3. Audit `transforms/pipeline.ts` (no code change)

**File**: `packages/media-editor/src/image-editor/core/transforms/pipeline.ts` (read-only audit)

**Intent**: Confirm the third `cropperReducer` consumer uses the **pure geometry** contract (the keep-point), document it as unaffected by Phases 2–3, and add it to the no-regression checklist.

**Contract**: A short note in this plan's Progress / commit message recording how `pipeline.ts:6` consumes `cropperReducer`, and confirmation that the existing `transforms/test/pipeline.ts` covers it. No production edit; if the audit reveals it depends on glue being moved, STOP and re-scope before Phase 2.

### Success Criteria:

#### Automated Verification:

- New tests pass: `npm run test:unit packages/media-editor/src/state/test/composite-reducer.ts`
- New tests pass: `npm run test:unit packages/media-editor/src/image-editor/react/hooks/test/build-cropper-setters.ts`
- Full package suite still green: `npm run test:unit packages/media-editor`
- Lint passes: `npm run lint:js packages/media-editor/src`
- Type-check passes: `npm run build:package-types` (or the repo's TS check via `npm run build`)

#### Manual Verification:

- Reviewed with Ramon that the golden test pins the *intended* behavior (not just current behavior that might itself be a latent bug), especially the atomic `SET_ASPECT_RATIO_VALUE` undo contract.
- `transforms/pipeline.ts` audit note confirms it consumes pure geometry only and is unaffected by Phases 2–3.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation (including Ramon's sign-off on the characterized behavior) before Phase 2. Commit Phase 1 as its own reversible commit.

---

## Phase 2: Single-Source the Inscribed-Rect Reshape

### Overview

Make the composite reducer the **sole behavioral owner** of the `computeInscribedRect` reshape. `cropper.tsx` stops re-deriving the reshape and routes its viewport change through a dispatch path (non-recording, as today), removing the B1/B2 duplication that is currently kept consistent only by epsilon dedup.

### Changes Required:

#### 1. Remove the view's reshape re-derivation

**File**: `packages/media-editor/src/image-editor/react/components/cropper.tsx`

**Intent**: At `:332` and `:372`, stop computing the inscribed rect in the view; instead report the viewport/visual-size change to the controller and let the reducer (via `VIEWPORT_ADJUST_CROP_RECT` / `setVisualSize`) produce the reshaped state. The view consumes the resulting `state.cropper` for render only.

**Contract**: The two `computeInscribedRect` call-sites in `cropper.tsx` are removed. The viewport reshape continues to flow through the controller's existing `adjustCropRectForViewport` (non-recording, `recordHistory=false`) and/or `setVisualSize` — no new public controller method unless the audit shows one is required. After this change, `computeInscribedRect` is called in exactly **1 production place** (`composite-reducer.ts:64`, plus the new viewport-reshape path inside the reducer if routed there). Net behavior — including the epsilon dedup loop-break (`composite-reducer.ts:88-96`) — is unchanged.

### Success Criteria:

#### Automated Verification:

- Phase-1 dedup/equality assertions still pass: `npm run test:unit packages/media-editor/src/state/test/composite-reducer.ts`
- `cropper.tsx` tests pass: `npm run test:unit packages/media-editor/src/image-editor/react/components/test/cropper.tsx`
- Full package suite green: `npm run test:unit packages/media-editor`
- `computeInscribedRect` call-site count reduced (verify by search: no remaining calls in `cropper.tsx`)
- Lint + type-check pass.
- Crop e2e still passes: `npm run test:e2e -- test/e2e/specs/editor/blocks/image.spec.js`

#### Manual Verification:

- **No render-loop on the view's resize path** — resize the editor window/canvas repeatedly while a non-Free aspect ratio is active and confirm the cropRect settles (does not oscillate or re-dispatch indefinitely). This is an explicit verification step, not an assumption.
- Aspect-ratio reshape on resize is visually identical to current behavior; cropRect stays contained.
- Aspect-ratio change still produces exactly **one** undo entry (atomic contract intact).
- Reviewed with Ramon.

**Implementation Note**: Pause for manual confirmation (incl. the render-loop check) before Phase 3. Commit Phase 2 as its own reversible commit.

---

## Phase 3: Consolidate Dirty/Baseline + `stateRef` Idiom and Shield Equality

### Overview

Collapse the duplicated dirty-baseline bookkeeping and the thrice-implemented `stateRef` synchronous-shadow idiom into shared, single-definition utilities both hooks use, and shield the two equality functions so a new state field can no longer silently desync history dedup.

### Changes Required:

#### 1. Shared `stateRef` synchronous-shadow utility

**File**: `packages/media-editor/src/state/use-media-editor-state.ts`, `packages/media-editor/src/image-editor/react/hooks/use-cropper-reducer.ts`, `packages/media-editor/src/image-editor/react/hooks/use-interaction.ts` (consumers); new shared helper under `image-editor/react/hooks/`

**Intent**: Extract the "dispatch-and-sync a ref so multiple actions in one event see fresh state" idiom (`use-cropper-reducer.ts:118-123`, `use-media-editor-state.ts:225-244`, `use-interaction.ts:119-120`) into one composable helper. Each hook keeps its own dispatch semantics (pure vs history-wrapped) but shares the ref-shadowing mechanism.

**Contract**: One exported hook/utility encapsulating `useRef(state)` + synchronous write-on-dispatch. The three current implementations are replaced by calls to it. Behavior — especially `dispatchWithHistory`'s pre-state/post-state computation for no-op skipping (`use-media-editor-state.ts:227-241`) — is preserved exactly.

#### 2. Consolidate dirty/baseline bookkeeping

**File**: `packages/media-editor/src/state/use-media-editor-state.ts`, `packages/media-editor/src/image-editor/react/hooks/use-cropper-reducer.ts`

**Intent**: Reduce the duplicated `initialBaseline` + dirty-derivation (B3) to a shared definition, keeping the layer-appropriate equality function (`areCropperStatesEqual` for the pure hook, `areMediaEditorStatesEqual` for the composite) as the injected comparator.

**Contract**: Both hooks derive `isDirty` (and the composite's `isCropperDirty`) through one shared baseline mechanism parameterized by comparator. The `setImage`/`reset` baseline-refresh semantics are unchanged.

#### 3. Shield equality against silent field desync

**File**: `packages/media-editor/src/state/composite-reducer.ts`, `packages/media-editor/src/state/types.ts` (and/or `image-editor/core` equality)

**Intent**: Make it impossible for a newly-added `MediaEditorState`/`CropOptionsSlice`/`CropperState` field to slip past `areMediaEditorStatesEqual`/`areCropperStatesEqual` unnoticed. Prefer a type-level guard (exhaustive key check) where feasible; otherwise a characterization assertion that fails when the state shape grows.

**Contract**: Either a `satisfies`/keyof-exhaustiveness construct that breaks compilation when a slice gains a field not handled by the equality function, or an explicit test that enumerates the state keys and fails on an unhandled one. The runtime equality result for current state shapes is unchanged.

### Success Criteria:

#### Automated Verification:

- Phase-1 dedup/equality assertions still pass: `npm run test:unit packages/media-editor/src/state/test/composite-reducer.ts`
- Hook tests pass: `npm run test:unit packages/media-editor/src/state/test/use-media-editor-state.ts` and `.../hooks/test/use-cropper-reducer.ts`
- Full package suite green: `npm run test:unit packages/media-editor`
- Equality-shield works: a deliberate scratch commit adding an unhandled state field **fails** compile or test (verify, then revert the scratch).
- Lint + type-check pass.

#### Manual Verification:

- Undo/redo, gesture coalescing, and dirty-tracking behave identically to pre-refactor (drag-pan, pinch-zoom, ruler rotate, aspect-ratio change, undo, redo).
- Standalone `useCropperReducer` (Storybook/recipes) still works unchanged.
- Reviewed with Ramon.

**Implementation Note**: Commit Phase 3 as its own reversible commit. After manual confirmation, the plan is complete.

---

## Testing Strategy

### Unit Tests:

- New `composite-reducer.ts` golden test — every branch + explicit `areMediaEditorStatesEqual` dedup invariant (Phase 1).
- New `build-cropper-setters.ts` direct test — all 10 setters + state-reading paths (Phase 1).
- Existing `use-media-editor-state.ts` and `use-cropper-reducer.ts` tests act as the regression net for the hook-level consolidation (Phase 3).
- Equality-shield negative test — adding an unhandled field fails (Phase 3).

### Integration / E2E:

- `test/e2e/specs/editor/blocks/image.spec.js:244` (crop via modal) is the end-to-end backstop for the whole gesture→reducer→export→block path; must stay green through every phase.

### Manual Testing Steps:

1. Open the media editor on an image; drag-pan, pinch/wheel-zoom, ruler-rotate, snap-rotate, flip — confirm each updates as before.
2. Switch aspect-ratio presets (Free → fixed → Original) and confirm the cropRect reshapes correctly and contained, as **one** undo entry each.
3. Resize the window/canvas repeatedly with a fixed aspect ratio active — confirm cropRect settles with **no render-loop / oscillation** (Phase 2 key check).
4. Exercise undo/redo across a mixed gesture + sidebar sequence — confirm coalescing and dirty state match pre-refactor.
5. Save a cropped image and confirm `onUpdate`/block update still fires (e2e covers this; spot-check manually).

## Performance Considerations

No new hot path introduced. The reshape move (Phase 2) replaces view-side computation with a dispatch that the reducer already performs elsewhere — net work is equal or lower. The shared `stateRef` utility is the same ref mechanism, deduplicated.

## Migration Notes

No data or persisted-state migration. All changes are in-memory React/reducer state internal to `media-editor/src`. No public API or contract change; external consumers (`editor`, block-library via setting) are untouched.

## References

- Research (this change): `context/changes/refactor-opportunities/research.md` — ranking, intentionality verdicts, ast-grep verification (S1–S10), S3b correction.
- Prior research: `context/changes/media-editor-flow/research.md` — feature overview, debt P1–P5.
- Key source: `packages/media-editor/src/state/composite-reducer.ts:32,44,64,109`; `state/use-media-editor-state.ts:97,193,225,389`; `image-editor/react/hooks/use-cropper-reducer.ts:42,118,159`; `image-editor/react/hooks/build-cropper-setters.ts:56`; `image-editor/react/components/cropper.tsx:332,372`.
- Layer rule: `AGENTS.md:64,78`. Owner coordination (P5): Ramon (composite reducer author), Andrew Serong.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Characterization Safety Net

#### Automated

- [ ] 1.1 New composite-reducer golden test passes
- [ ] 1.2 New build-cropper-setters test passes
- [ ] 1.3 Full media-editor package suite green
- [ ] 1.4 Lint passes
- [ ] 1.5 Type-check passes

#### Manual

- [ ] 1.6 Ramon sign-off that the golden test pins intended behavior (atomic aspect-ratio undo contract)
- [ ] 1.7 transforms/pipeline.ts audit note: confirmed pure-geometry consumer, unaffected by Phases 2–3

### Phase 2: Single-Source the Inscribed-Rect Reshape

#### Automated

- [ ] 2.1 Phase-1 dedup/equality assertions still pass
- [ ] 2.2 cropper.tsx tests pass
- [ ] 2.3 Full package suite green
- [ ] 2.4 No remaining computeInscribedRect calls in cropper.tsx (search-verified)
- [ ] 2.5 Lint + type-check pass
- [ ] 2.6 Crop e2e (image.spec.js) passes

#### Manual

- [ ] 2.7 No render-loop on resize with a non-Free aspect ratio active (explicit check)
- [ ] 2.8 Reshape-on-resize visually identical; cropRect contained
- [ ] 2.9 Aspect-ratio change is exactly one undo entry
- [ ] 2.10 Ramon review

### Phase 3: Consolidate Dirty/Baseline + stateRef Idiom and Shield Equality

#### Automated

- [ ] 3.1 Phase-1 dedup/equality assertions still pass
- [ ] 3.2 use-media-editor-state.ts and use-cropper-reducer.ts tests pass
- [ ] 3.3 Full package suite green
- [ ] 3.4 Equality-shield: scratch unhandled field fails compile/test (then reverted)
- [ ] 3.5 Lint + type-check pass

#### Manual

- [ ] 3.6 Undo/redo, gesture coalescing, dirty-tracking identical to pre-refactor
- [ ] 3.7 Standalone useCropperReducer (Storybook/recipes) unchanged
- [ ] 3.8 Ramon review
