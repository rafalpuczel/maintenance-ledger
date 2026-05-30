# Brand Settings (S-02) — Plan Brief

> Full plan: `context/changes/brand-settings/plan.md`

## What & Why

Build the global brand settings surface (PRD FR-002, roadmap S-02): one agency-wide record holding an agency name, two brand colors, and a logo. It is the single source S-08 (`branded-pdf-on-save`) fetches at PDF-render time so every report carries the agency's brand.

## Starting Point

The vertical-slice pattern is fully proven by `projects-crud` (migration → `db:types` → `lib/{schema,queries,form}` → API route → Astro page + React island), and auth is enforced globally by `src/middleware.ts`. No brand storage exists yet — only the `projects` table is migrated.

## Desired End State

A signed-in user opens `/brand-settings`, sees the current brand (name, two color pickers with live swatches, current logo, last-saved time), edits any field, optionally uploads a PNG/JPEG logo (≤ 512 KB) or removes it, and saves. The single brand row is upserted. `getBrand(client)` returns the row, or `null` before first save.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Row model | Singleton row, upsert-on-save | FR-002 mandates one agency brand; a sentinel-PK + check constraint makes duplicate rows structurally impossible. | Plan |
| Brand colors | Two (primary + secondary) | Covers the main two emphasis levels without a third field. | Plan |
| Logo storage | Data-URI in a DB column | No writable FS or object store exists on Workers; the spike proved FormePDF embeds a data-URI logo with zero S-08 fetch logic. | Plan |
| Logo limits | PNG/JPEG, ≤ 512 KB | Spike-proven formats; cap keeps the row and PDF small and the render fast. | Plan |
| Empty-input logo | Keep existing; explicit Remove button | Editing colors must not silently wipe the logo; deletion is deliberate. | Plan |
| Unconfigured read | `getBrand()` returns `null`; S-08 owns defaults | PDF generation never blocks on missing brand; clean null contract. | Plan |
| Scope add-ins | Live preview + hex validation + last-saved time | All cheap; hex validation prevents a malformed color breaking the render. | Plan |

## Scope

**In scope:** single `brand_settings` table with single-row guard; `getBrand`/`upsertBrand`; hex-validated colors; multipart logo upload (PNG/JPEG ≤ 512 KB) stored as data-URI with keep/remove semantics; one settings page + one React island with live logo/color preview and last-saved timestamp.

**Out of scope:** per-project brand override; object storage (R2/Cloudflare Images/Supabase Storage); SVG logos; create/list/delete UI; image resizing; S-08's actual PDF consumption; audit trail; a third color.

## Architecture / Approach

Mirror the projects slice, collapsing collection semantics into a singleton. One table with a boolean sentinel PK (`id boolean primary key default true check (id)`) so every insert conflicts on the same key and upsert always hits the one row. `src/lib/brand-settings/{schema,queries,form}.ts` → one POST route (`/api/brand-settings`) that upserts and redirects with `?ok`/`?error` → `/brand-settings.astro` + `BrandSettingsForm.tsx` (`client:load`). The only new mechanics vs projects: the single-row guard/upsert, and reading + base64-encoding an uploaded `File` from a `multipart/form-data` body in the parser.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Migration + types | `brand_settings` table (single-row guard, `updated_at` trigger, RLS) + regenerated types | Getting the single-row guard right; reuse existing `set_updated_at()` (don't redefine) |
| 2. Lib (schema/queries/form) | Hex-validated schema, `getBrand`/`upsertBrand`, multipart logo parser | Keep-vs-remove logo: upsert must omit `logo` to preserve, not clobber it |
| 3. API route | Single POST upsert with redirect banners | Low — direct copy of projects route shape |
| 4. UI page + island | Settings page + form with live preview, color swatches, remove-logo, timestamp | `.astro`+`.tsx` CI lint gotchas (React 19 handler type, `no-misused-promises`) |

**Prerequisites:** F-01 (shared-credential auth) — already in place; local Supabase DB to apply the migration.
**Estimated effort:** ~1–2 sessions across 4 phases (plumbing-heavy, one non-trivial bit: logo upload/parse).

## Open Risks & Assumptions

- Assumes 512 KB (~683 KB base64) logos are fine inside the single row and within FormePDF's render budget — true per the spike's headroom.
- Assumes S-08 will supply default colors when `getBrand()` is `null`; those defaults must be documented in S-08 so they aren't a mystery.
- `npm run lint` must be judged by exit code (a prior `no-misused-promises` crash read as "clean" and shipped real violations to CI — see lessons.md).

## Success Criteria (Summary)

- A signed-in user can set agency name + two colors + logo and see them persist on reload, with the logo preserved when only colors change and cleared only via Remove.
- Oversized/non-image uploads and malformed hex colors are rejected with friendly messages; no second brand row can ever exist.
- `getBrand()` returns the saved brand, or `null` before first save — the contract S-08 builds on.
