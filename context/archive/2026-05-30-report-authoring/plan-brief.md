# Report Authoring (S-06) — Plan Brief

> Full plan: `context/changes/report-authoring/plan.md`

## What & Why

Build the report-authoring surface: a `reports` table, full report CRUD nested under projects, and one form covering all nine fixed report sections (FR-014). This is the core of the maintenance-report flow — the developer authors the report in its final shape — minus the artifacts that bolt on later (PDF, bulk-paste, email). It's the largest slice in the roadmap and the spine the remaining slices attach to.

## Starting Point

Five domain slices are done (projects, brand, plugins catalog, PM contacts, project recurring-plugins), establishing a rigid `schema/queries/form` data triad, POST-only redirect routes, and Astro-page + controlled-React-island forms. The seeding source (`listRecurringPlugins`) and the catalog auto-promote hook (`promoteToCatalog`) already exist and return exactly what this slice needs. There is no `reports` table and — the one genuinely new thing — no existing pattern for a single form that saves multiple variable-length repeaters at once.

## Desired End State

From a project page, a signed-in user clicks "New report" (which seeds the plugins repeater from the project's recurring list), authors all nine sections — adding/removing rows in the plugins, themes, and license-renewals repeaters — clicks Save once to persist the whole report, and can re-edit, re-save, or delete it. Empty sections persist cleanly so the future PDF slice can hide them.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Storage model | One `reports` row; repeaters as `jsonb` columns | Single atomic replace-all save with far less plumbing under the 3-week deadline. | Plan |
| Save strategy | One big native POST, replace-all | Stays on the codebase's POST-redirect rail; one Save = one future PDF (FR-017 mental model). | Plan |
| Seed timing | Materialize recurring plugins into `plugins` JSONB at create-time | Matches the PRD ("user sees existing rows on the empty form"); each report is a frozen per-cycle snapshot. | Plan |
| Section scope | All nine sections authored now | Delivers the complete FR-014 surface so S-07/S-08 bolt onto a finished form. | Plan |
| Row shape | `{name, updated, from/to}` (plugins/themes); `{name, status, expiry?, notes?}` (licenses); no per-row id | Exactly the FR-014 fields; ids are dead weight under replace-all (rows keyed by index). | Plan |
| Auto-promote | Promote every plugin-row name on save (idempotent) | Reuses the existing thin hook; the upsert no-ops on existing names so no diff is needed. | Plan |
| Plugin-name UX | Native `<datalist>` combobox per row | Type-or-pick in one control, no JS library. | Plan |
| Empty sections | Persist as `[]` / `null` | Single empty-state for the PDF slice to hide; clean round-trip. | Plan |
| Identity & routing | uuid at `/projects/[slug]/reports/[id]`, listed per-project | No month-slug collisions (per-cycle re-dos are normal); matches FR-011. | Plan |
| Repeater interactivity | React island add/remove rows, no reorder | Enough to author; row order has no PRD meaning. | Plan |

## Scope

**In scope:** `reports` table + types; `src/lib/reports/{schema,queries,form}`; create (with recurring seed) / list-by-project / get / update (replace-all + catalog promote) / delete; report routes; per-project report list + create action; report edit page; the nine-section authoring form with three repeater islands; free-text plugin auto-promote on save.

**Out of scope:** PDF rendering/download (S-08); WP-CLI bulk-paste parser (S-07); email send / send history / re-send (S-09); drag-reorder; per-row save endpoints; soft-delete; cross-project feed; custom sections; tenancy columns; theme/license name promotion.

## Architecture / Approach

Bottom-up in the established slice order: **schema** (one `reports` table, scalar columns + three `jsonb` repeater columns, project FK cascade, shared `set_updated_at` trigger, closed RLS) → **data layer** (zod row schemas + the indexed-`FormData`↔array serializer/parser that the form and route both depend on + five query functions) → **thin POST routes** that redirect on the project-scoped URL → **pages** (per-project list + create action + edit-page shell) → **the big form** (controlled React island whose scalar fields and three repeaters all render real form inputs, so one native POST carries the entire report). The load-bearing convention is the indexed repeater field naming (`plugins[0].name`, …) defined once in `form.ts`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Schema & migration | `reports` table + regenerated types | Getting JSONB column defaults + FK cascade right |
| 2. Data layer | zod schemas, FormData parser, 5 queries | The indexed-array FormData parser (unchecked-checkbox→false, dense re-index) |
| 3. API routes | create / update / delete POST routes | Redirect targets + replace-all wiring |
| 4. Report list & nav | per-project list, create action, edit-page shell | FR-011 placement; create→seed→open path |
| 5. Authoring form & repeaters | nine-section form + 3 repeater islands | Controlled React rows must serialize correctly into one native POST |

**Prerequisites:** F-01, S-01, S-03, S-05 (all done). A project with a recurring-plugins list and ≥1 catalog entry is needed to exercise seeding/promote.
**Estimated effort:** ~3–4 sessions across 5 phases; Phase 5 (the form) is the bulk.

## Open Risks & Assumptions

- **JSONB diverges from the relational norm** — the rest of the schema uses typed rows + junctions; reports deliberately store repeaters as opaque JSON. Accepted for atomic save + deadline; zod owns the row shape instead of the DB.
- **Repeater serialization into native FormData** is the new pattern with the most failure surface (index gaps, checkbox absence). Mitigated by centralizing the field-name scheme + parser in `form.ts` and unit-testing it later if a harness lands.
- **Post-save edits drift from any later sent PDF** — accepted MVP trade (PRD Open Q2); reports are never locked.
- **No test harness** — verification is the automated gates (`astro check` / `lint` / `build`, judged by exit code per lessons.md) plus manual round-trip steps.

## Success Criteria (Summary)

- A user can create a report (plugins pre-seeded from the project's recurring list), author all nine sections, and Save the whole thing in one action — then re-edit and re-save freely.
- An all-empty report and a fully-filled report both round-trip (save → reload) with values intact; empty sections persist as `[]`/`null`.
- A free-text plugin name typed on a report row appears in the catalog on the next report.
