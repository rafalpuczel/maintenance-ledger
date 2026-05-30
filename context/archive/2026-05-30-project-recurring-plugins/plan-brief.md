# Project Recurring Plugins List — Plan Brief

> Full plan: `context/changes/project-recurring-plugins/plan.md`

## What & Why

Deliver FR-009 (roadmap S-05): let a user compose a **per-project recurring plugins list** — the set of plugins that should be pre-filled on every new maintenance report for that project. Built once per project so the dev doesn't re-type the same plugin rows each cycle (PRD Secondary Success Criterion). This slice delivers list *composition* only; the actual seeding into a report belongs to S-06.

## Starting Point

The repo has a mature, four-times-repeated vertical-slice pattern (projects, brand-settings, plugins-catalog, pm-contacts): migration → generated types → `lib/<domain>/{schema,queries,form}` → `api/<domain>/{index,[id],[id]/delete}` → `.astro` page + React island. The global `plugin_catalog` table already exists and ships a reusable, idempotent `promoteToCatalog()` hook; its migration comment already names S-05 as a consumer. The project detail page (`projects/[slug].astro`) has no section below its edit form — the natural host for this UI.

## Desired End State

On a project's detail page, below the edit form, a "Recurring plugins" section lists the project's attached plugins (alphabetical). The user adds one by picking from a catalog dropdown or typing a new name (auto-promoted into the catalog, then attached), removes any with an inline confirm, and is blocked from adding the same plugin twice with a friendly message.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Link storage | Junction table `project_recurring_plugins(project_id, plugin_id)`, catalog refs only | Simplest model; keeps the catalog the single source of plugin names | Plan |
| Free-text entries | Auto-promote into `plugin_catalog` via existing `promoteToCatalog()`, then link | Free reuse of a shipped hook; every entry stays catalog-backed | Plan |
| Duplicates | DB `unique(project_id, plugin_id)` → typed `AlreadyOnListError` | DB owns the invariant; mirrors existing `NameTakenError` handling | Plan |
| UI placement | Inline section + island on `projects/[slug].astro` | Mirrors catalog/pm-contacts island pattern; no new page/nav | Plan |
| Ordering | Alphabetical by plugin name | Matches `listCatalog` ordering; no `position` column needed | Plan |
| `updated_at` | Omitted (no trigger) | Membership rows are immutable — add/remove only, never edited | Plan |

## Scope

**In scope:** join table + types; `schema/queries/form` lib; create route (branches catalog-pick vs free-text) + delete route; island with catalog `<select>` + free-text field on the project page; duplicate guard; cascade on project/catalog delete.

**Out of scope:** seeding a new report (S-06); report authoring/repeaters/PDF/email; **any cadence/due-date/overdue/notification concept** (early misframing — this is a membership list, not a scheduler); editing a membership row; manual reordering; catalog CRUD changes; a separate recurring page; multi-tenancy columns.

## Architecture / Approach

Copy the plugins-catalog slice with four adaptations: (1) the table is a join with a composite unique constraint and no `updated_at`; (2) the query layer exposes list / add-by-id / add-by-name (promote→lookup→link) / remove + a typed duplicate error, and a nested PostgREST select projects the catalog row into the list; (3) one create route branches on whether `plugin_id` or `name` was posted; (4) the island's add control is a catalog dropdown + a free-text field rather than a single text input. Redirect-with-`?ok=`/`?error=` flows, server-side list fetch, and inline confirm are unchanged from the template.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Migration + types | Join table, FKs w/ cascade, unique pair, regenerated types | Getting the no-`updated_at` deviation right; non-empty `Relationships` in generated types |
| 2. Schema + queries + form | lib trio; promote→link; nested-select list read | The PostgREST nested-select ordering by the embedded column |
| 3. API routes | create (pick vs free-text branch) + delete, slug-based redirects | Threading `slug` through for the redirect target |
| 4. Island + page section | Dropdown+free-text add, remove-with-confirm, wired into detail page | Add form diverges from template (select, not input); React 19 lint gotchas |

**Prerequisites:** S-01 (projects) and S-03 (plugins-catalog) — both done. Supabase linked; `npm run db:push` / `db:types` working.
**Estimated effort:** ~1 session across 4 small phases (each ≈ one commit), given the pattern is a near-direct copy.

## Open Risks & Assumptions

- Assumes the live/linked Supabase is reachable for `db:push` + `db:types` (the repo uses `--linked`, not local migrate scripts).
- The "filter already-attached plugins out of the dropdown" nicety is optional; the DB duplicate guard is the real protection.
- Free-text promotion couples this slice to the catalog's `promoteToCatalog`/`name_key`; if that hook's signature changes, `addRecurringPluginByName` must follow.

## Success Criteria (Summary)

- A user can attach catalog plugins and free-text plugins to a project, and free-text names appear in the catalog afterward.
- Re-adding a plugin is blocked with a friendly message; removing works and persists; deleting the project cascades the rows away.
- `npm run lint`, `npm run build`, and `npm test` pass (lint judged by exit code).
