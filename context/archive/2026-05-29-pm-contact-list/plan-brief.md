# PM Contact List (S-04) — Plan Brief

> Full plan: `context/changes/pm-contact-list/plan.md`

## What & Why

Build the PM contact list — a settings-maintained CRUD surface where the signed-in user manages PM contacts, each with a **name + email** (PRD FR-004). PMs are not user accounts and never log in; this list exists solely as the recipient picker the future "Send to PM" flow (S-09 / FR-019) will read.

## Starting Point

Two complete, structurally identical CRUD slices already exist to mirror: `plugins-catalog` (S-03, the closest analog — a single-page settings catalog with inline edit/delete and DB-owned case-insensitive uniqueness) and `projects` (S-01, a heavier three-page slice). The dashboard already has a "Settings" group with Brand settings + Plugins catalog links.

## Desired End State

From the dashboard Settings group, the user opens **PM contacts**, sees the saved list (or empty state), adds contacts by name + email, edits inline, and removes behind a two-click confirm. Duplicate emails (case-insensitive) and malformed emails are rejected with friendly messages — client- and server-side. Records persist in a new `pm_contacts` table, ready for S-09 to query.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Duplicate guard | Unique on **email**, case-insensitive | Email is the actual send target — a dup email is the footgun that matters; names can legitimately repeat | Plan |
| Uniqueness mechanism | Generated `email_key = lower(trim(email))` + `UNIQUE` | Reuses the proven `plugin_catalog.name_key` pattern; DB owns normalization | Plan |
| Fields & validation | Both required; email format-checked + lowercased | Matches FR-004 ("name + email") and stops a malformed address before it reaches S-09 | Plan |
| Page shape | Single page, inline rows | Two fields don't justify per-entity pages; identical UX to the sibling catalog | Plan |
| Delete UX | Inline two-click confirm | Proportionate — contacts are cheap to re-add and S-09 stores its own copy per send | Plan |
| Tests | Unit-test the zod schema only | Email validation is the one real bit of logic; CRUD verified manually, matching both siblings | Plan |

## Scope

**In scope:** `pm_contacts` table + types; zod schema + `EmailTakenError` query module + form parser; create/update/delete API routes; single `/pm-contacts` page + inline-edit island; dashboard Settings link; schema unit tests.

**Out of scope:** the "Send to PM" picker and any email/send logic (S-09); foreign keys / promote hook; fields beyond name + email; multi-tenancy; soft delete; audit trail.

## Architecture / Approach

Canonical four-phase vertical slice, cloned file-for-file from `plugins-catalog`, under the `pm-contacts` name against a `pm_contacts` table. Supabase over HTTP/PostgREST; the Worker uses the secret key; RLS enabled with no policies. The only substantive divergence from the analog: identity keys on **email** (generated column) instead of name, and the email field is `.email()`-validated and lowercased.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Migration + types | `pm_contacts` table (email-keyed uniqueness, trigger, RLS) + regenerated types | Forgetting `email_key` is a *generated stored* column (needed for the UNIQUE to be a real column) |
| 2. Lib (schema/queries/form + tests) | zod schema, `EmailTakenError` CRUD module, form parser, schema unit tests | Ordering email refinements so empty input yields "required" not "invalid" |
| 3. API routes | create / update / delete form-POST endpoints | None material — direct copy; auth is free via middleware |
| 4. UI + nav | `/pm-contacts` page + inline-edit island + dashboard link | React 19 handler typing / `.astro` lint rule (already solved by the analog) |

**Prerequisites:** F-01 only (auth + Supabase client + migration tooling — all already in place). No dependency on other in-flight slices.
**Estimated effort:** ~1 focused session across 4 small phases; the heaviest file is the island, copied from `PluginCatalog.tsx`.

## Open Risks & Assumptions

- Assumes S-09 will store its own copy of the chosen PM per send (so hard-deleting a PM never orphans history) — consistent with FR-019's "records the send (PM name + email + timestamp)".
- `zod.email()` is permissive; a syntactically valid but wrong address still passes — the real check is the actual mail send in S-09, which is out of scope here.

## Success Criteria (Summary)

- The user can add / edit / remove PM contacts (name + email) from a single settings page reachable via the dashboard.
- Duplicate emails and malformed emails are rejected with friendly, in-place messages rather than 500s or silent acceptance.
- Contacts persist in `pm_contacts` and are queryable as the eventual "Send to PM" picker source.
