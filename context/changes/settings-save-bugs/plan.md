# Settings Save-Flow Bug Fixes Implementation Plan

## Overview

Fix two save-flow bugs on the two settings pages, both caused by the S-11 `async-ux` slice migrating API routes to a JSON contract while leaving (or mis-wiring) the form islands that drive them:

1. **brand-settings 404** — saving brand settings navigates the browser to `/api/brand-settings` (raw JSON, then a 404 on the follow-up GET) instead of saving in place.
2. **email-templates dead spinner** — the "Save templates" button never shows a loading state, so a save gives no in-flight feedback.

Both fixes follow the already-established, documented in-repo async pattern (`ProjectForm.tsx` + `context/archive/2026-05-31-async-ux/ux-recommendations.md`). No route, schema, data-model, or server changes.

## Current State Analysis

- **The async-ux slice converted the brand-settings *route* but not its *form*.** S-11 Phase 2 listed `brand-settings` in the route-conversion inventory, and `src/pages/api/brand-settings.ts:16` confirms the route returns JSON via `actionOk`/`actionError`. But no S-11 phase (3/4/5) listed `BrandSettingsForm.tsx` among the converted islands — it fell through the gap.
- **`BrandSettingsForm` is still a native POST form.** `src/components/brand-settings/BrandSettingsForm.tsx:93-95` renders `<form method="POST" action="/api/brand-settings" encType="multipart/form-data">`. Submitting does a full-page navigation to the JSON route → the browser shows raw JSON (POST) and a 404 (the subsequent GET has no handler). `handleSubmit` only does client-side zod validation and `e.preventDefault()` on failure; on success it lets the native navigation proceed.
- **`EmailTemplatesForm` is async but its button's spinner is dead.** `src/components/email-templates/EmailTemplatesForm.tsx:39` correctly calls `useSubmit()` and gets a real `pending` flag, and `handleSubmit` (`:64-95`) does the fetch + toast dance correctly. But it renders `SubmitButton` (`:145-147`), whose spinner is driven by React's `useFormStatus()` (`src/components/auth/SubmitButton.tsx:12`). `useFormStatus` only reports `pending` for a native `<form action>` submission inside a `<form>` — this island uses a manual `onSubmit` + `fetch`, so `useFormStatus().pending` is always `false`. The real `pending` is currently wired **only** to the `sr-only` aria-live region (`EmailTemplatesForm.tsx:141-143`), never to the button.
- **The canonical fix already exists in-repo.** `src/components/projects/ProjectForm.tsx:174-186` is the reference fetch-based async island: it does **not** use `SubmitButton`; it renders `Button` inline with the spinner markup driven by `pending` from `useSubmit()`. `ux-recommendations.md` §4 codifies the rule: "disable + spinner on the triggering control only … reuse the inline spinner markup from `SubmitButton`/the island buttons."
- **`useSubmit` handles multipart unchanged.** `src/lib/ui/useSubmit.ts:17-22` passes a `FormData` body straight to `fetch` without setting `Content-Type` (the browser sets the multipart boundary). So brand-settings' logo file upload survives the conversion with no change to `parseBrandForm`/`upsertBrand`.
- **The brand-settings route returns the upserted row.** `actionOk({ message, data: brand })` (`api/brand-settings.ts:16`) — `data` is the full `brand_settings` row including `updated_at` and the persisted `logo` data-URI, so the form can reflect post-save state without a re-fetch.
- **`SubmitButton` has three consumers:** `LoginForm.tsx` (native POST — must keep working via `useFormStatus`), `EmailTemplatesForm.tsx` (fetch — currently broken), `BrandSettingsForm.tsx` (currently native, will become fetch).

### Key Discoveries:

- Both bugs are one root cause in two forms: **`SubmitButton`/`useFormStatus` only works for native-POST forms; on a fetch island it is silently dead.** email-templates reused it on a fetch island; brand-settings was never moved off native POST at all.
- Single-form pages: no collection to patch, no `redirectTo` navigation. Simpler than any S-11 island — both reduce to `submit → toast → reflect the returned row`.
- The async-ux recommendations doc (`context/archive/2026-05-31-async-ux/ux-recommendations.md`) is the spec to conform to (§2 useSubmit, §3 toasts, §4 spinner-then-update, §5 field-vs-toast errors).
- Lessons register: type handlers as `React.SubmitEvent<HTMLFormElement>` (not deprecated `FormEvent`); judge lint/build by exit code; full `npm run lint` (not just the staged-file hook).

## Desired End State

Saving on **both** settings pages stays on the page, shows a spinner on the Save button while the request is in flight, and announces the outcome with a toast — no full-page navigation, no 404, no blank flash.

- **brand-settings:** clicking "Save changes" fetches `/api/brand-settings`, the button spins, on success a success toast fires, the "Last saved" timestamp updates, and the logo preview reflects the persisted server logo. On failure an error toast fires and an inline error is shown. The URL never changes to `/api/brand-settings`.
- **email-templates:** clicking "Save templates" shows the spinner + "Saving..." for the duration of the fetch (existing toast/error behavior already works).

Verify: in the Network tab, Save is a `fetch` returning JSON (not a document load); the button visibly spins; `npx astro check`, `npm run lint`, `npm test`, `npm run build` all pass.

## What We're NOT Doing

- **No route, schema, data-model, or server changes.** `api/brand-settings.ts`, `api/email-templates.ts`, `parseBrandForm`, `upsertBrand`, and all schemas stay exactly as they are.
- **No new tests / RTL harness.** Islands have no existing test setup; verification is the automated gates + manual save-flow checks (matches how S-11 verified its island conversions).
- **No refactor of `ProjectForm` or the other working async islands.** They already follow the pattern; leave them.
- **No new `AsyncSubmitButton` component.** We extend the existing `SubmitButton` with an optional `pending` prop rather than adding a parallel component.
- **No change to `LoginForm`** beyond confirming it still works (it stays native-POST + `useFormStatus`).
- **No client-side navigation / `redirectTo`.** These are single-form settings pages that stay put after save.
- **No change to client-side zod pre-validation, the logo file constraints, the live email-template preview, or the token reference.**

## Implementation Approach

Two independently-shippable phases, smallest-blast-radius first.

**Phase 1** makes the shared `SubmitButton` usable on fetch islands by adding an optional `pending` prop: when provided, it drives the spinner/disabled state; when omitted, it falls back to `useFormStatus()` (so `LoginForm` is untouched). Then wire `EmailTemplatesForm`'s already-available `pending` into the button. This fixes Bug 2 and creates the mechanism Phase 2 reuses.

**Phase 2** converts `BrandSettingsForm` to the async pattern: remove `method`/`action`/`encType` from the `<form>`, submit the existing multipart `FormData` via `useSubmit()`, drive the (now `pending`-aware) `SubmitButton`, toast success/error, render an inline `ServerError`, and on success reflect the returned row (update the "Last saved" timestamp and reset the logo preview baseline to the persisted server logo). This fixes Bug 1.

**Data flow per save (both forms):** island runs client-side zod validation → builds `FormData` → `submit(action, formData)` (`useSubmit` → same-origin `fetch`, session cookie auto-sent) → route returns `{ ok, message, data }` or `{ ok: false, error }` → on `ok`, `toastSuccess(message)` and reflect any returned state; on error, `toastError(error)` and set the inline `ServerError`. The Save button is disabled + spinning for the duration via the real `pending`.

## Critical Implementation Details

- **`useFormStatus` fallback must be preserved.** `SubmitButton`'s `pending` prop is *optional*; when `undefined`, the component must still read `useFormStatus()` so `LoginForm` (native POST) keeps its spinner. The effective pending is `pendingProp ?? useFormStatus().pending`. `useFormStatus()` must still be called unconditionally at the top of the component (hooks rules) — only the value selection is conditional.
- **Brand-settings logo baseline reset (the one non-obvious bit).** Today the preview derives from `merged.logo` (an SSR prop) plus local `filePreview`/`removed` state. After a successful save the component must adopt `res.data.logo` as the new baseline and clear the local `filePreview` (revoking its object URL) and `removed` flag — otherwise the file input still "holds" the prior pick, a second save re-uploads the same bytes, and the preview can drift from what's persisted. The existing `useEffect` that revokes the object URL on change already handles revocation when `filePreview` is set to `null`.
- **Multipart body is passed through untouched.** Keep building the submit body as `FormData` (carrying the `logo` File, `remove_logo`, and the three text fields exactly as the native form did) so `parseBrandForm` sees an identical payload. Do not JSON-encode.

## Phase 1: Shared `SubmitButton` pending prop + email-templates wiring

### Overview

Give `SubmitButton` an optional `pending` prop so fetch-based islands can drive its spinner, then pass `EmailTemplatesForm`'s real `pending` into it. Fixes the email-templates dead-spinner bug and establishes the mechanism Phase 2 uses. `LoginForm` is unchanged and must keep working.

### Changes Required:

#### 1. `SubmitButton` accepts an optional `pending` prop

**File**: `src/components/auth/SubmitButton.tsx`

**Intent**: Let callers override the `useFormStatus()`-derived pending state for fetch-based islands, while native-POST callers (LoginForm) keep working with no change.

**Contract**: Add optional `pending?: boolean` to `SubmitButtonProps`. Call `useFormStatus()` unconditionally (hooks rule) and compute the effective pending as `pending ?? formStatus.pending`. All existing rendering (spinner markup, disabled state, `pendingText`, icon, children) is driven by the effective value. No change to existing call sites' behavior when the prop is omitted.

#### 2. Wire the real `pending` into the email-templates Save button

**File**: `src/components/email-templates/EmailTemplatesForm.tsx`

**Intent**: Pass the `pending` already returned by `useSubmit()` into `SubmitButton` so the spinner/disabled state actually reflects the in-flight fetch.

**Contract**: `<SubmitButton pending={pending} pendingText="Saving..." icon={<Save .../>}>Save templates</SubmitButton>`. The existing `sr-only` aria-live region (`:141-143`) stays. No other logic changes.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Linting passes (judge by exit code): `npm run lint`
- Unit tests pass: `npm test`
- Build succeeds: `npm run build`

#### Manual Verification:

- Saving email templates shows the spinner + "Saving..." on the button for the duration of the request, then the existing success toast fires.
- The login page still shows its "Signing in..." spinner on submit (native POST + `useFormStatus` fallback intact).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes live in the `## Progress` section at the bottom.

---

## Phase 2: Convert `BrandSettingsForm` to async submit

### Overview

Move `BrandSettingsForm` off native POST onto the `useSubmit()` pattern so saving stays on the page, fixing the 404. Drive the (now `pending`-aware) `SubmitButton`, toast outcomes, render an inline `ServerError`, and reflect the returned row on success (timestamp + logo baseline). No route/parser/schema changes — the multipart payload is identical.

### Changes Required:

#### 1. Async submit + pending state

**File**: `src/components/brand-settings/BrandSettingsForm.tsx`

**Intent**: Replace the native form submission with a fetch via `useSubmit()`, so the browser no longer navigates to the JSON route.

**Contract**: Remove `method="POST"`, `action={action}`, and `encType="multipart/form-data"` from the `<form>` (keep `onSubmit`, `noValidate`, `className`). Call `const { submit, pending } = useSubmit<Brand>()`. In `handleSubmit`: `e.preventDefault()` always; run the existing client-side zod validation (return early on failure as today); build a `FormData` carrying the three text fields, the selected `logo` File (when present), and `remove_logo` (when `removed`) — i.e. the same fields the native form posted; `const res = await submit(action, fd)`. Drive `SubmitButton` with `pending={pending}`. Type the handler `React.SubmitEvent<HTMLFormElement>` and call it as `onSubmit={(e) => void handleSubmit(e)}` (async handler — mirror `ProjectForm`/`EmailTemplatesForm`).

#### 2. Success/error feedback (toast + inline ServerError)

**File**: `src/components/brand-settings/BrandSettingsForm.tsx`

**Intent**: Announce the outcome consistently with the other async forms and keep an on-page error trace.

**Contract**: Add `serverError` state (`useState<string|null>(null)`), cleared at the start of each submit. Import `toastSuccess`/`toastError` from `@/lib/ui/toast`. On `res.ok`: `toastSuccess(res.message)`. On failure: `setServerError(res.error)` and `toastError(res.error)`. Render the existing `<ServerError message={serverError} />` (replacing the prop-driven one; the `serverError` prop on `Props` can be dropped or left unused — prefer dropping it since the page never passes it).

#### 3. Reflect the saved row (timestamp + logo baseline reset)

**File**: `src/components/brand-settings/BrandSettingsForm.tsx`

**Intent**: After a successful save keep the in-place UI truthful — update "Last saved" and make the logo preview show the persisted server logo, so a re-save doesn't re-upload and the preview doesn't drift.

**Contract**: Hold the displayed "Last saved" string and the logo baseline in state seeded from props (`updatedAt` prop → state; `merged.logo` → an `existingLogo` state). On `res.ok` with `res.data`: set the saved-timestamp state from `new Date(res.data.updated_at).toLocaleString()`, set the logo baseline from `res.data.logo`, clear `filePreview` (→ `null`, which triggers the existing revoke `useEffect`) and reset `removed` to `false`. `previewSrc` continues to derive from `filePreview ?? (removed ? null : existingLogoState)`. Import the `Brand` type from `@/lib/brand-settings/queries` for the `useSubmit<Brand>()` generic and `res.data` typing.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Linting passes (judge by exit code): `npm run lint`
- Unit tests pass: `npm test`
- Build succeeds: `npm run build`

#### Manual Verification:

- Saving brand settings stays on `/brand-settings` (URL never becomes `/api/brand-settings`); Network tab shows a `fetch` returning JSON, not a document load — the 404 is gone.
- The Save button spins + disables for the duration of the request.
- On success a success toast fires and the "Last saved" timestamp updates without a reload.
- Upload a new logo and save → preview shows the saved logo; saving again immediately does not re-upload (preview baseline came from the server). Remove the logo and save → preview clears and persists.
- Force an error (e.g. oversized logo) → an error toast fires AND an inline error is shown; no navigation.
- Valid save with no logo change preserves the existing logo (the `logo?: never` "untouched" path still works).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

### Unit Tests:

- None added (no existing island test harness; out of scope for this LOW bug slice — see "What We're NOT Doing"). The existing `src/lib/brand-settings` and `src/lib/email-templates` unit tests continue to pass unchanged via `npm test`.

### Integration Tests:

- None added. The route/parser/schema are untouched, so existing coverage still applies.

### Manual Testing Steps:

1. **email-templates spinner:** open `/email-templates`, edit a field, click "Save templates" — confirm the button shows the spinner + "Saving..." while the request is in flight, then a success toast. Throttle the network (DevTools) to make the spinner clearly visible.
2. **login regression:** open `/login`, submit — confirm the "Signing in..." spinner still appears (native-POST `useFormStatus` fallback intact).
3. **brand-settings no-404:** open `/brand-settings`, change the agency name, click "Save changes" — confirm the URL stays `/brand-settings`, the Network tab shows a JSON `fetch` (not a document load), the button spins, a success toast fires, and "Last saved" updates. (Previously this navigated to `/api/brand-settings` and 404'd.)
4. **brand-settings logo round-trip:** pick a new PNG/JPEG logo, save → preview shows it; click Save again with no further change → confirm it does not re-upload the same bytes (preview reflects the server data-URI). Use "Remove logo" + save → preview clears and stays cleared after reload.
5. **brand-settings error path:** attempt an oversized (>512 KB) or non-PNG/JPEG logo and save → confirm an error toast AND an inline error appear, with no navigation.

## Performance Considerations

None. Each save is a single same-origin `fetch` replacing a full document navigation — strictly less work than before. No rendering, query, or payload changes.

## Migration Notes

No data migration. Code-only changes to two React island components and one shared button component; no schema, route, or dependency changes.

## References

- Canonical async island pattern: `src/components/projects/ProjectForm.tsx:174-186`
- Async-UX conventions (toasts, useSubmit, spinner-then-update, field-vs-toast): `context/archive/2026-05-31-async-ux/ux-recommendations.md`
- Originating slice (route converted, brand-settings form missed): `context/archive/2026-05-31-async-ux/plan.md` (Phase 2 route inventory)
- Submit helper + result contract: `src/lib/ui/useSubmit.ts`, `src/lib/ui/types.ts`, `src/lib/ui/response.ts`
- Brand row type + upsert: `src/lib/brand-settings/queries.ts`
- Lessons (React 19 handler typing, lint-by-exit-code): `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Shared `SubmitButton` pending prop + email-templates wiring

#### Automated

- [x] 1.1 Type checking passes: `npx astro check`
- [x] 1.2 Linting passes (exit code): `npm run lint`
- [x] 1.3 Unit tests pass: `npm test`
- [x] 1.4 Build succeeds: `npm run build`

#### Manual

- [x] 1.5 Saving email templates shows the spinner + "Saving..." for the request duration, then the success toast
- [x] 1.6 Login page still shows its "Signing in..." spinner (native-POST `useFormStatus` fallback intact)

### Phase 2: Convert `BrandSettingsForm` to async submit

#### Automated

- [x] 2.1 Type checking passes: `npx astro check`
- [x] 2.2 Linting passes (exit code): `npm run lint`
- [x] 2.3 Unit tests pass: `npm test`
- [x] 2.4 Build succeeds: `npm run build`

#### Manual

- [x] 2.5 Saving brand settings stays on `/brand-settings` (fetch returns JSON, no 404, no document load)
- [x] 2.6 The Save button spins + disables for the request duration
- [x] 2.7 On success a toast fires and "Last saved" updates without a reload
- [x] 2.8 Logo round-trip: new logo previews after save and is not re-uploaded on an immediate re-save; remove-logo persists
- [x] 2.9 Forced error (oversized/wrong-type logo) → error toast AND inline error, no navigation
- [x] 2.10 Valid save with no logo change preserves the existing logo (untouched path holds)
