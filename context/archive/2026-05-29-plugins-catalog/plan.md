# Plugins Catalog (S-03) Implementation Plan

## Overview

Build the global **predefined plugins catalog** (PRD FR-003, roadmap S-03): the canonical, agency-wide list of WordPress plugin names (each with an optional note). A signed-in user manages it on a single settings page — add, edit, and remove entries inline. The catalog is the name source two later slices consume: S-05 (`project-recurring-plugins`) uses it as the pick-list, and S-06 (`report-authoring`) uses it as the plugin-row dropdown source. FR-003 also requires an **auto-promote** rule — when a report row carries a free-text plugin name not yet in the catalog, the system adds it automatically — so this slice ships a thin `promoteToCatalog()` write that S-06 will call.

Because this is a near-textbook copy of the `projects-crud` collection-CRUD pattern with a smaller entity, the work is mostly plumbing. The two decisions that carry weight are (a) the case-insensitive uniqueness model that keeps names canonical, and (b) the shape of the `promoteToCatalog()` hook S-06 reuses.

## Current State Analysis

The vertical-slice pattern is fully established and is the template to copy:

- **Collection-CRUD precedent — `projects-crud`.** Migration → `db:types` → `src/lib/<feature>/{schema,queries,form}.ts` → `src/pages/api/<feature>/{index,[id],[id]/delete}.ts` → pages + React islands. See `src/lib/projects/queries.ts:1-63`, `src/lib/projects/schema.ts:1-41`, `src/lib/projects/form.ts:1-20`, `src/pages/api/projects/index.ts:1-20`, `src/pages/api/projects/[id].ts:1-26`, `src/pages/api/projects/[id]/delete.ts:1-17`.
- **Singleton-settings precedent — `brand-settings`.** The other global settings surface (`src/pages/brand-settings.astro:1-52`, `src/components/brand-settings/BrandSettingsForm.tsx`). Useful as the "Settings page chrome" reference, though the catalog is a collection, not a singleton.
- **Auth is free.** `src/middleware.ts` enforces a session on every non-public path. New `/plugins-catalog` pages and `/api/plugins-catalog/*` routes are gated automatically — no per-route auth code.
- **Supabase access** is a per-request HTTP/PostgREST client via `createSupabaseClient()` (`src/lib/supabase.ts`) using `SUPABASE_SECRET_KEY` (bypasses RLS). Never `pg` from the Worker.
- **DB conventions** (`supabase/migrations/20260529144131_create_projects.sql`): `create extension if not exists pgcrypto` for `gen_random_uuid()`; a shared `public.set_updated_at()` trigger function that **already exists** (do **not** `create or replace` it again — `brand-settings` reuses it, see `supabase/migrations/20260529181950_create_brand_settings.sql`); nullable text columns store `null` not `""`; `enable row level security` with no policies as the closed default.
- **Unique-violation pattern** (`src/lib/projects/queries.ts:9-18`): catch Postgres code `23505` and throw a distinct typed error (`SlugTakenError`) so routes map it to a friendly message, not a 500.
- **zod idioms** (`src/lib/projects/schema.ts`): `optionalText` = `z.string().trim().nullish().transform(...)` to normalize empty/omitted → `null`. zod v4 (`^4.4.3`).
- **Shared form primitives** under `src/components/auth/`: `FormField`, `SubmitButton`, `ServerError`. `ProjectForm` types its submit handler as `React.SubmitEvent<HTMLFormElement>` (per `context/foundation/lessons.md` — `React.FormEvent` is deprecated in React 19 and fails CI). `Button` lives at `src/components/ui/button`; `useFormStatus()` from `react-dom` drives pending state.
- **Migration tooling is hybrid (local-runtime / cloud-migrations).** `package.json` `db:push` / `db:types` are `--linked` (cloud). The local dev DB the server talks to does NOT receive a new migration until `npx supabase db reset --local`; regenerate local types with `npx supabase gen types --local --schema public > src/types/database.types.ts`. (This gap bit S-01 during testing — symptom: PostgREST insert/select fails at runtime with an opaque `internal error` even though the table is visible in the cloud dashboard.)
- **Dashboard nav** (`src/pages/dashboard.astro:1-29`) currently links only to `/projects` — there is no link to `/brand-settings` despite that slice having landed. This slice adds a "Settings" grouping that links both Brand settings and Plugins catalog (closing that gap).

### Key Discoveries:

- **Case-insensitive uniqueness + idempotent upsert needs a stored normalized key, not a functional index.** PostgREST `.upsert(payload, { onConflict: "<col>" })` targets a column with a unique constraint; a *functional* unique index on `lower(name)` is not addressable by `onConflict` the same way. The clean mechanism is a generated/maintained `name_key` column (`lower(trim(name))`) carrying a plain `UNIQUE`, so both the friendly-error create path (catch `23505`) and the idempotent promote path (`onConflict: "name_key"`) work against a real column. (See Critical Implementation Details.)
- **`promoteToCatalog()` is the S-06 coupling point.** Roadmap S-03 risk note: "keep that promote hook a thin write so S-06 can call it." Chosen contract: idempotent insert-if-absent (ignore-on-conflict) — S-06 calls it per new row with no pre-check and no try/catch, safe under concurrent report saves, and it never overwrites an existing entry's notes.
- **Hard delete only, no FK guard.** Nothing references catalog rows yet (S-05/S-06 tables don't exist). Plain hard delete matches the projects decision and the MVP "hard delete only" guardrail; S-05/S-06 own their own reference behavior when they land.
- **Single page, inline rows** is the chosen UI — unlike projects' four-page detail flow. One page: an add-form on top, the list below with per-row inline edit + delete. This is the one real divergence from a literal projects copy.
- **Single-tenant lock** (PRD Open Q3): no `agency_id` column.

## Desired End State

A signed-in user navigates to `/plugins-catalog` (reachable from a "Settings" group on the dashboard), sees the current catalog as a list, adds an entry by typing a plugin name (+ optional notes) and submitting, edits any row's name/notes inline, and deletes a row (with a lightweight confirm). Adding a name that already exists (case-insensitively) shows a friendly "already in the catalog" message rather than a 500 or a duplicate row. Programmatically, the query layer exposes `listCatalog(client)`, `createCatalogEntry`, `updateCatalogEntry`, `deleteCatalogEntry`, and a thin `promoteToCatalog(client, name)` that S-06 can call blindly per report row to insert-if-absent.

Verify: the page renders behind auth; create/edit/delete round-trip and persist on reload; `Akismet` and `akismet` collide (one canonical entry); `promoteToCatalog` on an existing name is a no-op (no error, notes preserved) and on a new name inserts a row; `astro check` / `lint` / `build` / `test` are green.

## What We're NOT Doing

- **The report plugin-row dropdown and the project recurring-list pick UI** — those are S-06 and S-05. This slice only delivers the catalog CRUD and the `promoteToCatalog()` read/write contract they will consume.
- **Calling `promoteToCatalog()` from anywhere** — the function ships and is unit-exercisable here, but the report-row save path that invokes it is built in S-06.
- **Soft delete / archive** — hard delete only (PRD Non-Goals; matches projects).
- **FK / referential guards on delete** — nothing references the catalog yet; S-05/S-06 decide their own reference model.
- **Multi-tenancy** — no `agency_id` column (explicit lock).
- **Pagination / search / sort** on the catalog list — small scale (PRD `target_scale: small`); a plain list is enough for MVP. (A client-side filter box is explicitly out of scope unless trivially free.)
- **Categories, versions, vendor URLs, or any field beyond name + notes** — FR-003 is "plugin name; optional notes" only.
- **Bulk import of plugin names** — entries are added one at a time (bulk paste is the report-side S-07 concern, not the catalog).
- **Mobile-responsive / WCAG-AA** — desktop, keyboard-navigable forms only (PRD Non-Goals).

## Implementation Approach

Bottom-up and dependency-ordered, mirroring `projects-crud`: data foundation first (Phase 1), then the pure validation + typed query seam including the promote hook (Phase 2), then the write API routes (Phase 3), then the single-page UI + nav (Phase 4). Each phase is independently verifiable. Validation uses the existing **zod** dependency; the query module (`src/lib/plugins-catalog/queries.ts`) is the durable seam S-05 and S-06 import.

The only mechanics genuinely new versus projects are (a) the normalized `name_key` column that makes case-insensitive uniqueness addressable by both the create and the upsert path, and (b) the inline-row edit island. Everything else is a direct pattern copy.

## Critical Implementation Details

- **Normalized `name_key` column carries the uniqueness.** Store `name` as the user typed it (display casing preserved) and a `name_key text not null unique` holding the normalized form. Two viable mechanisms — implementer picks the one that generates cleanly under the local Postgres version: (1) a `generated always as (lower(trim(name))) stored` column with a plain `UNIQUE`, or (2) a plain `name_key text not null unique` column the query layer sets explicitly on every insert/update/upsert (`name.trim().toLowerCase()`). Either way, `onConflict: "name_key"` is what `promoteToCatalog()` and the create path target. A generated column is preferable (the DB owns the invariant, the app cannot forget to set it) — fall back to the app-set column only if the generated-column form fails to generate. Whichever is chosen, the friendly-error create path still catches `23505` on `name_key`.
- **`promoteToCatalog()` must not clobber.** Use insert-with-ignore-on-conflict semantics (PostgREST `.upsert({ name, ... }, { onConflict: "name_key", ignoreDuplicates: true })`, or an insert that swallows `23505`). It must never update `notes` of an existing row. It returns without signaling whether a row was created — S-06 does not need to know.
- **`name_key` is never a form field.** It is derived server-side (generated column, or set in the query layer from `name`); the zod schema and the form parser only handle `name` + `notes`. Do not expose or accept `name_key` from the client.
- **React 19 handler type.** Type any form submit handler as `React.SubmitEvent<HTMLFormElement>`, never `React.FormEvent` (deprecated; fails CI per lessons.md).
- **Judge lint/build/test by exit code, never by grepping output** (per lessons.md — a `no-misused-promises` crash in projects-crud was mis-reported "clean" by an output grep and only surfaced in CI). Keep `@typescript-eslint/no-misused-promises` off for `**/*.astro` (already configured).

---

## Phase 1: Migration + generated types

### Overview

Create the `plugin_catalog` table with the normalized unique key, the `updated_at` trigger (reusing the existing function), and closed-default RLS; regenerate the TypeScript database types.

### Changes Required:

#### 1. Plugin catalog migration

**File**: `supabase/migrations/<timestamp>_create_plugin_catalog.sql` (new; `<timestamp>` via `npx supabase migration new create_plugin_catalog`)

**Intent**: Define the global plugin catalog table so the app has a canonical, case-insensitively-unique source of plugin names with optional notes.

**Contract**: New table `public.plugin_catalog` with columns: `id uuid primary key default gen_random_uuid()`; `name text not null`; `name_key text not null unique` holding the normalized name (prefer `generated always as (lower(trim(name))) stored`; else a plain column the query layer sets — see Critical Implementation Details); `notes text` (nullable); `created_at timestamptz not null default now()`; `updated_at timestamptz not null default now()`. Add a `before update` trigger calling the **existing** `public.set_updated_at()` (do not redefine the function). `alter table public.plugin_catalog enable row level security;` with no policies. Follow the header-comment style of the projects migration. No `agency_id`.

#### 2. Regenerate database types

**File**: `src/types/database.types.ts` (generated — do not hand-edit)

**Intent**: Make the new table available to the typed Supabase client and the query layer.

**Contract**: After applying the migration locally (`npx supabase db reset --local`), regenerate with `npx supabase gen types --local --schema public > src/types/database.types.ts` (the `db:types` npm script is `--linked`/cloud — use the `--local` form when the migration is only local). The generated `Database["public"]["Tables"]["plugin_catalog"]["Row"]` must include `id`, `name`, `name_key`, `notes`, `created_at`, `updated_at`. For the shipping step, `npm run db:push` applies the migration to cloud (separate, explicit).

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly to the local Supabase DB (`npx supabase db reset --local`) — judged by **exit code**, not by grepping output (per lessons.md).
- `src/types/database.types.ts` regenerates with a `plugin_catalog` Row type including `name`, `name_key`, `notes`, `created_at`, `updated_at`.
- Type checking passes: `npm run astro check`.

#### Manual Verification:

- Inserting `Akismet` then `akismet` (or `  Akismet  `) into `plugin_catalog` fails the `name_key` unique constraint (verified via a one-off SQL attempt against local).
- Table is not exposed to anon/authenticated roles (RLS enabled, no policies).

**Implementation Note**: After this phase and all automated verification passes, pause for manual confirmation before proceeding to the next phase.

---

## Phase 2: Schema, queries, and form parser (lib)

### Overview

Add the `src/lib/plugins-catalog/` module: zod validation (name required, notes optional-null), the CRUD query functions plus the distinct unique-violation error, the thin idempotent `promoteToCatalog()` hook, and the form parser.

### Changes Required:

#### 1. Validation schema

**File**: `src/lib/plugins-catalog/schema.ts` (new)

**Intent**: Single source of truth for catalog-entry validation, shared by the API route (Phase 3) and the React island (Phase 4).

**Contract**: Export `pluginCatalogSchema` (zod object): `name: z.string().trim().min(1, "Plugin name is required")`; `notes` = the `optionalText` pattern (`z.string().trim().nullish().transform(v => v == null || v === "" ? null : v)`) copied from `src/lib/projects/schema.ts:7-11`. Export `type PluginCatalogInput = z.infer<...>`. `name_key` is NOT in this schema (derived server-side).

#### 2. Query layer

**File**: `src/lib/plugins-catalog/queries.ts` (new)

**Intent**: The typed CRUD seam over PostgREST that the routes call now and S-05/S-06 import later, including the thin promote hook.

**Contract**:
- `export type PluginCatalogEntry = Database["public"]["Tables"]["plugin_catalog"]["Row"]`.
- `export class NameTakenError extends Error` — thrown when `name_key` collides (mirror `SlugTakenError` in `src/lib/projects/queries.ts:13-18`); message e.g. "That plugin is already in the catalog".
- `listCatalog(client): Promise<PluginCatalogEntry[]>` — `select("*").order("name", { ascending: true })`.
- `createCatalogEntry(client, input: PluginCatalogInput): Promise<PluginCatalogEntry>` — insert; map `23505` → `NameTakenError`. If using the app-set `name_key` variant, set it here from `input.name`.
- `updateCatalogEntry(client, id, input): Promise<PluginCatalogEntry>` — update by id; map `23505` → `NameTakenError`.
- `deleteCatalogEntry(client, id): Promise<void>` — plain hard delete.
- `promoteToCatalog(client, name: string): Promise<void>` — **thin idempotent write** S-06 calls per new free-text row. Insert-if-absent via `.upsert({ name }, { onConflict: "name_key", ignoreDuplicates: true })` (and set `name_key` explicitly if using the app-set variant). Must NOT overwrite an existing row's notes. Returns void; does not throw on an already-present name. Trim/skip empty input.

All non-`23505` PostgREST errors throw `Error(error.message)` (mirror projects' style).

#### 3. Form parser

**File**: `src/lib/plugins-catalog/form.ts` (new)

**Intent**: Turn a submitted form into a validated `PluginCatalogInput`, or the first validation message for the redirect-with-error path.

**Contract**: `parsePluginCatalogForm(form: FormData): { ok: true; data: PluginCatalogInput } | { ok: false; message: string }`. Read `name` and `notes` string fields, `safeParse` with `pluginCatalogSchema`, return the first issue message on failure. Mirror `src/lib/projects/form.ts:10-20`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run astro check`.
- Linting passes: `npm run lint` — judged by **exit code** (per lessons.md; watch for the `no-misused-promises` crash class).

#### Manual Verification:

- `pluginCatalogSchema` rejects an empty/whitespace name with the expected message and normalizes empty notes to `null`.
- (Query behavior — `NameTakenError` on duplicate, idempotent `promoteToCatalog` — is exercised end-to-end in Phase 3/4 against local Supabase; no test harness yet, see Testing Strategy.)

**Implementation Note**: After this phase and all automated verification passes, pause for manual confirmation before proceeding.

---

## Phase 3: API routes

### Overview

Add the three write endpoints (create, update, delete) that validate with the zod schema and call the query layer, mirroring the projects route shapes. All redirect back to `/plugins-catalog`.

### Changes Required:

#### 1. Create endpoint

**File**: `src/pages/api/plugins-catalog/index.ts` (new)

**Intent**: Accept the add-entry form, persist via `createCatalogEntry`, round-trip back to the catalog page.

**Contract**: `export const POST: APIRoute`. Parse `await context.request.formData()` with `parsePluginCatalogForm`; on parse failure redirect `/plugins-catalog?error=<encoded message>`. On success call `createCatalogEntry(createSupabaseClient(), parsed.data)`; redirect `/plugins-catalog?ok=created`. Catch `NameTakenError` → redirect with its message; other errors → `?error=Could%20not%20add%20the%20plugin`. Mirror `src/pages/api/projects/index.ts:1-20`. Route stays `.ts`.

#### 2. Update endpoint

**File**: `src/pages/api/plugins-catalog/[id].ts` (new)

**Intent**: Accept an inline-edit submission for one row and persist it.

**Contract**: `export const POST: APIRoute`. `id` from `context.params.id`. Parse + validate; on failure redirect `/plugins-catalog?error=...`. On success call `updateCatalogEntry(createSupabaseClient(), id, parsed.data)`; redirect `/plugins-catalog?ok=updated`. Catch `NameTakenError` → friendly message; other errors → `?error=Could%20not%20update%20the%20plugin`. Mirror `src/pages/api/projects/[id].ts:1-26` (no `_return_slug` needed — the catalog has a single return URL).

#### 3. Delete endpoint

**File**: `src/pages/api/plugins-catalog/[id]/delete.ts` (new)

**Intent**: Hard-delete one catalog row.

**Contract**: `export const POST: APIRoute`. `id` from `context.params.id`. Call `deleteCatalogEntry(createSupabaseClient(), id)`; redirect `/plugins-catalog?ok=deleted`; on error `/plugins-catalog?error=Could%20not%20delete%20the%20plugin`. Mirror `src/pages/api/projects/[id]/delete.ts:1-17`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run astro check`.
- Linting passes: `npm run lint` (exit code).
- Production build succeeds: `npm run build` (exit code — final gate; catches Workers bundle issues).

#### Manual Verification:

- `POST /api/plugins-catalog` with a valid name creates a row and redirects to `?ok=created`.
- Adding a name that differs only by case/whitespace from an existing one returns the friendly `NameTakenError` message, not a 500, and creates no duplicate.
- Update changes the row and redirects to `?ok=updated`; delete removes the row and redirects to `?ok=deleted`.
- An unauthenticated `curl` to any endpoint redirects to `/login` (middleware gate intact).

**Implementation Note**: After this phase and all automated verification passes, pause for manual confirmation of the write endpoints before building the UI.

---

## Phase 4: UI — single catalog page, inline-edit island, dashboard nav

### Overview

Add the `/plugins-catalog` Astro page (server-reads the list, shows banners), a `PluginCatalog` React island with a top add-form and per-row inline edit + delete, and a "Settings" grouping on the dashboard linking Brand settings + Plugins catalog.

### Changes Required:

#### 1. Plugins catalog page

**File**: `src/pages/plugins-catalog.astro` (new)

**Intent**: Render the catalog management surface behind auth, seeded with the current entries and any `?ok`/`?error` banner.

**Contract**: Frontmatter calls `listCatalog(createSupabaseClient())`; read `error` and `ok` from `Astro.url.searchParams` (map `created`→"Plugin added.", `updated`→"Changes saved.", `deleted`→"Plugin removed."). Wrap in `Layout`. Render the success banner (emerald) and pass `error` into the island as `serverError`. Pass the entries list to `<PluginCatalog client:load>`. Reuse the projects list page's container/banner styling (`src/pages/projects/index.astro:13-67`) with a "← Home" back-link and a heading.

#### 2. Plugin catalog island (add + inline rows)

**File**: `src/components/plugins-catalog/PluginCatalog.tsx` (new)

**Intent**: Client-side catalog manager — an add-entry form on top and an editable list where each row toggles between read mode and an inline edit form, with a per-row delete confirm.

**Contract**: Default export `PluginCatalog`. Props: `{ entries: { id: string; name: string; notes: string | null }[]; serverError?: string | null }`.
- **Add form**: `<form method="POST" action="/api/plugins-catalog">` with a `name` `FormField` (required) and a `notes` `FormField` (optional); client-side `pluginCatalogSchema.safeParse` on submit (`React.SubmitEvent<HTMLFormElement>`); `SubmitButton` ("Add plugin" / "Adding..."); `<ServerError message={serverError}>`.
- **List rows**: each entry renders name + notes in read mode with Edit and Delete controls. Edit mode swaps the row for an inline `<form method="POST" action={`/api/plugins-catalog/${id}`}>` with name/notes fields + Save/Cancel; only one row in edit mode at a time (local `editingId` state). Reuse `FormField`, `SubmitButton`, `Button` (`src/components/ui/button`), lucide icons.
- **Delete**: a per-row `<form method="POST" action={`/api/plugins-catalog/${id}/delete`}>` guarded by a lightweight confirm (a small inline "Delete? · Confirm / Cancel" toggle, or reuse the modal idiom from `DeleteProjectButton.tsx:44-82` scaled down — a type-to-confirm is overkill for a one-field row; a single confirm step suffices). `useFormStatus()` for pending.

Keep the form posts as native HTML form submissions (no `fetch`) so they ride the same redirect/`?ok=`/`?error=` round-trip as projects and need no client error plumbing beyond `serverError`.

#### 3. Dashboard Settings grouping

**File**: `src/pages/dashboard.astro`

**Intent**: Give users an in-app path to the catalog, and close the existing gap where Brand settings has no dashboard link.

**Contract**: Add a "Settings" group near the existing Projects link with two links — `Brand settings` (`/brand-settings`) and `Plugins catalog` (`/plugins-catalog`). Minimal, matches existing button styling (`src/pages/dashboard.astro:13-18`).

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run astro check`.
- Linting passes: `npm run lint` (exit code; verify `.astro` + `.tsx` both clean given prior CI gotchas).
- Production build succeeds: `npm run build` (exit code).
- Unit tests still pass: `npm run test`.

#### Manual Verification:

- `/plugins-catalog` loads behind auth (redirects to `/login` when signed out).
- Adding a plugin shows it in the list after the redirect; empty state renders when the catalog is empty.
- Inline-editing a row's name/notes saves and reflects on reload; only one row edits at a time.
- Deleting a row removes it after the confirm step.
- Adding a case/whitespace duplicate shows the friendly error banner and adds no row.
- Dashboard → Settings → Plugins catalog (and → Brand settings) navigation works.
- Keyboard-only navigation works through the add and inline-edit forms (PRD a11y commitment).

**Implementation Note**: After this phase and all automated verification passes, pause for manual confirmation of the full catalog UX. This is the final phase.

---

## Testing Strategy

### Unit Tests:

(The project has a `vitest` harness; the auth and projects slices co-locate `*.test.ts`. Formal test-strategy/quality gates arrive in Module 3 — for this slice, prioritize the pure logic that is cheap to lock:)

- `pluginCatalogSchema`: rejects empty/whitespace name; normalizes empty notes → `null`; happy path.
- `parsePluginCatalogForm`: missing name → `{ ok: false }` with the right message; valid input → `{ ok: true, data }`.

(Query-layer behavior — `NameTakenError` and idempotent `promoteToCatalog` — depends on live PostgREST and is verified manually in Phases 3–4, matching the projects slice's manual-against-Supabase convention.)

### Integration Tests:

- None automated (matches the projects slice; query layer + routes verified manually against local Supabase).

### Manual Testing Steps:

1. `npx supabase db reset --local` → confirm `plugin_catalog` table + `name_key` UNIQUE; regenerate local types.
2. Sign in; visit `/plugins-catalog` (empty state on a fresh DB).
3. Add `Akismet` with a note → appears in the list, `?ok=created` banner.
4. Add `akismet` (lowercase) → friendly "already in the catalog" error, no duplicate row.
5. Inline-edit `Akismet`'s notes → saves, reflects on reload.
6. Delete the row via the confirm step → row gone.
7. (Promote hook) via a one-off script or psql against local: call the upsert twice with the same name → exactly one row, notes untouched on the second call.
8. Dashboard → Settings → Plugins catalog and Brand settings links work.
9. Sign out; hit `/plugins-catalog` and the API routes → redirected to `/login`.

## Performance Considerations

Negligible: `target_scale: small`, low qps. `listCatalog` is one unindexed-but-tiny table scan ordered by name; the `name_key` unique index also serves any future lookup. No pagination needed at MVP volume. `promoteToCatalog` is a single upsert per report row in S-06 — bounded and cheap.

## Migration Notes

- **Local-first apply.** `npx supabase db reset --local` after adding the migration (the dev server talks to local; `db:push` is cloud-only). Regenerate local types with `npx supabase gen types --local --schema public > src/types/database.types.ts`.
- **Ship to cloud** as a separate explicit step: `npm run db:push` (`--linked`). Production already has `SUPABASE_URL` + `SUPABASE_SECRET_KEY` (`deploy-plan.md`); the Worker reaches the new table over HTTP with no extra provisioning. Deploy is unchanged (Workers Builds on push to `master`).
- New table only; no data backfill. If `name_key` is a generated column, existing/new rows get it automatically; if app-set, the query layer populates it on every write.

## References

- Change folder: `context/changes/plugins-catalog/`
- PRD: `context/foundation/prd.md:75-76` (FR-003)
- Roadmap: `context/foundation/roadmap.md:120-130` (S-03)
- Pattern source — queries (CRUD + `23505` → typed error): `src/lib/projects/queries.ts:1-63`
- Pattern source — schema (`optionalText` normalization): `src/lib/projects/schema.ts:1-41`
- Pattern source — form parser: `src/lib/projects/form.ts:1-20`
- Pattern source — create / update / delete routes: `src/pages/api/projects/index.ts:1-20`, `src/pages/api/projects/[id].ts:1-26`, `src/pages/api/projects/[id]/delete.ts:1-17`
- Pattern source — list page + banners: `src/pages/projects/index.astro:1-70`
- Pattern source — settings-page chrome: `src/pages/brand-settings.astro:1-52`
- Pattern source — delete-confirm island: `src/components/projects/DeleteProjectButton.tsx:1-85`
- Form primitives: `src/components/auth/{FormField,SubmitButton,ServerError}.tsx`, `src/components/ui/button`
- Migration conventions + shared `set_updated_at()`: `supabase/migrations/20260529144131_create_projects.sql`, `supabase/migrations/20260529181950_create_brand_settings.sql`
- Supabase client: `src/lib/supabase.ts`
- Auth middleware (free route gating): `src/middleware.ts`
- Local dev topology (`db reset --local`, `gen types --local`): memory `local-supabase-dev-topology`
- Lessons (lint exit-code, React 19 handler type, `.astro` `no-misused-promises`): `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Migration + generated types

#### Automated

- [x] 1.1 Migration applies cleanly to local Supabase DB (`npx supabase db reset --local`, by exit code) — 9350751
- [x] 1.2 `database.types.ts` regenerates with full `plugin_catalog` Row (incl. `name_key`, `notes`) — 9350751
- [x] 1.3 Type checking passes (`npm run astro check`) — 9350751

#### Manual

- [x] 1.4 `Akismet` then `akismet`/whitespace variant fails the `name_key` unique constraint — 9350751
- [x] 1.5 Table not exposed to anon/authenticated roles (RLS enabled, no policies) — 9350751

### Phase 2: Schema, queries, and form parser (lib)

#### Automated

- [x] 2.1 Type checking passes (`npm run astro check`) — 8763245
- [x] 2.2 Linting passes (`npm run lint`, by exit code) — 8763245

#### Manual

- [x] 2.3 `pluginCatalogSchema` rejects empty/whitespace name; normalizes empty notes → `null` — 8763245

### Phase 3: API routes

#### Automated

- [x] 3.1 Type checking passes (`npm run astro check`) — e399c81
- [x] 3.2 Linting passes (`npm run lint`, by exit code) — e399c81
- [x] 3.3 Production build succeeds (`npm run build`, by exit code) — e399c81

#### Manual

- [x] 3.4 Valid POST creates a row and redirects to `?ok=created` — e399c81
- [x] 3.5 Case/whitespace duplicate returns friendly `NameTakenError`, not 500, no duplicate row — e399c81
- [x] 3.6 Update redirects to `?ok=updated`; delete redirects to `?ok=deleted` — e399c81
- [x] 3.7 Unauthenticated request to any endpoint redirects to `/login` — e399c81

### Phase 4: UI — single catalog page, inline-edit island, dashboard nav

#### Automated

- [x] 4.1 Type checking passes (`npm run astro check`) — d036cbd
- [x] 4.2 Linting passes (`npm run lint`, `.astro` + `.tsx` clean, by exit code) — d036cbd
- [x] 4.3 Production build succeeds (`npm run build`, by exit code) — d036cbd
- [x] 4.4 Unit tests still pass (`npm run test`) — d036cbd

#### Manual

- [x] 4.5 `/plugins-catalog` loads behind auth (redirects to `/login` when signed out) — d036cbd
- [x] 4.6 Adding a plugin shows it in the list; empty state renders when catalog is empty — d036cbd
- [x] 4.7 Inline-edit saves name/notes and reflects on reload; one row edits at a time — d036cbd
- [x] 4.8 Deleting a row removes it after the confirm step — d036cbd
- [x] 4.9 Case/whitespace duplicate shows friendly error banner, adds no row — d036cbd
- [x] 4.10 Dashboard → Settings → Plugins catalog + Brand settings nav works — d036cbd
- [x] 4.11 Keyboard-only navigation works through add + inline-edit forms — d036cbd
