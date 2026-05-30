# Brand Settings (S-02) Implementation Plan

## Overview

Build the global **brand settings** surface (PRD FR-002, roadmap S-02): one agency-wide brand record holding an agency name, two brand colors, and a logo. The user views and edits it on a single settings page; there is no list, slug, create, or delete. The brand is the single source S-08 (`branded-pdf-on-save`) will fetch at PDF-render time.

## Current State Analysis

- The vertical-slice pattern is fully established by `projects-crud` and is the template to copy: migration → `npm run db:types` → `src/lib/<feature>/{schema,queries,form}.ts` → `src/pages/api/<feature>/*.ts` → Astro page(s) + `client:load` React island. See `src/lib/projects/queries.ts:1-63`, `src/lib/projects/schema.ts:1-42`, `src/lib/projects/form.ts:1-20`, `src/pages/api/projects/index.ts:1-20`, `src/pages/projects/[slug].astro:1-57`, `src/components/projects/ProjectForm.tsx:1-162`.
- **Auth is already global.** `src/middleware.ts` enforces a session on every non-public path; new brand-settings pages and the API route are protected automatically with no extra work.
- **Supabase access** is a per-request HTTP/PostgREST client via `createSupabaseClient()` (`src/lib/supabase.ts:1-13`) using `SUPABASE_SECRET_KEY` (bypasses RLS). Never `pg` from the Worker.
- **DB conventions** (`supabase/migrations/20260529144131_create_projects.sql`): `pgcrypto` for `gen_random_uuid()`, a shared `public.set_updated_at()` trigger function (already exists — do **not** redefine it), nullable text columns store `null` not `""`, and `enable row level security` with no policies as a closed default.
- **Shared form primitives** live under `src/components/auth/`: `FormField`, `SubmitButton`, `ServerError`. `ProjectForm` reuses them and types its submit handler as `React.SubmitEvent<HTMLFormElement>` (per `context/foundation/lessons.md` — `React.FormEvent` is deprecated in React 19 and fails CI).
- **No brand storage exists yet.** Only the `projects` table is migrated. The spike (`context/changes/pdf-render-pipeline/`) proved FormePDF embeds a `data:` URI logo (PNG/JPEG) directly via `<Image src=...>` and applies hex colors to template styles.
- **No writable filesystem and no object store.** Deploy target is Cloudflare Workers Static Assets: the runtime FS is read-only and `dist`/`public` is an immutable build-time bundle. `wrangler.jsonc` binds only `ASSETS` (read-only), `SESSION` (KV), and observability; `env.IMAGES` (per `context/deployment/deploy-plan.md:35-38`) is the adapter's image-*processing* binding, not a confirmed upload API. No R2 or Supabase Storage bucket is provisioned. Storing the logo as a data-URI in the DB column is therefore both the simplest and the only zero-new-infra option.

## Desired End State

A signed-in user navigates to `/brand-settings`, sees the current brand (agency name, two color pickers with live swatches, the current logo if any, and a last-saved timestamp), edits any field, optionally uploads a new PNG/JPEG logo (≤ 512 KB) or removes the existing one, and clicks Save. The single brand row is upserted. Re-opening the page shows the saved values. Programmatically, `getBrand(client)` returns the brand row or `null` when never configured.

Verify: the page renders behind auth; saving colors without touching the logo preserves the existing logo; uploading a logo round-trips (visible on reload); removing the logo clears it; an oversized or non-image upload is rejected with a friendly error; a second row can never be created (DB guard); `getBrand()` returns `null` before first save.

### Key Discoveries:

- Single-row model is mandated: migration comment "Single-tenant MVP — no `agency_id`" (`supabase/migrations/20260529144131_create_projects.sql:2`) and FR-002 "one agency brand only" (`context/foundation/prd.md:73-74`).
- `public.set_updated_at()` already exists from the projects migration — the new migration only adds a trigger that calls it, it must not `create or replace` the function again (harmless but redundant; reuse it).
- Logo is binary, so the form must be `multipart/form-data` and the parser reads a `File` from `FormData` (not the string-only `form.get(field) as string` pattern). This is the one real deviation from `projects/form.ts`.
- Hex-color validation belongs in the shared zod schema so a malformed color can never reach the PDF (chosen scope item).
- S-08 contract: `getBrand()` returns `null` when unconfigured; S-08 owns the fallback default colors and no-logo behavior.

## What We're NOT Doing

- No per-project / per-client brand override (parked, FR-002).
- No logo object storage (R2 / Cloudflare Images / Supabase Storage) — data-URI in the DB only.
- No SVG logo support — PNG/JPEG only (SVG embedding is unverified by the spike).
- No create/list/delete UI — it is a singleton settings record, edit-only.
- No image resizing / cropping / optimization — the user supplies an appropriately sized raster.
- No S-08 work (the PDF actually consuming the brand) — that is a separate slice; this slice only guarantees the `getBrand()` read contract.
- No audit trail of who changed the brand (multi-user concerns are post-MVP).
- No third brand color — two colors only (primary + secondary), per the chosen color model.

## Implementation Approach

Copy the projects slice structure, collapsing collection semantics into a singleton:

- **One table, one row, upsert on save.** Enforce single-row at the DB level with a fixed sentinel primary key plus a check constraint, so duplicate rows are structurally impossible.
- **`getBrand()` + `upsertBrand()`** replace the five projects query functions. No slug, no delete.
- **One POST route** (`/api/brand-settings`) does the upsert and redirects with `?ok=saved` / `?error=`.
- **One page + one island.** The page server-reads the brand and renders `BrandSettingsForm` in a single mode (no create/edit split). The island adds the logo `<input type="file">`, live preview, color swatches, and a remove-logo toggle.

The only genuinely new mechanics versus projects are (a) the single-row DB guard and upsert, and (b) reading + validating + base64-encoding an uploaded file in the form parser. Everything else is a direct pattern copy.

## Critical Implementation Details

- **Multipart form + file parsing.** The brand form submits `enctype="multipart/form-data"`. In the API route, `await context.request.formData()` returns a `File` for the logo field. The parser must: read `file.type` (must be `image/png` or `image/jpeg`), read `file.size` (must be ≤ 512 KB), then `Buffer.from(await file.arrayBuffer()).toString("base64")` to build `data:${file.type};base64,${b64}`. An empty file input yields a zero-size `File` (or empty string) → treat as "no new logo" (preserve existing), distinct from the explicit remove signal.
- **Keep-vs-remove logo semantics.** Three cases the parser/query must distinguish: (1) new file uploaded → set logo to the new data-URI; (2) no file + remove flag not set → omit `logo` from the upsert payload so the stored value is preserved; (3) remove flag set → set `logo` to `null`. Because case (2) must *not* overwrite, the query layer cannot blindly upsert a full object — `upsertBrand()` takes a payload where `logo` may be "absent" (preserve), a string (set), or `null` (clear). Model the parsed logo as a discriminated value (e.g. `{ logo: string } | { logo: null } | {}`) merged into the rest of the fields.
- **Single-row DB guard.** Use a boolean sentinel column (e.g. `id boolean primary key default true` with `check (id)`), so every insert collides on the same PK and upsert always targets the one row. `upsertBrand()` uses PostgREST `.upsert(payload, { onConflict: "id" })` (or update-then-insert) against that fixed key.
- **React 19 handler type.** Type the form submit handler as `React.SubmitEvent<HTMLFormElement>`, never `React.FormEvent` (deprecated; fails CI per lessons.md).

---

## Phase 1: Migration + generated types

### Overview

Create the `brand_settings` table with a single-row guard, the `updated_at` trigger (reusing the existing function), and closed-default RLS; regenerate the TypeScript database types.

### Changes Required:

#### 1. Brand settings migration

**File**: `supabase/migrations/<timestamp>_create_brand_settings.sql`

**Intent**: Define the single global brand record so the app has somewhere to persist agency name, two brand colors, and the logo data-URI; guarantee at most one row.

**Contract**: New table `public.brand_settings` with columns: a single-row sentinel primary key (`id boolean primary key default true` + `check (id)`); `agency_name text not null`; `primary_color text not null`; `secondary_color text not null`; `logo text` (nullable; stores a `data:` URI); `created_at timestamptz not null default now()`; `updated_at timestamptz not null default now()`. Add a `before update` trigger calling the **existing** `public.set_updated_at()` (do not redefine the function). `alter table public.brand_settings enable row level security;` with no policies. Follow the header-comment style of the projects migration.

#### 2. Regenerate database types

**File**: `src/types/database.types.ts`

**Intent**: Make the new table available to the typed Supabase client and the query layer.

**Contract**: Run `npm run db:types` after the migration is applied to the local DB. The generated `Database["public"]["Tables"]["brand_settings"]["Row"]` must include all columns above. Do not hand-edit this file.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly to the local Supabase DB (`npm run db:reset` or the project's local-apply command) — judged by **exit code**, not by grepping output (per lessons.md).
- `npm run db:types` regenerates `src/types/database.types.ts` with a `brand_settings` Row type including `agency_name`, `primary_color`, `secondary_color`, `logo`, `created_at`, `updated_at`.
- Type checking passes: `npm run typecheck` (or `astro check`).

#### Manual Verification:

- Inserting a second row into `brand_settings` fails the single-row guard (verified via a one-off SQL attempt against local).
- Table is not exposed to anon/authenticated roles (RLS enabled, no policies).

**Implementation Note**: After this phase and all automated verification passes, pause for manual confirmation before proceeding.

---

## Phase 2: Schema, queries, and form parser (lib)

### Overview

Add the `src/lib/brand-settings/` module: zod validation (with hex-color checks and logo handling), the `getBrand`/`upsertBrand` query functions, and the multipart form parser that decodes + validates the uploaded logo.

### Changes Required:

#### 1. Validation schema

**File**: `src/lib/brand-settings/schema.ts`

**Intent**: Validate the brand fields independently of HTTP so both the API route and the client island can reuse the rules; guarantee colors are well-formed hex before they can reach the PDF.

**Contract**: Export `brandSettingsSchema` (zod object) with `agency_name: z.string().trim().min(1, ...)`, and `primary_color` / `secondary_color` validated against a hex pattern (`#RGB` or `#RRGGBB`) with a friendly message. Export `type BrandSettingsInput = z.infer<...>`. The logo is **not** part of this schema (it is binary, handled by the parser) — this schema covers the text fields the client island also validates. Reuse the `optionalText` style only if a nullable text field is added; colors are required.

#### 2. Query layer

**File**: `src/lib/brand-settings/queries.ts`

**Intent**: Read and write the single brand row over PostgREST, returning `null` when unconfigured so callers (this page now, S-08 later) can branch.

**Contract**: `export type Brand = Database["public"]["Tables"]["brand_settings"]["Row"]`. `getBrand(client): Promise<Brand | null>` selects the single row via `.maybeSingle()`. `upsertBrand(client, payload): Promise<Brand>` upserts against the fixed sentinel key (`onConflict: "id"`). The payload type must allow the logo to be **omitted** (preserve existing), a `string` (set), or `null` (clear) — e.g. `BrandSettingsInput & ({ logo?: never } | { logo: string | null })`. On preserve, the upsert must not include `logo` so the stored value is untouched (note: a blind upsert of a full object would clobber it — only include `logo` when setting or clearing). Throw `Error(error.message)` on PostgREST errors (mirror projects' style). No custom unique-violation error is needed (no slug).

#### 3. Form parser

**File**: `src/lib/brand-settings/form.ts`

**Intent**: Turn a submitted multipart form into a validated upsert payload (or the first error message for the redirect path), including decoding and bounding the logo file.

**Contract**: `parseBrandForm(form: FormData): { ok: true; data: <upsert payload> } | { ok: false; message: string }`. Steps: validate text fields via `brandSettingsSchema.safeParse`; then resolve the logo per the three-case rule in Critical Implementation Details — read `form.get("logo")` as a `File`; if present and size > 0, enforce `type ∈ {image/png, image/jpeg}` and `size ≤ 512 * 1024`, else return a friendly error; encode to a `data:` URI; if a `remove_logo` field is truthy and no new file, set logo to `null`; otherwise omit logo. Return the merged payload. Use `Buffer.from(await file.arrayBuffer()).toString("base64")` for encoding.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck`.
- Linting passes: `npm run lint` — judged by **exit code** (per lessons.md; watch for the `no-misused-promises` crash class).

#### Manual Verification:

- `brandSettingsSchema` rejects a non-hex color and an empty agency name with the expected messages.
- `parseBrandForm` rejects a >512 KB file and a non-PNG/JPEG file, accepts a small PNG (produces a `data:image/png;base64,...` value), preserves logo when no file + no remove, and clears it when `remove_logo` is set.

**Implementation Note**: After this phase and all automated verification passes, pause for manual confirmation before proceeding.

---

## Phase 3: API route

### Overview

Add the single POST endpoint that parses the form, upserts the brand, and redirects with success/error params.

### Changes Required:

#### 1. Brand settings POST route

**File**: `src/pages/api/brand-settings.ts`

**Intent**: Accept the settings form submission, persist it via the query layer, and round-trip the user back to the settings page with a status banner.

**Contract**: `export const POST: APIRoute`. Read `await context.request.formData()`, run `parseBrandForm`; on parse failure redirect to `/brand-settings?error=<encoded message>`. On success call `upsertBrand(createSupabaseClient(), parsed.data)` and redirect to `/brand-settings?ok=saved`; on thrown error redirect to `/brand-settings?error=Could%20not%20save%20brand%20settings`. Mirror the redirect/encode shape of `src/pages/api/projects/index.ts`. The route file stays `.ts` (Astro disallows `.tsx` API routes).

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck`.
- Linting passes: `npm run lint` (exit code).
- Production build succeeds: `npm run build` (exit code).

#### Manual Verification:

- POSTing a valid multipart form upserts the row and lands on `/brand-settings?ok=saved`.
- POSTing an invalid form lands back on `/brand-settings?error=...` with a readable message.

**Implementation Note**: After this phase and all automated verification passes, pause for manual confirmation before proceeding.

---

## Phase 4: UI page + React island

### Overview

Add the `/brand-settings` Astro page (server-reads the brand, shows banners and last-saved timestamp) and the `BrandSettingsForm` React island (text fields, color pickers with live swatches, logo file input with live preview, and a remove-logo control).

### Changes Required:

#### 1. Brand settings page

**File**: `src/pages/brand-settings.astro`

**Intent**: Render the single settings surface behind auth, seeded with the current brand and any `?ok`/`?error` banner, plus the last-saved time.

**Contract**: Server-side `getBrand(createSupabaseClient())`; read `error` and `ok` from `Astro.url.searchParams` (map `ok === "saved"` → "Brand settings saved."). Render `<BrandSettingsForm>` with `action="/api/brand-settings"`, `serverError={error}`, and `initial` populated from the brand row (empty strings / no logo when `null`). Display `updated_at` (formatted) when a brand row exists. Reuse `Layout.astro` and the projects page's container/banner styling. No redirect-on-missing (unlike `[slug].astro`) — a `null` brand renders an empty form.

#### 2. Brand settings form island

**File**: `src/components/brand-settings/BrandSettingsForm.tsx`

**Intent**: Client-side form for editing the brand, with hex validation, live logo + color preview, and explicit logo removal, submitting as multipart.

**Contract**: Default export `BrandSettingsForm`. Props: `{ action: string; serverError?: string | null; initial?: { agency_name: string; primary_color: string; secondary_color: string; logo: string | null }; updatedAt?: string | null }` (single mode — no create/edit split). `<form method="POST" action={action} encType="multipart/form-data" onSubmit={handleSubmit} noValidate>`. Reuse `FormField` for `agency_name`; use color inputs for the two colors with adjacent live swatches; `<input type="file" name="logo" accept="image/png,image/jpeg">` with a live `<img>` preview of the chosen file (via `URL.createObjectURL`) or the existing `initial.logo`; a "Remove logo" control that, when active, renders a hidden `remove_logo` field and hides the preview. Client-side validate the text fields with `brandSettingsSchema.safeParse`; type the handler as `React.SubmitEvent<HTMLFormElement>`. Reuse `ServerError` and `SubmitButton` ("Save changes" / "Saving..."). Mark `client:load` in the page.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck`.
- Linting passes: `npm run lint` (exit code; verify `.astro` + `.tsx` both clean given the prior CI gotchas).
- Production build succeeds: `npm run build` (exit code).

#### Manual Verification:

- `/brand-settings` loads behind auth (redirects to `/login` when signed out).
- Editing colors and saving without selecting a logo preserves the existing logo on reload.
- Uploading a PNG/JPEG shows the live preview, and after save the logo persists on reload.
- "Remove logo" clears the logo after save.
- An oversized/non-image upload shows a friendly error and does not change stored data.
- Invalid hex color is blocked client-side; last-saved timestamp updates after a save.

**Implementation Note**: After this phase and all automated verification passes, pause for manual confirmation. This is the final phase.

---

## Testing Strategy

### Unit Tests:

(Project has no test harness yet — testing strategy is introduced in Module 3. Verification here is via typecheck/lint/build plus manual checks. If/when a harness exists, prioritize:)

- `brandSettingsSchema`: rejects empty agency name and malformed hex; accepts valid `#RRGGBB`/`#RGB`.
- `parseBrandForm`: the three logo cases (set / preserve / clear) and the size + MIME rejections.

### Integration Tests:

- Full POST → upsert → read-back round-trip for: first save (insert), subsequent save (update, single row preserved), logo set/preserve/clear.

### Manual Testing Steps:

1. Sign in; visit `/brand-settings` (empty form on a fresh DB).
2. Enter agency name + two colors, upload a small PNG; Save → banner "saved", logo + colors persist on reload; timestamp shown.
3. Change only a color; Save → logo unchanged on reload.
4. Click Remove logo; Save → logo gone on reload.
5. Try a 2 MB image and a `.gif` → friendly error, stored data unchanged.
6. Enter `not-a-color` in a color field → blocked before submit.
7. Sign out; hit `/brand-settings` → redirected to `/login`.

## Performance Considerations

Logo is bounded at 512 KB pre-encoding (~683 KB as base64) — small enough for a single-row read and well within FormePDF's proven ~140–172 ms render budget when S-08 embeds it. No N+1 or list-scaling concerns (single row). The data-URI lives in the row, so `getBrand()` is one indexed PK read.

## Migration Notes

New table only; no data backfill. The single-row guard means no cleanup of pre-existing rows. If the table is ever reset, `getBrand()` correctly returns `null` and the page renders empty until the next save.

## References

- Change folder: `context/changes/brand-settings/`
- PRD: `context/foundation/prd.md:72-74` (FR-002)
- Roadmap: `context/foundation/roadmap.md:108-118` (S-02)
- Pattern source — queries: `src/lib/projects/queries.ts:1-63`
- Pattern source — schema: `src/lib/projects/schema.ts:1-42`
- Pattern source — form parser: `src/lib/projects/form.ts:1-20`
- Pattern source — API route: `src/pages/api/projects/index.ts:1-20`
- Pattern source — detail page: `src/pages/projects/[slug].astro:1-57`
- Pattern source — form island: `src/components/projects/ProjectForm.tsx:1-162`
- Migration conventions: `supabase/migrations/20260529144131_create_projects.sql`
- Supabase client: `src/lib/supabase.ts:1-13`
- Auth middleware: `src/middleware.ts`
- Deploy bindings (no writable FS / object store): `context/deployment/deploy-plan.md:33-38`, `wrangler.jsonc`
- Lessons (lint exit-code, React 19 handler type, `.astro` `no-misused-promises`): `context/foundation/lessons.md`
- PDF/logo proof: `context/changes/pdf-render-pipeline/` (data-URI PNG/JPEG logo embeds; hex colors applied)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Migration + generated types

#### Automated

- [x] 1.1 Migration applies cleanly to local Supabase DB (judged by exit code) — 2b43108
- [x] 1.2 `npm run db:types` regenerates `database.types.ts` with full `brand_settings` Row — 2b43108
- [x] 1.3 Type checking passes (`npm run typecheck` / `astro check`) — 2b43108

#### Manual

- [x] 1.4 Inserting a second `brand_settings` row fails the single-row guard — 2b43108
- [x] 1.5 Table not exposed to anon/authenticated roles (RLS enabled, no policies) — 2b43108

### Phase 2: Schema, queries, and form parser (lib)

#### Automated

- [x] 2.1 Type checking passes (`npm run typecheck`) — 96e16ec
- [x] 2.2 Linting passes (`npm run lint`, by exit code) — 96e16ec

#### Manual

- [x] 2.3 Schema rejects non-hex color and empty agency name with expected messages — 96e16ec
- [x] 2.4 `parseBrandForm` handles set/preserve/clear logo and rejects oversized/non-image files — 96e16ec

### Phase 3: API route

#### Automated

- [x] 3.1 Type checking passes (`npm run typecheck`) — 6328cb0
- [x] 3.2 Linting passes (`npm run lint`, by exit code) — 6328cb0
- [x] 3.3 Production build succeeds (`npm run build`, by exit code) — 6328cb0

#### Manual

- [x] 3.4 Valid multipart POST upserts and redirects to `?ok=saved` — c706dc9
- [x] 3.5 Invalid POST redirects to `?error=...` with a readable message — c706dc9

### Phase 4: UI page + React island

#### Automated

- [x] 4.1 Type checking passes (`npm run typecheck`) — c706dc9
- [x] 4.2 Linting passes (`npm run lint`, `.astro` + `.tsx` clean, by exit code) — c706dc9
- [x] 4.3 Production build succeeds (`npm run build`, by exit code) — c706dc9

#### Manual

- [x] 4.4 `/brand-settings` loads behind auth (redirects to `/login` when signed out) — c706dc9
- [x] 4.5 Saving colors without a new logo preserves the existing logo on reload — c706dc9
- [x] 4.6 Uploading a PNG/JPEG shows live preview and persists after save — c706dc9
- [x] 4.7 "Remove logo" clears the logo after save — c706dc9
- [x] 4.8 Oversized/non-image upload shows a friendly error; stored data unchanged — c706dc9
- [x] 4.9 Invalid hex blocked client-side; last-saved timestamp updates after save — c706dc9
