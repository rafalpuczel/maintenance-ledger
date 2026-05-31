# Settings Save-Flow Bug Fixes — Plan Brief

> Full plan: `context/changes/settings-save-bugs/plan.md`

## What & Why

Two save-flow bugs on the settings pages, both leftovers from the S-11 `async-ux` migration that converted API routes to a JSON contract but didn't bring their form islands along. **brand-settings**: saving navigates the browser to `/api/brand-settings` (raw JSON, then a 404) instead of saving in place. **email-templates**: the Save button never shows a spinner, so a save gives no in-flight feedback. Both are fixed to the documented in-repo async pattern.

## Starting Point

The brand-settings *route* already returns JSON (`actionOk`/`actionError`), but `BrandSettingsForm` is still a native `<form method="POST" action="/api/brand-settings">` — so it does a full-page navigation to the JSON route. `EmailTemplatesForm` is correctly async (`useSubmit()`) but renders `SubmitButton`, whose spinner reads React's `useFormStatus()` — which only fires for native-POST forms, so on a `fetch` island it's permanently `false`. `ProjectForm.tsx` is the in-repo reference for the correct fetch-island pattern.

## Desired End State

Saving on both settings pages stays on the page, spins the Save button while in flight, and toasts the outcome — no navigation, no 404, no blank flash. brand-settings additionally updates its "Last saved" timestamp and logo preview from the row the route already returns.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Spinner-fix strategy | Add optional `pending` prop to shared `SubmitButton` (falls back to `useFormStatus` when omitted) | One shared button, fixes the root cause reusably, leaves native-POST `LoginForm` working | Plan |
| brand-settings post-save | Stay in place, toast, reflect the returned row (timestamp + logo) | Matches the async-ux convention; uses `data` the route already sends | Plan |
| Logo preview after save | Reset preview baseline to the saved server logo | Preview matches server truth; re-save doesn't re-upload the same bytes | Plan |
| Success/error feedback | Toast success; errors = toast + inline `ServerError` | Mirrors `EmailTemplatesForm`; error stays visible after the toast dismisses | Plan |
| Test scope | Automated gates + manual verification only | Matches how S-11 verified island conversions; no island test harness exists | Plan |

## Scope

**In scope:**
- Optional `pending` prop on `SubmitButton`; wire it in `EmailTemplatesForm`.
- Convert `BrandSettingsForm` from native POST to `useSubmit()` (multipart logo preserved), with toast + inline error + returned-row reflection.

**Out of scope:**
- Any route / parser / schema / data-model / server change.
- New tests or RTL harness; new `AsyncSubmitButton` component; refactor of `ProjectForm` or other working islands.
- Changes to `LoginForm` (beyond confirming it still works), client-side validation, logo constraints, or the email-template preview.

## Architecture / Approach

Two thin React-island edits plus one shared-component tweak. Per save: client zod validate → build `FormData` → `submit(action, fd)` (`useSubmit` → same-origin `fetch`, cookie auto-sent) → route returns `{ ok, message, data }` or `{ ok:false, error }` → toast + reflect state; the Save button is disabled + spinning via the real `pending`. `useSubmit` passes `FormData` straight to `fetch`, so brand-settings' multipart logo upload is unchanged.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. `SubmitButton` pending prop + email-templates wiring | Working spinner on email-templates (and the mechanism Phase 2 reuses) | Breaking `LoginForm`'s `useFormStatus` spinner — mitigated by making `pending` optional with fallback |
| 2. Convert `BrandSettingsForm` to async | No more 404; in-place save with spinner, toast, timestamp + logo reflection | Logo baseline/preview drift after save — handled by resetting baseline from `res.data` |

**Prerequisites:** none (no deps, no migration; pattern + helpers already exist in the repo).
**Estimated effort:** ~1 session across 2 phases.

## Open Risks & Assumptions

- Assumes `useFormStatus()` returning `false` for non-native submits is the sole cause of the email-templates dead spinner (confirmed by reading `SubmitButton.tsx` + `EmailTemplatesForm.tsx`).
- Assumes `useSubmit`'s `FormData` passthrough keeps the multipart logo payload byte-identical to the native POST (confirmed in `useSubmit.ts:17-22`); the route/parser are untouched.
- Assumes the brand-settings route always returns the full upserted row in `data` (confirmed in `api/brand-settings.ts` + `upsertBrand`).

## Success Criteria (Summary)

- Saving brand settings stays on `/brand-settings` with a spinner + toast — the 404 is gone.
- Saving email templates shows the Save button spinner while in flight.
- `npx astro check`, `npm run lint`, `npm test`, `npm run build` all pass; login spinner still works.
