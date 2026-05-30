# Plugins Catalog (S-03) — Plan Brief

> Full plan: `context/changes/plugins-catalog/plan.md`

## What & Why

Build the global **predefined plugins catalog** (PRD FR-003, roadmap S-03): the canonical agency-wide list of WordPress plugin names (each with optional notes). It's the name source two later slices consume — S-05 (project recurring-plugins pick-list) and S-06 (report plugin-row dropdown) — and ships the thin `promoteToCatalog()` hook FR-003 needs so a free-text plugin name typed on a report row auto-adds to the catalog.

## Starting Point

The vertical-slice pattern is fully established. `projects-crud` is the collection-CRUD template (migration → typed query module → zod → form-POST routes → pages + React islands); `brand-settings` is the singleton-settings precedent. Auth gates every route for free, Supabase is a per-request HTTP/PostgREST client, and the `public.set_updated_at()` trigger already exists. No catalog table exists yet.

## Desired End State

A signed-in user opens `/plugins-catalog` (from a new dashboard "Settings" group), manages entries inline — add a name + optional notes, edit any row in place, delete with a confirm. Case/whitespace duplicates (`Akismet` vs `akismet`) collide into one canonical entry with a friendly error. The query layer exposes CRUD plus a thin idempotent `promoteToCatalog(client, name)` that S-06 can call blindly per report row.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Name uniqueness | Case-insensitive unique | Keeps names truly canonical — casing/whitespace variants can't fragment the dropdown. | Plan |
| Uniqueness mechanism | Normalized `name_key` column + plain UNIQUE | A functional `lower(name)` index isn't addressable by PostgREST `onConflict`; a stored key is. | Plan |
| `promoteToCatalog()` on duplicate | Idempotent no-op upsert (ignore-on-conflict) | S-06 calls it per row with no pre-check/try-catch — the "thin write" the roadmap asks for; never clobbers notes. | Plan |
| Delete safety | Plain hard delete, no FK guard | Nothing references the catalog yet; matches projects + MVP "hard delete only"; S-05/S-06 own their reference model. | Plan |
| Edit UI shape | Single page, inline rows | Two-field records don't justify projects' per-entity detail pages; one screen the user scans. | Plan |
| Entry point | Dashboard link under a "Settings" group | Matches FR-003's global-settings framing; also closes the gap where Brand settings has no dashboard link. | Plan |

## Scope

**In scope:** `plugin_catalog` table (name + optional notes + normalized unique key); zod schema + form parser; CRUD query layer + `NameTakenError` + thin `promoteToCatalog()`; create/update/delete API routes; single `/plugins-catalog` page with inline-edit island; dashboard Settings nav.

**Out of scope:** the S-05 pick-list and S-06 dropdown UIs; *calling* `promoteToCatalog()` (built in S-06); soft delete; FK guards; pagination/search; any field beyond name + notes; bulk import; multi-tenancy; mobile/WCAG-AA.

## Architecture / Approach

Bottom-up, mirroring `projects-crud`: migration + types (Phase 1) → pure zod/query/parser seam incl. the promote hook (Phase 2) → form-POST write routes (Phase 3) → single-page UI + nav (Phase 4). All writes are native HTML form posts riding the existing redirect/`?ok=`/`?error=` round-trip. The query module (`src/lib/plugins-catalog/queries.ts`) is the durable seam S-05/S-06 import. Two new mechanics vs. projects: the normalized `name_key` column (makes case-insensitive uniqueness addressable by both create and upsert) and the inline-row edit island.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Migration + types | `plugin_catalog` table, `name_key` UNIQUE, RLS; regenerated types | Generated-column form for `name_key` may not generate under local PG — app-set fallback documented |
| 2. Lib (schema/queries/parser) | zod, CRUD + `NameTakenError`, thin `promoteToCatalog()` | Getting the upsert `onConflict`/ignore-duplicates semantics right so promote never clobbers notes |
| 3. API routes | create / update / delete endpoints | Mapping `23505` → friendly error (proven projects pattern) |
| 4. UI + nav | `/plugins-catalog` page, inline-edit island, dashboard Settings group | Inline per-row edit state — the one divergence from a literal projects copy |

**Prerequisites:** F-01 (auth — done) and the projects data pattern (done). Local Supabase running (`npx supabase start` / `db reset --local`).
**Estimated effort:** ~1 session across 4 phases — a simpler copy of the projects slice.

## Open Risks & Assumptions

- **`name_key` generated-column support** under the local Postgres version is assumed; the plan documents an app-set-column fallback if `generated always as ... stored` fails to generate.
- **S-06 coupling**: `promoteToCatalog()` is shipped and unit-exercisable but not invoked until S-06; its idempotent no-op contract is the agreed interface S-06 builds against.
- **Hybrid migration topology**: must `db reset --local` (not just `db:push`, which is cloud-only) or runtime PostgREST calls fail with an opaque error.

## Success Criteria (Summary)

- A signed-in user can add, inline-edit, and delete catalog entries on one page, persisting across reloads.
- A case/whitespace duplicate name is rejected with a friendly message, never a 500 or a duplicate row.
- `promoteToCatalog()` on an existing name is a no-op (no error, notes preserved) and on a new name inserts a row — the contract S-06 will rely on.
