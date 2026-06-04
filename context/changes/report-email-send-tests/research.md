---
date: 2026-06-04T00:00:00Z
researcher: Rafal Puczel
git_commit: 8c890c666c5c71975b54fe97bb2b439bb048c79e
branch: master
repository: 10xdev-project
topic: "Risk #3 (Send path): dispatch→record ordering, attachment freshness/encoding, recipient integrity, re-send & double-send guards"
tags: [research, codebase, send, resend, report-sends, risk-3, test-plan-phase-2]
status: complete
last_updated: 2026-06-04
last_updated_by: Rafal Puczel
---

# Research: Risk #3 — Send Path (dispatch→record, recipient integrity, re-send guard)

**Date**: 2026-06-04T00:00:00Z
**Researcher**: Rafal Puczel
**Git Commit**: 8c890c666c5c71975b54fe97bb2b439bb048c79e
**Branch**: master
**Repository**: 10xdev-project

## Research Question

`context/foundation/test-plan.md` Risk #3:

> A Send dispatches the wrong/stale PDF, sends to the wrong recipient, or a failed
> send still writes a "sent" record (or a double-click double-sends) — the agency
> emails a client a broken artifact, or the re-send guard is defeated.

Per the test-plan §2 Risk-Response row for #3, research must ground four things in the
**live** code (research is ground truth where it disagrees with the plan, §1 principle #3):

1. The send handler's **dispatch→record ordering** (record written only after confirmed dispatch).
2. How the **attachment bytes** are produced (base64 per the S-09 lesson).
3. How **re-send confirm** is enforced **server-side**, not just UI.
4. That the **recipient** is the intended PM/client address.

Scope (confirmed with the user): **send mechanics only** — the PDF/email internal-field
leak angle (Risk #4) is left to its own research. Depth: full oracle research feeding
Phase-2 `/10x-plan`.

## Summary

The send path is **mostly honest** on the highest-impact axis and **soft** on two others.

**What holds (oracle can assert green):**
- **Dispatch→record ordering is correct.** `sendReportEmail(...)` runs first; `recordSend(...)`
  runs only after it resolves without throwing. A dispatch failure returns `502` and writes
  no row (`send.ts:60-73`). This is the US-01 record-on-success contract, and it is real.
- **The attached PDF is guaranteed-fresh.** The send helper re-renders the PDF live with the
  *exact same* composition as the download route — `renderReportPdf(reportDocument({ report, brand }))`
  (`send-report.ts:59` ≡ `pdf.ts:25`). There is no stored blob to go stale.
- **base64 encoding is workerd-safe.** `bytesToBase64` uses `btoa` over a chunked binary string,
  not Node `Buffer` (`send-report.ts:21-28`) — survives the real worker, not just `astro build`.
- **Client recipient is server-resolved** from `project.contact_email` with a null guard
  *before* any dispatch (`send.ts:44-48`).

**What is soft (the actual Risk-#3 surface — oracle must pin current behavior, and the plan
should decide whether each is acceptable-as-is or a bug to fix first):**
- **The route returns JSON, not a redirect.** The archived S-09 plan describes `?ok=`/`?error=`
  redirects; the live route returns `actionOk`/`actionError` JSON (`response.ts`). The S-11
  async-UX refactor replaced the mechanism. **Any test written against the plan's redirect
  contract would be testing a route that no longer exists.**
- **A partial-success warning path the plan never described.** Email sent + `recordSend` throws
  → **HTTP 200 with `warning: true`** and the success `data` (`send.ts:74-82`). This is a third
  outcome between clean-success and failure; it means a 200 does NOT guarantee a recorded send.
- **PM recipient = client-supplied `pm_email`.** No server-side re-lookup against `pm_contacts`
  (`send.ts:50-54`). A direct POST can send to an arbitrary address — the "wrong recipient"
  half of the risk is unguarded server-side.
- **Re-send confirm and double-send protection are UI-only.** The confirm dialog and the
  `pending` button-disable live in `ReportDelivery.tsx`; the server has no confirm flag, no
  history check, no idempotency key, no unique constraint. A direct/repeated POST re-sends and
  writes a second row — the "re-send guard defeated" / "double-send" halves of the risk.
- **The insert is not zod-validated at runtime.** `sendRecordSchema` exists but `recordSend`
  inserts the raw object (`queries.ts:49-54`); the schema is type-only.

## Detailed Findings

### Area 1 — Dispatch → record ordering & failure atomicity (oracle req #1)

**Route**: `src/pages/api/reports/[id]/send.ts` (POST). Flow:

- Parse `recipient_type` with `recipientTypeSchema.safeParse` → `actionError("Unknown send target")` (400) on miss (`send.ts:21-25`).
- Load `getReport` → 404 if absent (`send.ts:28-31`); then `Promise.all([getBrand, getProjectById, getEmailTemplates])`; 404 if no project (`send.ts:32-39`).
- Resolve `to` (see Area 3).
- **Dispatch first** (`send.ts:60-64`):
  ```
  try { await sendReportEmail({ report, brand, project, to, recipientType, templates }); }
  catch { return actionError({ error: "Could not send the email" }, 502); }
  ```
- **Record only on success** (`send.ts:66-82`): `sentAt = new Date().toISOString()`, then `recordSend(...)` inside its own try/catch.

**Finding (req #1 — PASS):** the insert is strictly after a non-throwing dispatch. A dispatch
failure short-circuits at `send.ts:63` (502) before `recordSend` is reached → **no row written**.
The `sendReportEmail` helper throws on *both* Resend failure modes: a thrown exception propagates,
and a returned `{ error }` is converted to a throw (`send-report.ts:79-81`). The route's catch
covers both. No pre-inserted "pending" row exists.

**Divergence — partial-success warning (NEW, not in plan):** if dispatch succeeds but
`recordSend` throws, the route returns **`actionOk({ message: "Sent, but could not record the
send.", warning: true, data })`** — HTTP **200** (`send.ts:74-82`). So:
- A 200 with `warning: true` = email sent, **history row may be missing**.
- A 200 without `warning` = email sent + recorded.
- This is deliberate (`send.ts:75-76` comment) and benign per the S-09 risk note (a missing
  record only risks a benign re-send, never a phantom "sent"), but **the oracle must assert the
  three outcomes distinctly** and not treat "200 ⇒ recorded".

### Area 2 — Attachment bytes: freshness + encoding (oracle req #2)

**Helper**: `src/lib/email/send-report.ts`.

- **Fresh render** (`send-report.ts:59`): `const pdf = await renderReportPdf(reportDocument({ report, brand }));`
  — byte-identical composition to the download route `src/pages/api/reports/[id]/pdf.ts:25`. No
  stored artifact; the attachment cannot be stale relative to the report row at send time.
  **(req #2 freshness — PASS.)**
- **base64** (`send-report.ts:21-28`): `bytesToBase64` builds the binary string in `0x8000`-byte
  chunks via `String.fromCharCode(...subarray)` then `btoa(binary)`. **No Node `Buffer`** →
  workerd-safe (the S-09 lesson). Used at `send-report.ts:77` as `attachments: [{ filename, content: bytesToBase64(pdf) }]`.
  **(req #2 encoding — PASS.)**
- **Filename** (`send-report.ts:60`): `${fileToken(project.slug)}-${report.month}.pdf`; `fileToken`
  slugifies with a `"report"` fallback (`src/lib/pdf/filename.ts:5-11`).
- **From / subject / body**: `from: REPORT_FROM_EMAIL ?? "onboarding@resend.dev"` (`send-report.ts:15,73`);
  subject+html from `renderTemplate({ templates, recipientType, ctx })` (`send-report.ts:69`),
  server-sanitized — the no-leak boundary, **owned by Risk #4, out of scope here.**

**Test-relevant note:** the chunked-base64 path is only exercised meaningfully by a large
(multi-page / image) PDF; a tiny fixture won't hit the chunk boundary. Worth one large-PDF case
if the workerd layer is used.

### Area 3 — Recipient resolution (oracle req #4)

**Route**: `send.ts:42-57`.

- **Client** (`send.ts:44-48`): `if (!project.contact_email) return actionError("No client email on this project");`
  then `to = project.contact_email`. Server-resolved, null-guarded **before** dispatch. **(PASS.)**
- **PM** (`send.ts:50-56`): `to = (form.get("pm_email") ?? "").trim()`; non-empty check only
  (`actionError("Pick a PM to send to")` if blank); `pm_contact_id` taken from the form too,
  stored for history but **not used to validate the address**.

**Divergence — PM recipient is unverified client input.** The UI populates `pm_email` from a
`<select>` of saved contacts (`ReportDelivery.tsx:189-191`), so the *browser* path is safe. But
the **server performs no lookup** that `pm_email` (or its `pm_contact_id`) belongs to a
`pm_contacts` row. A direct `POST /api/reports/[id]/send` with `recipient_type=pm` &
`pm_email=attacker@evil.com` would dispatch to that address and record it. This is the
"sends to the wrong recipient" half of Risk #3, **unguarded at the layer the test must cover**.
(There is no per-user identity — single shared login — so this is recipient-integrity, not IDOR;
it parallels Risk #6's "service key + client input, no server check" shape.)

### Area 4 — Re-send confirm & double-send (oracle req #3)

**UI**: `src/components/reports/ReportDelivery.tsx` (one island owning both recipients; the
archived plan's separate `SendToClientButton`/`SendToPmButton` files do **not** exist).

- **Re-send confirm is client-only.** `SendToClient` renders a plain button on first send
  (`ReportDelivery.tsx:302-309`) and a confirm `<Dialog>` only when `lastSend` exists (`311-342`);
  `SendToPm` always uses a dialog with the picker (`197-245`). The dialog is `useState` open-flag
  state — there is **no confirm token sent to the server** and **no server-side check** of prior
  sends. `send.ts` has no branch that requires confirmation.
- **Double-send guard is client-only.** `useSubmit` exposes `pending` (`useSubmit.ts:37,39-46`);
  the buttons set `disabled={pending}` (`ReportDelivery.tsx:238,304,335`). This stops a second
  click *in the same browser* mid-flight, nothing more.
- **Server is idempotency-free.** `recordSend` is a bare `insert` (`queries.ts:49-54`); the
  `report_sends` table has no unique constraint that would reject a duplicate (migration:
  index on `report_id` only, per the S-09 plan). Two identical rapid POSTs → **two emails + two rows**.

**Finding (req #3):** the re-send guard is **UI-only**; a direct or repeated POST defeats it.
This is exactly the "re-send guard defeated" / "double-click double-sends" half of Risk #3.

### Area 5 — Schema, queries, existing tests

- **Schema** `src/lib/report-sends/schema.ts:12-17`: `sendRecordSchema` = `{ report_id: z.uuid(),
  recipient_type: z.enum(["pm","client"]), recipient_email: z.email(), pm_contact_id: z.uuid().nullable() }`
  — zod v4 top-level validators. **Not invoked at runtime** by `recordSend`; type-only.
- **Queries** `src/lib/report-sends/queries.ts`: `summarize(rows)` is a pure, exported,
  DB-free reducer picking latest-per-recipient (client keyed on type; pm keyed on the latest row)
  (`queries.ts:30-45`); `recordSend` insert-only, throws on DB error (`49-54`); `getSendSummary`
  selects by `report_id` ordered `sent_at desc` then `summarize`s (`57-67`).
- **Existing test** `src/lib/report-sends/queries.test.ts`: **only** `summarize` — empty, one-each,
  multi-PM-latest, multi-client-latest, order-independence (5 cases, `19-68`). **No** test covers
  the route, `recordSend`, `getSendSummary`, ordering, recipient resolution, or the guards.

## Code References

- `src/pages/api/reports/[id]/send.ts:60-64` — dispatch-first try/catch; 502 + no record on failure.
- `src/pages/api/reports/[id]/send.ts:66-82` — record-on-success; **partial-success `warning:true` 200**.
- `src/pages/api/reports/[id]/send.ts:44-48` — client recipient server-resolved + null guard.
- `src/pages/api/reports/[id]/send.ts:50-56` — **PM recipient = unverified `pm_email` form field**.
- `src/lib/email/send-report.ts:59` — live PDF re-render (≡ `pdf.ts:25`); fresh attachment.
- `src/lib/email/send-report.ts:21-28` — workerd-safe `btoa` chunked base64.
- `src/lib/email/send-report.ts:79-81` — throws on Resend `{ error }`; helper also propagates throws.
- `src/lib/ui/response.ts:7-16` — `actionOk`/`actionError` JSON builders (replace the old redirect).
- `src/components/reports/ReportDelivery.tsx:311-342, 197-245` — confirm dialog (client-only).
- `src/components/reports/ReportDelivery.tsx:189-191` — UI populates `pm_email` from saved-contact select.
- `src/lib/ui/useSubmit.ts:36-49` — `pending` state (client-only double-click guard).
- `src/lib/report-sends/queries.ts:30-45,49-54,57-67` — `summarize` / `recordSend` / `getSendSummary`.
- `src/lib/report-sends/schema.ts:12-17` — `sendRecordSchema` (type-only; not parsed at runtime).
- `src/lib/report-sends/queries.test.ts:19-68` — `summarize` unit tests (only existing coverage).
- `src/middleware.ts` + `src/lib/auth/public-paths.ts:4` — send path not in `PUBLIC_PATHS` → gated.

## Architecture Insights

- **Routes are JSON action endpoints, not redirect endpoints.** The S-11 async-UX refactor moved
  every mutation to `actionOk`/`actionError` + a client `useSubmit` fetch (`response.ts`,
  `useSubmit.ts`). The S-09 plan's `?ok=`/`?error=` redirect contract is dead. Any Risk-#3 test
  must assert the **JSON ActionResult** (`{ ok, message?, warning?, data?, error? }`) + status code.
- **The route is a thin orchestration adapter; the only pure/DB-free seam is `summarize`.** Recipient
  resolution, ordering, and the guards live *in the route body*, entangled with `formData` and
  Supabase/Resend I/O — so per the test-plan §6.2 two-layer rule, the honest signal for ordering,
  recipient integrity, and the warning path is **Layer B (workerd route integration)** with the
  Resend boundary stubbed, not a plain-Node seam (there is no extractable seam without a refactor).
- **Recipient integrity, re-send, and double-send share one root:** the server trusts the client and
  keeps no send-state gate. Same shape as Risk #6 (service key bypasses RLS; only a handler check
  guards it). Whether to *fix* (server-side PM lookup / confirm token / dedup) or *accept + pin* is a
  plan decision — research's job is to surface that these guards are UI-only, which they are.

## Mapping to the test-plan oracle (§2 Risk-Response row #3)

| Oracle clause (plan) | Live reality | Layer | Verdict |
|---|---|---|---|
| Record written **only** after confirmed dispatch | `send.ts:60-73` — yes; 502 + no row on dispatch fail | B (Resend stub: error → assert no row) | **Holds — assert it** |
| Attached PDF is the **current** render | `send-report.ts:59` re-renders live ≡ `pdf.ts:25` | B or unit (assert same composition) | **Holds — assert it** |
| base64 attachment per S-09 lesson | `btoa` chunked, workerd-safe (`send-report.ts:21-28`) | B (real worker) / unit | **Holds — assert it** |
| Re-send confirm enforced **server-side** | **UI-only**; no server flag/history check | B (direct POST re-sends) | **Gap — pin behavior; plan decides fix** |
| Recipient is the **intended** address | client ✅ server-resolved; **PM ✗ unverified form input** | B (POST forged `pm_email`) | **Gap — pin; plan decides fix** |
| (implied) no double-send | no server idempotency/constraint | B (two POSTs → two rows) | **Gap — pin; plan decides fix** |

**Anti-patterns to avoid (plan §2 row #3):** don't test Resend itself — stub it at the HTTP
boundary; don't assert a record exists without asserting it's gated on dispatch success (force a
Resend error, assert zero rows); don't write a UI-only confirm test (the guard the risk cares
about is the *server's*, which is absent — assert the absence honestly rather than passing a
green UI test).

## Recommended cheapest-layer test set (input to `/10x-plan`)

Layer-B workerd route integration (test-plan §6.2 Layer B + the real-DB note), Resend stubbed at
its HTTP edge, against a real local Supabase so `report_sends` rows are observable:

1. **Ordering / record-on-success** — stub Resend to error → POST → assert `502` + `report_sends`
   unchanged. Stub success → assert `200` + exactly one row, `recipient_email === to`.
2. **Partial-success warning** — Resend success but force `recordSend` to fail (e.g. bad
   `pm_contact_id` FK) → assert `200 { warning: true }` and the row count reflects the failure.
3. **Client recipient + null guard** — null `contact_email` → `400 "No client email…"`, no dispatch,
   no row; with an email → dispatched `to === project.contact_email`.
4. **PM recipient integrity** — forged `pm_email` not in `pm_contacts` → **document current behavior
   (sends + records)**; this case is the decision point for whether the plan adds a server-side lookup.
5. **Double-send** — two rapid identical POSTs → assert current behavior (two rows); decision point
   for a dedup/constraint.
6. **`summarize`** — already covered (`queries.test.ts`); no new work.

Cases 4 and 5 are written to **pin current behavior**; the plan decides whether they become
red-then-fixed (add server guards) or accepted-and-locked.

## Historical Context (from prior changes)

- `context/archive/2026-05-30-report-email-send/plan.md:50` — the record-on-success-only intent
  and the base64-attachment lesson originate here (S-09). The plan describes the route as
  `?ok=`/`?error=` **redirects** — superseded; see below.
- `context/changes/auth-gate-throttle/research.md` + `change.md` — the Phase-1 precedent: research
  corrected the plan's wording (deny-by-default allowlist, not a `PROTECTED_ROUTES` list). Same
  pattern here: the plan's redirect contract is corrected to JSON.
- `context/changes/auth-gate-throttle/spike-notes.md` — the `unstable_startWorker` Layer-B harness
  (`test/workers-harness.ts`) these tests reuse; gotchas (build first, boot the adapter-generated
  `dist/server/wrangler.json`, `Origin` header for form POSTs, `CF-Connecting-IP`).
- Memory `[[async-ux-plan-decisions]]` (S-11) — the JSON-only-routes + full client-side SPA swap
  decision that replaced the S-09 redirect mechanism. This is *why* the live route diverges from
  the S-09 plan.
- Memory `[[email-templates-plan-decisions]]` (S-13) — the per-recipient template + server-side
  sanitizer that `renderTemplate` (`send-report.ts:69`) now applies; the no-leak boundary is
  Risk #4's surface, scoped out here.

## Related Research

- `context/changes/auth-gate-throttle/research.md` — Phase-1 (Risk #2) oracle; sibling harness + the
  "research corrects the plan's wording" precedent this doc follows.

## Open Questions

1. **Fix or accept-and-pin the three soft guards?** Server-side PM-contact lookup (recipient
   integrity), a confirm token or last-send-window check (re-send), and a dedup/unique constraint
   (double-send) are all small additions — but the product is a 5-user, single-shared-login internal
   tool, so "accept + lock current behavior" may be the right cost×signal call. **`/10x-plan` decides;
   research only surfaces that these are server-unguarded.**
2. **Does CI get a Supabase service container?** Same open item as risks #1/#6 (test-plan §4) —
   these route tests need a real DB to observe `report_sends`. If CI stays stubbed, real-DB cases
   run locally only.
3. **`pm_name` form field is read by the UI but the route ignores it** (`send.ts` reads `pm_email`
   /`pm_contact_id`, not `pm_name`) — harmless, but note it so a test doesn't assert on it.
