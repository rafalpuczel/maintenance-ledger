# Report Authoring (S-06) Implementation Plan

## Overview

Build the report-authoring surface for roadmap slice **S-06**: a `reports` table, full report CRUD nested under projects, and a single authoring form covering all nine fixed report sections (FR-014). New reports are seeded at create-time with the project's recurring plugins (FR-009 consumption); free-text plugin names typed on report rows are auto-promoted into the catalog on save (FR-003 consumption). This slice is a **pure authoring surface** — PDF generation (S-08), WP-CLI bulk-paste (S-07), and email send (S-09) are explicitly out of scope and bolt onto the finished form later.

PRD refs delivered: FR-010 (create), FR-011 (per-project list), FR-012 (edit any field), FR-013 (delete), FR-014 (fixed section set), FR-016 (per-row add/edit/remove in plugins/themes/licenses), and the authoring half of US-01.

## Current State Analysis

Five domain slices are done and establish rigid conventions this slice copies exactly:

- **Data-access triad** — every domain is `src/lib/<domain>/{schema.ts, queries.ts, form.ts}`. `schema.ts` uses zod v4 top-level validators (`z.email()`, `z.url()`, `z.uuid()` — never the deprecated `.string().x()` chain, per `context/foundation/lessons.md`). `queries.ts` takes a `SupabaseClient<Database>`, throws `new Error(error.message)` on generic failures, and defines custom `Error` subclasses for the unique-violation code `23505` (e.g. `AlreadyOnListError` in `src/lib/project-recurring-plugins/queries.ts:22`). `form.ts` parses `FormData` into a `ParseResult` discriminated union (`{ ok: true; data } | { ok: false; message }`), reporting the first zod issue only.
- **Routes are POST-only + redirect** — no JSON/fetch anywhere in the app. Routes live at `src/pages/api/<domain>/{index.ts (create), [id].ts (update), [id]/delete.ts}`, read `context.request.formData()`, validate via the form parser, call a query with a fresh `createSupabaseClient()`, and `context.redirect(...)` with `?ok=<code>` / `?error=<msg>` query params (`src/pages/api/projects/index.ts:6`).
- **Astro page + React island** — `.astro` frontmatter creates a per-request client, loads data in parallel (`Promise.all`), reads `Astro.url.searchParams` for `ok`/`error`, maps `ok` codes to human messages inline, and passes props to a `client:load` React island. Islands are controlled components with field-level errors, light client validation in `onSubmit` (typed `React.SubmitEvent<HTMLFormElement>` — **not** the deprecated `React.FormEvent`, per lessons.md), `noValidate` on the `<form>`, and native `method="POST"` submission (`src/components/projects/ProjectForm.tsx`, `src/pages/projects/[slug].astro`).
- **Migrations** — `supabase/migrations/<YYYYMMDDHHmmss>_create_*.sql`. All tables: `uuid primary key default gen_random_uuid()` (needs `create extension if not exists pgcrypto;`), `created_at`/`updated_at timestamptz not null default now()` with a `before update` trigger calling the shared `public.set_updated_at()` (defined once in the projects migration), snake_case names, and `alter table ... enable row level security;` with **no policies** (the Worker uses `SUPABASE_SECRET_KEY` which bypasses RLS; enabling-with-no-policies is the closed default). Types regenerate via `npm run db:types` (`supabase gen types --linked`).
- **Seeding source already returns the right shape** — `listRecurringPlugins(client, projectId)` (`src/lib/project-recurring-plugins/queries.ts:48`) returns `{ id, pluginId, name, notes }[]` flattened from the `project_recurring_plugins` ↔ `plugin_catalog` join. This slice copies the `name` of each into a seeded plugin row.
- **Auto-promote hook already exists** — `promoteToCatalog(client, name)` (`src/lib/plugins-catalog/queries.ts:66`) is an idempotent upsert on the generated `name_key` column; blank names no-op. This slice calls it per plugin-row name on save.

What's missing: there is no `reports` table, no `src/lib/reports/`, no report routes, no report pages, and — critically — **no existing pattern for a single form that saves multiple variable-length repeaters atomically**. Every existing form saves one flat record (projects) or adds/deletes one row at a time (recurring plugins). The multi-repeater single-POST form is the genuinely new ground here.

## Desired End State

A signed-in user, from a project's detail page, can:
1. Click "New report" → a report is created, its month auto-derived from the creation date, and its plugins repeater pre-seeded with the project's recurring plugins; they land on the report's edit page.
2. See a per-project list of that project's reports (newest first, showing month + created date).
3. Author all nine sections — month (read-only, auto), WP core (version + updated), PHP (updated + from/to), plugins repeater, themes repeater, integrity checks (status + issues list), fixes applied, license renewals repeater, notes to client — adding/removing rows in the three repeaters, with plugin-row names offering catalog suggestions via a combobox.
4. Click Save once → the whole report (scalars + all repeater rows) persists in a single POST; every plugin-row name is promoted into the catalog; they see a "saved" confirmation. Empty sections persist cleanly (`[]` / `null`) so the future PDF slice can hide them.
5. Edit and re-save any field any number of times (no locking).
6. Delete a report.

Verification: the round-trip (create → seed visible → edit every section → save → reload → values intact) works; an all-empty report saves and reloads without error; a free-text plugin name appears in the catalog dropdown on the next report; `npm run db:types && npm run lint && npm run build && npx astro check` all pass.

### Key Discoveries:

- **JSONB repeaters on one `reports` row** (user decision) — scalars are real columns; `plugins`, `themes`, `licenses` are `jsonb not null default '[]'`. zod owns the row-array shapes; the DB stores opaque arrays. This diverges from the relational `project_recurring_plugins` junction style but is the chosen trade for a single atomic replace-all save under the deadline.
- **Replace-all save** (user decision) — the update route overwrites the whole `reports` row including all three JSONB arrays in one `update`. No per-row endpoints, no diffing. One Save = one future PDF (FR-017 mental model).
- **Seed materializes into the `plugins` JSONB at create-time** (user decision) — `createReport` reads `listRecurringPlugins` and writes the seeded names as plugin rows into the `plugins` column on the initial insert. Later edits to the project's recurring list do **not** retro-fill existing reports (each report is a per-cycle snapshot — correct per PRD).
- **Repeater row shapes** (user decision): plugin/theme row = `{ name: string, updated: boolean, from_version: string | null, to_version: string | null }`; license row = `{ name: string, status: "expired" | "expiring", expiry_date: string | null, notes: string | null }`. No per-row id (replace-all makes ids dead weight); the form keys rows by array index.
- **Combobox via native `<datalist>`** (user decision) — each plugin-row name field is a text input backed by a `<datalist>` of catalog names; type-or-pick in one control. No JS combobox library.
- **Empty = `[]` / `null`** (user decision) — untouched repeaters persist as `[]`, untouched scalars as `null`/`false`. Single empty-state for the PDF slice to check.
- **uuid identity, nested route** (user decision) — reports addressed by uuid at `/projects/[slug]/reports/[id]`; listed within the project (FR-011). No month-slug (per-cycle collisions are normal).
- **Free-text promote on save** (user decision) — the update route calls `promoteToCatalog` for every plugin-row name (idempotent; the diff would be redundant).

## What We're NOT Doing

- **No PDF generation / rendering / download** — that is S-08 (`branded-pdf-on-save`). This slice does not import FormePDF, render anything, or add a download link.
- **No WP-CLI bulk-paste parser** — that is S-07. The repeaters are filled by individual row add/edit only. (The combobox name field is built so S-07 can later inject parsed rows.)
- **No email send / send history / re-send** — that is S-09.
- **No drag-to-reorder** of repeater rows — row order has no PRD meaning.
- **No per-row save endpoints** — the whole report saves in one POST (replace-all).
- **No soft-delete / archive** — report delete is hard delete (mirrors projects).
- **No cross-project reports feed** — reports are listed per-project only (FR-011); a global feed is post-MVP.
- **No custom/freeform sections** — the nine-section list is fixed (FR-014).
- **No agency_id / tenancy columns** — single-tenant lock (roadmap Open Question 3; explicit tech-stack instruction not to pre-build tenancy).
- **No theme-name auto-promote** — FR-003 auto-promote is specified for the plugins catalog only; theme/license names are free-text and are not promoted anywhere.

## Implementation Approach

Bottom-up, mirroring the established slice order (schema → data layer → routes → pages → islands), so each layer is verifiable before the next builds on it:

1. **Schema** lands the `reports` table with the JSONB columns and regenerates `Database` types so the data layer is type-safe.
2. **Data layer** encodes the report contract once: zod schemas for scalars and the three row arrays, a `FormData`↔report serializer/parser (the indexed-field convention that the form and route share), and the five query functions (create-with-seed, get, list, update-replace-all-with-promote, delete).
3. **Routes** are thin POST adapters over the data layer, redirecting on the project-scoped URL.
4. **Pages** wire the per-project list, the create action, and the author/edit page; report-list rendering proves the read path before the heavy form exists.
5. **Form & repeater islands** are the largest piece: the scalar section fields plus three React repeater components, all wired to real form inputs so a single native POST carries everything.

## Critical Implementation Details

**FormData serialization of repeater arrays (the load-bearing convention).** Because the app uses native POST (not JSON), the three repeater arrays must round-trip through `FormData`. Use indexed field names: `plugins[0].name`, `plugins[0].updated`, `plugins[0].from_version`, … `themes[1].name`, `licenses[0].status`, etc. The React island renders these names on real (controlled) inputs; `form.ts` reconstructs the arrays by scanning keys for each repeater prefix and grouping by index. A checkbox that is unchecked sends no key — `parse` must treat a missing `updated` key as `false`. This serializer/parser is defined once in `src/lib/reports/form.ts` and is the single contract the form (write side) and route (read side) both depend on; get it right here and both sides follow.

**Seeding writes into JSONB, not child rows.** `createReport` must call `listRecurringPlugins(client, projectId)` and map each to a plugin row `{ name, updated: false, from_version: null, to_version: null }`, then insert the `reports` row with that array as the `plugins` column value. This is a one-time copy at creation; nothing keeps it in sync afterward (by design).

**Month is server-derived, never user-entered.** On `createReport`, compute the month from the creation date server-side (store it as a `month` text column, e.g. `"2026-05"`, or derive from `created_at` at read time — store it explicitly so the value is frozen to the creation cycle even though `created_at` is also present). The form shows it read-only.

## Phase 1: Schema & migration

### Overview

Create the `reports` table following the established migration conventions, then regenerate the TypeScript `Database` types so every later layer is type-checked against the real schema.

### Changes Required:

#### 1. Reports migration

**File**: `supabase/migrations/<new-timestamp>_create_reports.sql` (timestamp later than `20260530131236`)

**Intent**: Define the `reports` table holding one row per maintenance report — scalar section fields as real columns and the three repeaters as JSONB arrays — scoped to a project via a cascading FK, with the shared updated-at trigger and closed RLS.

**Contract**: Columns —
- `id uuid primary key default gen_random_uuid()`
- `project_id uuid not null references public.projects (id) on delete cascade`
- `month text not null` — frozen cycle label derived at create-time (e.g. `"2026-05"`)
- WP core: `wp_core_version text`, `wp_core_updated boolean not null default false`
- PHP: `php_updated boolean not null default false`, `php_from_version text`, `php_to_version text`
- Integrity: `integrity_status text` (free text status per FR-014 "passed / issues found"; nullable when untouched), `integrity_issues text` (the issues list as free text)
- `fixes_applied text`
- `notes_to_client text`
- Repeaters: `plugins jsonb not null default '[]'::jsonb`, `themes jsonb not null default '[]'::jsonb`, `licenses jsonb not null default '[]'::jsonb`
- `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`

Plus: `create index reports_project_id_idx on public.reports (project_id);` (per-project listing is the primary read), the `reports_set_updated_at` `before update` trigger calling `public.set_updated_at()`, `create extension if not exists pgcrypto;` at the top, and `alter table public.reports enable row level security;` with no policies. Follow the exact DDL idiom of `supabase/migrations/20260529144131_create_projects.sql`.

#### 2. Regenerate database types

**File**: `src/types/database.types.ts` (generated, do not hand-edit)

**Intent**: Refresh the generated types so `Database["public"]["Tables"]["reports"]` exists for the data layer. The JSONB columns will type as `Json`; the data layer casts them to the zod-derived row types on read.

**Contract**: Run `npm run db:types` after the migration is applied to the linked DB (and/or `npx supabase db reset --local` for local per the local-dev topology). No manual edits.

### Success Criteria:

#### Automated Verification:

- [ ] Migration file exists and follows the naming/DDL conventions: `ls supabase/migrations/*_create_reports.sql`
- [ ] Migration applies cleanly against local Supabase: `npx supabase db reset --local`
- [ ] Types regenerate and include the reports table: `npm run db:types` then `Grep` for `reports:` in `src/types/database.types.ts`
- [ ] Type checking passes: `npx astro check`

#### Manual Verification:

- [ ] In Supabase Studio (local), the `reports` table shows all columns with correct types, the three JSONB columns default to `[]`, and the FK to `projects` is present with cascade.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation that the table looks right before proceeding.

---

## Phase 2: Data layer (`src/lib/reports/`)

### Overview

Encode the report contract once: zod schemas (scalars + repeater rows), the `FormData`↔report serializer/parser, and the five query functions. No HTTP, no React — pure functions over a `SupabaseClient<Database>`.

### Changes Required:

#### 1. Zod schemas

**File**: `src/lib/reports/schema.ts`

**Intent**: Define the validated shapes for a report's scalar fields and the three repeater row arrays, used by both the form parser and the queries. zod owns the JSONB row shape since the DB stores it opaquely.

**Contract**: Export — a `pluginRowSchema` / `themeRowSchema` = `{ name: string (trimmed, min 1), updated: boolean, from_version: string|null, to_version: string|null }`; a `licenseRowSchema` = `{ name: string (trimmed, min 1), status: z.enum(["expired","expiring"]), expiry_date: string|null, notes: string|null }`; a `reportInputSchema` covering the scalar fields (`month`, `wp_core_version`, `wp_core_updated`, `php_*`, `integrity_status`, `integrity_issues`, `fixes_applied`, `notes_to_client`) plus `plugins`, `themes`, `licenses` arrays of the row schemas. Optional text fields use the existing nullish-to-null transform idiom from `src/lib/projects/schema.ts` (`z.string().trim().nullish().transform(v => v == null || v === "" ? null : v)`). Use zod v4 top-level validators throughout. Export the inferred `ReportInput` type and the row types.

#### 2. FormData serializer + parser

**File**: `src/lib/reports/form.ts`

**Intent**: Bridge the native POST form and the validated report. The parser is the read side of the indexed-field convention (see Critical Implementation Details); a small serializer helper documents the field-name scheme the React island must emit.

**Contract**: Export `parseReportForm(form: FormData): { ok: true; data: ReportInput } | { ok: false; message: string }`. It reads scalar keys directly, reconstructs each repeater array by scanning keys matching `^<repeater>\[(\d+)\]\.(\w+)$` and grouping by the numeric index (rows compacted to a dense array in index order), coerces checkbox presence to boolean (missing key → `false`), then runs the whole object through `reportInputSchema.safeParse` and returns the first issue's message on failure. Also export the field-name helpers (e.g. `pluginFieldName(i, key)`) so the island and parser cannot drift. **Contract note**: an unchecked `updated` checkbox sends no FormData key — the parser must default it to `false`, never error on absence.

#### 3. Queries

**File**: `src/lib/reports/queries.ts`

**Intent**: The five report operations over Supabase-over-HTTP, throwing on error per the codebase convention.

**Contract**: Export —
- `createReport(client, projectId): Promise<Report>` — derives `month` from the current date server-side, calls `listRecurringPlugins(client, projectId)` and maps names into seeded plugin rows (`{ name, updated: false, from_version: null, to_version: null }`), inserts the `reports` row with `plugins` set to that array (themes/licenses `[]`, scalars null/false), returns the inserted row. Reuses the existing `listRecurringPlugins` import.
- `getReport(client, id): Promise<Report | null>` — single row by id; casts the JSONB columns to the row types.
- `listReportsByProject(client, projectId): Promise<ReportSummary[]>` — id + month + created_at, ordered `created_at desc`.
- `updateReport(client, id, input: ReportInput): Promise<void>` — **replace-all**: overwrites every scalar column and all three JSONB arrays in one `update().eq("id", id)`; before (or after) the write, calls `promoteToCatalog(client, row.name)` for every entry in `input.plugins` (idempotent). Throws `new Error(error.message)` on failure.
- `deleteReport(client, id): Promise<void>` — hard delete by id.

Define a `Report` type from `Database["public"]["Tables"]["reports"]["Row"]` with the JSONB columns narrowed to the zod row arrays, and a `ReportSummary` for the list. No custom error subclass is needed (reports have no unique constraint to violate).

### Success Criteria:

#### Automated Verification:

- [ ] Type checking passes: `npx astro check`
- [ ] Linting passes (judged by exit code, not grep — per lessons.md): `npm run lint`
- [ ] Build passes: `npm run build`

#### Manual Verification:

- [ ] (Deferred to Phase 4/5 where the layer is exercised end-to-end — no UI yet to test against.)

**Implementation Note**: This phase has no user-facing surface; its correctness is proven when Phases 4–5 exercise it. Proceed once automated checks pass.

---

## Phase 3: API routes

### Overview

Thin POST adapters over the data layer, following the projects route shape exactly: create, update, delete — each redirecting to the project-scoped report URL with `?ok=`/`?error=`.

### Changes Required:

#### 1. Create route

**File**: `src/pages/api/reports/index.ts`

**Intent**: Create a new report on a project (seeding handled in the query) and redirect to its edit page.

**Contract**: `POST` reads `project_id` and the redirect `slug` from FormData, calls `createReport(createSupabaseClient(), project_id)`, and on success `context.redirect(\`/projects/${slug}/reports/${report.id}?ok=created\`)`. On error, redirect back to the project page with `?error=`. Mirrors `src/pages/api/projects/index.ts`.

#### 2. Update route

**File**: `src/pages/api/reports/[id].ts`

**Intent**: Persist a full report edit (replace-all + catalog promote) and redirect back to the report edit page.

**Contract**: `POST` reads the report `id` from params and `slug` from FormData (for the redirect target), parses the body via `parseReportForm`; on parse failure redirects to the report URL with `?error=<message>`; on success calls `updateReport(client, id, parsed.data)` and redirects to `/projects/${slug}/reports/${id}?ok=saved`. Generic catch → `?error=Could not save the report`.

#### 3. Delete route

**File**: `src/pages/api/reports/[id]/delete.ts`

**Intent**: Hard-delete a report and return to the project's report list.

**Contract**: `POST` reads `id` from params and `slug` from FormData, calls `deleteReport(client, id)`, redirects to `/projects/${slug}/reports?ok=report-deleted` (or the project page). Mirrors `src/pages/api/project-recurring-plugins/[id]/delete.ts`.

### Success Criteria:

#### Automated Verification:

- [ ] Type checking passes: `npx astro check`
- [ ] Linting passes (exit code): `npm run lint` — note: keep `@typescript-eslint/no-misused-promises` behavior in mind for any `.astro`, but these are `.ts` routes; ensure `APIRoute` handlers are typed correctly.
- [ ] Build passes: `npm run build`

#### Manual Verification:

- [ ] (Exercised in Phase 4/5 via the UI — routes have no standalone surface.)

**Implementation Note**: Proceed once automated checks pass; the routes are validated end-to-end in Phase 5.

---

## Phase 4: Report list & navigation

### Overview

Wire the read/navigation surface: a per-project report list, the "New report" create action, and the report edit page shell (frontmatter + layout) — before the heavy form island is built, so the create→list→open path is verifiable on its own.

### Changes Required:

#### 1. Per-project report list

**File**: `src/pages/projects/[slug].astro` (edit) and/or `src/pages/projects/[slug]/reports/index.astro` (new)

**Intent**: Show the project's reports (newest first, month + created date) within the project context (FR-011), with a "New report" button that POSTs to the create route.

**Contract**: In the project detail frontmatter, add `listReportsByProject(client, project.id)` to the existing `Promise.all`. Render a "Reports" `<section>` listing each report as a link to `/projects/${slug}/reports/${report.id}` showing its month + created date; empty-state when none. Add a "New report" `<form method="POST" action="/api/reports">` with hidden `project_id` and `slug`. Extend the existing `okMessage` map for `report-deleted`. (Choose: list inline on `[slug].astro`, or a dedicated `[slug]/reports/index.astro` — inline matches the recurring-plugins precedent and FR-011's "within that project's detail page"; prefer inline unless the page gets too long.)

#### 2. Report edit page shell

**File**: `src/pages/projects/[slug]/reports/[id].astro`

**Intent**: Load a report by id, guard not-found, surface `ok`/`error` messages, and host the authoring form island (built in Phase 5) plus a delete button.

**Contract**: Frontmatter: `const client = createSupabaseClient()`, read `slug` + `id` params, `getReport(client, id)`; if null, redirect to `/projects/${slug}?error=Report%20not%20found`. Load the plugin catalog (`listCatalog`) for the datalist source via `Promise.all`. Read `Astro.url.searchParams` for `ok` (`saved` → "Changes saved.", `created` → "Report created.") / `error`. Render the `Layout`, a back-link to the project, a `DeleteReportButton` (mirrors `DeleteProjectButton`, posts to `/api/reports/${id}/delete` with `slug`), and the `ReportForm` island (Phase 5) with `action={\`/api/reports/${id}\`}`, the report's current values as `initial`, the catalog names, and `serverError`.

#### 3. Delete report button

**File**: `src/components/reports/DeleteReportButton.tsx`

**Intent**: Confirm-then-POST delete, mirroring the existing project delete button.

**Contract**: A `client:load` React island with a confirm toggle that, on confirm, submits a `method="POST" action={\`/api/reports/${id}/delete\`}` form carrying hidden `slug`. Copy the structure of `src/components/projects/DeleteProjectButton.tsx`.

### Success Criteria:

#### Automated Verification:

- [ ] Type checking passes: `npx astro check`
- [ ] Linting passes (exit code): `npm run lint`
- [ ] Build passes: `npm run build`

#### Manual Verification:

- [ ] From a project page, "New report" creates a report and lands on its edit page; the new report appears in the project's report list.
- [ ] The report list shows month + created date, newest first; opening a report loads its edit page; a non-existent report id redirects to the project with an error.
- [ ] Deleting a report removes it from the list and returns to the project with a confirmation.
- [ ] A newly created report's plugins repeater (visible once Phase 5 lands; for now verify via Studio that the `plugins` JSONB was seeded from the project's recurring list).

**Implementation Note**: After automated verification passes, pause for manual confirmation of the create→list→open→delete navigation before building the form.

---

## Phase 5: Authoring form & repeater islands

### Overview

The largest piece: the single native-POST authoring form covering all nine sections, with three React repeater islands (add/remove rows; plugin-name combobox via `<datalist>`) wired to real form inputs so one Save serializes everything. Seeded plugin rows render as editable rows.

### Changes Required:

#### 1. Report form island

**File**: `src/components/reports/ReportForm.tsx`

**Intent**: Render the whole report as one controlled `<form method="POST">` — scalar section fields plus the three repeaters — that submits to the update route in a single POST and validates lightly on the client before letting the native submit proceed.

**Contract**: Props: `action`, `initial` (the report's current scalar values + the three row arrays), `catalog` (`{ name }[]` for the datalist), `slug` (hidden field for redirects), `serverError`. State holds the three repeater arrays plus the scalar fields. Renders, in order: month (read-only display), WP core (version text + updated checkbox), PHP (updated checkbox + from/to), Plugins repeater, Themes repeater, Integrity (status + issues textarea), Fixes (textarea), License renewals repeater, Notes to client (textarea). All inputs are real form controls with the FormData names from `form.ts` helpers; the three repeater arrays render via the repeater components below. Hidden `slug` input. `onSubmit` typed `React.SubmitEvent<HTMLFormElement>` does light validation (e.g. a repeater row with a blank name) and only `preventDefault()`s on failure; otherwise the native POST proceeds. `noValidate` on the form. Reuse `FormField`, `SubmitButton`, `ServerError` from `src/components/auth/` and `Button` from `src/components/ui/button`, matching `ProjectForm.tsx`.

#### 2. Plugins/Themes repeater

**File**: `src/components/reports/RowsRepeater.tsx` (one reusable component parameterized by row kind, or two siblings if cleaner)

**Intent**: Render a variable-length list of plugin/theme rows (name + updated + from/to) with Add row / Remove row, each field wired to the indexed FormData name; plugin-name fields offer catalog suggestions.

**Contract**: Receives the current rows, an `onChange` to lift state to `ReportForm`, the field-name prefix (`plugins`/`themes`), and (for plugins) the catalog names for a `<datalist>`. Each row: a name text input (`list=` pointing at a shared `<datalist id>` of catalog names for the plugins kind only), an "updated" checkbox, from/to version text inputs — all named via the `form.ts` helpers at the row's current index. "Add row" appends an empty row; "Remove row" splices it; rows are re-indexed densely so FormData names stay contiguous. Keyed by array index (no per-row id, per the data-model decision).

#### 3. License renewals repeater

**File**: `src/components/reports/LicensesRepeater.tsx` (or a row-kind of the shared repeater)

**Intent**: Same repeater mechanics for license rows (name + status + optional expiry date + notes).

**Contract**: Each row: name text input, a `status` `<select>` of `expired`/`expiring`, an optional `expiry_date` (date input, nullable), an optional `notes` text input — named via the license field-name helpers at the row index. Add/Remove/re-index as above. No catalog datalist (licenses are free-text, not promoted).

### Success Criteria:

#### Automated Verification:

- [ ] Type checking passes: `npx astro check`
- [ ] Linting passes (exit code): `npm run lint`
- [ ] Build passes: `npm run build`

#### Manual Verification:

- [ ] Full round-trip: create a report → seeded plugin rows are visible and editable → fill every section (WP core, PHP, add plugin/theme/license rows, integrity, fixes, notes) → Save → reload the page → every value persisted correctly.
- [ ] Add and remove rows in each of the three repeaters; the saved arrays match what's on screen (no off-by-one from re-indexing); an unchecked "updated" box persists as `false`.
- [ ] Save an all-empty report (every section untouched) → it saves without error and reloads with empty repeaters (`[]`) and null scalars.
- [ ] Type a brand-new free-text plugin name on a row → Save → that name appears in the plugins catalog (verify on a new report's datalist or in Settings/Studio).
- [ ] Edit and re-save an already-saved report (post-send editing is allowed) → changes persist; the report is never locked.
- [ ] No project internal notes or contact email appear anywhere in the report form/data unless the user typed them into "notes to client" (guards the S-08 no-leak NFR at the authoring layer).

**Implementation Note**: After automated verification passes, pause for manual confirmation of the full authoring round-trip — this is the slice's acceptance gate.

---

## Testing Strategy

### Unit Tests:

This repo has no test harness yet (testing is introduced in Module 3 per CLAUDE.md), so verification is via the automated gates (`astro check`, `lint`, `build`) plus the manual steps above. If a unit test target is added later, the highest-value isolated unit is `parseReportForm` in `src/lib/reports/form.ts` — the indexed-FormData↔array reconstruction (including the unchecked-checkbox→false and dense-re-index cases) is the trickiest pure logic and is the natural seam to test without a DB.

### Integration Tests:

Not in scope for this slice (no harness). The end-to-end create→seed→edit→save→reload flow is the manual integration check.

### Manual Testing Steps:

1. Configure a project with a recurring-plugins list (S-05) and at least one catalog entry (S-03).
2. From the project page, click "New report" → confirm seeded plugin rows appear and the month is auto-set.
3. Fill all nine sections, adding/removing rows in each repeater; Save; reload; confirm persistence.
4. Save an all-empty report; confirm clean `[]`/`null` round-trip.
5. Type a new free-text plugin name; Save; confirm it lands in the catalog.
6. Delete the report; confirm it leaves the list.

## Performance Considerations

Negligible at MVP scale (small data volume, low QPS per PRD `target_scale`). The replace-all update writes one row including three JSONB arrays bounded by the NFR's ~30 plugin / 5 theme rows — a single small write. `promoteToCatalog` runs one idempotent upsert per plugin row on save (≤~30 upserts, each a tiny PostgREST call); acceptable for the authoring action, which has no sub-5s NFR of its own (that NFR is on the PDF-on-save path in S-08). If the per-row promote loop ever feels slow, it can be batched into a single upsert later — out of scope now.

## Migration Notes

Forward-only migration; no existing report data to migrate (greenfield table). Local dev applies it via `npx supabase db reset --local` (per the local-runtime/cloud-migrations topology); the linked DB via `npm run db:push`. Regenerate types with `npm run db:types` after the schema lands. No rollback script needed for MVP (drop-and-recreate locally if the shape changes during implementation).

## References

- Roadmap slice: `context/foundation/roadmap.md` (S-06, lines 156–166)
- PRD: `context/foundation/prd.md` (FR-010–FR-014, FR-016; US-01; Business Logic)
- Lessons (binding): `context/foundation/lessons.md` — zod v4 top-level validators; judge lint by exit code; Astro+React 19 lint gotchas; full `npm run lint` not staged-only.
- Closest pattern precedents:
  - Data triad + queries: `src/lib/project-recurring-plugins/queries.ts`, `src/lib/projects/{schema.ts,queries.ts,form.ts}`
  - Seeding source: `src/lib/project-recurring-plugins/queries.ts:48` (`listRecurringPlugins`)
  - Auto-promote: `src/lib/plugins-catalog/queries.ts:66` (`promoteToCatalog`)
  - Routes: `src/pages/api/projects/index.ts`, `src/pages/api/projects/[id].ts`, `src/pages/api/project-recurring-plugins/[id]/delete.ts`
  - Page + island: `src/pages/projects/[slug].astro`, `src/components/projects/ProjectForm.tsx`, `src/components/project-recurring-plugins/RecurringPlugins.tsx`
  - Migration idiom: `supabase/migrations/20260529144131_create_projects.sql`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema & migration

#### Automated

- [x] 1.1 Migration file exists and follows naming/DDL conventions — 92370a1
- [x] 1.2 Migration applies cleanly against local Supabase (`npx supabase db reset --local`) — 92370a1
- [x] 1.3 Types regenerate and include the reports table (`npm run db:types`) — 92370a1
- [x] 1.4 Type checking passes (`npx astro check`) — 92370a1

#### Manual

- [ ] 1.5 `reports` table verified in Supabase Studio (columns, JSONB defaults, FK cascade)

### Phase 2: Data layer

#### Automated

- [x] 2.1 Type checking passes (`npx astro check`)
- [x] 2.2 Linting passes by exit code (`npm run lint`)
- [x] 2.3 Build passes (`npm run build`)

### Phase 3: API routes

#### Automated

- [ ] 3.1 Type checking passes (`npx astro check`)
- [ ] 3.2 Linting passes by exit code (`npm run lint`)
- [ ] 3.3 Build passes (`npm run build`)

### Phase 4: Report list & navigation

#### Automated

- [ ] 4.1 Type checking passes (`npx astro check`)
- [ ] 4.2 Linting passes by exit code (`npm run lint`)
- [ ] 4.3 Build passes (`npm run build`)

#### Manual

- [ ] 4.4 "New report" creates a report and lands on its edit page; appears in the project's report list
- [ ] 4.5 Report list shows month + date newest-first; open works; bad id redirects with error
- [ ] 4.6 Delete removes the report and returns to the project with confirmation
- [ ] 4.7 New report's `plugins` JSONB seeded from the project's recurring list (verify in Studio)

### Phase 5: Authoring form & repeater islands

#### Automated

- [ ] 5.1 Type checking passes (`npx astro check`)
- [ ] 5.2 Linting passes by exit code (`npm run lint`)
- [ ] 5.3 Build passes (`npm run build`)

#### Manual

- [ ] 5.4 Full round-trip: create → seeded rows visible → fill every section → Save → reload → values intact
- [ ] 5.5 Add/remove rows in all three repeaters; saved arrays match screen; unchecked "updated" persists as `false`
- [ ] 5.6 All-empty report saves and reloads cleanly (`[]` / null)
- [ ] 5.7 Free-text plugin name auto-promotes into the catalog on save
- [ ] 5.8 Re-save an already-saved report; changes persist; no locking
- [ ] 5.9 No project internal notes / contact email leak into the report data unless typed into "notes to client"
