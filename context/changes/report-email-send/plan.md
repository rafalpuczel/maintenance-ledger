# Report Email Send (S-09) Implementation Plan

## Overview

Add the two send actions that complete the US-01 north-star loop: **Send to PM** (pick from the S-04 contact list) and **Send to client** (the project's `contact_email`). Each re-renders the report's branded PDF, emails it via Resend using a fixed template with the PDF as an attachment, and records the send (recipient + timestamp) so the report page shows the most recent send inline per recipient and relabels the button to "Re-send …" with a confirm dialog. This is the validation milestone (FR-019, FR-020, FR-021) proving the Slack → Docs → PDF → email pipeline is fully replaced in-app.

## Current State Analysis

S-08 left the report page (`src/pages/projects/[slug]/reports/[id].astro`) with a working **Download PDF** link and a **Delete** action. The PDF is **live-rendered on demand** — `renderReportPdf(reportDocument({ report, brand }))` in `src/pages/api/reports/[id]/pdf.ts:38`, F-02-measured p95 ~197 ms — and **never stored**. The save route already proves a report is renderable on every save (`src/pages/api/reports/[id].ts:32-40`).

All send inputs already exist:
- **PM list** — `listContacts(client)` → `PmContact[]` (`src/lib/pm-contacts/queries.ts:20`), columns `id, name, email`.
- **Client email** — `project.contact_email` (nullable text) on the `projects` row, already loaded on the report page via `getProjectBySlug`.
- **Report + brand** — `getReport(client, id)`, `getBrand(client)` — the exact pair the PDF route already composes.

Email is **completely green-field but fully wired**: `resend@^6.12.3` is already a dependency (`package.json:36`); `RESEND_API_KEY` is declared `optional: true` in the `astro:env/server` schema (`astro.config.mjs:25`) and present as a placeholder in `.dev.vars`. There is **no email-sending code anywhere** and **no send-tracking storage** — the `reports` table has no `sent_*` columns and no `report_sends` table exists.

The only outstanding non-code item is operator **Prereq C** (`context/deployment/deploy-plan.md` lines 85–92, 213): create a Resend account, verify a sending domain, `wrangler secret put RESEND_API_KEY`. This gates *production sending*, not the implementation — local dev and smoke tests run against Resend's shared `onboarding@resend.dev` sender.

### Key Discoveries:

- **PDF is re-rendered, not fetched** — the send route calls `renderReportPdf(reportDocument({ report, brand }))` exactly like `src/pages/api/reports/[id]/pdf.ts:38`; there is no stored blob to attach. Resend attachments take base64 content, so the `Uint8Array` is base64-encoded for the `attachments[].content` field.
- **Action-island pattern is established** — `src/components/reports/DeleteReportButton.tsx` is a `client:load` React island: a `type="button"` trigger flips a `useState` open flag, and the confirmed action is a real `<form method="POST" action=…>` with a hidden `slug` input. Send buttons follow this shape exactly (POST form → server redirect), no `fetch`/JSON.
- **Mutations redirect with `?ok=`/`?error=`** — the report page already renders an `okMessage` banner (`[id].astro:27-29`, 53-59) from `?ok=created|saved`. Send extends this convention with new `ok` tokens; no new feedback mechanism.
- **Replace-all save would clobber send columns** — `updateReport` (`src/lib/reports/queries.ts:94-111`) overwrites every editable column on the `reports` row. Keeping send records in a **separate table** keeps them out of that blast radius (decided: `report_sends` table, not columns/jsonb on `reports`).
- **Env/secret idiom** — secrets are imported from `astro:env/server` (`src/lib/supabase.ts:2`), not from `locals.runtime.env`. `RESEND_API_KEY` and the new `REPORT_FROM_EMAIL` are read the same way.
- **Zod v4 + sibling-import + types-sanitize lessons apply** — top-level `z.email()` not `z.string().email()`; within `src/lib/report-sends/` import `./schema` relatively (vitest has no `@/` alias); after `npm run db:types`, strip CLI banners and verify with `npx astro check` (see `context/foundation/lessons.md`).

## Desired End State

On a saved report's page, the user sees **Send to PM** and **Send to client** buttons beside Download PDF. Clicking **Send to PM** opens a picker of the S-04 contacts; choosing one emails that PM the branded PDF and records the send. **Send to client** emails the project's `contact_email` (disabled with an inline hint when that field is empty). After a successful send, the button reads **Re-send to PM/client**, shows "Sent to `<addr>` on `<date>`" inline, and a re-send opens a confirm dialog before dispatching. A failed send surfaces an in-app error and writes **no** send record. Verify by sending both, confirming two emails arrive (smoke-test sender in dev), the timestamps render, and a forced Resend failure leaves the `report_sends` table unchanged.

## What We're NOT Doing

- **No PDF storage / caching** — send re-renders live, same as download. (Out of scope; F-02 latency headroom makes it unnecessary.)
- **No delivery / bounce / open tracking** — the commitment ends at *dispatch acknowledged by Resend* (NFR explicitly excludes inbox delivery). No webhooks, no Resend event ingestion.
- **No editable email templates** — one fixed transactional template per the Non-Goals; subject/body are constants in code.
- **No retry/queue/async** — synchronous send within the request (NFR 3 s p95; dispatch is one HTTP call). A failure is surfaced, not retried.
- **No report locking on send** — FR-012/US-01: the report stays editable; sending changes nothing about the report row.
- **No provider abstraction layer** — Resend directly; Postmark was the only alternative and the FR is satisfied by either, so no premature interface.
- **No new auth** — the send route inherits the session gate from middleware (path not in `PUBLIC_PATHS`), like every other `/api/reports/*` route.
- **No operator provisioning** — creating the Resend account, verifying the domain, and `wrangler secret put` are documented as a manual Prereq C handoff, not performed by this change.

## Implementation Approach

Three phases, bottom-up so each is independently verifiable: (1) a `report_sends` persistence layer with a latest-per-recipient summary query, unit-tested in isolation; (2) the email dispatch helper + the `POST /api/reports/[id]/send` route enforcing record-on-success-only; (3) the two UI islands wired into the report page with inline send history. The route re-uses the exact PDF render call from the existing pdf route, and the UI re-uses the `DeleteReportButton` form-island pattern, so the new surface area is small and pattern-consistent.

## Critical Implementation Details

- **Record-on-success-only ordering** (US-01 acceptance criterion). The route must call Resend **first** and insert the `report_sends` row **only** after a confirmed non-error response. On any Resend error/throw, redirect with `?error=…` and write nothing. Do not pre-insert a "pending" row. (A crash in the narrow dispatch→insert window is an accepted rare loss — a missing record only risks a benign re-send, never a phantom "sent".)
- **Resend attachment encoding.** Resend's `attachments[].content` expects base64 (or a Buffer). The render returns a `Uint8Array`; encode it to a base64 string for the attachment. Workerd has no Node `Buffer` by default — use a Web-safe base64 encode of the bytes (the codebase already base64url-encodes HMAC output in `src/lib/auth/credentials.ts`; reuse that approach for plain base64). Set `filename` to the same `<slug>-<month>.pdf` token the pdf route builds.
- **Latest-per-recipient semantics.** Client history keys on `recipient_type = 'client'` (one logical recipient per report — the project contact). PM history keys on `recipient_email` (a report may be sent to different PMs across cycles, and the inline line + re-send state should reflect the *specific* PM). `getSendSummary` returns the single latest client send and the latest PM send (with that PM's email/name) — enough to drive both buttons' label, inline text, and confirm dialog.

## Phase 1: Send persistence layer

### Overview

Create the `report_sends` table, regenerate DB types, and add a `report-sends` domain module (`schema.ts` + `queries.ts`) exposing `recordSend` (append one row) and `getSendSummary` (latest client + latest PM send for a report). No route, no UI. The summary-derivation logic is the unit-testable core.

### Changes Required:

#### 1. Migration — `report_sends` table

**File**: `supabase/migrations/<timestamp>_create_report_sends.sql` (new)

**Intent**: Persist an append-only log of every successful send so FR-021's inline history and the re-send guard can read "latest per recipient." Separate table keeps send state out of the replace-all `reports` update.

**Contract**: Table `report_sends` with columns: `id uuid pk default gen_random_uuid()`, `report_id uuid not null references reports(id) on delete cascade`, `recipient_type text not null check (recipient_type in ('pm','client'))`, `recipient_email text not null`, `pm_contact_id uuid null references pm_contacts(id) on delete set null`, `sent_at timestamptz not null default now()`. Index on `(report_id)` (the summary query filters by it). No `updated_at` — rows are immutable. Mirror the SQL style and header-comment convention of `supabase/migrations/20260530140000_create_reports.sql`. Apply locally with `supabase migration up --local` (never `db reset` — see memory `[[local-migration-apply-no-reset]]`).

#### 2. Regenerate database types

**File**: `src/types/database.types.ts` (regenerated)

**Intent**: Expose the new table to the typed Supabase client.

**Contract**: Run `npm run db:types`, then **sanitize** — valid content starts at `export type Json =` and ends at the final `} as const`; strip any prepended connection line or appended CLI upgrade/hint banner (lessons.md). Verify with `npx astro check` (exit 0), not lint (the file is lint-ignored). Result must include `public.Tables.report_sends` with `Row`/`Insert`/`Update`.

#### 3. Send-record schema

**File**: `src/lib/report-sends/schema.ts` (new)

**Intent**: Validate the data inserted on a send (the route builds this, not a user form, but a schema keeps the insert shape honest and reusable).

**Contract**: Export `recipientTypeSchema` (`z.enum(["pm","client"])`) and a `sendRecordSchema` covering `report_id` (`z.uuid()`), `recipient_type`, `recipient_email` (`z.email()`), `pm_contact_id` (`z.uuid().nullable()`). Use **top-level** zod v4 validators (`z.uuid()`, `z.email()`), never the deprecated `.string().uuid()/.email()` chain (lessons.md). Export the inferred `SendRecordInput` type.

#### 4. Send-record queries + summary derivation

**File**: `src/lib/report-sends/queries.ts` (new)

**Intent**: `recordSend` appends one row; `getSendSummary` returns the latest client send and latest PM send for a report to drive the UI.

**Contract**: Import the sibling schema **relatively** (`./schema`), never via `@/` (vitest alias lesson). Export:
- `recordSend(client, input: SendRecordInput): Promise<void>` — inserts one `report_sends` row.
- `getSendSummary(client, reportId): Promise<SendSummary>` where `SendSummary = { client: SendInfo | null; pm: PmSendInfo | null }`, `SendInfo = { email: string; sentAt: string }`, `PmSendInfo = SendInfo & { pmContactId: string | null }`. Query `report_sends` by `report_id` ordered `sent_at desc`, then reduce to the first `client`-type and first `pm`-type row. Keep the reduce a pure exported helper (e.g. `summarize(rows): SendSummary`) so it is unit-testable without a DB.

### Success Criteria:

#### Automated Verification:

- Migration applies locally: `npx supabase migration up --local`
- Types regenerate clean and typecheck: `npx astro check` (exit 0)
- Linting passes: `npm run lint` (exit 0 — judge by exit code, not grep; lessons.md)
- `summarize` unit tests pass: `npm test` (empty → both null; mixed client+pm rows → latest of each; multiple PM sends → most recent by `sent_at`)

#### Manual Verification:

- Inserting two `report_sends` rows by hand (psql/Studio) and calling `getSendSummary` returns the expected latest-per-recipient shape.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Email dispatch + send route

### Overview

Add the `REPORT_FROM_EMAIL` env var, an `email/send-report.ts` helper that renders the PDF and dispatches it through Resend with the fixed template, and the `POST /api/reports/[id]/send` route that orchestrates parse → render → dispatch → record-on-success and redirects with `ok`/`error`. No UI yet — exercisable via curl/Thunder against a local dev server with a real (smoke) `RESEND_API_KEY`.

### Changes Required:

#### 1. Declare `REPORT_FROM_EMAIL` env var

**File**: `astro.config.mjs`

**Intent**: Make the from-address configurable (verified agency sender in prod) with a dev/smoke default, so sending works before the domain is verified.

**Contract**: Add to the `env.schema`: `REPORT_FROM_EMAIL: envField.string({ context: "server", access: "secret", optional: true })` (mirror the `RESEND_API_KEY` line at `astro.config.mjs:25`). The helper supplies the `onboarding@resend.dev` fallback in code when this is unset — keep it `optional` so the worker doesn't 500 without it, exactly as `RESEND_API_KEY` is handled.

#### 2. `.dev.vars` + deploy-plan documentation

**File**: `.dev.vars` (add placeholder line) and `context/deployment/deploy-plan.md` (Prereq C note)

**Intent**: Record the new var so local dev and the operator know to set it.

**Contract**: Add `REPORT_FROM_EMAIL=onboarding@resend.dev` to `.dev.vars` (safe real default — Resend's shared sender). In `deploy-plan.md` Prereq C, add a bullet: production sets `REPORT_FROM_EMAIL` to the verified-domain sender via `wrangler secret put REPORT_FROM_EMAIL` alongside `RESEND_API_KEY`. Pure-prose edit to the Prereq C / outstanding-secrets section.

#### 3. Email dispatch helper

**File**: `src/lib/email/send-report.ts` (new)

**Intent**: Single place that renders the report PDF and dispatches one email with it attached via Resend, using the fixed template. Throws on any Resend error so the route can enforce record-on-success.

**Contract**: Export `sendReportEmail(args: { report: Report; brand: Brand | null; project: Project; to: string; recipientLabel: string }): Promise<void>`. Internally: render via `renderReportPdf(reportDocument({ report, brand }))` (same call as `src/pages/api/reports/[id]/pdf.ts:38`); base64-encode the `Uint8Array`; build the fixed subject + body (constants — e.g. subject `"<project.name> — maintenance report <report.month>"`, short plain-text/HTML body referencing the attached PDF, no internal-notes leakage); call Resend with `from: REPORT_FROM_EMAIL ?? "onboarding@resend.dev"`, `to`, `subject`, `html`, and `attachments: [{ filename: "<slug>-<month>.pdf", content: <base64> }]`. Read `RESEND_API_KEY` from `astro:env/server`; construct `new Resend(RESEND_API_KEY)`. If `RESEND_API_KEY` is unset or Resend returns an error object/throws, **throw** (the route maps that to an error redirect with no record). Filename token reuses the same slugify logic as the pdf route (`fileToken`) — extract it to a shared spot or duplicate the tiny helper; do not depend on the route file.

#### 4. Send route

**File**: `src/pages/api/reports/[id]/send.ts` (new)

**Intent**: Orchestrate a send end-to-end: identify recipient (pm|client), load data, dispatch, and record **only** on success; redirect back to the report page with an ok/error flag.

**Contract**: `POST` handler reading `context.params.id` and `formData`: `recipient_type` (`pm`|`client`), `slug` (for the redirect URL, like the save/delete routes), and for PM sends `pm_email`, `pm_name`, `pm_contact_id`. Build `reportUrl = /projects/<slug>/reports/<id>`. Load `getReport`, `getBrand`, `getProjectById` (need `contact_email` + `slug` + `name`). Resolve `to`: for `client`, `project.contact_email` — if null, redirect `?error=No client email on this project`; for `pm`, the posted `pm_email`. Call `sendReportEmail(...)`; on throw, redirect `?error=Could not send the email`. On success, `recordSend({ report_id, recipient_type, recipient_email: to, pm_contact_id: type==='pm' ? pm_contact_id : null })`, then redirect `?ok=sent-pm` / `?ok=sent-client`. Mirror the structure of `src/pages/api/reports/[id].ts` (params → formData → slug → try/catch → redirect). Inherits the session gate (path not in `PUBLIC_PATHS`).

### Success Criteria:

#### Automated Verification:

- Typecheck passes: `npx astro check` (exit 0)
- Linting passes: `npm run lint` (exit 0 — judge by exit code; keep `no-misused-promises` off for `.astro` per lessons.md, N/A here as this is `.ts`)
- Build passes: `npm run build` (exit 0 — confirms the route + Resend import bundle on the Cloudflare adapter)

#### Manual Verification:

- With a real smoke `RESEND_API_KEY` in `.dev.vars`, POST to `/api/reports/<id>/send` with `recipient_type=client` (project has a `contact_email`) → an email with the PDF attachment arrives; a `report_sends` row exists.
- POST with `recipient_type=pm` + a `pm_email` → email arrives; row recorded with `pm_contact_id`.
- Temporarily set an invalid `RESEND_API_KEY` → the request redirects with `?error=…` and **no** `report_sends` row is written (record-on-success verified).
- POST `recipient_type=client` against a project with null `contact_email` → `?error=No client email…`, no send, no row.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 3: Send UI on the report page

### Overview

Add the two send islands and wire the send summary into the report page so labels, inline timestamps, and the re-send confirm dialog reflect persisted history. Reuses the `DeleteReportButton` form-island pattern and the existing `?ok=`/`?error=` banner.

### Changes Required:

#### 1. Load send summary on the report page

**File**: `src/pages/projects/[slug]/reports/[id].astro`

**Intent**: Provide each button the data to decide first-send vs re-send and to render "Sent on …".

**Contract**: Add `getSendSummary(client, report.id)` to the existing `Promise.all` (`[id].astro:14-18`). Extend the `okMessage` map (`[id].astro:29`) with `sent-pm` → "Report sent to the PM." and `sent-client` → "Report sent to the client." Render `SendToPmButton` and `SendToClientButton` in the action row (`[id].astro:42-51`, beside Download PDF), passing `reportId`, `slug`, the relevant summary slice, and for the client button `clientEmail={project.contact_email}`, for the PM button `contacts={…}` (from a new `listContacts(client)` call added to the `Promise.all`).

#### 2. Send-to-client island

**File**: `src/components/reports/SendToClientButton.tsx` (new)

**Intent**: One-click first send to the project contact; disabled with a hint when there is no client email; confirm dialog on re-send; inline last-send timestamp.

**Contract**: Props `{ reportId: string; slug: string; clientEmail: string | null; lastSend: { email: string; sentAt: string } | null }`. When `clientEmail` is null: render a disabled button + small "No client email — add one on the project" note (link to `/projects/<slug>/edit` or the project page). When set and `lastSend` is null: a `<form method="POST" action={/api/reports/${reportId}/send}>` with hidden `recipient_type=client` + `slug`, button label "Send to client". When `lastSend` exists: label "Re-send to client", clicking opens a confirm modal (the `useState` open-flag pattern from `DeleteReportButton.tsx`) showing the prior timestamp, whose confirm button submits the same form. Render "Sent to `<email>` on `<date>`" inline when `lastSend` exists. Use `useFormStatus` for the pending label, matching `DeleteReportButton`.

#### 3. Send-to-PM island

**File**: `src/components/reports/SendToPmButton.tsx` (new)

**Intent**: Open a picker of PM contacts; the chosen PM is the recipient; confirm on re-send; inline last-send line.

**Contract**: Props `{ reportId: string; slug: string; contacts: { id: string; name: string; email: string }[]; lastSend: { email: string; sentAt: string } | null }`. Button label "Send to PM" (or "Re-send to PM" when `lastSend` exists). Clicking opens a modal with a `<select>` of `contacts` (default to `lastSend.email`'s contact when re-sending); the modal contains the POST `<form>` with hidden `recipient_type=pm`, `slug`, and `pm_email`/`pm_name`/`pm_contact_id` populated from the selected option (sync selection into hidden inputs, or read the select's value into named fields on submit). When `lastSend` exists the modal is the confirm step (it already requires an explicit click after the picker). If `contacts` is empty, render the button disabled with a "No PM contacts — add one in Settings" hint. Inline "Sent to `<email>` on `<date>`" when `lastSend` exists. Type the submit handler / form per the React 19 lint rules (`React.SubmitEvent<HTMLFormElement>`, not the deprecated `FormEvent` — lessons.md).

### Success Criteria:

#### Automated Verification:

- Typecheck passes: `npx astro check` (exit 0)
- Linting passes: `npm run lint` (exit 0 — judge by exit code; React-19 form-handler + no-deprecated rules satisfied per lessons.md)
- Build passes: `npm run build` (exit 0)

#### Manual Verification:

- On a saved report with a client email, **Send to client** appears enabled; clicking sends and the page returns with the success banner and "Sent to `<email>` on `<date>`"; the button now reads **Re-send to client**.
- Clicking **Re-send to client** opens a confirm dialog showing the prior timestamp; confirming sends again and updates the timestamp.
- **Send to PM** opens the picker; selecting a PM and confirming sends; inline line + re-send relabel appear; re-send pre-selects the last PM.
- A report whose project has no client email shows the disabled **Send to client** with the inline hint; no POST is possible.
- With no PM contacts saved, **Send to PM** is disabled with the Settings hint.
- A forced send failure (bad key) shows the error banner and leaves the buttons in their pre-send (first-send) state — no phantom timestamp.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful. This completes S-09 (the north star).

---

## Testing Strategy

### Unit Tests:

- `summarize(rows)` (Phase 1) — the pure latest-per-recipient reducer: empty rows → `{ client: null, pm: null }`; one client + one pm → both populated; multiple pm sends → latest by `sent_at`; multiple client sends → latest client. This is the one piece of non-trivial derivation logic and is DB-free, so it is the natural unit-test target (mirrors how `wp-cli-bulk-paste` and `report-authoring` unit-tested their pure helpers).

### Integration Tests:

- None automated for the send path in this MVP (Module 3 introduces the testing strategy; the email dispatch is an external-IO boundary). Covered by the manual smoke-test steps above.

### Manual Testing Steps:

1. Create/open a report on a project that has a `contact_email`; ensure it saves and Download PDF works (S-08 regression check).
2. Click **Send to client** → confirm the email (with PDF attachment) arrives at the contact, the success banner shows, the inline timestamp renders, and the button relabels to **Re-send to client**.
3. Click **Send to PM**, pick a PM, send → confirm that PM receives the email + attachment; inline line + relabel appear.
4. Re-send each → confirm the confirm dialog appears with the prior timestamp and that re-sending updates the timestamp.
5. Open a report whose project has no `contact_email` → confirm **Send to client** is disabled with the hint.
6. Force a failure (set an invalid `RESEND_API_KEY` locally) and send → confirm the error banner shows and that **no** `report_sends` row was written (check Studio/psql).

## Performance Considerations

Each send re-renders the PDF (~197 ms p95 per F-02) and makes one Resend HTTP call; total well within the 3 s p95 NFR for dispatch acknowledgement. No batching, no async — the request returns after Resend acknowledges. The summary query is a single indexed `select` by `report_id`. Re-rendering rather than caching is an accepted, measured trade (consistent with S-08).

## Migration Notes

One additive migration (`report_sends`); no changes to existing tables, so no data backfill and a trivial rollback (drop the table). Apply locally with `supabase migration up --local` (never `db reset` — wipes seeded data, memory `[[local-migration-apply-no-reset]]`); production via `npm run db:push`. Generated types must be re-sanitized after `db:types` (lessons.md).

## References

- Roadmap slice: `context/foundation/roadmap.md` (S-09 — north star)
- PRD: FR-019, FR-020, FR-021, US-01, NFR (3 s dispatch p95)
- Builds on S-08: `src/pages/api/reports/[id]/pdf.ts`, `src/lib/pdf/render.ts`, `src/lib/pdf/report-document.tsx`
- Reuses pattern: `src/components/reports/DeleteReportButton.tsx` (form-island + confirm modal)
- Data sources: `src/lib/pm-contacts/queries.ts` (`listContacts`), `src/lib/projects/queries.ts` (`contact_email`), `src/lib/reports/queries.ts` (`getReport`)
- Email infra status: `context/deployment/deploy-plan.md` (Prereq C — Resend)
- Project lessons: `context/foundation/lessons.md` (lint-by-exit-code, zod v4 top-level, vitest no `@/` alias, types-sanitize, React-19 form handlers)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Send persistence layer

#### Automated

- [x] 1.1 Migration applies locally: `npx supabase migration up --local`
- [x] 1.2 Types regenerate clean and typecheck: `npx astro check` (exit 0)
- [x] 1.3 Linting passes: `npm run lint` (exit 0)
- [x] 1.4 `summarize` unit tests pass: `npm test`

#### Manual

- [ ] 1.5 Hand-inserted `report_sends` rows → `getSendSummary` returns expected latest-per-recipient shape

### Phase 2: Email dispatch + send route

#### Automated

- [x] 2.1 Typecheck passes: `npx astro check` (exit 0)
- [x] 2.2 Linting passes: `npm run lint` (exit 0)
- [x] 2.3 Build passes: `npm run build` (exit 0)

#### Manual

- [ ] 2.4 Client send (smoke key) → email with PDF arrives; `report_sends` row exists
- [ ] 2.5 PM send → email arrives; row recorded with `pm_contact_id`
- [ ] 2.6 Invalid key → `?error=…` redirect and NO `report_sends` row (record-on-success)
- [ ] 2.7 Client send with null `contact_email` → `?error=No client email…`, no send, no row

### Phase 3: Send UI on the report page

#### Automated

- [x] 3.1 Typecheck passes: `npx astro check` (exit 0)
- [x] 3.2 Linting passes: `npm run lint` (exit 0)
- [x] 3.3 Build passes: `npm run build` (exit 0)

#### Manual

- [ ] 3.4 Send to client: enabled → sends → success banner + inline timestamp + relabel to Re-send
- [ ] 3.5 Re-send to client: confirm dialog shows prior timestamp; confirming updates it
- [ ] 3.6 Send to PM: picker → select → send → inline line + relabel; re-send pre-selects last PM
- [ ] 3.7 No client email → Send to client disabled with hint
- [ ] 3.8 No PM contacts → Send to PM disabled with Settings hint
- [ ] 3.9 Forced failure → error banner; buttons stay in first-send state (no phantom timestamp)
