# Async UX (S-11) Implementation Plan

## Overview

Convert Maintenance Ledger from native `<form method="POST">` → full-page-redirect submissions into asynchronous in-place `fetch` interactions. Every create / edit / delete / send becomes an async call that returns JSON; the affected list or detail region re-renders **client-side from React state** (full content-swap, no hard navigation, no blank-flash); outcomes are announced via **sonner** toasts that replace the `?ok=`/`?error=` query-string banners; destructive actions route through one reusable **ConfirmDialog**; and every action shows a spinner on its triggering control while in flight. The send and PDF-on-save guardrails are preserved unchanged.

This is the S-11 / Slice B work from `prd-v2.md`. It builds directly on S-10 (frontend-redesign), which shipped the full primitive set (Dialog, Tooltip, Card, Input, Label, Button, EmptyState, Skeleton, AppShell, cn) and deliberately deferred all async/toast wiring here.

## Current State Analysis

- **Submission model:** ~10 React form islands wrap native `<form method="POST" action=…>`. On submit, the browser posts FormData to an Astro `.ts` API route, which returns a **302 redirect** to a page URL carrying `?ok=<code>` or `?error=<urlencoded message>`. The destination page re-renders fully (blank-flash) and reads the query flag.
- **Outcome display:** `src/components/ui/Banner.astro` renders the `?ok=`/`?error=` message with `role="status"`/`role="alert"`. Each page hand-parses `Astro.url.searchParams` and maps `ok` codes to copy (`projects/[slug].astro`, `reports/[id].astro`, `pm-contacts.astro`, etc.).
- **Pending feedback:** islands use React 19's `useFormStatus()` to flip a button label ("Save" → "Saving…") and disable it. Pattern lives in `auth/SubmitButton.tsx` and inline `RowSubmit`/`SubmitSend`/`ConfirmSubmit` helpers across islands.
- **Confirmations (inconsistent):** project & report delete use the Radix `Dialog` primitive (`DeleteProjectButton.tsx` — with a type-the-name guard; `DeleteReportButton.tsx`); contact / catalog / recurring deletes use a **hand-rolled inline "Delete?" toggle** (`useState` in `ReadRow`). The send re-send confirm uses `Dialog`.
- **API routes (~13):** all under `src/pages/api/`, all return `context.redirect(...)`. Inventory: `projects/{index,[id],[id]/delete}`, `reports/{index,[id],[id]/delete,[id]/send}`, `pm-contacts/{index,[id],[id]/delete}`, `plugins-catalog/{index,[id],[id]/delete}`, `project-recurring-plugins/{index,[id]/delete}`, `brand-settings`.
- **Send choreography (load-bearing):** `api/reports/[id]/send.ts` dispatches the email **first**, then records the send **only on success** (US-01 — a failed send writes no record). Distinct error for "sent but couldn't record."
- **Auth:** `middleware.ts` verifies a stateless HMAC session cookie on every non-public path. Same-origin `fetch` carries the cookie automatically — no CSRF token exists or is needed.
- **Read data:** there are **no** GET/JSON read endpoints. Pages server-render from query modules (`src/lib/<domain>/queries.ts`) and pass data as props into islands.

### Key Discoveries:

- The only missing primitive is **Toast** — `Banner.astro:4` literally says "Async toasts are S-11." Everything else exists in `src/components/ui/`.
- `cn()` helper at `src/lib/utils.ts:1`; `clsx` + `tailwind-merge` already installed.
- Toast mount point is `src/layouts/AppShell.astro:17` (the authenticated shell wrapping every non-login page with `<Header>` + `<main><slot/></main>`).
- Form handlers are typed `React.SubmitEvent<HTMLFormElement>` (not deprecated `FormEvent`) per the lessons register — keep this.
- Repeater rows (plugins/themes/licenses) are **already** pure client state inside `ReportForm.tsx`; they persist only via the whole-form Save. This slice does not change that.
- Settings list islands (`PmContacts.tsx`, `PluginCatalog.tsx`, `RecurringPlugins.tsx`) already manage edit/confirm state in `useState` and receive their `entries` as props — they are the closest to the client-data-layer target and the natural first conversion.

## Desired End State

A signed-in user can complete the full flow (dashboard → project → author report → save → view PDF → send to PM and client) plus all settings CRUD with **no full-page reload or blank-flash**. Each action shows an immediate spinner on its control, the relevant region updates in place from the server's JSON response, and the outcome is announced by an accessible toast. Destructive actions use one consistent confirm dialog. Failed actions surface an error (inline for field errors, toast otherwise) and never show a false success; a failed send still writes no record. A `ux-recommendations.md` artifact ships with the plan.

Verify: clicking Save/Send/Delete/Add anywhere never triggers a browser navigation spinner or white flash (Network tab shows a `fetch` returning JSON, not a document load); `Banner.astro` and all `?ok=`/`?error=` parsing are gone; `npm run lint`, `npx astro check`, `npm test`, `npm run build` all pass.

## What We're NOT Doing

- **No optimistic UI / rollback.** Consciously deviating from US-03's literal "reflects immediately and rolls back" wording — see Open Risks. Feedback is spinner-then-update: the control spins, then the region updates *after* the server confirms. No unconfirmed state is ever shown, so no rollback logic exists.
- **No no-JS fallback.** Routes become JSON-only; the 302/redirect path is removed. (Internal ~20-user tool on modern browsers.)
- **No per-row persistence for report repeaters.** Plugins/themes/licenses rows stay client-only until the report Save.
- **No new GET/JSON read endpoints.** Islands seed from SSR props and patch from mutation responses.
- **No conversion of read-only views.** The dashboard stays server-rendered (no mutations to swap).
- **No background/queue work.** PDF render and email send stay on the request path (PRD non-goal). "Async" = request/response UX, not deferred jobs.
- **No domain-logic, PDF-render, send-order, or schema changes.** Presentation/interaction only. No migration in this slice.
- **No change to the disabled-Send tooltips** (S-10 already did them) beyond keeping them working.

## Implementation Approach

Build the toolkit first (toast, ConfirmDialog, a shared async-submit helper), then flip the route contract to JSON, then convert surfaces in increasing risk order: settings lists (most island-ready) → projects/reports lists & detail (adds client navigation) → report Save + Send paths (guardrail-critical), last. A shared client helper centralizes the fetch + JSON-parse + error-routing + toast + pending-state logic so each island converts to a thin call rather than re-implementing the dance. Each phase is independently shippable and leaves the app working.

**Data flow per mutation:** island calls `submit(action, formData)` → helper `fetch`es (same-origin, cookie auto-sent) → route returns `{ ok, message, data?, redirectTo? }` or `{ error, field? }` → on `ok`, the island patches its local collection state from `data` (re-render in place) and toasts `message`, or navigates via pushState if `redirectTo` is set; on `error`, the island shows a field error (if `field`) or the helper toasts the error. The control is disabled+spinning for the duration.

## Critical Implementation Details

- **Send order is server-side and stays put.** `send.ts` already dispatches-then-records; converting the route's *response* from redirect to JSON must not reorder or remove the try/catch choreography. The "sent but couldn't record" branch becomes a JSON success-with-warning (toast the warning), not an error that implies nothing was sent.
- **Report Save renders the PDF synchronously.** The Save route returns only after the PDF render attempt; the client must keep the control spinning for that full duration (await-confirm, no optimism) and toast the distinct "Saved, but the PDF could not be generated" case as a warning while still reflecting the save.
- **pushState + toast-across-navigation.** When a create returns `redirectTo` (e.g. new project/report page), the client navigates there. Because that destination no longer reads `?ok=`, the success toast must fire *before* navigation (client-side, persists across a pushState since the app isn't reloading) — or be re-emitted on arrival via a transient client signal. Do not reintroduce a `?ok=` query flag.
- **JSON detection is unnecessary** under JSON-only: routes always return JSON; the client always `fetch`es. No `Accept`-header branching.
- **Field-error contract.** Routes that today redirect with a slug/email-taken message must instead return `{ error, field: "slug" | "email" }` so the island maps it back under the right `FormField`; generic failures return `{ error }` (no `field`) and the helper toasts them.

---

## Phase 1: Async foundation & primitives

### Overview

Add the toast system, the reusable confirm dialog, and the shared async-submit helper. No existing behavior changes yet — this phase only introduces the toolkit later phases consume. App still works entirely on native POST→redirect after this phase.

### Changes Required:

#### 1. Sonner toast dependency + mount

**File**: `package.json`, `src/layouts/AppShell.astro`

**Intent**: Install `sonner` and mount its `<Toaster/>` once in the authenticated shell so any island can call `toast()`. This is the missing primitive.

**Contract**: Add `sonner` to dependencies (install requires user approval). Mount `<Toaster/>` as a React island (`client:load`) inside `AppShell.astro` alongside `<Header>`, configured for the light theme tokens and accessible defaults (it ships a live region). Toast position/duration defaults are set here.

#### 2. Toast wrapper module

**File**: `src/lib/ui/toast.ts` (new)

**Intent**: A thin re-export/wrapper around sonner's `toast` so call sites import from one project path (`@/lib/ui/toast`) and the library stays swappable; expose `toastSuccess(msg)` / `toastError(msg)` / `toastWarning(msg)`.

**Contract**: Named exports `toastSuccess`, `toastError`, `toastWarning` delegating to sonner. No JSX.

#### 3. Reusable ConfirmDialog

**File**: `src/components/ui/ConfirmDialog.tsx` (new)

**Intent**: One accessible confirm dialog on top of the existing Radix `Dialog` primitive, to replace the three hand-rolled inline "Delete?" toggles and align the existing delete dialogs. Supports a destructive variant and an optional type-to-confirm guard (for project delete).

**Contract**: Props approximately `{ trigger: ReactNode; title: string; description?: ReactNode; confirmLabel?: string; variant?: "default" | "destructive"; confirmWord?: string; pending?: boolean; onConfirm: () => void }`. Renders `Dialog` → `DialogTrigger asChild` (trigger) → `DialogContent` with header/description/footer (Cancel + Confirm). When `confirmWord` is set, the confirm button stays disabled until the typed input matches. Uses the existing Dialog's focus-trap/Esc/roles. No business logic.

#### 4. Shared async-submit helper

**File**: `src/lib/ui/submit.ts` (new) + a small `useSubmit` hook if a hook shape fits the islands better (`src/lib/ui/useSubmit.ts`)

**Intent**: Centralize the fetch + JSON-parse + error-routing + toast + pending-state pattern so each island converts to a thin call. This is the load-bearing convention the whole slice leans on.

**Contract**: A function `submit(action: string, body: FormData | Record<string,unknown>, opts?): Promise<Result>` where `Result = { ok: true; message?: string; data?: unknown; redirectTo?: string } | { ok: false; error: string; field?: string }`. It `fetch`es `action` (POST, same-origin so the session cookie rides automatically, body as FormData or JSON), parses the JSON response, and returns the typed `Result`. On a network/parse failure it returns `{ ok: false, error: "Something went wrong" }`. The helper does NOT itself toast (callers decide field-vs-toast); a companion hook may expose `{ submit, pending }` to drive the control's disabled+spinner state. Define the `Result` types in one shared `src/lib/ui/types.ts` consumed by both routes (Phase 2) and islands.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Linting passes (judge by exit code): `npm run lint`
- Unit tests pass: `npm test`
- Build succeeds: `npm run build`
- `sonner` appears in `package.json` dependencies

#### Manual Verification:

- A throwaway `toast()` call renders an accessible toast in the corner on a page using AppShell, then auto-dismisses
- `ConfirmDialog` opens, traps focus, closes on Esc/Cancel, and (with `confirmWord`) keeps Confirm disabled until the word matches
- No existing page's behavior changed (forms still POST→redirect)

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding.

---

## Phase 2: Route JSON contract

### Overview

Convert all ~13 API routes from 302-redirect to JSON, returning the post-mutation resource so the client can patch state. Retire `Banner.astro` and every page-level `?ok=`/`?error=` parse. After this phase the routes speak JSON but islands haven't been converted yet — so this phase ships together with at least Phase 3's first conversion, OR the islands are temporarily pointed at the JSON via the Phase 1 helper. (Sequencing note: to keep the app working, convert each route in lockstep with its island in Phases 3–5; Phase 2 is the *contract spec* applied route-by-route as each surface is converted. The route changes are listed here once, as the shared contract.)

### Changes Required:

#### 1. Mutation routes return JSON

**File**: every file under `src/pages/api/` listed in Current State (projects, reports, pm-contacts, plugins-catalog, project-recurring-plugins, brand-settings — index/[id]/delete/send as applicable)

**Intent**: Replace `context.redirect(...)` with `Response`-as-JSON. Success returns the affected resource (and a `redirectTo` where a create currently lands on a new page); errors return a message plus an optional `field` for field-mappable validation/conflict errors.

**Contract**: Success → `Response.json({ ok: true, message, data?, redirectTo? }, { status: 200 })` where `data` is the created/updated row (or, for deletes, the deleted id) so the island can patch its collection. Field errors (slug-taken, email-taken, validation) → `Response.json({ ok: false, error, field }, { status: 400 })`. Other failures → `{ ok: false, error }` with `400`/`404`/`500` as fits. The `send.ts` choreography is preserved: dispatch-then-record stays; the "sent but couldn't record" case returns `{ ok: true, message: <warning>, … }` (success-with-warning), the "could not send" case returns `{ ok: false, error }`. Shapes match `src/lib/ui/types.ts` from Phase 1.

#### 2. Remove Banner + query-flag parsing

**File**: `src/components/ui/Banner.astro` (delete), and the `Astro.url.searchParams.get("ok"|"error")` blocks in `src/pages/projects/index.astro`, `projects/[slug].astro`, `projects/[slug]/reports/[id].astro`, `pm-contacts.astro`, `plugins-catalog.astro`, `brand-settings.astro`, `projects/new.astro`

**Intent**: Toasts replace the banner channel; the query-string outcome mechanism is fully retired.

**Contract**: Delete `Banner.astro`. Remove each page's `ok`/`error` param read and the `<Banner …/>` render. Login page error handling (`login.astro`) is out of scope for this slice — leave it (auth isn't being converted here; confirm it doesn't depend on `Banner.astro`, and if it does, inline its minimal markup).

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Linting passes (exit code): `npm run lint`
- Unit tests pass: `npm test`
- Build succeeds: `npm run build`
- No remaining references to `Banner.astro`: grep is clean
- No remaining `searchParams.get("ok")` / `searchParams.get("error")` outside `login.astro`: grep is clean

#### Manual Verification:

- Hitting a converted route directly (e.g. via curl/devtools) returns JSON with the right status, not a 302
- The send route still dispatches-then-records (a forced send failure records nothing; verify against the existing behavior)
- Field errors return `{ error, field }`; generic errors return `{ error }`

**Implementation Note**: Pause for manual confirmation before proceeding.

---

## Phase 3: Settings list pages → client data layer

### Overview

Convert the most island-ready surfaces to async + client-managed state: PM contacts, plugins catalog, and the project-detail recurring-plugins list. These already hold `entries` as props and manage row/edit state, so they prove the client-data-layer pattern with the least friction. Each add/edit/delete becomes an async `submit()`, the list re-renders from returned JSON, deletes route through `ConfirmDialog`.

### Changes Required:

#### 1. PM contacts island

**File**: `src/components/pm-contacts/PmContacts.tsx`

**Intent**: Promote `entries` to React state owned by the island; async add (AddForm), edit (EditRow), delete (ReadRow) via `submit()`; patch state from the returned row; replace the inline "Delete?" toggle with `ConfirmDialog`; toast outcomes; map email-taken to the email `FormField`.

**Contract**: `entries` seeds `useState`; `submit("/api/pm-contacts", …)` for create, `submit("/api/pm-contacts/{id}", …)` for update, `submit("/api/pm-contacts/{id}/delete", …)` for delete. On success, insert/replace/remove the row in state and `toastSuccess(message)`. On `{ field: "email" }`, set the field error; otherwise `toastError`. Pending state disables+spins the triggering control only. Keep `React.SubmitEvent<HTMLFormElement>` typing and client-side zod pre-validation.

#### 2. Plugins catalog island

**File**: `src/components/plugins-catalog/PluginCatalog.tsx`

**Intent**: Same conversion as PM contacts (mirror structure — add/edit/delete rows), against the `/api/plugins-catalog*` routes; map name conflicts to the name field.

**Contract**: Identical pattern to #1 with catalog routes and fields. ConfirmDialog replaces the inline delete toggle.

#### 3. Recurring-plugins island

**File**: `src/components/project-recurring-plugins/RecurringPlugins.tsx`

**Intent**: Async add (plugin_id-or-name) + delete against `/api/project-recurring-plugins*`; patch the list in state; ConfirmDialog for remove; keep the hidden `project_id`/`slug` carried in the request body.

**Contract**: Same pattern; the add validates "either plugin_id or name" client-side as today. On success, patch the recurring list state and toast.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Linting passes (exit code): `npm run lint`
- Unit tests pass: `npm test`
- Build succeeds: `npm run build`

#### Manual Verification:

- Add / edit / delete a PM contact, a catalog entry, and a recurring plugin — each updates the list **in place** with a toast, no page reload or flash
- Triggering a duplicate (email/name/already-on-list) shows the error inline (field) or as a toast (already-on-list), with no false success
- The delete confirm is the new `ConfirmDialog` (focus-trapped, keyboard-operable), consistent across all three
- Controls disable + spin only on the row/button being acted on

**Implementation Note**: Pause for manual confirmation before proceeding.

---

## Phase 4: Projects & reports lists + create / delete

### Overview

Convert the project and report collection surfaces and their create/delete actions, introducing client navigation (pushState) for creates that currently land on a new page. Covers: projects list + create + delete, project detail (its reports list + delete), report create + delete.

### Changes Required:

#### 1. Project create/edit form

**File**: `src/components/projects/ProjectForm.tsx`

**Intent**: Async submit for both create and edit; on create success, client-navigate (pushState/`location.assign` per the toast-across-nav detail) to the new project page with a success toast; on edit success, update in place + toast; map slug-taken to the slug field.

**Contract**: `submit(action, formData)`; success-with-`redirectTo` → toast then navigate; edit success → toast, no nav. `{ field: "slug" }` → slug `FormField` error; else `toastError`. Pending disables+spins the submit button.

#### 2. Delete project / delete report buttons

**File**: `src/components/projects/DeleteProjectButton.tsx`, `src/components/reports/DeleteReportButton.tsx`

**Intent**: Re-base both on the shared `ConfirmDialog` (project keeps its type-the-name guard via `confirmWord`); async delete; on success navigate to the list (projects) / project page (report) via pushState + toast.

**Contract**: `ConfirmDialog` with `variant="destructive"`; project delete sets `confirmWord={projectName}`. On confirm, `submit(".../delete", …)`; success → toast + client navigate to `redirectTo`. Removes the hand-rolled dialog markup in favor of the shared one.

#### 3. Projects list & reports list rendering

**File**: the list views — `src/pages/projects/index.astro` (+ any list island), `src/pages/projects/[slug].astro` (reports list section), and any island that renders these collections

**Intent**: Make the rendered collection update from client state after a create/delete instead of relying on a reload. Where the list is currently pure Astro SSR with no island, introduce a thin client island that seeds from SSR props and owns the collection so deletes/creates can patch it in place.

**Contract**: Each mutating collection is rendered by a React island seeded with the SSR data as props; the island holds the collection in `useState` and patches it from mutation `data`. Read-only summary bits stay SSR. No new GET endpoint — state comes from props + mutation responses.

#### 4. Report create action

**File**: the "new report" trigger (in `projects/[slug].astro` / its island) and `src/pages/api/reports/index.ts` consumer

**Intent**: Async create-report; on success navigate (pushState) to the new report page with a toast.

**Contract**: `submit("/api/reports", { project_id, slug })`; success → toast + navigate to `redirectTo` (the report page).

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Linting passes (exit code): `npm run lint`
- Unit tests pass: `npm test`
- Build succeeds: `npm run build`

#### Manual Verification:

- Create a project → lands on the new project page with a success toast, no white flash
- Edit a project (incl. slug change) → updates in place / navigates as today, toast, no reload; slug-taken shows inline
- Delete a project → ConfirmDialog requires typing the name, then navigates to the list with a toast
- Create a report → lands on the report page with a toast; delete a report → ConfirmDialog, returns to the project, toast
- The reports list and projects list reflect create/delete in place
- Browser back/forward still works after pushState navigations (deep links intact)

**Implementation Note**: Pause for manual confirmation before proceeding.

---

## Phase 5: Report authoring Save + Send paths

### Overview

The guardrail-critical surface, done last: async report Save (synchronous PDF render, await-confirm), and the two Send paths (preserving dispatch-then-record, the re-send confirm, and the inline send-history refresh). No optimism here by definition — Save and Send always wait for server confirmation.

### Changes Required:

#### 1. Report Save form

**File**: `src/components/reports/ReportForm.tsx`

**Intent**: Convert the whole-form Save to async `submit()`; keep the control spinning for the full PDF-render duration; on success update in place + toast; surface the distinct "Saved, but the PDF could not be generated" case as a warning toast while still reflecting the save; field/validation errors inline. Repeater rows remain client-only and serialize into the same submit as today.

**Contract**: `submit("/api/reports/{id}", formData)`; await-confirm (no optimistic state). Success → `toastSuccess`; success-with-warning (PDF failed) → `toastWarning`, still mark saved and refresh the PDF link state; `{ field }` → inline; else `toastError`. The PDF download/view link region updates from the response (new render available).

#### 2. SendToPm / SendToClient islands

**File**: `src/components/reports/SendToPmButton.tsx`, `src/components/reports/SendToClientButton.tsx`

**Intent**: Convert the send submit to async; preserve the re-send `ConfirmDialog` and the disabled-Send tooltips (S-10) untouched; on success refresh the inline send-history (delivery strip) from the returned data and toast; on the "sent but couldn't record" warning toast a warning; on failure toast an error and change nothing.

**Contract**: `submit("/api/reports/{id}/send", formData)` with the existing hidden fields (slug, recipient_type, pm_email/pm_contact_id). Success → toast + update the send-history state (last-send email/timestamp, which flips the button to "Re-send" and updates the strip). Warning (recorded-failed) → `toastWarning`. Failure → `toastError`, no history change, **no record written** (server-enforced). The re-send confirm dialog stays as the gate before dispatch; first-send stays a direct submit.

#### 3. Delivery-strip / send-history state

**File**: `src/pages/projects/[slug]/reports/[id].astro` (delivery strip, lines ~95–125) + the island(s) that render it

**Intent**: The inline "PM: … · date / Client: … · date" strip must update after an async send without a reload. Promote the strip (or its data) into client state seeded from `getSendSummary` SSR props, patched from the send response.

**Contract**: The strip renders from island state seeded with the SSR send-summary; a successful send patches the relevant recipient's `{ email, sentAt }`. No new endpoint.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Linting passes (exit code): `npm run lint`
- Unit tests pass: `npm test`
- Build succeeds: `npm run build`

#### Manual Verification:

- Save a report → button spins through the PDF render, then a success toast; the PDF view/download link reflects the new render; no reload
- Force a PDF-render failure path → save still reflected, a **warning** toast (not a false "all good", not a hard error)
- Send to PM and to client → success toast, the delivery strip updates inline and the button flips to "Re-send", no reload
- Re-send → the ConfirmDialog gates it; confirming dispatches and updates the strip
- Force a send failure → error toast, **no** send recorded, strip unchanged (verify the US-01 rule holds)
- Disabled-Send tooltips (no client email / no PM contacts) still work and are keyboard-reachable

**Implementation Note**: Pause for manual confirmation before proceeding.

---

## Phase 6: UX recommendations deliverable

### Overview

Deliver the explicitly-requested set of UX recommendations as an artifact, scoped to the async-UX conventions this slice establishes so future slices stay consistent.

### Changes Required:

#### 1. UX recommendations doc

**File**: `context/changes/async-ux/ux-recommendations.md` (new)

**Intent**: Capture the conventions introduced: when/how to toast (success vs error vs warning, duration, the accessible live region), spinner-then-update timing and the disable-the-triggering-control rule, ConfirmDialog usage (when a confirm is required, destructive variant, the type-to-confirm guard), the error-surfacing rule (field errors inline vs everything-else-toast), and the client-data-layer pattern (seed from SSR props, patch from mutation JSON, no separate reads). Note the conscious US-03 optimism deviation and why.

**Contract**: A concise markdown doc (sections per convention) with a short rationale each and a pointer to the canonical implementation (`src/lib/ui/submit.ts`, `ConfirmDialog.tsx`, `toast.ts`). Reference-style, not a tutorial.

### Success Criteria:

#### Automated Verification:

- File exists: `context/changes/async-ux/ux-recommendations.md`

#### Manual Verification:

- The doc covers all six conventions and reads as a usable reference for the next slice
- Each recommendation names its canonical code location

**Implementation Note**: Final phase — confirm the doc with the human.

---

## Testing Strategy

### Unit Tests:

- The async-submit helper (`submit.ts`): success JSON → `{ ok: true, … }`; error JSON with `field` → `{ ok: false, error, field }`; network/parse failure → `{ ok: false, error }`. (Import siblings relatively per the vitest no-`@/`-alias lesson.)
- `ConfirmDialog`: confirm disabled until `confirmWord` matches; `onConfirm` fires only on the confirm action.
- Any route-level pure helpers that shape the JSON response (if extracted).

### Integration Tests:

- Per converted surface: submit → JSON → state patch (where a testing-library setup exists for islands). At minimum, exercise the helper + reducer logic that patches collections.

### Manual Testing Steps (end-to-end, the real proof):

1. Walk the full flow (sign in → dashboard → project → author report → save → view PDF → send to PM + client) and confirm **zero** full-page reloads / blank-flashes (watch the Network tab for `fetch` vs document loads).
2. Exercise every CRUD surface (projects, reports, contacts, catalog, recurring) for add/edit/delete with success and with a forced error; confirm inline-vs-toast error routing and no false success.
3. Force the send-failure and PDF-render-failure paths; confirm the US-01 no-record rule and the warning (not error/not false-success) treatments.
4. Keyboard-only pass: toasts are announced, ConfirmDialog traps focus and is operable, disabled-Send tooltips reachable (WCAG-AA carry-over from S-10).
5. Back/forward after create/delete navigations; deep links still resolve.

## Performance Considerations

The save→PDF path stays within the existing 5 s p95 budget — this slice doesn't touch rendering, only how the response is delivered (JSON vs redirect) and consumed. Returning the mutated resource in the JSON avoids an extra read round-trip. Each action is a single same-origin `fetch`; no polling, no global re-fetch.

## Migration Notes

No data migration — this slice is additive in code only (one new dependency, new UI modules) and changes no schema. The only destructive code change is removing `Banner.astro` and the query-flag parsing, replaced by toasts.

## References

- PRD: `context/foundation/prd-v2.md` (US-03, Slice B, Guardrails)
- Roadmap: `context/foundation/roadmap.md` (S-11)
- Send choreography to preserve: `context/archive/2026-05-30-report-email-send/plan.md` (record-on-success-only)
- Primitives shipped by S-10: `context/changes/frontend-redesign/plan.md` (Phase 2)
- Lessons (lint-by-exit-code, vitest no-`@/`, Astro lint gotchas, zod v4): `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Async foundation & primitives

#### Automated

- [x] 1.1 Type checking passes: `npx astro check` — a066e7a
- [x] 1.2 Linting passes (exit code): `npm run lint` — a066e7a
- [x] 1.3 Unit tests pass: `npm test` — a066e7a
- [x] 1.4 Build succeeds: `npm run build` — a066e7a
- [x] 1.5 `sonner` appears in `package.json` dependencies — a066e7a

#### Manual

- [ ] 1.6 A throwaway `toast()` renders an accessible auto-dismissing toast on an AppShell page
- [ ] 1.7 `ConfirmDialog` opens, traps focus, closes on Esc/Cancel, gates Confirm on `confirmWord`
- [ ] 1.8 No existing page behavior changed (forms still POST→redirect)

### Phase 2: Route JSON contract

#### Automated

- [x] 2.1 Type checking passes: `npx astro check` — 73e877e
- [x] 2.2 Linting passes (exit code): `npm run lint` — 73e877e
- [x] 2.3 Unit tests pass: `npm test` — 73e877e
- [x] 2.4 Build succeeds: `npm run build` — 73e877e
- [x] 2.5 No remaining references to `Banner.astro` (grep clean) — 73e877e
- [x] 2.6 No remaining `searchParams.get("ok"|"error")` outside `login.astro` (grep clean) — 73e877e

#### Manual

- [ ] 2.7 Hitting a converted route returns JSON with the right status, not a 302
- [ ] 2.8 The send route still dispatches-then-records (forced failure records nothing)
- [ ] 2.9 Field errors return `{ error, field }`; generic errors return `{ error }`

### Phase 3: Settings list pages → client data layer

#### Automated

- [x] 3.1 Type checking passes: `npx astro check` — 9abcabc
- [x] 3.2 Linting passes (exit code): `npm run lint` — 9abcabc
- [x] 3.3 Unit tests pass: `npm test` — 9abcabc
- [x] 3.4 Build succeeds: `npm run build` — 9abcabc

#### Manual

- [ ] 3.5 Add/edit/delete a PM contact, catalog entry, recurring plugin — each updates in place with a toast, no reload
- [ ] 3.6 Duplicate triggers inline field error or already-on-list toast, no false success
- [ ] 3.7 Delete confirm is the shared `ConfirmDialog`, consistent across all three
- [ ] 3.8 Only the acted-on control disables + spins

### Phase 4: Projects & reports lists + create / delete

#### Automated

- [x] 4.1 Type checking passes: `npx astro check`
- [x] 4.2 Linting passes (exit code): `npm run lint`
- [x] 4.3 Unit tests pass: `npm test`
- [x] 4.4 Build succeeds: `npm run build`

#### Manual

- [ ] 4.5 Create project → lands on new project page with a toast, no flash
- [ ] 4.6 Edit project (incl. slug change) → updates/navigates with toast, slug-taken inline
- [ ] 4.7 Delete project → ConfirmDialog type-the-name, then navigates to list with toast
- [ ] 4.8 Create report → report page + toast; delete report → ConfirmDialog → project + toast
- [ ] 4.9 Projects & reports lists reflect create/delete in place
- [ ] 4.10 Back/forward works after pushState navigations (deep links intact)

### Phase 5: Report authoring Save + Send paths

#### Automated

- [ ] 5.1 Type checking passes: `npx astro check`
- [ ] 5.2 Linting passes (exit code): `npm run lint`
- [ ] 5.3 Unit tests pass: `npm test`
- [ ] 5.4 Build succeeds: `npm run build`

#### Manual

- [ ] 5.5 Save → control spins through PDF render, success toast, PDF link reflects new render, no reload
- [ ] 5.6 Forced PDF-render failure → save reflected + warning toast (not false-success, not hard error)
- [ ] 5.7 Send to PM and client → success toast, delivery strip updates inline, button flips to "Re-send", no reload
- [ ] 5.8 Re-send → ConfirmDialog gates dispatch, strip updates
- [ ] 5.9 Forced send failure → error toast, no send recorded, strip unchanged (US-01 holds)
- [ ] 5.10 Disabled-Send tooltips still work and are keyboard-reachable

### Phase 6: UX recommendations deliverable

#### Automated

- [ ] 6.1 File exists: `context/changes/async-ux/ux-recommendations.md`

#### Manual

- [ ] 6.2 Doc covers all six conventions and reads as a usable reference
- [ ] 6.3 Each recommendation names its canonical code location
