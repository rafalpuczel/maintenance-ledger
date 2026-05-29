# Projects CRUD (S-01) Implementation Plan

## Overview

Build the first domain entity in Maintenance Ledger: **projects**. A user signed in with the shared credential can create a project (name, slug, URL, contact company/name/email, internal notes), view a list of all projects, edit any field, and hard-delete a project (FR-005–008).

Because this is the first feature to touch the database, it does double duty: it ships the user-facing CRUD **and** establishes the reusable Supabase data pattern — migration tooling, per-request client factory, typed query module, and zod validation schemas — that S-02…S-09 copy.

## Current State Analysis

The data layer is greenfield (roadmap baseline, 2026-05-25; re-verified 2026-05-29):

- **No Supabase client** — `src/lib/supabase.ts` does not exist (roadmap line 60 mentions it aspirationally; it is not in the tree).
- **No schema / migrations / types / seed** — `supabase/config.toml` has `[db.migrations] enabled = true` but `schema_paths = []` (line 58) and `[db.seed] sql_paths = ["./seed.sql"]` (line 65) pointing at a file that does not exist. No `supabase/migrations/` dir. Zero domain tables.
- **No migration-runner** — no `scripts/` dir, no `db:*` npm scripts. This slice is the first to establish how DDL reaches Supabase.

What already exists and is **established convention to copy**:

- **Auth gate is free.** `src/middleware.ts` verifies the HMAC session cookie and redirects every non-public route to `/login`; it sets `context.locals.authenticated`. New routes under `/projects` and `/api/projects` are gated automatically — no per-route auth code needed.
- **API route pattern** (`src/pages/api/auth/login.ts`): `export const prerender = false`, `export const POST: APIRoute = async (context) => {...}`, body via `await context.request.formData()`, response via `context.redirect(url)`; server secrets via `import { … } from "astro:env/server"`, KV/bindings via `import { env } from "cloudflare:workers"`.
- **Pure-lib + thin-route separation** (`src/lib/auth/{credentials,session}.ts` with co-located `*.test.ts`): security/logic lives in unit-tested `src/lib/` modules; routes are thin.
- **Form pattern** (`src/components/auth/LoginForm.tsx` + `FormField`/`SubmitButton`/`ServerError`): React island, `client:load`, `method="POST" action="/api/..."`, `useFormStatus()` for pending state, `cn()` (`@/lib/utils`) for Tailwind class merge, lucide-react icons, server errors surfaced via `?error=` query param read in the page frontmatter and passed to `<ServerError>`.
- **Page pattern** (`src/pages/dashboard.astro`, `login.astro`): wrap in `@/layouts/Layout.astro`; middleware handles the redirect so pages don't re-check auth; query params via `Astro.url.searchParams.get()`.
- **Env schema** (`astro.config.mjs`): `SUPABASE_URL` + `SUPABASE_SECRET_KEY` already declared (`context:"server", access:"secret"`) and provisioned in prod (`deploy-plan.md`). `output: "server"`, `@astrojs/cloudflare` adapter, react + tailwind.
- **tsconfig**: path alias `@/*` → `./src/*`.
- **Stack**: Astro `^6.3.1`, React 19, `@supabase/supabase-js ^2.99.1` (dep), `supabase ^2.23.4` (devDep, CLI), `vitest ^3.2.4`. Tailwind v4.

### Key Discoveries:

- CLAUDE.md (load-bearing): **`@supabase/supabase-js` over HTTP/PostgREST only — never `pg` from a Worker.** Keys are `sb_secret_…` via `SUPABASE_SECRET_KEY` server-side. **Migrations and seed scripts run from a local Node process against the Supabase host directly.**
- PostgREST/`@supabase/supabase-js` **cannot run DDL** (`CREATE TABLE`). The chosen migration mechanism is the **Supabase CLI** (`supabase db push`), which `config.toml` is already configured for — this needs the Postgres connection string, a new *local-only* secret distinct from the PostgREST `SUPABASE_URL`/`SUPABASE_SECRET_KEY`.
- Prior plans (`shared-credential-auth/plan.md`, `pdf-render-pipeline/plan.md`) standardize verification on `npm run astro check` · `npm run lint` · `npm run build` · `npm run test`. `npm run build` is the final gate (catches Workers bundle/linker issues).
- Single-tenant lock (PRD Open Q3, roadmap Open Q3): **do NOT add an `agency_id`/tenant column.** Explicit tech-stack instruction.

## Desired End State

A signed-in user navigates to `/projects`, sees all projects (or an empty state), clicks "New project" to create one, opens a project at `/projects/:slug` to view and inline-edit any field, and deletes one via a type-to-confirm modal. Data persists in a Supabase `projects` table. A teammate can re-run `npm run db:push` / `npm run db:types` to reproduce the schema and regenerate types. Verified when: all four CRUD operations work end-to-end against live Supabase, `astro check`/`lint`/`build`/`test` are green, and a fresh report-routing surface (`/projects/:slug`) exists for S-06 to nest reports under.

## What We're NOT Doing

- **Soft delete / archive** — hard delete only (FR-008); recovery is operator-side restore.
- **Recurring plugins list** — that is S-05 (`project-recurring-plugins`), a separate slice; the `projects` table here carries only FR-005 fields.
- **Reports** — no report table or report UI (S-06). We only create the `/projects/:slug` route they will later nest under.
- **Multi-tenancy** — no `agency_id` column (explicit lock).
- **Pagination / search / sort** on the project list — small scale (PRD `target_scale: small`); a plain list is enough for MVP.
- **Mobile-responsive / WCAG-AA** — desktop, keyboard-navigable forms only (PRD Non-Goals).
- **Project-level auth/ownership** — single shared login; every signed-in user sees every project.

## Implementation Approach

Bottom-up, dependency-ordered: stand up the data foundation and migration tooling first (Phase 1), then the validation + typed query seam (Phase 2), then the API routes that call it (Phase 3), then the UI that calls the routes (Phase 4). Each phase is independently verifiable. Validation uses **zod** as a single source of truth shared between client and server (a new, small dependency — chosen over hand-rolled validation for typed schemas reused across the form and the API). The query module (`src/lib/projects/queries.ts`) is the durable seam every later slice imports.

## Critical Implementation Details

- **Migration mechanism / new secret.** `supabase db push` connects to Postgres directly and needs `SUPABASE_DB_URL` (the `postgresql://...pooler.supabase.com:6543/postgres` string from the Supabase dashboard → Connect). This is a **local-only** secret: add it to `.dev.vars` (gitignored) and the developer's shell — it is NOT a Worker secret and must NOT be added to `astro.config.mjs`'s env schema (the Worker never opens a Postgres socket; the Worker uses only `SUPABASE_URL`/`SUPABASE_SECRET_KEY` over HTTP). The CLI must be linked once: `npx supabase link --project-ref <ref>`.
- **Client factory is per-request, not module-singleton.** On workerd a module-scope client can leak state across requests; export `createSupabaseClient()` and call it inside each handler (mirrors how auth reads `env` per request).
- **Slug uniqueness is enforced at two layers.** A `UNIQUE` constraint on `projects.slug` is the source of truth; the create/update path must catch the Postgres unique-violation (code `23505`) and surface a friendly "slug already taken" error rather than a 500.
- **No-leak guardrail (forward-looking).** `contact_email` and `internal_notes` are agency-internal. They are fine to show in the authenticated `/projects` UI, but the PDF slices (S-08) must never render them. Nothing to enforce here beyond keeping them as ordinary columns — noted so a later slice doesn't assume they were pre-filtered.

## Phase 1: Data foundation & migration tooling

### Overview

Create the `projects` table, the migration/typegen workflow, and the Supabase client factory. This is the pattern-setting phase.

### Changes Required:

#### 1. Migration SQL

**File**: `supabase/migrations/<timestamp>_create_projects.sql` (new; `<timestamp>` via `npx supabase migration new create_projects`)

**Intent**: Define the `projects` table holding the FR-005 fields.

**Contract**: Columns — `id uuid pk default gen_random_uuid()`, `name text not null`, `slug text not null unique`, `url text`, `contact_company text`, `contact_name text`, `contact_email text`, `internal_notes text`, `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`. Add an `updated_at` auto-touch trigger (or set it explicitly in the update query — implementer's choice; if a trigger, include it in this migration). No RLS policy needed (access is via the secret key over PostgREST from the trusted Worker only; the table is not exposed to anon clients). No `agency_id`.

#### 2. config.toml — register the migration glob

**File**: `supabase/config.toml`

**Intent**: Point the (already-enabled) migrations at the new SQL so `db push`/`db reset` see it; stop referencing the non-existent seed file.

**Contract**: Set `[db.migrations] schema_paths` to include `"./migrations/*.sql"` (or confirm `db push` picks up `supabase/migrations/` by default and leave as-is). Either create an empty `supabase/seed.sql` or set `[db.seed] sql_paths = []` so `db reset` doesn't error on the missing file.

#### 3. npm scripts for migrate + typegen

**File**: `package.json`

**Intent**: Make schema application and type generation one-command, reproducible, and documented.

**Contract**: Add `"db:push": "supabase db push --db-url $SUPABASE_DB_URL"` and `"db:types": "supabase gen types typescript --db-url $SUPABASE_DB_URL > src/types/database.types.ts"`. (PowerShell expands `$env:SUPABASE_DB_URL`; document both invocations in the migration note. Cross-shell env expansion in npm scripts is the one gotcha — verify on win32.)

#### 4. Generated DB types

**File**: `src/types/database.types.ts` (new, generated — do not hand-edit)

**Intent**: Provide the `Database` type so the client and query module are fully typed.

**Contract**: Output of `npm run db:types`. Exports `Database`. Committed to the repo.

#### 5. Supabase client factory

**File**: `src/lib/supabase.ts` (new)

**Intent**: One typed, per-request client constructor every server module uses.

**Contract**: `export function createSupabaseClient(): SupabaseClient<Database>` — reads `SUPABASE_URL` + `SUPABASE_SECRET_KEY` from `astro:env/server`, calls `createClient<Database>(url, key, { auth: { persistSession: false } })`. No module-level singleton.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run astro check`
- Linting passes: `npm run lint`
- Build passes: `npm run build`
- `src/types/database.types.ts` exists and exports `Database`

#### Manual Verification:

- `npm run db:push` applies the migration to live Supabase with no error
- The `projects` table is visible in the Supabase dashboard with all FR-005 columns and a UNIQUE constraint on `slug`
- `npm run db:types` regenerates types cleanly (no diff churn on a second run)

**Implementation Note**: After Phase 1 automated verification passes, pause for manual confirmation that the migration applied to live Supabase before proceeding.

---

## Phase 2: Validation schema + query layer

### Overview

Add the zod schema and slugify helper (both unit-tested), then the typed CRUD query module. Pure, testable logic before any route wiring.

### Changes Required:

#### 1. Install zod

**File**: `package.json`

**Intent**: Add the shared-schema validation dependency.

**Contract**: `npm install zod`. (Requires user OK on the new dep — flagged in the brief's prerequisites.)

#### 2. Project zod schema

**File**: `src/lib/projects/schema.ts` (new)

**Intent**: Single source of truth for project field validation, shared by the API route (Phase 3) and the React form (Phase 4).

**Contract**: Export `projectSchema` (zod object): `name` non-empty, `slug` non-empty matching kebab-case `^[a-z0-9]+(?:-[a-z0-9]+)*$`, `url` optional URL-or-empty, `contact_company`/`contact_name` optional strings, `contact_email` optional email-or-empty, `internal_notes` optional string. Export the inferred `ProjectInput` type. (Empty optional fields normalize to `null`/`undefined` for the DB — handle empty-string-to-null here so the query module receives clean values.)

#### 3. Slugify helper

**File**: `src/lib/projects/slug.ts` (new)

**Intent**: Derive a kebab-case slug from a project name for the auto-suggest behavior.

**Contract**: `export function slugify(name: string): string` — lowercase, strip accents/non-alphanumerics, collapse whitespace/runs to single hyphens, trim leading/trailing hyphens. Deterministic; pure.

#### 4. Unit tests

**Files**: `src/lib/projects/slug.test.ts`, `src/lib/projects/schema.test.ts` (new)

**Intent**: Lock the deterministic logic (matches the auth slice's pure-lib test convention).

**Contract**: `slug.test.ts` covers accents, spaces, symbols, leading/trailing hyphens, already-slug input. `schema.test.ts` covers required-field failures, bad email, bad slug, empty-optional normalization, and a happy path.

#### 5. Query module

**File**: `src/lib/projects/queries.ts` (new)

**Intent**: The typed CRUD seam over Supabase that routes (and later slices) call.

**Contract**: Functions taking a `SupabaseClient<Database>` (so they're testable/mournable and don't each build a client): `listProjects()`, `getProjectBySlug(slug)`, `createProject(input)`, `updateProject(id, input)`, `deleteProject(id)`. Each returns `{ data, error }`-style or throws a typed error consistently (pick one and apply uniformly). `createProject`/`updateProject` surface the `23505` unique-violation distinctly so the route can map it to a slug error.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test`
- Type checking passes: `npm run astro check`
- Linting passes: `npm run lint`

#### Manual Verification:

- (none — pure logic; covered by unit tests and exercised in Phase 3)

---

## Phase 3: API routes

### Overview

Wire create/update/delete endpoints that validate with the zod schema and call the query module. Read paths are done in the page frontmatter (Phase 4), so these are the write endpoints.

### Changes Required:

#### 1. Create / update / delete endpoints

**File**: `src/pages/api/projects/index.ts` (POST create) + `src/pages/api/projects/[id].ts` (POST/PUT update, DELETE) — or a single collection file; implementer picks per Astro routing ergonomics.

**Intent**: Accept form submissions, validate server-side (authoritative), persist via the query module, redirect with success or error.

**Contract**: Each handler: `export const prerender = false`; parse `await context.request.formData()`; validate with `projectSchema.safeParse`; on failure `context.redirect("/projects/new?error=…")` (or back to the edit page) carrying a readable message; on success build a client via `createSupabaseClient()`, call the matching query fn, and redirect to `/projects` (create/delete) or `/projects/:slug` (update). Map the `23505` unique-violation to a "slug already taken" error param. No new public paths — middleware gates these automatically (do NOT add them to `PUBLIC_PATHS`).

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run astro check`
- Linting passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification:

- `POST /api/projects` with valid fields creates a row (verify in dashboard) and redirects to `/projects`
- Duplicate slug returns the friendly error, not a 500
- Update changes the row and redirects to the detail page; delete removes the row
- An unauthenticated `curl` to any endpoint redirects to `/login` (middleware gate intact)

**Implementation Note**: After Phase 3 automated verification passes, pause for manual confirmation of the write endpoints before building the UI.

---

## Phase 4: UI — list, create, detail/edit

### Overview

The three pages and their React form islands, reusing the existing form components and styling. Adds a "Projects" entry point from the dashboard.

### Changes Required:

#### 1. Projects list page

**File**: `src/pages/projects/index.astro` (new)

**Intent**: List all projects with links to detail, a "New project" button, and per-row delete.

**Contract**: Frontmatter builds a client via `createSupabaseClient()` and calls `listProjects()`; renders rows (name, slug, company) linking to `/projects/:slug`; empty-state when none. Wrap in `Layout`. Reads `?error=`/`?ok=` for post-action feedback via `<ServerError>` / a success notice. Delete is handled by a React island (next item).

#### 2. Delete confirmation island

**File**: `src/components/projects/DeleteProjectButton.tsx` (new)

**Intent**: Type-to-confirm guard proportionate to an irreversible hard delete.

**Contract**: React island; opens a modal requiring the user to type the project name (or slug) before the Delete button enables; submits a `method="POST"` form to the delete endpoint (`useFormStatus` for pending). Reuse `Button`/`cn`/lucide. Props: `projectName`, `projectId` (or slug for the action URL).

#### 3. Create page + form

**Files**: `src/pages/projects/new.astro` (new), `src/components/projects/ProjectForm.tsx` (new)

**Intent**: Create a project; auto-suggest the slug from the name.

**Contract**: `ProjectForm` is a React island (`client:load`) reused for create and edit; `method="POST" action="/api/projects"`; fields via the existing `FormField`; client-side validation via the same `projectSchema` (`safeParse`) for instant feedback; slug field auto-fills from `name` via `slugify` until the user edits it manually; `<SubmitButton>` + `<ServerError serverError={…}>`. Page reads `?error=` and passes it in.

#### 4. Detail / edit page

**File**: `src/pages/projects/[slug].astro` (new)

**Intent**: View a project and inline-edit any field.

**Contract**: Frontmatter calls `getProjectBySlug(Astro.params.slug)`; 404/redirect to `/projects` if missing. Renders `ProjectForm` pre-populated with the project (edit mode → action targets the update endpoint with the id). Includes the `DeleteProjectButton`. Wrap in `Layout`.

#### 5. Dashboard link

**File**: `src/pages/dashboard.astro`

**Intent**: Give users a way into the new surface.

**Contract**: Add a link/button to `/projects`. Minimal, matches existing styling.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run astro check`
- Linting passes: `npm run lint`
- Build passes: `npm run build`
- Unit tests still pass: `npm run test`

#### Manual Verification:

- Create → new project appears in the list; slug auto-suggests from name and is editable
- Detail page shows all fields; inline edit saves and reflects changes
- Delete modal requires typing the name; only then does Delete enable; row disappears after
- Empty state renders when no projects exist
- Dashboard → Projects navigation works; unauthenticated access to any `/projects*` route redirects to `/login`
- Keyboard-only navigation works through the create/edit forms (PRD a11y commitment)

**Implementation Note**: After Phase 4 automated verification passes, pause for manual confirmation of the full CRUD UX.

---

## Testing Strategy

### Unit Tests:

- `slugify`: accents, symbols, whitespace runs, leading/trailing hyphens, idempotency on already-slug input.
- `projectSchema`: required-field failures, invalid email, invalid slug pattern, empty-optional → null normalization, happy path.

### Integration Tests:

- None automated (matches the auth slice; query layer + routes verified manually against live Supabase). Rationale recorded in the brief.

### Manual Testing Steps:

1. `npm run db:push` → confirm `projects` table + unique slug in the Supabase dashboard.
2. Create a project with all fields → appears in `/projects`, redirects correctly.
3. Create a second project reusing the first slug → friendly "slug already taken" error, no 500.
4. Open `/projects/:slug` → edit name and contact email → saves, list reflects the change.
5. Delete via the modal → type the name to enable, confirm row is gone.
6. `curl` an endpoint and a page unauthenticated → both redirect to `/login`.

## Performance Considerations

Negligible: `target_scale: small`, low qps. PostgREST queries are fast and well under any CPU budget (the project's CPU concern is PDF rendering, not DB). No pagination needed at MVP volume.

## Migration Notes

- Apply schema: set `SUPABASE_DB_URL` (Postgres pooler string from Supabase → Connect) in `.dev.vars` + shell, `npx supabase link --project-ref <ref>` once, then `npm run db:push`. `SUPABASE_DB_URL` is **local-only** — never a Worker secret, never in `astro.config.mjs`.
- Regenerate types after any schema change: `npm run db:types` (commit the result).
- Production already has `SUPABASE_URL` + `SUPABASE_SECRET_KEY` (`deploy-plan.md`); the Worker reaches the same table over HTTP with no extra provisioning. Deploy is unchanged (Workers Builds on push to `master`).

## References

- Roadmap slice: `context/foundation/roadmap.md` (S-01, lines 96–106)
- PRD: `context/foundation/prd.md` (FR-005–008, Access Control, Non-Goals)
- Data/migration rules: `CLAUDE.md` (Supabase-over-HTTP, keys, local-Node migrations)
- API + form patterns to copy: `src/pages/api/auth/login.ts`, `src/middleware.ts`, `src/components/auth/LoginForm.tsx`, `src/components/auth/FormField.tsx`
- Prior plan conventions: `context/changes/shared-credential-auth/plan.md`
- Deploy state / secrets: `context/deployment/deploy-plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data foundation & migration tooling

#### Automated

- [x] 1.1 Type checking passes: `npm run astro check` — c341824
- [x] 1.2 Linting passes: `npm run lint` — c341824
- [x] 1.3 Build passes: `npm run build` — c341824
- [x] 1.4 `src/types/database.types.ts` exists and exports `Database` — c341824

#### Manual

- [x] 1.5 `npm run db:push` applies the migration to live Supabase with no error — c341824
- [x] 1.6 `projects` table visible in dashboard with all FR-005 columns + UNIQUE slug — c341824
- [x] 1.7 `npm run db:types` regenerates cleanly (no churn on second run) — c341824

### Phase 2: Validation schema + query layer

#### Automated

- [x] 2.1 Unit tests pass: `npm run test` — b2b3ced
- [x] 2.2 Type checking passes: `npm run astro check` — b2b3ced
- [x] 2.3 Linting passes: `npm run lint` — b2b3ced

### Phase 3: API routes

#### Automated

- [x] 3.1 Type checking passes: `npm run astro check` — 2c5067d
- [x] 3.2 Linting passes: `npm run lint` — 2c5067d
- [x] 3.3 Build passes: `npm run build` — 2c5067d

#### Manual

- [x] 3.4 `POST /api/projects` creates a row and redirects to `/projects` — 2c5067d
- [x] 3.5 Duplicate slug returns friendly error, not 500 — 2c5067d
- [x] 3.6 Update changes row + redirects to detail; delete removes row — 2c5067d
- [x] 3.7 Unauthenticated request to any endpoint redirects to `/login` — 2c5067d

### Phase 4: UI — list, create, detail/edit

#### Automated

- [x] 4.1 Type checking passes: `npm run astro check`
- [x] 4.2 Linting passes: `npm run lint`
- [x] 4.3 Build passes: `npm run build`
- [x] 4.4 Unit tests still pass: `npm run test`

#### Manual

- [x] 4.5 Create → appears in list; slug auto-suggests and is editable
- [x] 4.6 Detail shows all fields; inline edit saves
- [x] 4.7 Delete modal requires typing the name before enabling; row gone after
- [x] 4.8 Empty state renders with no projects
- [x] 4.9 Dashboard → Projects nav works; unauthenticated `/projects*` redirects to `/login`
- [x] 4.10 Keyboard-only navigation works through create/edit forms
