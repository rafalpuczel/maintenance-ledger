# Report Email Send (S-09) — Plan Brief

> Full plan: `context/changes/report-email-send/plan.md`

## What & Why

Add the two send actions that close the US-01 north-star loop: **Send to PM** and **Send to client**, each emailing the report's branded PDF via Resend with a fixed template. This is the validation milestone (FR-019/020/021) — the single deliverable whose success proves the Slack → Docs → PDF → email pipeline is fully replaced in-app.

## Starting Point

S-08 left a working report page with a live-rendered **Download PDF** link (re-rendered on demand, ~197 ms p95, never stored) and a Delete action. All send inputs already exist (`listContacts`, `project.contact_email`, `getReport`, `getBrand`); `resend@^6.12.3` is already installed and `RESEND_API_KEY` is wired through `astro:env/server`. There is **no email-sending code** and **no send-tracking storage** yet.

## Desired End State

Beside Download PDF, the user sees **Send to PM** (picks from the S-04 contact list) and **Send to client** (the project contact, disabled with a hint when absent). A successful send relabels the button to **Re-send …**, shows "Sent to `<addr>` on `<date>`" inline, and guards re-sends with a confirm dialog. A failed send shows an in-app error and writes no record.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Send-record storage | New append-only `report_sends` table | Keeps send state out of the replace-all `reports` save; full per-recipient history is free | Plan |
| Failure atomicity | Resend first, record only on success | Directly satisfies the US-01 "no record on failed send" criterion | Plan |
| No client email | Disable button + inline hint | `contact_email` is nullable; fail loud at the UI, guide the fix, no dead POST | Plan |
| Re-send guard | Confirm dialog only on re-send | Matches the FR — friction exactly at the duplicate-send footgun, none on first send | Plan |
| PM recipient | Pick from list each send | Matches FR-019; supports different PMs per cycle; records which PM got it | Plan |
| From address | `REPORT_FROM_EMAIL` var, default `onboarding@resend.dev` | Unblocks dev/smoke before the domain verifies; one switch to go live; no hardcoded sender | Plan |
| Send feedback | POST form → redirect with `?ok`/`?error` | Consistent with save/delete; history reloads fresh on redirect; no JSON/fetch plumbing | Plan |
| History load | `getSendSummary` in `.astro` frontmatter | Server-rendered with the page; buttons get plain props; latest-per-recipient is unit-testable | Plan |

## Scope

**In scope:** `report_sends` table + queries (latest-per-recipient summary); Resend dispatch helper (fixed template, PDF attachment); `POST /api/reports/[id]/send`; two send islands; inline send history + re-send confirm.

**Out of scope:** PDF storage/caching; delivery/bounce/open tracking; editable templates; retry/queue/async; report locking on send; provider abstraction; operator Prereq C provisioning (documented as a handoff).

## Architecture / Approach

Three bottom-up phases. **(1)** `report_sends` persistence — migration + types + `src/lib/report-sends/{schema,queries}.ts`, with a pure `summarize()` reducer as the unit-test target. **(2)** Dispatch + route — `REPORT_FROM_EMAIL` env var, `src/lib/email/send-report.ts` (re-renders the PDF exactly as the pdf route does, base64-encodes it for the Resend attachment, throws on any Resend error), and `POST /api/reports/[id]/send` enforcing render → dispatch → record-on-success → redirect. **(3)** UI — `SendToClientButton` + `SendToPmButton` islands reusing the `DeleteReportButton` form-island + confirm-modal pattern, wired into `[id].astro` with the send summary.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Send persistence layer | `report_sends` table + `recordSend`/`getSendSummary` | Types-sanitize after `db:types`; verify with `astro check` not lint |
| 2. Email dispatch + send route | Resend helper + `POST …/send`, record-on-success-only | Workerd-safe base64 for the attachment; throw-on-error ordering |
| 3. Send UI on the report page | Two send islands + inline history + re-send guard | React-19 form-handler lint rules; PM picker → hidden-field wiring |

**Prerequisites:** S-08 (done), S-04 (done). For *production* sending only: operator Prereq C (Resend account + verified domain + `wrangler secret put RESEND_API_KEY` / `REPORT_FROM_EMAIL`) — not required to implement or smoke-test (uses `onboarding@resend.dev`).
**Estimated effort:** ~2–3 sessions across 3 phases.

## Open Risks & Assumptions

- **Production sends are blocked on Prereq C** (domain verification), not on this code. Dev/smoke runs against Resend's shared sender; flipping `REPORT_FROM_EMAIL` + setting the real key goes live.
- **Post-send edit divergence** (PRD Open Q2) is accepted — the report stays editable after sending; the sent PDF is the artifact of record.
- A crash in the narrow dispatch→insert window could drop a record (accepted: rare, and only risks a benign re-send, never a phantom "sent").

## Success Criteria (Summary)

- The user sends the branded PDF to a chosen PM and to the client from the report page in one session, completing US-01 end-to-end.
- Each recipient's most recent send timestamp shows inline; a re-send requires explicit confirmation.
- A failed send surfaces in-app and leaves the report, PDF, and send history untouched (no record written).
