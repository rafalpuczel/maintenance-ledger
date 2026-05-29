# Projects CRUD (S-01) — Plan Brief

> Full plan: `context/changes/projects-crud/plan.md`

## What & Why

Build the first domain entity in Maintenance Ledger — **projects** — so a signed-in user can create, list, edit, and hard-delete client projects (FR-005–008). Because it's the first feature to touch the database, it also establishes the reusable Supabase data pattern (migration tooling, client factory, typed query module, zod schemas) that the eight downstream slices copy.

## Starting Point

The data layer is greenfield: no Supabase client, no schema, no migrations, no generated types, no migration-runner script (`supabase/config.toml` has migrations enabled but an empty `schema_paths` and a dangling `seed.sql` reference). Auth (F-01) is done — `src/middleware.ts` already gates every non-login route, and the API-route / React-form conventions from the auth slice are the templates to copy.

## Desired End State

`/projects` lists all projects with create / open / delete affordances; `/projects/new` creates one (slug auto-suggested from the name); `/projects/:slug` shows the project and inline-edits any field; delete is a type-to-confirm modal. Data lives in a Supabase `projects` table reproducible via `npm run db:push` / `npm run db:types`. The `/projects/:slug` route is the surface S-06 will later nest reports under.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Migration mechanism | Supabase CLI `db push` + `db:push`/`db:types` npm scripts | PostgREST can't run DDL; CLI is the canonical flow `config.toml` is already set up for and gives free typegen. | Plan |
| Slug semantics | Unique key, auto-suggested from name + editable, used in `/projects/:slug` | Human-readable stable id, clean routes, collision-safe foundation for report routes. | Plan |
| Data-access layering | `createSupabaseClient()` factory + `src/lib/projects/queries.ts` typed module; thin routes | Mirrors the established `src/lib/auth/*` pure-lib/thin-route split; the query module is the reusable seam. | Plan |
| Validation | **zod** schema shared by client + server | Single source of truth, strongly typed, reused across the form and the API. | Plan |
| Delete UX | Type-to-confirm modal (type the project name) | Proportionate to an irreversible hard delete with no in-app undo. | Plan |
| Routes | `/projects` (list+delete), `/projects/new` (create), `/projects/:slug` (view+edit) | Clean separation; yields the per-project URL reports nest under in S-06. | Plan |
| Test coverage | Unit-test pure logic only (slugify + zod schema); CRUD verified manually | Matches the auth slice (pure libs tested); high value per effort under the 3-week budget. | Plan |

## Scope

**In scope:** `projects` table + migration tooling; per-request Supabase client factory; zod schema + slugify (unit-tested); typed CRUD query module; create/update/delete API routes; list / create / detail-edit pages with reused form components + type-to-confirm delete; dashboard link.

**Out of scope:** soft delete/archive; recurring-plugins list (S-05); reports (S-06); multi-tenancy / `agency_id`; list pagination/search/sort; mobile-responsive & WCAG-AA; per-project ownership.

## Architecture / Approach

Bottom-up, dependency-ordered. Phase 1 lays the data foundation (table, migration/typegen scripts, client factory). Phase 2 adds the pure, unit-tested validation (zod schema + slugify) and the typed query module. Phase 3 wires write API routes that validate server-side and call the query module. Phase 4 builds the three pages and React form islands, reusing the existing `FormField`/`SubmitButton`/`ServerError` components. The Worker reaches Supabase only over HTTP/PostgREST with the secret key; DDL is applied locally via the Supabase CLI — never `pg` from the Worker.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Data foundation & migration tooling | `projects` table, `db:push`/`db:types` scripts, generated types, client factory | Win32 env-var expansion in npm scripts; obtaining the `SUPABASE_DB_URL` Postgres string |
| 2. Validation schema + query layer | zod schema + slugify (tested), typed CRUD query module | Consistent error contract incl. `23505` unique-violation handling |
| 3. API routes | create/update/delete endpoints with server-side validation | Mapping unique-violation to a friendly error rather than a 500 |
| 4. UI — list, create, detail/edit | three pages + form/delete islands + dashboard link | Reusing the auth form components cleanly; type-to-confirm modal correctness |

**Prerequisites:** F-01 auth (done). User OK to add **zod**. The Postgres connection string (`SUPABASE_DB_URL`) from the Supabase dashboard for local migrations, and a one-time `supabase link`. `SUPABASE_URL`/`SUPABASE_SECRET_KEY` already provisioned in prod.
**Estimated effort:** ~2–3 after-hours sessions across the four phases.

## Open Risks & Assumptions

- **New local secret.** `SUPABASE_DB_URL` is local-only (CLI migrations); it must NOT become a Worker secret or enter `astro.config.mjs`'s env schema — the Worker uses HTTP only.
- **Cross-shell npm scripts.** `$SUPABASE_DB_URL` vs `$env:SUPABASE_DB_URL` on win32 needs verifying when wiring `db:push`/`db:types`.
- **Single-tenant lock.** No `agency_id` column now (explicit instruction); retrofitting tenancy later is an accepted, deferred cost.
- **zod is a new dependency** not previously in the stack — small and well-supported, but a deliberate addition.

## Success Criteria (Summary)

- A signed-in user can create, list, edit, and hard-delete a project end-to-end against live Supabase, with a type-to-confirm delete and friendly slug-collision handling.
- The schema is reproducible (`npm run db:push`) and types regenerate cleanly (`npm run db:types`); `astro check` / `lint` / `build` / `test` all pass.
- A `/projects/:slug` route exists for S-06 to nest reports under, and the established query-module + migration pattern is ready for S-02…S-09 to copy.
