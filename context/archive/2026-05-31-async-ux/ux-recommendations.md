# Async UX — Recommendations & Conventions

> Delivered with the S-11 `async-ux` slice (PRD-v2 US-03). This is the reference
> for the interaction conventions this slice established, so future slices stay
> consistent instead of re-inventing them. Scoped to async-UX patterns — not a
> broad product-UX audit.

## TL;DR for the next slice

Adding a new mutating surface? Follow the same five moves:

1. Route returns JSON via `actionOk` / `actionError` (`src/lib/ui/response.ts`), including the mutated resource in `data`.
2. Island calls `useSubmit()` (`src/lib/ui/useSubmit.ts`) → patches its local state from `res.data` → toasts.
3. Field-mappable errors render inline under the field; everything else is an error toast.
4. Destructive actions go through `ConfirmDialog` (`src/components/ui/ConfirmDialog.tsx`).
5. Spinner + disable on the triggering control only; never show unconfirmed state.

---

## 1. The client-data-layer pattern

**Convention:** A mutating view's island owns its collection in `useState`, seeded from the server-rendered props, and patches that state from each mutation's JSON response. There is **no** separate read endpoint and **no** client re-fetch after a write — the mutated resource rides back in the response (`ActionSuccess.data`).

- Add → push/insert the returned row; edit → replace by id; delete → filter by id.
- Where a returned shape is awkward to merge (e.g. a join), the route may return the **whole refreshed collection** instead of one row — see the recurring-plugins add route. Prefer the single row when it's clean.
- **Canonical code:** `src/components/pm-contacts/PmContacts.tsx` (the reference), `PluginCatalog.tsx`, `RecurringPlugins.tsx`.

**Why:** one round-trip per action, the server stays the source of truth for what changed, and SSR props give a correct first paint with no loading flash.

**Cross-route navigation** (create lands on a new page; delete returns to a list) is handled by Astro's `<ClientRouter/>` (in `Layout.astro`), not a hand-built client collection — the destination page re-renders from SSR over a partial swap. Use `clientNavigate(redirectTo)` (`src/lib/ui/navigate.ts`); the route supplies `redirectTo`. The `<Toaster/>` is `transition:persist`, so a toast fired just before navigating survives the swap.

## 2. The async-submit helper

**Convention:** Never hand-roll `fetch` + JSON-parse + pending state in an island. Use `useSubmit<TData>()`, which returns `{ submit, pending }`.

- `submit(action, body)` takes `FormData` or a plain object; same-origin POST, so the HMAC session cookie rides automatically — **no CSRF token**.
- It returns a typed `ActionResult<TData>` and **never throws** — a network/parse failure resolves to `{ ok: false, error }`, so call sites have one branch.
- It does **not** toast — the caller decides field-vs-toast routing.
- **Canonical code:** `src/lib/ui/useSubmit.ts`, contract in `src/lib/ui/types.ts`.

## 3. Toasts

**Convention:** Outcomes are announced with `sonner` toasts via the wrapper in `src/lib/ui/toast.ts` (`toastSuccess` / `toastError` / `toastWarning`). The old `?ok=`/`?error=` query banners and `Banner.astro` are gone.

- **Success** → `toastSuccess(res.message)`. The route owns the copy (e.g. "Contact added.").
- **Error** → `toastError(...)` for non-field failures (network, send failed, server 500).
- **Warning** → `toastWarning(...)` for **success-with-warning**: the action succeeded but a non-fatal follow-up failed. Two live cases: "Saved, but the PDF could not be generated." and "Sent, but could not record the send." Never show these as errors (they imply failure) or plain success (they hide a problem).
- Duration/position/a11y: defaults from the single `<Toaster/>` in `AppShell.astro`; sonner ships an accessible live region — don't hand-roll one.

## 4. Spinner-then-update (no optimism)

**Convention — and a deliberate deviation from US-03's wording.** US-03 says list/repeater mutations "reflect immediately and roll back if rejected" (optimistic UI). This slice instead does **spinner-then-update**: the triggering control spins + disables, and the region updates only **after** the server confirms. **No optimistic state, no rollback logic.**

- "Immediate feedback" is satisfied by the instant spinner + disabled control + the fast local-network response, not by pre-applying unconfirmed state.
- **Rationale:** zero drift risk and no possibility of a false-success flash — which matters most on the send and PDF paths. This was an explicit product decision (see `async-ux-plan-decisions` memory and the plan's Open Risks).
- **Consequence for reviewers:** a plan-vs-PRD check will flag the missing optimism. That is an **accepted deviation**, not a defect.

**In-flight treatment:** disable + spinner on the **triggering control only** (reuse the inline spinner markup from `SubmitButton`/the island buttons). Do not lock the whole form/region; do not add a global loading bar. Actions here are independent and fast on a small dataset.

## 5. Error surfacing — field vs toast

**Convention:** Errors that map to a specific form field render **inline under that field**; everything else is an **error toast**.

- The route tags field-mappable errors with `field` in `ActionError` (e.g. slug-taken → `field: "slug"`, email-taken → `field: "email"`). The island maps `res.field` back onto its `FieldErrors` state.
- A generic/transient failure (network, send failed, unknown 500) has no `field` → toast it.
- Client-side zod pre-validation still runs first and shows inline field errors before any round-trip.
- **Canonical code:** the `routeError(error, field)` helper in `PmContacts.tsx` / `PluginCatalog.tsx`.

## 6. Confirmation dialogs

**Convention:** Every destructive action uses the one shared `ConfirmDialog` (`src/components/ui/ConfirmDialog.tsx`), built on the Radix `Dialog` primitive. The three hand-rolled inline "Delete?" toggles are gone.

- Pass `variant="destructive"` for deletes.
- For an extra-dangerous action, pass `confirmWord={name}` to require typing a value before the confirm button unlocks (project delete uses the project name).
- Pass `pending` + `pendingLabel` so the confirm button reflects the in-flight async delete.
- Focus trap, Esc-to-close, and dialog roles come from Radix for free — keyboard-operable by default (WCAG-AA, carried from S-10).
- The send **re-send** confirmation keeps its own dialog inside `ReportDelivery` (it has a recipient picker / warning copy), but follows the same disable-while-pending rule.

## Guardrails this slice preserved (do not regress)

- **Failed send writes no record** (US-01): the send route dispatches the email **first**, records **only** on success. The async conversion changed only the response shape, not this order. A failed send → error toast, strip unchanged, no record.
- **No-leak:** the async work changed no rendered field on the client-facing PDF or any data source. Presentation/transport only.
- **Re-send confirmation + inline send history:** preserved in `ReportDelivery`.
- **Auth gate:** unchanged — `fetch` is same-origin and carries the session cookie; middleware still gates every non-login route.
