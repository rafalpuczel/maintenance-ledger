# Branded PDF on Save + Download — Implementation Plan

## Overview

Productionize the F-02 FormePDF rendering pipeline against **real** report and brand data. On the report page the user gets an always-visible "Download PDF" link that renders a branded PDF of the current report — agency logo + brand colors, every empty section hidden, and the agency-internal fields (project internal notes, project contact email) structurally excluded. Save additionally validates that a renderable PDF can be produced, so a saved report is never in a state that can't yield its PDF.

This is roadmap slice **S-08** (`branded-pdf-on-save`); prerequisites S-06 (report-authoring), F-02 (pdf-render-pipeline), and S-02 (brand-settings) are all done and archived.

## Current State Analysis

- **F-02 retired every hard risk.** The FormePDF-on-workerd recipe is proven and recorded in `CLAUDE.md` and `context/archive/2026-05-28-pdf-render-pipeline/`: `await init(wasm)` once per request → `renderDocument(<Doc/>)`; `customConditions: ["worker"]` in `tsconfig.json`; an ambient `declare module "*.wasm"`; font bytes inlined via base64 + `atob` and registered through `Document.fonts`. Verdict **PASS-paid**: wall-clock p95 ~197 ms (~25× under the 5 s NFR), CPU p95 ~172 ms (≪ 30 s paid cap), bundle 7.75 MiB uncompressed (fits the 10 MiB paid cap; the 6.45 MiB wasm engine alone exceeds the free 3 MiB cap). Account is on Workers Paid since 2026-05-28. Synchronous render is explicitly fine — no queue.
- **The spike code was fully deleted** (commit `9f1e856`). `tsconfig.json` (`tsconfig.json:5-12`) has **no** `customConditions`, and `src/env.d.ts` has **no** `*.wasm` declaration. S-08 re-adds both from scratch. `@formepdf/core@^0.10.2` + `@formepdf/react@^0.10.2` remain in `package.json`, imported nowhere.
- **The report data layer is ready.** `getReport(client, id)` (`src/lib/reports/queries.ts:69-75`) returns a fully-typed `Report` — all scalar fields plus `plugins`/`themes`/`licenses` narrowed from `Json` to the zod row shapes (`src/lib/reports/schema.ts`). Emptiness is uniform: untouched scalar text → `null`, untouched repeater → `[]`, untouched boolean → `false`. `report.month` is the frozen `YYYY-MM` cycle label.
- **The brand data layer is ready.** `getBrand(client)` (`src/lib/brand-settings/queries.ts:20-26`) returns `Brand | null`; `logo` is a `data:image/png;base64,…` (or jpeg) URI that FormePDF's `<Image src={…}>` consumes directly — no decode, no fetch. `primary_color`/`secondary_color` are pre-validated hex. F-02 explicitly assigned the null-brand fallback (default colors, omit logo) to S-08.
- **The save flow is POST→redirect.** `POST /api/reports/[id]` (`src/pages/api/reports/[id].ts`) parses the form, calls `updateReport()`, and redirects to `/projects/{slug}/reports/{id}?ok=saved`; the Astro page (`src/pages/projects/[slug]/reports/[id].astro`) re-renders server-side. One Save button, no autosave, no JSON. The page already loads `project` and `report` in its frontmatter — the natural place to surface the download link.
- **No PDF persistence primitive exists.** No R2 binding in `wrangler.jsonc`; the `reports` row has no PDF column. Render-on-demand needs none.
- **Project lookup gap.** `src/lib/projects/queries.ts` exposes `getProjectBySlug` but **no** `getProjectById`. The PDF route has the report `id` (→ `report.project_id`) and needs the project slug to name the file `<slug>-<month>.pdf`; a slim `getProjectById` closes this.

## Desired End State

On the report edit page there is a persistent "Download PDF" control. Clicking it downloads `<project-slug>-<month>.pdf` — a branded PDF of the report exactly as currently saved: logo + brand colors (or sane defaults if brand is unset), header/footer, plugins/themes as paginated tables, every empty section omitted (no header, no "none"), and **no** project internal notes or contact email anywhere. Saving a report validates that this PDF can be produced; if rendering fails, the save surfaces an error rather than silently leaving an unrenderable report.

Verifiable by: `npm run build` + `npx astro check` + `npm run lint` + `npm test` all exit 0; the new section-visibility/no-leak unit tests pass; a manual download of a partially-filled report shows only filled sections and a correct filename; an unauthenticated request to the PDF route is rejected by middleware; `wrangler deploy` exits 0 and the live route returns `application/pdf`.

### Key Discoveries:

- **Workerd render recipe** (`CLAUDE.md:5-6`; `context/archive/2026-05-28-pdf-render-pipeline/plan.md:30,38-52`): `import { init, renderDocument } from "@formepdf/core"` + `import wasm from "@formepdf/core/pkg-web/forme_bg.wasm"`, `await init(wasm)` (idempotent) before each render; `customConditions: ["worker"]` required or `tsc` resolves the no-`init` default types; ambient `*.wasm` decl required; `renderDocument` returns `Uint8Array` — pass `pdf.buffer as ArrayBuffer` as the `Response` body.
- **Template layout gotchas** (`…/plan.md:48-53`): `Page` has **no** `style` prop — page-level defaults go on `Document.style`. Do **not** wrap each section in its own `<View>` (keep-together blocks leave page gaps); let sections flow as direct `Page` children, using fragments for title+table groups. Empty-section hiding is `{cond && <Section/>}` by construction.
- **Astro routing constraints** (`…/plan.md:50`): `.tsx` files are disallowed as `src/pages/` API routes — the route stays `.ts` and builds the document element via a non-JSX `createElement` factory exported from a `.tsx` lib module.
- **Data shapes** already typed: `Report` (`src/lib/reports/queries.ts:13-17`), `Brand` (`src/lib/brand-settings/queries.ts`), row types (`src/lib/reports/schema.ts`).
- **Middleware auto-gates** the new route: `src/middleware.ts` allows only an explicit `PUBLIC_PATHS`/`PUBLIC_PREFIXES` list; `/api/reports/*` is not listed, so the PDF route inherits the session requirement with no new auth code.
- **Vitest has no `@/` alias** (lessons.md): modules under `src/lib/<domain>/` must import siblings relatively (`./sections`, `./schema`), or `npm test` fails at collection.

## What We're NOT Doing

- **No PDF persistence** — no R2 bucket, no Supabase Storage, no `pdf` column. Render-on-demand only. (Re-rendering is ~197 ms; freezing the artifact is unnecessary and post-send edit divergence is an accepted MVP trade — Roadmap Q2.)
- **No async/queue** — synchronous render; F-02 proved it fits the NFR and `CLAUDE.md` says no queue is needed.
- **No PDF preview before save / inline view** — explicitly parked; download-to-view is the model (attachment, not inline).
- **No persisting bytes inside the save POST** — save validates renderability; the bytes are produced at download time by the GET route.
- **No multi-weight font matrix, no charts/QR/forms** — one Inter weight, latin subset; only Text/View/Image/Table/Row/Cell/Fixed.
- **No send/email** — that is S-09. This slice stops at the download link.
- **No per-project brand, no second locale font** — single agency brand, English reports.
- **No CI gating of PDF rendering as a pipeline** — unit tests cover the visibility/no-leak logic; the render itself is upstream-tested and F-02-proven.

## Implementation Approach

Three phases ordered so each is independently verifiable and the riskiest wiring lands first. Phase 1 re-establishes the proven workerd plumbing and a production render helper, verified by a successful typecheck/build (the bundle must still compile with the wasm import). Phase 2 builds the branded template and — critically — extracts the FR-017 section-visibility logic and the no-leak prop boundary into a **pure, unit-tested** module, so the two must-have guardrails have deterministic regression coverage independent of FormePDF's byte output. Phase 3 wires the user-visible surface: the GET route (auth-gated, correct filename, brand fallback), the always-visible download link, and a validate-render hook on save.

The no-leak rule is enforced **by construction**: the template's prop type accepts only `Report` + `Brand`, never the project's internal notes or contact email, so the forbidden data is never in scope to render. The PDF route loads `getReport()` + `getBrand()` (+ a slim project lookup for the filename only).

## Critical Implementation Details

- **WASM init ordering** — `await init(wasm)` must complete before the first `renderDocument` in the request; `init` is idempotent so calling it at the top of the render helper every time is correct. The `wasm` value must be the `WebAssembly.Module` imported from `@formepdf/core/pkg-web/forme_bg.wasm` (Vite/`@astrojs/cloudflare` v13 inlines it into the JS bundle; no `CompiledWasm` binding needed).
- **Filename resolution** — the route knows the report `id`, hence `report.project_id`, but the filename needs the project slug. Resolve it with a new `getProjectById(client, id)` (returns at least `{ slug, month-irrelevant }`). Set `Content-Disposition: attachment; filename="<slug>-<month>.pdf"` server-side; a client-only `download` attribute can't name a cross-navigation GET reliably.
- **Brand fallback** — when `getBrand()` is `null` or `brand.logo` is `null`, use module-level default colors and omit the `<Image>`. Do not block render. (F-02 proved the no-logo path.)

## Phase 1: PDF Infrastructure + Production Render Helper

### Overview

Re-establish the workerd wiring the spike removed and provide a single production render entry point. No template content yet beyond what the helper needs to compile and smoke-render.

### Changes Required:

#### 1. TypeScript worker condition

**File**: `tsconfig.json`

**Intent**: Make `tsc`/`astro check` resolve `@formepdf/core` against its `worker` export condition so the `init` export is visible (matches the runtime condition).

**Contract**: Add `"customConditions": ["worker"]` to `compilerOptions`. (Per F-02, without this `astro check` errors `has no exported member 'init'`.)

#### 2. Ambient `.wasm` module declaration

**File**: `src/env.d.ts` (edit)

**Intent**: Type the `forme_bg.wasm` import as a `WebAssembly.Module` so the strict build accepts it.

**Contract**: `declare module "*.wasm" { const mod: WebAssembly.Module; export default mod; }` added alongside the existing `App.Locals` namespace.

#### 3. Bundled brand font

**File**: `src/lib/pdf/font.ts` (new) + the source font asset

**Intent**: Ship one permissively-licensed Inter weight (latin subset) as inline bytes for the brand typeface, decoded workerd-safely. Mirrors the proven F-02 mechanism.

**Contract**: Export `BRAND_FONT: Uint8Array` decoded from a base64 string via `atob` (no edge asset loading). Family name (e.g. `"Brand"`) exported for the template to register. ~17 KB raw / ~23 KB base64. OFL/permissive source.

#### 4. Production render helper

**File**: `src/lib/pdf/render.ts` (new)

**Intent**: Encapsulate the workerd init contract + font registration in one place so callers pass a document element and get bytes back.

**Contract**: `renderReportPdf(element: ReactElement): Promise<Uint8Array>` — `await init(wasm)` then `renderDocument(element)`. The import specifiers and init-before-render ordering are load-bearing (follow `@formepdf/core/dist/worker.d.ts` verbatim):

```ts
import { init, renderDocument } from "@formepdf/core";
import wasm from "@formepdf/core/pkg-web/forme_bg.wasm";

export async function renderReportPdf(element: import("react").ReactElement): Promise<Uint8Array> {
  await init(wasm); // idempotent; must precede renderDocument under the worker condition
  return renderDocument(element);
}
```

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check` (exit 0 — confirms `customConditions` + wasm decl resolve `init` and the import)
- Build succeeds with the wasm import bundled: `npm run build` (exit 0)
- Lint passes: `npm run lint` (exit 0; judge by exit code per lessons.md)

#### Manual Verification:

- A throwaway/dev invocation of `renderReportPdf` with a trivial `<Document><Page><Text>` element on `npm run dev` (real workerd) returns a non-empty buffer that opens as a valid PDF — confirms `init(wasm)` succeeds and the bundle delivers a usable `WebAssembly.Module` before any template work.

**Implementation Note**: After automated verification passes, pause for manual confirmation that a trivial PDF renders on local workerd before building the full template. If the wasm import does not bundle as a module, resolve the bundling approach (alternate specifier / adapter config) before proceeding. Phase blocks use plain bullets; checkbox state lives in `## Progress`.

---

## Phase 2: Branded Report Template + Section-Visibility Module

### Overview

Build the production document factory taking `(report, brand)` and the pure logic that decides which sections render and supplies brand defaults. The pure module is unit-tested; it is where FR-017 (empty-section hiding) and the no-leak boundary are enforced and regression-guarded.

### Changes Required:

#### 1. Section-visibility + brand-default logic (pure, tested)

**File**: `src/lib/pdf/sections.ts` (new) + `src/lib/pdf/sections.test.ts` (new)

**Intent**: House the pure decisions so they're testable without rendering: per-section "is this meaningful" predicates and the brand fallback. Keep the template a thin consumer of these.

**Contract**: Exports for each section a predicate over `Report` that returns whether it has real content — repeaters when `length > 0`; scalar sections only when their constituent field(s) are non-null/non-empty (PHP shows only if `php_from_version`/`php_to_version` set or `php_updated` true; integrity only if `integrity_status`/`integrity_issues` present; WP core, fixes, notes-to-client when their field is non-null). Plus a `resolveBrand(brand: Brand | null)` returning `{ primaryColor, secondaryColor, logo: string | null }` with module-level defaults when brand/logo is null. Import any sibling (`./schema` types) **relatively** (vitest has no `@/` alias). The test asserts: empty report → no section visible; a report with only `plugins` → only the plugins section; PHP with only `php_updated:false` → PHP hidden; and `resolveBrand(null)` → defaults + `logo:null`.

#### 2. No-leak template prop boundary

**File**: `src/lib/pdf/report-document.tsx` (new — prop types)

**Intent**: Make leaking project internal notes / contact email structurally impossible by accepting only report + brand data.

**Contract**: The factory's props type is exactly `{ report: Report; brand: Brand | null }` (no project internals; the only client-facing free-text is `report.notes_to_client`). Do **not** widen to accept the project row. (The route may pass the project slug separately for the filename, but it never reaches the template.)

#### 3. Branded document factory

**File**: `src/lib/pdf/report-document.tsx` (same file)

**Intent**: Return the full FormePDF element tree — `Document` (metadata + default `style` using the registered brand font and resolved brand color), a `Fixed` header with the logo `Image` (when present) + agency name, a `Fixed` footer with page numbers, then each FR-014 section rendered only when its `sections.ts` predicate is true. Plugins and themes render as `Table` with an auto-repeating header `Row`; licenses as a simple list/table. Built via `createElement` (non-JSX export name) so the `.ts` route can call it.

**Contract**: `reportDocument({ report, brand }: ReportDocumentProps): ReactElement`. Registers the brand font via `Document.fonts={[{ family, src: BRAND_FONT }]}`; page defaults on `Document.style` (never on `Page`). Sections flow as direct `Page` children (fragments for title+table groups), not individually `View`-wrapped. Uses only Text/View/Image/Table/Row/Cell/Fixed. Straightforward composition — no snippet needed beyond the F-02 component references.

### Success Criteria:

#### Automated Verification:

- Section-visibility + brand-default unit tests pass: `npm test` (exit 0)
- Type checking passes: `npx astro check` (exit 0)
- Build succeeds (template + font bundled): `npm run build` (exit 0)
- Lint passes: `npm run lint` (exit 0)

#### Manual Verification:

- Rendering a representative report (≈30 plugin rows, a few themes, one empty section such as licenses) via the dev path produces a branded multi-section PDF: logo in the header, page numbers in the footer, plugins/themes as paginated tables with the header row repeated, custom font visibly applied.
- The empty section does not appear — no header, no "none" placeholder.
- A report containing project internal notes / a contact-email-shaped string in internal fields shows neither anywhere in the PDF (manual scan).

**Implementation Note**: After automated verification passes, pause for manual confirmation that the branded full-section PDF renders correctly — custom font, empty-section hiding, and no leaked internal fields — before wiring the route and UX.

---

## Phase 3: PDF Route + Download Link + Validate-on-Save

### Overview

Expose the user-visible surface: an auth-gated GET route that renders the current report as a correctly-named PDF, an always-visible download link on the report page, and a save-time check that a renderable PDF can be produced.

### Changes Required:

#### 1. Slim project-by-id lookup (for filename)

**File**: `src/lib/projects/queries.ts` (edit)

**Intent**: Let the PDF route resolve the project slug from the report's `project_id` to name the file, without exposing project internals to the template.

**Contract**: `getProjectById(client, id): Promise<Project | null>` mirroring `getProjectBySlug` (`select("*").eq("id", id).maybeSingle()`). Returns the existing `Project` type; the route reads only `.slug` from it.

#### 2. PDF render route

**File**: `src/pages/api/reports/[id]/pdf.ts` (new)

**Intent**: Render the current report to a branded PDF and return it as a downloadable attachment. Inherits the session gate from middleware automatically.

**Contract**: `export const GET: APIRoute` — read `id` from params; `getReport(client, id)` (404/redirect if missing); `getBrand(client)`; `getProjectById(client, report.project_id)` for the slug; `renderReportPdf(reportDocument({ report, brand }))`; return `new Response(pdf.buffer as ArrayBuffer, { headers: { "content-type": "application/pdf", "content-disposition": 'attachment; filename="<slug>-<month>.pdf"' } })`. Slugify defensively for the filename. On render/load error, return a non-200 (or redirect to the report page with `?error=`), matching the app's error conventions.

#### 3. Download link on the report page

**File**: `src/pages/projects/[slug]/reports/[id].astro` (edit)

**Intent**: Surface a persistent "Download PDF" control near the report header so the user can download anytime (render-on-demand means it is always valid).

**Contract**: An anchor to `/api/reports/${report.id}/pdf` styled as a button, placed alongside the existing back-link / delete-button row. No client JS needed (plain link). Always visible (not gated on `?ok=saved`).

#### 4. Validate-render on save

**File**: `src/pages/api/reports/[id].ts` (edit)

**Intent**: Honor FR-017's "produces an updated branded PDF … before the save completes" by ensuring a saved report is always renderable — fail the save if it is not, rather than persisting a report whose PDF can't be produced.

**Contract**: After `updateReport()` succeeds, load the fresh report + brand and attempt `renderReportPdf(reportDocument(...))` (discard the bytes). On success, redirect `?ok=saved` as today. On render failure, redirect `?error=<message>` so the failure is visible. (Bytes are not stored; the GET route re-renders on download.) Keep the added latency within the 5 s NFR — F-02 headroom is ample.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check` (exit 0)
- Build succeeds: `npm run build` (exit 0)
- Lint passes: `npm run lint` (exit 0)
- Existing + new unit tests pass: `npm test` (exit 0)

#### Manual Verification:

- The report page shows a "Download PDF" link; clicking it downloads a file named `<project-slug>-<month>.pdf` that opens as the branded report.
- A partially-filled report's PDF shows only the filled sections (empty ones omitted) and reflects the most recent save.
- With brand unset, the PDF still renders (default colors, no logo); with brand set, the real logo + colors appear.
- An unauthenticated `GET /api/reports/{id}/pdf` is rejected by middleware (redirect to `/login`).
- Saving a normal report still redirects to `?ok=saved`; the save→download round trip is comfortably under 5 s.
- `wrangler deploy` exits 0 and the live route returns `application/pdf` for an authenticated request.

**Implementation Note**: After automated verification passes, pause for manual confirmation of the full download UX (filename, branding, empty-section hiding, brand fallback, auth rejection) and a live-deploy check before closing the slice.

---

## Testing Strategy

### Unit Tests:

- `src/lib/pdf/sections.test.ts` — the FR-017 + no-leak surface, rendered deterministically without FormePDF:
  - empty `Report` → every section predicate false (nothing renders).
  - report with only `plugins` (length > 0) → only the plugins section visible; themes/licenses/scalar sections hidden.
  - PHP section: visible only when `php_from_version`/`php_to_version` set or `php_updated` true; a report with `php_updated:false` and null versions → hidden.
  - integrity section: visible only when `integrity_status` or `integrity_issues` non-null.
  - `resolveBrand(null)` → default colors + `logo:null`; `resolveBrand(brandWithLogo)` → passes the data-URI through.
- Import siblings relatively (no `@/`), per the vitest-alias lesson.

### Integration Tests:

- The deployed `GET /api/reports/{id}/pdf` is the integration check: real request path through middleware → `getReport`/`getBrand` → render → `application/pdf` response. Verified manually (download + open) rather than via an automated render-in-CI, since wasm-init under vitest's node env is not part of this slice's scope.

### Manual Testing Steps:

1. `npm run dev` → open a report → click "Download PDF" → confirm a branded, multi-section PDF with logo header, footer page numbers, paginated tables, custom font, and empty sections omitted; filename is `<slug>-<month>.pdf`.
2. Clear brand in Settings → re-download → confirm default colors + no logo, still valid.
3. Put an email-shaped string in an internal field (not notes-to-client) → confirm it appears nowhere in the PDF.
4. Hit `/api/reports/{id}/pdf` unauthenticated → confirm redirect to `/login`.
5. Save a report → confirm `?ok=saved` and that the round trip is well under 5 s; force a render failure path (if feasible) → confirm `?error=`.
6. `wrangler deploy` → repeat (1) and (4) against the live URL.

## Performance Considerations

F-02 measured the render at ~197 ms wall-clock p95 / ~172 ms CPU p95 for the representative payload — ~25× under the 5 s NFR and well within the 30 s paid CPU cap. Render-on-demand adds the brand + report + project reads (single indexed PostgREST lookups, O(1)) before render; the validate-on-save path adds one render to the save POST. Both stay far inside budget. The deployed bundle (~7.75 MiB uncompressed, dominated by the 6.45 MiB wasm engine) fits the 10 MiB Workers Paid cap; the added font (~23 KB) and template are negligible. Watch live p95 via `wrangler tail --format json` (`cpuTime`/`wallTime` per event).

## Migration Notes

None — no schema change, no migration, no persisted PDF state. Pure code additions plus two tsconfig/ambient-type edits.

## References

- Roadmap S-08: `context/foundation/roadmap.md:180-190`
- PRD FR-017 / FR-018 / US-01 / no-leak + 5 s NFR: `context/foundation/prd.md` (FR-017 line 107, FR-018 line 109, US-01 lines 51-64, no-leak line 124, latency line 122)
- F-02 verdict + recipe: `context/archive/2026-05-28-pdf-render-pipeline/verdict.md`, `context/archive/2026-05-28-pdf-render-pipeline/plan.md`
- FormePDF workerd recipe + Workers Paid requirement: `CLAUDE.md:4-9`
- Report data layer: `src/lib/reports/queries.ts`, `src/lib/reports/schema.ts`
- Brand data layer: `src/lib/brand-settings/queries.ts`
- Save flow + report page: `src/pages/api/reports/[id].ts`, `src/pages/projects/[slug]/reports/[id].astro`
- Auth gate: `src/middleware.ts`
- Lessons (lint exit codes; zod v4; vitest `@/` alias): `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: PDF Infrastructure + Production Render Helper

#### Automated

- [x] 1.1 Type checking passes: `npx astro check` — f9ef064
- [x] 1.2 Build succeeds with the wasm import bundled: `npm run build` — f9ef064
- [x] 1.3 Lint passes: `npm run lint` — f9ef064

#### Manual

- [x] 1.4 A trivial `renderReportPdf` call on local workerd returns a valid PDF (init + wasm bundle confirmed) — f9ef064

### Phase 2: Branded Report Template + Section-Visibility Module

#### Automated

- [x] 2.1 Section-visibility + brand-default unit tests pass: `npm test` — 52b2eac
- [x] 2.2 Type checking passes: `npx astro check` — 52b2eac
- [x] 2.3 Build succeeds (template + font bundled): `npm run build` — 52b2eac
- [x] 2.4 Lint passes: `npm run lint` — 52b2eac

#### Manual

- [x] 2.5 Branded full-section PDF renders (logo header, footer page numbers, paginated tables, custom font) — 52b2eac
- [x] 2.6 Empty section is omitted (no header, no "none" placeholder) — 52b2eac
- [x] 2.7 No internal notes / contact-email-shaped string appears anywhere in the PDF — 52b2eac

### Phase 3: PDF Route + Download Link + Validate-on-Save

#### Automated

- [x] 3.1 Type checking passes: `npx astro check` — 91e3561
- [x] 3.2 Build succeeds: `npm run build` — 91e3561
- [x] 3.3 Lint passes: `npm run lint` — 91e3561
- [x] 3.4 Existing + new unit tests pass: `npm test` — 91e3561

#### Manual

- [x] 3.5 "Download PDF" link downloads `<project-slug>-<month>.pdf` as the branded report — 91e3561
- [x] 3.6 Partially-filled report's PDF shows only filled sections, reflecting the latest save — 91e3561
- [x] 3.7 Brand unset → default colors + no logo; brand set → real logo + colors — 91e3561
- [x] 3.8 Unauthenticated `GET /api/reports/{id}/pdf` is rejected by middleware — 91e3561
- [x] 3.9 Normal save still redirects `?ok=saved`; save→download round trip under 5 s — 91e3561
- [x] 3.10 `wrangler deploy` exits 0 and the live route returns `application/pdf` — 91e3561
