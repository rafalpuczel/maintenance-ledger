# Send-path integration tests + recipient/double-send guards — Plan Brief

> Full plan: `context/changes/report-email-send-tests/plan.md`
> Research: `context/changes/report-email-send-tests/research.md`

## What & Why

Test Rollout **Phase 2 / Risk #3** (`context/foundation/test-plan.md`): a Send must not dispatch the wrong/stale PDF, send to the wrong recipient, or write a "sent" record on a failed send (or double-send on a double-click). Research proved the dispatch→record ordering and attachment-freshness halves already hold, but found three soft server-side guards (PM recipient = unverified client input; no double-send protection; UI-only re-send confirm). This change writes the integration suite against the **real route + real local Supabase** (the only honest way to observe `report_sends` rows, test-plan §7) and hardens the two guards that map to real harm.

## Starting Point

The send feature shipped under S-09 and was reshaped by the S-11 async-UX refactor, so the live route returns **JSON** (`actionOk`/`actionError`), not the `?ok=`/`?error=` redirects the archived S-09 plan describes. Only `summarize` has an automated test today; the route, recipient resolution, and guards are untested. The Phase-1 `unstable_startWorker` harness (`test/workers-harness.ts`) exists but has **no real-DB wiring** — risks #1/#6 also wait on that layer (test-plan §4 deferred it to whichever slice landed first).

## Desired End State

`npm run test:workers` runs green against the real route + local Supabase (Resend stubbed at its HTTP edge), proving: a Resend success writes exactly one row, a Resend error writes zero (record-on-success); the partial-success warning is pinned; the attachment is the fresh render, base64-safe; the client recipient is server-resolved; a forged PM email is rejected (new guard); a duplicate send is blocked (new guard). The real-DB harness is reusable by risks #1/#6, and the test-plan cookbook documents the recipe.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Test layer | Workerd route integration + **real local Supabase**, Resend stubbed at the edge | No extractable plain-Node seam; only a real DB proves record-on-success | Research |
| Real-DB harness boundary | **Build it here**, extend `test/workers-harness.ts` | Risk #3 needs row observation anyway; unblocks risks #1/#6 | Plan |
| PM recipient | **Fix** — server lookup against unique `pm_contacts.email` → 400 on miss | Closes the one guard mapping to client-facing harm (wrong recipient) | Plan |
| PM reject response | `actionError` **400**, no dispatch | Consistent with the client-null-email guard (`send.ts:46`) | Plan |
| Double-send | **Pre-dispatch check + DB unique constraint backstop** | Pre-check stops the duplicate *email*; constraint is race-proof for the duplicate *row* | Plan |
| Re-send confirm | **Pin** (UI-only stays) | A footgun guard, not a security boundary, for a 5-user single-login tool | Plan |
| Partial-success warning | **Pin** with a dedicated test | Most surprising behavior (200 that didn't record) — lock it against silent drift | Plan |
| Resend stub | Inject a workerd-safe intercept (mechanism via a timeboxed spike) | `vi.mock` can't reach the separately-booted worker; stub only the external edge | Plan |
| Row observation | Raw `report_sends` count/select, not via `summarize` | Cleaner "exactly one row" oracle | Plan |

## Scope

**In scope:** PM recipient lookup (`getContactByEmail` + 400 reject); double-send pre-check + `report_sends` unique-constraint migration + types regen; real-DB extension of the workers harness; Resend-intercept stub (spiked); the S1–S6 route integration suite; cookbook + test-plan sync.

**Out of scope:** Risk #4 no-leak boundary (its own slice); re-asserting `summarize` or PDF internals; a server-side re-send confirm token; idempotency-key dedup; CI Supabase-container wiring (decision noted, not made); any UI-island change.

## Architecture / Approach

Guards-first so tests target final behavior: **(1)** two small production edits — PM lookup + double-send guard (one additive migration). **(2)** extend the existing `unstable_startWorker` harness with `SUPABASE_URL` via `vars` + a local-Supabase lifecycle, and spike a workerd-safe Resend intercept. **(3)** author S1–S6 against that harness, seeding/cleaning own rows, observing raw `report_sends` counts. **(4)** document the recipe in test-plan §6.2/§6.3 and advance rollout state.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Server guards | PM lookup → 400; double-send pre-check + unique constraint + types | Constraint must absorb a `23505` into the warning path, not a 500; bucket granularity must match pre-check ↔ constraint |
| 2. Real-DB harness + Resend stub | `SUPABASE_URL` via `vars` + local-Supabase wiring; intercept verdict in `spike-notes.md` | `vi.mock` can't reach the booted worker — the intercept seam is the spike's whole job |
| 3. Route integration suite | S1–S6 on real route + real DB + stubbed Resend | Test independence + cleanup on a shared DB; `Origin`/`CF-Connecting-IP` on form POSTs |
| 4. Cookbook + sync | §6.2/§6.3 recipe, §6.5 note, §3 status, `change.md` implemented | None (docs only) |

**Prerequisites:** local Supabase (`npx supabase start` + `migration up --local`); built worker (`npm run build`); the Phase-1 harness (done).
**Estimated effort:** ~3 sessions across 4 phases (the Resend-stub spike is the main unknown).

## Open Risks & Assumptions

- **Resend intercept on workerd is unproven** — the Phase-2 spike may need a tiny behavior-preserving seam in `send-report.ts` (e.g. honoring a base-URL env); timeboxed, fallback to the cheapest working option.
- **CI without local Supabase** — DB-dependent cases `it.skipIf`-skip when `SUPABASE_URL` is absent; the real-DB suite runs locally until the CI-container decision (test-plan §4) lands.
- **Double-send window is heuristic** — a deliberate fast re-send inside the bucket is blocked; accepted (it's a footgun guard).

## Success Criteria (Summary)

- A stubbed Resend success writes exactly one `report_sends` row; a stubbed error writes none — record-on-success is automated, not just "verified in prod."
- A forged `pm_email` and a duplicate send are both rejected server-side (no email, no row); the partial-success warning is pinned.
- The real-DB workers harness is reusable, and a contributor can follow test-plan §6.3 to add a send test without this plan.
