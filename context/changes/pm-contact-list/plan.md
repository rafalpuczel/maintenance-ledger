# PM Contact List (S-04) Implementation Plan

## Overview

Build the PM contact list: a settings-maintained CRUD surface where the signed-in user can add / edit / remove PM contacts, each carrying a **name + email** (PRD FR-004). PMs are not user accounts and never log in — this list exists solely as the recipient picker that the future "Send to PM" flow (S-09 / FR-019) will read. This slice is the simplest CRUD surface in the system and is built as a near-exact clone of the existing `plugins-catalog` slice (S-03), with the one substantive difference that identity is keyed on **email** (case-insensitive) rather than name, and the email field is format-validated.

## Current State Analysis

The repo already contains two complete, structurally identical CRUD slices to mirror:

- **`plugins-catalog`** (S-03) — the closest analog: a global settings catalog rendered as a *single page* with an add-form on top and inline edit / inline two-click-delete rows below. Case-insensitive uniqueness is enforced by a generated `name_key` column + a plain `UNIQUE`, with Postgres `23505` mapped to a friendly `NameTakenError`.
- **`projects`** (S-01) — a heavier three-page slice (list / new / detail-edit); the source of the shared migration tooling and the `set_updated_at()` trigger function.

Key facts discovered:

- **DB**: Supabase over HTTP/PostgREST only. Migrations live in `supabase/migrations/<timestamp>_*.sql`, applied via `npm run db:push`; types regenerated via `npm run db:types` into `src/types/database.types.ts`. The shared `public.set_updated_at()` trigger function already exists (defined in the projects migration) — reuse it, never redefine.
- **RLS**: every table enables RLS with **zero policies** as defense-in-depth (the Worker uses the secret key, which bypasses RLS).
- **Generated-column uniqueness mechanism** (`plugin_catalog`): `name_key text not null generated always as (lower(trim(name))) stored unique`. A *stored generated column* is used (not a functional index) specifically because PostgREST `.upsert({ onConflict })` can only target a real column — and because the DB then owns the normalization invariant. We replicate this for `email`.
- **Query layer** (`src/lib/plugins-catalog/queries.ts`): a typed `Client = SupabaseClient<Database>`, `list/create/update/delete` functions, a `UNIQUE_VIOLATION = "23505"` constant, and a custom error class thrown on collision.
- **Form parser** (`src/lib/plugins-catalog/form.ts`): a `FIELDS` tuple drives FormData → `safeParse` → `{ ok, data } | { ok, message }`.
- **API routes** (`src/pages/api/plugins-catalog/*`): native HTML form POST (no `fetch`), validate → call query → `context.redirect("…?ok=created|updated|deleted")` on success, `?error=<encoded>` on failure. Auth is free via `src/middleware.ts` — API routes need no per-route auth code.
- **UI island** (`src/components/plugins-catalog/PluginCatalog.tsx`): React, `client:load`, reuses `FormField` / `SubmitButton` / `ServerError` from `src/components/auth/`. Inline `EditRow` posts to `/[id]`; inline delete posts to `/[id]/delete` behind a two-click "Delete? Confirm / Cancel". Client-side `safeParse` blocks submit and surfaces field errors.
- **Page** (`src/pages/plugins-catalog.astro`): frontmatter calls the list query, reads `?ok`/`?error` search params into a banner, renders the island. Cosmic-gradient layout, `max-w-2xl` container.
- **Dashboard** (`src/pages/dashboard.astro:20-35`): already has a "Settings" group containing **Brand settings** and **Plugins catalog** links — this slice adds a third.
- **Lessons** (`context/foundation/lessons.md`): (1) judge lint/build by **exit code**, never by grepping output; (2) keep `@typescript-eslint/no-misused-promises` **off** for `**/*.astro`; type React form handlers as `React.SubmitEvent<HTMLFormElement>` (not the deprecated `React.FormEvent`); don't introduce single-use generic type params. The existing eslint config and the `PluginCatalog.tsx` handler signature already satisfy these — following the analog keeps us clean.

## Desired End State

A signed-in user can navigate from the dashboard Settings group to **PM contacts**, see the list of saved contacts (or an empty state), add a contact by name + email, edit any contact inline, and remove one behind a two-click confirm. Adding a second contact with an email that matches an existing one (ignoring case/whitespace) is rejected with a friendly "That email is already in the contact list" message rather than a 500. A malformed email is rejected before it is stored, both client-side and server-side. The contacts persist in a new `pm_contacts` table and are ready for S-09 to query as a picker.

Verification: `npm run astro check`, `npm run lint`, `npm run build`, and `npm run test` all exit 0; the manual round-trip (create / edit / delete / duplicate-email / bad-email / empty-state) behaves as described in each phase's Manual Verification.

### Key Discoveries:

- Uniqueness mechanism to copy verbatim: `plugin_catalog.name_key` generated column — `supabase/migrations/20260529190000_create_plugin_catalog.sql`.
- Query + error-class shape to copy: `src/lib/plugins-catalog/queries.ts:9-59`.
- API route trio to copy: `src/pages/api/plugins-catalog/{index.ts,[id].ts,[id]/delete.ts}`.
- Island to copy (incl. `RowSubmit`, `EditRow`, two-click delete): `src/components/plugins-catalog/PluginCatalog.tsx`.
- Dashboard Settings group to extend: `src/pages/dashboard.astro:20-35`.
- Email identity (not name) is the correct duplicate guard for people — confirmed against FR-019 (the picker sends to the email).

## What We're NOT Doing

- **Not building the "Send to PM" picker or any send/email logic** — that is S-09 (FR-019). This slice only produces the contact records.
- **No foreign keys, no "promote" hook.** Nothing references `pm_contacts` yet; S-09 will store its *own copy* of the chosen PM (name + email + timestamp) per send, so a later hard-delete of a PM does not orphan send history. No FK guard is needed (matches projects + plugins-catalog).
- **No multi-tenancy / `agency_id`** — single-tenant MVP lock, consistent with every existing table.
- **No fields beyond name + email** (no phone, company, role) — FR-004 specifies name + email only.
- **No per-entity detail pages** — single inline-edit page (decided), not the projects three-page shape.
- **No soft delete, no audit trail** — out of MVP scope per PRD Access Control.
- **No form-parser or query-layer unit tests** — only the zod schema is unit-tested (decided), matching the sibling slices.

## Implementation Approach

Follow the canonical four-phase vertical slice exactly as `plugins-catalog` did: (1) migration + regenerated types, (2) pure library layer (schema + queries + form parser) with schema unit tests, (3) form-POST API routes, (4) single-page UI island + dashboard link. Each phase is independently checkable and ends with a manual-confirmation gate before the next. The naming convention for the slice is `pm-contacts` (route, lib dir, component dir, API dir) against a `pm_contacts` table.

## Critical Implementation Details

- **Email uniqueness is a *generated stored column*, not a functional index.** Mirror `plugin_catalog.name_key`: `email_key text not null generated always as (lower(trim(email))) stored unique`. The plain `UNIQUE` on a real column is what lets a future caller use PostgREST `.upsert({ onConflict: "email_key" })` if ever needed, and makes the DB the owner of normalization. Do **not** also normalize-and-store a separate lowercased email in the app — insert the raw `email` (already trimmed/lowercased by zod for display consistency) and let the generated column carry the key.
- **`updated_at` trigger function already exists.** The migration must create the *trigger* on the new table but must **not** redefine `public.set_updated_at()` (it lives in the projects migration). Re-`create or replace function` is technically idempotent but the established convention across brand_settings + plugin_catalog is to reuse silently — follow it.
- **Astro disallows `.tsx` in `src/pages/`** and the lessons file warns about `no-misused-promises` on `.astro`. Both are already handled by the analog: the route stays `.astro`, the island is a `.tsx` under `src/components/`, and the eslint config already disables the offending rule for `.astro`. No new eslint config change is required for this slice.

---

## Phase 1: Migration + generated types

### Overview

Create the `pm_contacts` table with the email-keyed uniqueness mechanism and the shared `updated_at` trigger, then regenerate the TypeScript database types so the rest of the slice is fully typed.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/<timestamp>_create_pm_contacts.sql` (timestamp newer than `20260529190000`)

**Intent**: Stand up the `pm_contacts` table — the storage for FR-004 PM contacts — with case-insensitive email uniqueness owned by the DB, the standard timestamps + auto-touch trigger, and RLS-enabled-no-policies defense-in-depth. Mirror the `plugin_catalog` migration structure.

**Contract**: Table `public.pm_contacts` with columns: `id uuid primary key default gen_random_uuid()`, `name text not null`, `email text not null`, `email_key text not null generated always as (lower(trim(email))) stored unique`, `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`. A `before update` trigger `pm_contacts_set_updated_at` executing the existing `public.set_updated_at()` function (do not redefine the function). `alter table public.pm_contacts enable row level security;` with no policies. Include `create extension if not exists pgcrypto;` for parity with the sibling migrations.

#### 2. Regenerated types

**File**: `src/types/database.types.ts`

**Intent**: Add the generated Row/Insert/Update shapes for `pm_contacts` so queries and the island are type-checked.

**Contract**: Produced by running `npm run db:types` after the migration is pushed — not hand-edited. The new `pm_contacts` entry must expose `Row.{ id, name, email, email_key, created_at, updated_at }` with `email_key` non-nullable.

### Success Criteria:

#### Automated Verification:

- Migration pushes cleanly: `npm run db:push`
- Types regenerate without error and include `pm_contacts`: `npm run db:types`
- Type checking passes: `npm run astro check`
- Linting passes (judge by exit code): `npm run lint`

#### Manual Verification:

- In the Supabase dashboard, the `pm_contacts` table exists with all six columns and the `email_key` column shows as generated.
- The `email_key` UNIQUE constraint is present; inserting two rows whose emails differ only by case/whitespace fails the second insert.
- RLS is enabled on the table with no policies.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Schema, queries, and form parser (lib)

### Overview

Build the pure library layer: a zod schema (name required, email required + format-checked + normalized), a typed CRUD query module with an `EmailTakenError`, and a FormData parser. Unit-test the schema.

### Changes Required:

#### 1. Validation schema

**File**: `src/lib/pm-contacts/schema.ts`

**Intent**: Single source of truth for a PM contact's shape, shared by the client island and the server route. Both fields required; email validated as an address and normalized to lowercase + trimmed so it matches the DB's `email_key` and displays consistently.

**Contract**: Export `pmContactSchema = z.object({ name: z.string().trim().min(1, "<name required msg>"), email: z.string().trim().toLowerCase().min(1, "<email required msg>").email("<invalid email msg>") })` and `export type PmContactInput = z.infer<typeof pmContactSchema>`. (Order the email refinements so the empty-input case yields the "required" message, not the "invalid" message.)

#### 2. Query module

**File**: `src/lib/pm-contacts/queries.ts`

**Intent**: Typed CRUD against `pm_contacts`, mapping the Postgres unique-violation on `email_key` to a friendly domain error. Direct copy of the catalog query module with names swapped and the `promoteToCatalog` helper omitted (not needed here).

**Contract**: `type Client = SupabaseClient<Database>`; `export type PmContact = Database["public"]["Tables"]["pm_contacts"]["Row"]`; `const UNIQUE_VIOLATION = "23505"`; `export class EmailTakenError extends Error` (message e.g. "That email is already in the contact list"). Functions: `listContacts(client): Promise<PmContact[]>` ordered by `name` ascending; `createContact(client, input): Promise<PmContact>`; `updateContact(client, id, input): Promise<PmContact>`; `deleteContact(client, id): Promise<void>`. `create`/`update` catch `error.code === UNIQUE_VIOLATION` → throw `EmailTakenError`, else throw `Error(error.message)`.

#### 3. Form parser

**File**: `src/lib/pm-contacts/form.ts`

**Intent**: Turn a submitted FormData into a validated `PmContactInput` or the first validation message for the redirect-with-error path. Direct copy of the catalog parser with the field list changed.

**Contract**: `const FIELDS = ["name", "email"] as const`; `export type ParseResult = { ok: true; data: PmContactInput } | { ok: false; message: string }`; `export function parsePmContactForm(form: FormData): ParseResult` — reads each field (null → ""), `safeParse`, returns first issue message on failure.

#### 4. Schema unit tests

**File**: `src/lib/pm-contacts/schema.test.ts`

**Intent**: Lock down the one piece of real logic in the slice — email validation and field normalization.

**Contract**: Vitest cases covering: valid name+email passes; missing/empty name → "required" message; missing/empty email → "required" message; malformed email (e.g. `"asdf"`, `"a@"`, `"a@b"`) → "invalid" message; email with surrounding whitespace + mixed case is normalized to trimmed-lowercase in `data.email`; name is trimmed.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run astro check`
- Linting passes (judge by exit code): `npm run lint`
- Unit tests pass: `npm run test`

#### Manual Verification:

- (None beyond automated — this phase is pure logic; the query layer is exercised manually in Phase 3.)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: API routes

### Overview

Add the three form-POST endpoints (create / update / delete) that validate input, call the query module, and ride the redirect + query-param round-trip. Auth is provided by middleware; no per-route auth code.

### Changes Required:

#### 1. Create endpoint

**File**: `src/pages/api/pm-contacts/index.ts`

**Intent**: Validate a submitted add-contact form and create the row, surfacing a duplicate-email collision as a friendly message. Copy of the catalog create route.

**Contract**: `export const POST: APIRoute`. Parse with `parsePmContactForm`; on `!ok` redirect `/pm-contacts?error=<encoded message>`. On success call `createContact(createSupabaseClient(), parsed.data)` and redirect `/pm-contacts?ok=created`. Catch: `EmailTakenError` → its message; otherwise "Could not add the contact" → redirect as `?error`.

#### 2. Update endpoint

**File**: `src/pages/api/pm-contacts/[id].ts`

**Intent**: Validate and apply an edit to one contact. Copy of the catalog update route.

**Contract**: `export const POST: APIRoute`; `id = context.params.id ?? ""`. Same parse/redirect pattern; success → `/pm-contacts?ok=updated`; `EmailTakenError` message else "Could not update the contact".

#### 3. Delete endpoint

**File**: `src/pages/api/pm-contacts/[id]/delete.ts`

**Intent**: Hard-delete one contact. Copy of the catalog delete route.

**Contract**: `export const POST: APIRoute`; `id = context.params.id ?? ""`; call `deleteContact(createSupabaseClient(), id)`; success → `/pm-contacts?ok=deleted`; on any error → `/pm-contacts?error=<encoded "Could not delete the contact">`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run astro check`
- Linting passes (judge by exit code): `npm run lint`
- Build succeeds (judge by exit code): `npm run build`

#### Manual Verification:

- `POST /api/pm-contacts` with valid name+email creates a row and redirects to `/pm-contacts?ok=created`.
- Submitting a duplicate email (case/whitespace variant) redirects with the "already in the contact list" error, not a 500.
- `POST /api/pm-contacts/[id]` updates the row; `POST /api/pm-contacts/[id]/delete` removes it.
- Hitting any endpoint while signed out is redirected to `/login` by middleware (auth gate intact).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: UI — single contact page, inline-edit island, dashboard nav

### Overview

Build the single `/pm-contacts` page with an add-form, an inline-editable list, and inline two-click delete, then add a "PM contacts" link to the dashboard Settings group. Reuse the existing `FormField` / `SubmitButton` / `ServerError` auth components and mirror `PluginCatalog.tsx`.

### Changes Required:

#### 1. React island

**File**: `src/components/pm-contacts/PmContacts.tsx`

**Intent**: Client island providing the add-form + inline edit rows + inline delete-confirm, with client-side zod validation that blocks submit and shows field errors. Direct adaptation of `PluginCatalog.tsx` — two fields are `name` and `email` (both via `FormField`), the schema is `pmContactSchema`, and field-error keys are `"name" | "email"`.

**Contract**: Default-export `PmContacts({ entries, serverError })` where `entries: { id: string; name: string; email: string }[]`. Internal `AddForm` (posts `/api/pm-contacts`), `ContactList` with `ReadRow` (shows name + email; Edit + two-click Delete posting `/api/pm-contacts/${id}/delete`) and `EditRow` (posts `/api/pm-contacts/${id}`, fields carry `name="name"` / `name="email"`), and a `RowSubmit` using `useFormStatus()`. Form handlers typed `React.SubmitEvent<HTMLFormElement>` with `noValidate` on the `<form>` (per lessons + analog). Use an email-appropriate `lucide-react` icon (e.g. `Mail`) for the email field; `User`/`UserPlus` for name/add.

#### 2. List page

**File**: `src/pages/pm-contacts.astro`

**Intent**: Server-render the contact list, read success/error banners from search params, and mount the island. Copy of `plugins-catalog.astro` with copy and query swapped.

**Contract**: Frontmatter calls `listContacts(createSupabaseClient())`; maps `?ok` ∈ {created, updated, deleted} to a banner message ("Contact added." / "Changes saved." / "Contact removed."); reads `?error` into `serverError`. Renders `<PmContacts entries={…map to {id,name,email}} serverError={error} client:load />` inside `Layout` with the cosmic-gradient `max-w-2xl` shell, a "← Home" link, an `<h1>` "PM contacts", and a one-line description.

#### 3. Dashboard link

**File**: `src/pages/dashboard.astro`

**Intent**: Add a third entry to the existing Settings group so the page is reachable.

**Contract**: Inside the Settings `flex flex-col gap-2` block (`dashboard.astro:22-35`), add an `<a href="/pm-contacts">PM contacts</a>` styled identically to the Brand settings / Plugins catalog links.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run astro check`
- Linting passes (judge by exit code): `npm run lint`
- Build succeeds (judge by exit code): `npm run build`
- Unit tests still pass: `npm run test`

#### Manual Verification:

- From the dashboard, the "PM contacts" link opens `/pm-contacts`.
- Adding a contact (valid name + email) shows it in the list with a success banner; the empty state shows when none exist.
- Client-side: submitting a blank name or a malformed email shows an inline field error and does not POST.
- Editing a contact inline saves and reflects the change; Cancel discards.
- Delete shows the inline "Delete? Confirm / Cancel"; Confirm removes the row, Cancel aborts.
- Submitting a duplicate email surfaces the server error banner.
- Keyboard navigation through the add-form and row actions works; no regressions on the sibling Settings pages.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

### Unit Tests:

- `pmContactSchema` (`src/lib/pm-contacts/schema.test.ts`): valid input; required-name; required-email; invalid-email forms; email normalization (trim + lowercase); name trim.

### Integration Tests:

- None automated (consistent with the repo). The CRUD round-trip and the unique-email collision are verified manually against live Supabase in Phases 3–4.

### Manual Testing Steps:

1. Push migration; confirm table + generated `email_key` + RLS in Supabase.
2. Add a contact via the UI; confirm it lists with a success banner.
3. Add a second contact with the same email in different case; confirm the friendly duplicate error.
4. Submit a malformed email; confirm client-side block, then (bypassing JS) confirm the server also rejects it.
5. Edit a contact inline; confirm save and cancel.
6. Delete a contact via the two-click confirm; confirm removal and the cancel path.
7. Confirm the empty state when the list is cleared.
8. Sign out and hit `/pm-contacts` and `/api/pm-contacts`; confirm the middleware redirect.

## Performance Considerations

Negligible. A single small table, list query ordered by name, no joins, PM-list-scale row counts. No pagination needed.

## Migration Notes

New table only; no existing data to migrate. Rollback is `drop table public.pm_contacts;` (the shared trigger function stays — other tables use it).

## References

- Change identity: `context/changes/pm-contact-list/change.md`
- Closest analog (clone this): `plugins-catalog` slice — `src/lib/plugins-catalog/*`, `src/pages/api/plugins-catalog/*`, `src/components/plugins-catalog/PluginCatalog.tsx`, `src/pages/plugins-catalog.astro`, migration `supabase/migrations/20260529190000_create_plugin_catalog.sql`.
- Migration tooling + trigger function: `supabase/migrations/20260529144131_create_projects.sql`; `package.json:14-15`.
- Dashboard Settings group: `src/pages/dashboard.astro:20-35`.
- PRD: FR-004 (`context/foundation/prd.md:77`), FR-019 (`:113`), Access Control (`:158-160`).
- Roadmap: S-04 `pm-contact-list`.
- Lessons honored: `context/foundation/lessons.md` (exit-code gating; `.astro` lint rule; React 19 handler typing).

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Migration + generated types

#### Automated

- [x] 1.1 Migration pushes cleanly: `npm run db:push` (applied to LOCAL via `supabase db reset --local` per dev runbook; cloud `db:push` deferred to ship) — a598a29
- [x] 1.2 Types regenerate and include `pm_contacts`: `npm run db:types` (used `gen types --local` since migration is local-only) — a598a29
- [x] 1.3 Type checking passes: `npm run astro check` — a598a29
- [x] 1.4 Linting passes (exit code): `npm run lint` — a598a29

#### Manual

- [x] 1.5 `pm_contacts` table exists with all six columns; `email_key` shows as generated — a598a29
- [x] 1.6 `email_key` UNIQUE rejects a second case/whitespace-variant email — a598a29
- [x] 1.7 RLS enabled on the table with no policies — a598a29

### Phase 2: Schema, queries, and form parser (lib)

#### Automated

- [x] 2.1 Type checking passes: `npm run astro check` — ae4d4ad
- [x] 2.2 Linting passes (exit code): `npm run lint` — ae4d4ad
- [x] 2.3 Unit tests pass: `npm run test` — ae4d4ad

### Phase 3: API routes

#### Automated

- [x] 3.1 Type checking passes: `npm run astro check` — be1f722
- [x] 3.2 Linting passes (exit code): `npm run lint` — be1f722
- [x] 3.3 Build succeeds (exit code): `npm run build` — be1f722

#### Manual

- [x] 3.4 Valid POST creates a row and redirects `?ok=created` — be1f722
- [x] 3.5 Duplicate email redirects with friendly error, not a 500 — be1f722
- [x] 3.6 Update and delete endpoints work — be1f722
- [x] 3.7 Signed-out requests are redirected to `/login` by middleware — be1f722

### Phase 4: UI — single contact page, inline-edit island, dashboard nav

#### Automated

- [x] 4.1 Type checking passes: `npm run astro check` — e1486d4
- [x] 4.2 Linting passes (exit code): `npm run lint` — e1486d4
- [x] 4.3 Build succeeds (exit code): `npm run build` — e1486d4
- [x] 4.4 Unit tests still pass: `npm run test` — e1486d4

#### Manual

- [x] 4.5 Dashboard "PM contacts" link opens `/pm-contacts` — e1486d4
- [x] 4.6 Adding a valid contact lists it with a success banner; empty state shows when none — e1486d4
- [x] 4.7 Client-side blocks blank name / malformed email with inline errors — e1486d4
- [x] 4.8 Inline edit saves; Cancel discards — e1486d4
- [x] 4.9 Two-click delete removes the row; Cancel aborts — e1486d4
- [x] 4.10 Duplicate email surfaces the server error banner — e1486d4
- [x] 4.11 Keyboard navigation works; no regressions on sibling Settings pages — e1486d4
