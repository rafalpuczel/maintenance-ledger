# Async UX (S-11) — Plan Brief

> Full plan: `context/changes/async-ux/plan.md`

## What & Why

Convert Maintenance Ledger's every create / edit / delete / send from a native form POST that triggers a full-page redirect (blank-flash reload, outcome shown via a `?ok=`/`?error=` banner) into an asynchronous in-place `fetch`. The app should feel like a real product: actions acknowledge instantly with a spinner, the affected region updates without a reload, and outcomes are announced with toasts. This is Slice B of the post-MVP round (PRD-v2 US-03).

## Starting Point

The MVP + S-10 redesign are shipped. Every mutation is a native `<form method="POST">` → 302-redirect with query-flag banners; islands flip a button label via `useFormStatus()`. S-10 delivered the full UI primitive set (Dialog, Tooltip, Card, EmptyState, Skeleton, AppShell, `cn`) and deliberately deferred all async/toast wiring to this slice — Toast is the one missing primitive.

## Desired End State

A user completes the full flow (dashboard → project → report → save → view PDF → send to PM + client) and all settings CRUD with no full-page reload. Each action spins its control, updates its region from the server's JSON, and toasts the outcome. Destructive actions use one consistent confirm dialog. Failures surface inline (field errors) or as a toast — never a false success — and a failed send still writes no record.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| API response shape | **JSON-only** — drop the redirect/no-JS path | Simplest routes, one path; internal tool on modern browsers | Plan |
| Optimism | **None — spinner-then-update everywhere** | User accepted deviating from US-03's "reflect immediately/rollback"; zero drift, no false-success | Plan |
| Content update | **Full client-side content-swap (SPA)** — re-render regions from React state, no hard nav | User chose the heaviest option; cost accepted | Plan |
| Read data | **Mutation returns the new state** in its JSON; no GET endpoints | One round-trip per action; islands seed from SSR props + patch | Plan |
| Surface scope | **All mutating views**; read-only (dashboard) stays SSR | Covers 100% of US-03's create/edit/delete/send surface | Plan |
| Repeater rows | **Stay client-only until report Save** (unchanged) | No per-row endpoints; preserves PDF-on-save model | Plan |
| Error UX | **Field errors inline + everything else an error toast** | Matches existing dual pattern; fixable errors stay by the field | Plan |
| Confirms | **One reusable `ConfirmDialog`** replaces 3 inline toggles + aligns existing dialogs | US-03 "consistent confirmation prompts"; keeps project type-to-confirm guard | Plan |
| In-flight | **Disable + spinner on the triggering control only** | Lightest, matches existing per-button pending convention | Plan |
| Toast | **`sonner` library** mounted in AppShell | Accessible, tiny, matches the Radix/shadcn ecosystem | Plan |

## Scope

**In scope:** async conversion of ~13 API routes to JSON; client-data-layer for all mutating views; sonner toasts (retiring `Banner.astro` + query flags); one `ConfirmDialog`; spinner-on-trigger in-flight UX; a UX-recommendations deliverable.

**Out of scope:** optimistic UI/rollback; no-JS fallback; per-row repeater persistence; new GET endpoints; converting read-only views; any domain-logic / PDF-render / send-order / schema change; background/queue work.

## Architecture / Approach

A shared async-submit helper (`src/lib/ui/submit.ts`) centralizes fetch + JSON-parse + error-routing + pending-state; each island converts to a thin call. Routes return `{ ok, message, data?, redirectTo? }` or `{ error, field? }`. On success, the island patches its local collection from `data` and toasts (or pushState-navigates if `redirectTo`); on error it shows a field error or the helper toasts. Same-origin `fetch` carries the HMAC session cookie automatically (no CSRF machinery). The send route's dispatch-then-record choreography is server-side and untouched — only its response shape changes.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Foundation & primitives | sonner + Toaster, `ConfirmDialog`, async-submit helper | New dependency; getting the helper's contract right (everything leans on it) |
| 2. Route JSON contract | All ~13 routes return JSON; Banner + query flags removed | Must not reorder the send dispatch-then-record choreography |
| 3. Settings lists | PM contacts, catalog, recurring → client state + async | First client-data-layer conversion; proving the pattern |
| 4. Projects & reports lists + create/delete | Collections in client state; pushState nav on create | Back/forward + deep-link integrity after pushState |
| 5. Report Save + Send paths | Async Save (sync PDF), async sends | **Guardrail-critical**: US-01 no-record-on-failure, no false success, re-send confirm |
| 6. UX recommendations | `ux-recommendations.md` artifact | — |

**Prerequisites:** S-10 shipped (all primitives except Toast). Install approval for `sonner`.
**Estimated effort:** ~5–6 sessions across 6 phases.

## Open Risks & Assumptions

- **Conscious US-03 deviation.** US-03's acceptance criterion says list/repeater mutations "reflect immediately and roll back if rejected" — literal optimistic UI. This slice instead does spinner-then-update (no optimism, no rollback), per an explicit user decision. "Immediate feedback" is satisfied by the instant spinner + disabled control + fast local response. This must be flagged at review as an intentional departure, not a miss.
- **Full-SPA scope is the heaviest item.** Promoting every mutating view to a client data layer (vs. the lighter soft-nav option) is the largest build here and has no primitive to lean on; effort/risk concentrate in Phases 4–5. Mitigated by seeding from existing SSR props and returning mutated state in the JSON (no separate read layer).
- **Toast-across-navigation.** Creates that pushState-navigate must fire the success toast client-side before/across the transition without reintroducing a `?ok=` flag.
- **Send guardrail.** The dispatch-then-record order and the failed-send-writes-no-record rule are server-enforced and must survive the response-shape change; verified explicitly in Phase 5.

## Success Criteria (Summary)

- No create/edit/delete/send produces a full-page blank-flash reload; each updates in place with an accessible toast.
- Errors surface inline (field) or as a toast — never a false success; a failed send writes no record.
- Destructive actions use one consistent, keyboard-operable confirm dialog; disabled-Send tooltips still work.
