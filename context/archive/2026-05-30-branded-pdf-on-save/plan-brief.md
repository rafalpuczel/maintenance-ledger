# Branded PDF on Save + Download — Plan Brief

> Full plan: `context/changes/branded-pdf-on-save/plan.md`

## What & Why

Roadmap slice **S-08**: give the user a branded PDF of any report, on demand, via a visible "Download PDF" link on the report page (FR-018), with the agency brand applied and empty sections hidden (FR-017). It productionizes the F-02 render pipeline — which proved FormePDF works on Cloudflare Workers — against real report and brand data, and is the last enabler before the north star S-09 (emailing that PDF).

## Starting Point

F-02 already proved FormePDF renders a branded, paginated, custom-font PDF on workerd (verdict PASS-paid, ~197 ms p95, ~25× under the 5 s NFR) and left a documented init/bundle recipe — but the spike code was fully deleted, so `tsconfig.json` and `src/env.d.ts` carry none of the wiring today. The report data layer (`getReport` → fully-typed `Report` with `plugins`/`themes`/`licenses`), the brand layer (`getBrand` → `Brand`, `logo` as a ready-to-embed data-URI), the POST→redirect save flow, and the all-routes auth gate all already exist.

## Desired End State

The report edit page shows a persistent "Download PDF" link that downloads `<project-slug>-<month>.pdf` — the report as currently saved, with logo + brand colors (or sane defaults if brand is unset), every empty section omitted, and zero agency-internal data (project internal notes, contact email) anywhere in it. Saving validates that a renderable PDF can be produced.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Delivery & storage | Render-on-demand GET route | Zero new infra/schema, link never goes stale vs saved data, ~197 ms render is cheap | Plan |
| "Before save completes" (FR-017) | Validate render on save, serve via GET | Honors the intent without coupling save latency to byte storage; fits the existing POST→redirect flow | Plan |
| Empty-section rule | Hide unless a section's field(s) are non-null / repeater non-empty | Matches FR-017 ("no headers, no 'none'") and the uniform null/`[]` data model | Plan |
| No-leak guard | Template prop type accepts only `Report` + `Brand` | Forbidden fields are never in scope to render — enforced by construction | Plan |
| Brand missing | Default colors, omit logo (don't block) | PDF always renders; F-02 assigned this fallback to S-08 and proved the no-logo path | Plan |
| Font | Re-bundle one Inter subset, inline via base64+`atob` | Proven F-02 mechanism, no edge asset loading, ~23 KB | Plan |
| Download UX | Always-visible link; filename `<slug>-<month>.pdf` | Valid anytime under render-on-demand; meaningful filename for agency records | Plan |
| Testing | Unit-test section-visibility + no-leak logic | Deterministic regression guard on the two must-have guardrails; render itself is F-02-proven | Plan |

## Scope

**In scope:** workerd wiring (`customConditions`, ambient `*.wasm`); inline brand font; `renderReportPdf` helper; branded `(report, brand)` template; pure tested section-visibility/brand-default module; `GET /api/reports/[id]/pdf` (auth-gated, named download, brand fallback); always-visible download link; validate-render on save; slim `getProjectById` for the filename.

**Out of scope:** PDF persistence (no R2/Storage/column), async/queue, inline preview, storing bytes on save, multi-weight fonts, email/send (S-09), per-project brand, CI render gating.

## Architecture / Approach

`GET /api/reports/[id]/pdf` loads `getReport` + `getBrand` (+ `getProjectById` for the filename only), builds the document via a `createElement` factory in a `.tsx` lib module (Astro bars `.tsx` routes), and renders through `renderReportPdf` (`init(wasm)` → `renderDocument`), returning `application/pdf` as an attachment. The template consumes only report + brand data, so internal fields can't leak. Section visibility and brand defaults live in a pure, unit-tested module. The report page gains a static link to that route; the save POST additionally does a throwaway render to fail unsaveable-as-PDF reports. No bytes are persisted — every download re-renders the current data.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. PDF infra + render helper | `customConditions`/wasm wiring, inline Inter font, `renderReportPdf()` | wasm import must bundle as a module under `@astrojs/cloudflare` v13 (F-02-proven; re-verify) |
| 2. Template + section-visibility module | `(report, brand)` factory + pure tested FR-017/no-leak logic | getting empty-section predicates right; not widening props to leak internals |
| 3. PDF route + download link + validate-on-save | auth-gated named GET route, always-visible link, save-time render check | filename slug resolution (`getProjectById`); keeping save latency under the 5 s NFR |

**Prerequisites:** S-06, F-02, S-02 (all done). Workers Paid (active since 2026-05-28). `@formepdf/*` already in `package.json`.
**Estimated effort:** ~2-3 sessions across 3 phases — mostly template + wiring; the hard PDF/workerd risk is already retired.

## Open Risks & Assumptions

- Re-rendering on every download is assumed acceptable (it is, at ~197 ms); the artifact is not frozen, consistent with the accepted post-send edit-divergence trade (Roadmap Q2).
- The validate-render-on-save step assumes a render failure is the only "PDF can't be produced" signal worth surfacing; it adds one render to each save (well within budget).
- Assumes the agency's reports are English/latin (single-subset font); a non-latin need would require a second font.

## Success Criteria (Summary)

- From the report page, the user downloads a correctly-named branded PDF that matches the saved report, with empty sections hidden and no agency-internal data present.
- With brand unset the PDF still renders (defaults, no logo); with brand set the real logo + colors appear; the route is auth-gated.
- `build` + `astro check` + `lint` + `test` all green (incl. the new section-visibility/no-leak tests), and `wrangler deploy` serves the live route.
