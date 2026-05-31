---
change_id: settings-save-bugs
title: Fix save UX on the two settings pages (brand-settings 404 redirect; email-templates missing spinner)
status: implemented
created: 2026-05-31
updated: 2026-05-31
archived_at: null
---

## Notes

Two save-flow bugs on the settings pages, both stemming from incomplete async-UX migration:

1. **brand-settings 404 redirect** — `BrandSettingsForm` is still a native `method="POST" action="/api/brand-settings"` form, so saving does a full-page navigation to the API route, which now returns JSON (`actionOk`/`actionError`). The browser lands on `/api/brand-settings` (raw JSON, and 404 on the subsequent GET). The route was migrated to the JSON `ActionResult` contract during the async-ux slice but the form was never converted to `useSubmit` like `EmailTemplatesForm` was.

2. **email-templates save button has no spinner/loading state** — `EmailTemplatesForm` uses `useSubmit()` and gets a real `pending` flag, but `SubmitButton` reads its spinner from React's `useFormStatus()`, which only updates for native `<form action>` submissions. This form submits via manual `onSubmit` + `fetch`, so `useFormStatus().pending` is always `false` and the spinner never appears. `pending` is currently only wired to the `sr-only` aria-live region.

Fix is symmetric with the existing async-ux pattern: convert brand-settings to `useSubmit` (handle multipart/logo + the `data:` logo round-trip), and drive the email-templates button from the real `pending` (likely a `SubmitButton` variant that accepts an explicit `pending` prop, since `useFormStatus` is the wrong source for fetch-based islands).
