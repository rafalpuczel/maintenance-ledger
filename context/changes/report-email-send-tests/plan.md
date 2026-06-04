# Send-path integration tests + recipient/double-send guards — Test Rollout Phase 2 (Risk #3) Implementation Plan

## Overview

Stand up the **send-path integration layer** for Risk #3 of `context/foundation/test-plan.md`: prove that a send writes a `report_sends` record **only after** a confirmed dispatch, that the attached PDF is the **current** render, and that the recipient is the **intended** address — against the *real* `POST /api/reports/[id]/send` route in workerd with a **real local Supabase** so the row writes are observable (a stub cannot prove record-on-success honestly, test-plan §7). Two server-side guards the research found missing are hardened first so the tests target final behavior: a **PM recipient lookup** (reject a forged `pm_email`) and a **double-send guard** (a pre-dispatch existence check backed by a DB unique constraint). The re-send confirm stays **UI-only** (pinned, not fixed). This change also **builds the real-DB harness layer** that risks #1/#6 inherit (test-plan §4 deferred it to whichever slice landed first — this is it).

## Current State Analysis

The send feature shipped under S-09 (`context/archive/2026-05-30-report-email-send/`) and was later reshaped by the S-11 async-UX refactor. Research (`research.md`) grounded the live code; the load-bearing facts:

- **Dispatch→record ordering is correct.** `src/pages/api/reports/[id]/send.ts:60-73`: `sendReportEmail(...)` runs first; a throw → `actionError(...,502)` and **no** `recordSend`. The helper throws on both Resend failure modes — a returned `{ error }` (`send-report.ts:79-81`) and a propagated exception. This is the US-01 record-on-success contract, and it holds.
- **The route returns JSON, not redirects.** `actionOk`/`actionError` (`src/lib/ui/response.ts:7-16`) replaced the S-09 plan's `?ok=`/`?error=` redirects (S-11). The oracle asserts a JSON `ActionResult` body + status, never a `Location` header.
- **A partial-success warning path** (`send.ts:74-82`): dispatch succeeds but `recordSend` throws → **HTTP 200 `{ warning: true }`** with the success `data`. So a 200 does NOT guarantee a recorded send — a third outcome between clean-success and failure.
- **Attachment is guaranteed-fresh + workerd-safe.** `send-report.ts:59` re-renders live via `renderReportPdf(reportDocument({ report, brand }))` — byte-identical composition to the download route `src/pages/api/reports/[id]/pdf.ts:25`. `bytesToBase64` (`send-report.ts:21-28`) uses chunked `btoa`, not Node `Buffer`.
- **Client recipient is server-resolved + null-guarded** before dispatch (`send.ts:44-48`). **PM recipient is NOT**: `to = form.get("pm_email")` with only a non-empty check (`send.ts:50-54`); `pm_contact_id` is stored for history but never validated against `pm_contacts`. A direct/scripted POST can mis-send. This is Risk #3's "wrong recipient" clause, unguarded at the server.
- **No double-send protection.** `recordSend` is a bare insert (`src/lib/report-sends/queries.ts:49-54`); `report_sends` has only a `(report_id)` index — no unique constraint. Two rapid POSTs → two emails + two rows. The `pending` button-disable (`src/lib/ui/useSubmit.ts:37`) and the confirm `<Dialog>` (`src/components/reports/ReportDelivery.tsx:311-342`) are client-only.
- **`pm_contacts` already enforces a unique email** (`src/lib/pm-contacts/queries.ts:11,31` map `23505` → `EmailTakenError`), so a PM lookup can key on `email`. `listContacts(client)` (`queries.ts:20`) loads all contacts; a targeted `getContactByEmail` is the natural addition.
- **`summarize` is unit-covered** (`src/lib/report-sends/queries.test.ts:19-68`); nothing else in the send path has an automated test.
- **The workerd harness exists** (`test/workers-harness.ts`, Phase-1 risk #2): `startTestWorker()` → `{ fetch, dispose }`, boots `dist/server/wrangler.json`, reads `.dev.vars`, `test/load-dev-vars.ts` loads secrets into `process.env`. It does **not** yet wire a Supabase binding or a real DB. Gotchas (spike-notes): build-first; form POSTs need a matching `Origin` (Astro `checkOrigin` 403s otherwise) and a `CF-Connecting-IP`; injected `vars` add new bindings but don't override `.dev.vars` secrets.

### Key Discoveries:

- The route is a thin orchestration adapter — recipient resolution, ordering, and the (absent) guards live **in the route body** entangled with `formData`/Supabase/Resend I/O. There is no extractable plain-Node seam without a refactor, so the honest layer for ordering/recipient/warning is **Layer B (workerd route integration)** per test-plan §6.2 — not a Layer-A seam test (`research.md` Architecture Insights).
- `summarize` (`queries.ts:30-45`) is the only pure DB-free piece and is already covered — do not re-assert it.
- The PM guard keys on the **unique `pm_contacts.email`**, not the client-supplied `pm_contact_id` — the email is the trustworthy join (`pm-contacts/queries.ts:11`).
- The double-send unique constraint rejects the duplicate **row** only *after* the email dispatched (hitting the warning path), so it must be **paired** with a pre-dispatch existence check that stops the duplicate **email**; the constraint is the race-proof backstop (decided — see Critical Implementation Details).
- `23505` (unique_violation) is the established way this codebase distinguishes a constraint hit from a generic error (`pm-contacts/queries.ts:11`) — reuse it for the double-send backstop.
- S-06 lesson: under Vitest import siblings **relatively** (`lessons.md:33`). Zod v4 top-level validators (`lessons.md:19`). Types-sanitize after `db:types` (`lessons.md:27`). Judge lint/build by exit code (`lessons.md:7`).

## Desired End State

`npm run test:workers` runs a green suite that, against the real route + real local Supabase (Resend stubbed at its HTTP edge), proves:

- **S1 (ordering / record-on-success)** — a stubbed Resend success → `200`, exactly **one** `report_sends` row whose `recipient_email === to`; a stubbed Resend **error** → `502` and the table is **unchanged** (zero rows).
- **S2 (partial-success warning)** — dispatch succeeds but the record insert fails → `200 { warning: true }`, and the assertion confirms the email path ran (the warning is the third outcome, pinned).
- **S3 (attachment freshness + encoding)** — the send helper re-renders the same composition as the pdf route (assert structurally / via a render spy) and base64-encodes workerd-safely.
- **S4 (client recipient)** — null `contact_email` → `400`, no dispatch, no row; with an email → dispatched `to === project.contact_email`.
- **S5 (PM recipient integrity — new guard)** — a `pm_email` not matching a saved `pm_contacts` row → `400`, no dispatch, no row; a matching one → sends + records.
- **S6 (double-send — new guard)** — a second identical send in the same bucket is rejected pre-dispatch (`400`, no second email, no second row); a concurrent race is caught by the unique constraint (no duplicate row).

A **reusable real-DB workers harness** exists (`test/workers-harness.ts` extended with `SUPABASE_URL` via `vars` + a local-Supabase setup), documented in `test-plan.md §6.2`, ready for risks #1/#6. `test-plan.md` §3 Phase-2 status and §6.5 are updated; `change.md` is `implemented`.

**Verification**: `npm run test:workers` exits 0 with the new suite; `npm test` (plain-Node) still green; `npm run lint`, `npx astro check`, `npm run build` exit 0; the new migration applies via `migration up --local`; `test-plan.md` §6.2/§6.5/§3 reflect the shipped harness + recipe.

## What We're NOT Doing

- **Not** testing the no-leak boundary (Risk #4) — the email body's internal-field whitelist is Phase-2's *other* risk with its own oracle; this change is send-mechanics only (`research.md` scope).
- **Not** re-asserting `summarize` (unit-covered `queries.test.ts:19-68`) or the PDF render internals (FormePDF is third-party, test-plan §7) — S3 asserts *our* composition/encoding, not the engine.
- **Not** fixing the re-send confirm to be server-side. It stays UI-only by decision (a 5-user single-login tool; the confirm is a footgun guard, not a security boundary). The suite **pins** that a direct re-send POST succeeds — honest to the threat model, not a "fix."
- **Not** adding an idempotency-key or in-flight-lock scheme for double-send — the pre-check + unique-constraint pairing is the chosen mechanism; key-based dedup was rejected as over-built.
- **Not** testing Resend itself — stub only its external HTTP edge (test-plan §7 / Risk #3 anti-pattern).
- **Not** adopting `@cloudflare/vitest-pool-workers` — the Phase-1 `unstable_startWorker` harness is reused (spike-notes verdict).
- **Not** authoring CI YAML or wiring a CI Supabase service container — test-plan §4 leaves that open until the real-DB layer is proven; this change ships the layer and runs it **locally** (the CI-container decision is noted, not made here).
- **Not** changing the UI islands (`ReportDelivery.tsx`) — the PM guard is server-side; the existing UI already posts a saved contact's email, so it stays green against the new guard with no edit.

## Implementation Approach

Guards-first, then harness, then suite, then sync — so each test targets the *final* server behavior and never has to be rewritten when a guard lands:

1. **Phase 1 (production guards)** — the two behavior-changing edits: a PM recipient lookup (`getContactByEmail` + a 400 reject in the route) and the double-send guard (pre-dispatch existence check + a `report_sends` unique constraint via a new additive migration + types regen). Smallest possible production surface; the client-recipient path and the ordering are already correct and untouched.
2. **Phase 2 (real-DB harness + Resend stub)** — extend `test/workers-harness.ts` to add `SUPABASE_URL` via `vars` and a local-Supabase lifecycle, and find a workerd-safe Resend-intercept seam via a timeboxed stub spike (verdict → `spike-notes.md`). This is the reusable infrastructure; it is the part risks #1/#6 wait on.
3. **Phase 3 (route integration suite)** — author S1–S6 against the harness, Resend stubbed, rows observed by a raw `report_sends` count/select (a cleaner oracle for "exactly one row" than routing through `summarize`).
4. **Phase 4 (cookbook + test-plan sync)** — fill §6.2's "Adding a test for the send / no-leak boundary" + the real-DB note, add a §6.5 dated note, advance §3 Phase-2 status, set `change.md` implemented.

## Critical Implementation Details

- **The double-send guard needs BOTH a pre-check and the constraint, in that order.** A unique constraint alone rejects the duplicate *row* — but only *after* `sendReportEmail` already dispatched the second email, which then falls into the partial-success warning path (`send.ts:74-82`). That does not prevent the duplicate *email*, which is what Risk #3 names. So the route must (a) **before dispatch**, query `report_sends` for an existing same-bucket send (same `report_id` + `recipient_email`, within the bucket window) and reject with `400` if present, and (b) keep the unique constraint as the **race-proof backstop** for two POSTs that both pass the pre-check before either inserts. The bucket granularity (e.g. truncate `sent_at` to the minute, or a generated bucket column) must match between the pre-check query and the constraint so they agree on what "duplicate" means.
- **The constraint-violation path must NOT resurface as a 500.** When the backstop fires (concurrent race), `recordSend`'s insert returns `23505`; the route's existing record-insert `catch` (`send.ts:74-82`) already maps an insert failure to the `200 { warning: true }` outcome — confirm the constraint hit lands there (email went out once, the losing row is dropped) rather than escaping as an unhandled 500. This is the one place the new constraint touches existing error handling.
- **PM guard keys on the unique email, not the posted contact id.** Validate `pm_email` against `pm_contacts.email` (which is unique, `pm-contacts/queries.ts:11`); do not trust `pm_contact_id` as the join. Reject with `actionError({ error: "Unknown PM contact" })` (400) **before** any render/dispatch, mirroring the client-null-email guard at `send.ts:46`.
- **Resend stub must be workerd-safe.** `btoa`/`fetch` exist in workerd but Node test doubles do not run inside the worker. The intercept seam (test-only base URL, a `vars`-injected flag the helper honors, or a fetch shim) is the subject of the Phase-2 spike — do not assume `vi.mock` reaches into the booted worker (it does not; the worker is a separate process over HTTP).
- **Real-DB lifecycle: never `db reset`.** Apply the new migration with `supabase migration up --local`; `db reset` wipes seeded data (memory `[[local-migration-apply-no-reset]]`, `[[local-supabase-dev-topology]]`). Tests must seed their own rows with unique ids and clean up so parallel runs/re-runs don't collide (test independence, CLAUDE.md E2E rules apply equally here).
- **Form POSTs need `Origin` + `CF-Connecting-IP`.** Any workerd POST submitting form data must send an `Origin` matching the harness host (Astro `checkOrigin` 403s otherwise) and a `CF-Connecting-IP` (spike-notes §"checkOrigin", §"edge headers").

## Phase 1: Server-side recipient + double-send guards

### Overview

Harden the two guards the research found missing, with the smallest production change: a PM recipient lookup that rejects a forged `pm_email`, and a double-send guard (pre-dispatch check + DB unique-constraint backstop). The client-recipient path, the dispatch→record ordering, and the attachment logic are already correct and stay untouched.

### Changes Required:

#### 1. PM contact lookup query

**File**: `src/lib/pm-contacts/queries.ts`

**Intent**: Give the send route a way to confirm a posted `pm_email` belongs to a saved contact, so a forged address is rejected before dispatch.

**Contract**: Add `getContactByEmail(client, email): Promise<PmContact | null>` — `select("*").eq("email", email).maybeSingle()`; return `null` on no match, throw on a real error (mirror the existing `listContacts` error style). Keys on the unique `email` column (`queries.ts:11`).

#### 2. PM recipient guard in the send route

**File**: `src/pages/api/reports/[id]/send.ts`

**Intent**: Reject a PM send whose `pm_email` doesn't match a saved contact, before any render/dispatch/record — closing the wrong-recipient hole.

**Contract**: In the `recipientType === "pm"` branch (currently `send.ts:50-57`), after resolving the non-empty `pmEmail`, call `getContactByEmail(client, pmEmail)`; if `null`, `return actionError({ error: "Unknown PM contact" })` (400) — same shape/placement as the client-null-email guard (`send.ts:46`). Set `pmContactId` from the looked-up contact's `id` (authoritative) rather than the posted field. No dispatch, no record on rejection. The client path is unchanged.

#### 3. `report_sends` double-send unique constraint

**File**: `supabase/migrations/<timestamp>_report_sends_dedup.sql` (new)

**Intent**: A race-proof backstop that prevents two rows for the same report+recipient within one dedup bucket, so a concurrent double-submit can't write a duplicate record.

**Contract**: Additive migration on `report_sends`: a unique constraint/index over `(report_id, recipient_email, <bucket>)` where `<bucket>` is a minute-granularity truncation of `sent_at` (a generated/stored column `sent_minute` is cleaner for a unique index than an expression index — choose whichever the local PG version supports; document which). Header-comment convention mirrors `20260530150000_create_report_sends.sql`. Apply with `supabase migration up --local` (never `db reset`). No backfill (additive). Trivial rollback (drop the constraint).

#### 4. Pre-dispatch double-send check

**File**: `src/pages/api/reports/[id]/send.ts` (+ a helper in `src/lib/report-sends/queries.ts`)

**Intent**: Stop the duplicate *email* (not just the duplicate row) by rejecting a same-bucket repeat before dispatch; the constraint from change #3 covers the true concurrent race.

**Contract**: Add `findRecentSend(client, { reportId, recipientEmail }): Promise<boolean>` (or returns the row) to `report-sends/queries.ts` — query `report_sends` for an existing row in the current dedup bucket (same window the constraint uses). In the route, **after** recipient resolution and **before** `sendReportEmail`, if a same-bucket send exists, `return actionError({ error: "Already sent just now — re-send is blocked for a moment" })` (400), no dispatch, no record. Ensure the existing record-insert `catch` (`send.ts:74-82`) still absorbs a `23505` from the constraint backstop into the `200 { warning: true }` outcome rather than a 500.

#### 5. Regenerate database types

**File**: `src/types/database.types.ts` (regenerated)

**Intent**: Reflect the new constraint/column on the typed client.

**Contract**: `npm run db:types`, then **sanitize** (valid content `export type Json =` … final `} as const`; strip CLI banners — `lessons.md:27`). Verify with `npx astro check` (exit 0), not lint (file is lint-ignored).

### Success Criteria:

#### Automated Verification:

- Migration applies locally: `supabase migration up --local`
- Types regenerate clean and typecheck: `npx astro check` (exit 0)
- Lint passes: `npm run lint` (exit 0 — by exit code, `lessons.md:7`)
- Build passes: `npm run build` (exit 0 — route changes bundle on `@astrojs/cloudflare`)
- Plain-Node suite still green: `npm test` (no regression in `summarize`/others)

#### Manual Verification:

- In `npm run dev`: a normal PM send (picked from the list) still works; a hand-crafted POST with a `pm_email` not in contacts → 400 "Unknown PM contact", no email; a rapid duplicate send → second is rejected, only one email + one row in Studio.
- A normal client send and re-send (via the UI confirm) still work unchanged.

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 2. Phase blocks use plain bullets; the `## Progress` section owns the checkboxes.

---

## Phase 2: Real-DB workers harness + Resend-intercept stub

### Overview

Extend the Phase-1 workers harness to boot against a **real local Supabase** (so `report_sends` rows are observable) and establish a **workerd-safe Resend stub** so the suite never hits the real Resend. This is the reusable infrastructure risks #1/#6 inherit. A timeboxed spike picks the Resend-intercept mechanism.

### Changes Required:

#### 1. Real-DB harness extension

**File**: `test/workers-harness.ts` (+ possibly `test/supabase-lifecycle.ts`)

**Intent**: Let a test boot the worker wired to a local Supabase and read/write `report_sends` directly for assertions and cleanup.

**Contract**: Extend `startTestWorker()` to accept/inject `SUPABASE_URL` (+ the `sb_secret_` key the worker already reads) via `unstable_startWorker({ vars })` — `vars` adds *new* bindings fine (only *overrides* of `.dev.vars` don't take, spike-notes §credentials). Expose a thin Supabase admin client to the test (over HTTP/PostgREST per CLAUDE.md — never `pg`) for row counts + teardown. Document the prerequisite: `npx supabase start` + `migration up --local` before the suite. Keep the helper in top-level `test/` (a `wrangler` import under `src/` breaks `astro build` — spike-notes / test-plan §6.2).

#### 2. Resend-intercept stub spike

**File**: `context/changes/report-email-send-tests/spike-notes.md` (new; appends to the existing harness lore)

**Intent**: Determine, in a strict timebox (~half a session), the cheapest workerd-safe way to make the route's Resend call return a controlled success / `{ error }` / throw without hitting the network — since `vi.mock` cannot reach into the separately-booted worker.

**Contract**: Evaluate, in order of cheapness: (a) a test-only `RESEND_BASE_URL`/flag injected via `vars` that the helper honors to short-circuit dispatch; (b) pointing the Resend client at a local intercept the harness controls; (c) a fixture/env toggle. Spike success = one test that drives a forced success AND a forced error through the real route and observes the row delta. Record the verdict + the working config + gotchas. If an intercept needs a tiny production seam in `send-report.ts` (e.g. honoring a base-URL env), keep it behavior-preserving and note it; ask before adding any dependency (workflow rule).

#### 3. `test:workers` wiring for the DB prerequisite

**File**: `package.json` (script note) + harness docstring

**Intent**: Make the real-DB requirement explicit so a fresh run doesn't fail cryptically.

**Contract**: Document (script comment or harness docstring) that the send suite needs a running local Supabase with migrations applied; have the harness **skip** (not fail) the DB-dependent cases when `SUPABASE_URL` is absent (mirrors the `it.skipIf` secret-absent pattern, spike-notes §credentials), so CI-without-DB stays green until the container decision lands.

### Success Criteria:

#### Automated Verification:

- A scratch harness boot wired to local Supabase performs one `report_sends` insert + read + cleanup (proves the DB wiring).
- The Resend stub drives a forced success and a forced error through the real route in the spike test (proves the intercept).
- Lint + type-check pass on the harness/spike files: `npm run lint` && `npx astro check` (exit 0).

#### Manual Verification:

- `spike-notes.md` records the Resend-intercept verdict, the working config, and gotchas.
- With local Supabase **down**, the DB-dependent cases **skip** (not error); with it up + migrated, they run.
- Any production seam added for the stub (if any) is behavior-preserving and was approved before install of any dep.

**Implementation Note**: Timebox the stub spike; if it hits the box without a clean intercept, take the cheapest working fallback and proceed — do not extend open-endedly. Pause for manual confirmation before Phase 3.

---

## Phase 3: Send-path route integration suite (S1–S6)

### Overview

Author the Risk #3 oracle cases against the real route + real Supabase + stubbed Resend, observing `report_sends` rows by a raw count/select (cleaner "exactly one row" oracle than routing through `summarize`).

### Changes Required:

#### 1. Send-route integration tests

**File**: `test/send.workers.test.ts` (new; top-level `test/` per the harness rule)

**Intent**: Prove the dispatch→record ordering, the freshness/encoding, the recipient guards (incl. the two new ones), and the partial-success warning — the full Risk #3 oracle.

**Contract**: Using the extended harness (`fetch` + admin Supabase client), each case seeds its own report/project/contact rows with unique ids and cleans up. Send form POSTs carry a matching `Origin` + `CF-Connecting-IP` (spike-notes). Cases:
- **S1 ordering / record-on-success**: stub Resend success → assert `200`, body `{ ok: true }` (no `warning`), and **exactly one** new `report_sends` row with `recipient_email === to`. Stub Resend **error** → assert `502`, `{ ok: false }`, and **zero** new rows (the record-on-success heart of Risk #3).
- **S2 partial-success warning**: dispatch succeeds, force the insert to fail (e.g. a constraint hit via a pre-seeded same-bucket row, or a forced FK violation) → assert `200 { warning: true }` and that the dispatch stub was invoked (email went out, record didn't).
- **S3 freshness + encoding**: assert the helper renders via the same `reportDocument` composition as the pdf route (render spy or a structural assertion that both call the same factory) and that the attachment `content` is valid base64 of non-empty bytes (decode round-trip). Do **not** assert PDF internals.
- **S4 client recipient**: project with null `contact_email` → `400` "No client email…", Resend stub **not** called, zero rows; project with an email → dispatched `to === project.contact_email`, one row.
- **S5 PM recipient integrity (new guard)**: `pm_email` absent from `pm_contacts` → `400` "Unknown PM contact", no dispatch, zero rows; a matching `pm_email` → one row, `pm_contact_id` = the looked-up id.
- **S6 double-send (new guard)**: two sequential identical sends → first `200`+one row, second `400` (pre-check), Resend stub invoked **once**, one row total. A near-concurrent variant (two `fetch`es without awaiting between) → at most one row (constraint backstop); assert no duplicate row even if both dispatched.
- Skip the DB-dependent cases (`it.skipIf`) when `SUPABASE_URL` is absent.

#### 2. (Optional) real-DB query unit

**File**: `src/lib/report-sends/queries.test.ts` (extend) or a new `test/`-level case

**Intent**: If `getContactByEmail`/`findRecentSend` carry non-trivial logic, cover the reducer-like part DB-free; otherwise rely on the route suite.

**Contract**: Only add if there is pure logic worth isolating (e.g. the bucket computation). Keep `summarize` coverage untouched. Import siblings relatively (`lessons.md:33`).

### Success Criteria:

#### Automated Verification:

- Workers suite green: `npm run test:workers` (boots built worker + local Supabase, runs S1–S6).
- `npm run build` succeeds before the suite (it depends on `dist/server/`).
- S1 asserts zero rows on the Resend-error path and exactly one on success (record-on-success).
- S5 asserts a forged `pm_email` → 400 + zero rows; S6 asserts a duplicate → one row + one dispatch.
- Plain-Node suite still green: `npm test`. Lint + type-check: `npm run lint` && `npx astro check` (exit 0).

#### Manual Verification:

- Running the suite against a freshly migrated local Supabase leaves no orphan `report_sends` rows (cleanup works); re-running is idempotent.
- Temporarily reverting a Phase-1 guard (PM lookup or pre-check) makes the corresponding case **fail** (the test actually guards the behavior), then restore.

**Implementation Note**: Pause for manual confirmation before Phase 4.

---

## Phase 4: Cookbook + test-plan sync

### Overview

Record the send/no-leak + real-DB recipe in `test-plan.md §6.2/§6.3`, add a §6.5 dated note, advance the §3 Phase-2 status, and mark the change implemented. No production or test code changes.

### Changes Required:

#### 1. Fill the send + real-DB cookbook

**File**: `context/foundation/test-plan.md`

**Intent**: Replace §6.3's "TBD — see §3 Phase 2" with the real recipe (record-gated-on-dispatch pattern; the recipient-integrity guard) and complete the §6.2 real-DB note so risks #1/#6 reuse the harness without re-deriving it.

**Contract**: §6.3 gains the send-path recipe: the workers harness + real-local-Supabase + Resend-intercept stub; observe rows by raw count; the `Origin`/`CF-Connecting-IP` requirement; reference `test/send.workers.test.ts` as the template. §6.2's "Real-DB integration (risks #1/#6, not yet built)" paragraph is updated to "built — see `test/workers-harness.ts` + `report-email-send-tests`" with the `SUPABASE_URL`-via-`vars` + `migration up --local` note. Update §4's real-DB row from "not built yet" to the shipped tooling. Do not edit §1–§3 strategy beyond the Phase-2 status line. (Risk #4, the no-leak unit, remains §6.3 TBD until its own slice.)

#### 2. Advance rollout + change status

**File**: `context/foundation/test-plan.md` (§3 row 2 Status + §6.5) + `context/changes/report-email-send-tests/change.md`

**Intent**: Move the Phase-2 row toward complete for the risk-#3 slice and mark the change implemented.

**Contract**: §3 Phase-2 Status advances per the fixed vocabulary toward `complete` for risk #3 (note risk #4 still pending in the same phase). Append a §6.5 dated note: the real-DB harness landed here, the Resend-stub verdict, and the two guards added (PM lookup, double-send pre-check + constraint). Set `change.md` `status: implemented`, `updated: <today>`. (CI Supabase-container decision noted as still open, per §4.)

### Success Criteria:

#### Automated Verification:

- Full suites green: `npm test` and `npm run test:workers`.
- `test-plan.md §6.3` no longer contains "TBD — see §3 Phase 2" for the send-path pattern.
- `test-plan.md §3` Phase-2 Status reflects the shipped risk-#3 slice; §6.5 has a dated note.

#### Manual Verification:

- A reader can follow §6.3 + §6.2 to add a real-DB send test without consulting this plan.
- `change.md` status is `implemented`.

**Implementation Note**: Final phase — after verification, the risk-#3 slice of Phase 2 is done; suggest opening risk #4 (no-leak boundary) next, or risks #1/#6 which now inherit the real-DB harness.

---

## Testing Strategy

### Unit / logic tests (plain-Node Vitest):

- `summarize` — already covered (`queries.test.ts:19-68`); untouched.
- Any pure bucket-computation helper from Phase 1 — covered DB-free only if non-trivial.

### Integration tests — route handler in workerd + real Supabase (Phase 3):

- S1 ordering/record-on-success (success → one row; error → zero rows).
- S2 partial-success warning (200 `warning:true`, email out / record not).
- S3 attachment freshness + base64 round-trip.
- S4 client recipient + null guard.
- S5 PM recipient integrity (new guard).
- S6 double-send (pre-check + constraint backstop).

### Manual Testing Steps:

1. `npm run dev`: normal PM send (from list) works; forged `pm_email` POST → 400; rapid duplicate → second rejected, one email/row in Studio.
2. Normal client send + UI re-send unchanged.
3. Revert a Phase-1 guard → the matching Phase-3 case fails → restore (proves the guard).
4. Run `test:workers` against a fresh migrated local Supabase → green, no orphan rows; re-run idempotent.

## Performance Considerations

The workers suite needs an `astro build` and boots the worker with the inlined 6.45 MiB FormePDF WASM (~830 ms first request, spike-notes), plus a local Supabase round-trip per case — keep it the **separate `test:workers` script**, off the fast `npm test` inner loop. Each send case re-renders a PDF (~197 ms p95, F-02); a small fixture report keeps cases quick. The S3 large-PDF/base64-chunk-boundary case (if added) is the one heavier render.

## Migration Notes

One additive migration (`report_sends` dedup unique constraint/column); no existing-table data change, no backfill, trivial rollback (drop the constraint/column). Apply with `supabase migration up --local` (never `db reset` — wipes seeds, memory `[[local-migration-apply-no-reset]]`); production via `npm run db:push`. Regenerate + sanitize types after (`lessons.md:27`).

## References

- Research: `context/changes/report-email-send-tests/research.md` (oracle S1–S6, the JSON/warning/PM/double-send divergences, cheapest-layer mapping)
- Test plan: `context/foundation/test-plan.md` §2 (Risk #3 + Risk Response Guidance), §3 Phase 2, §4 (real-DB harness open decision), §6.2/§6.3 (cookbook — filled by Phase 4), §7 (real-Supabase / stub-only-the-edge rule)
- Phase-1 precedent: `context/changes/auth-gate-throttle/plan.md` (two-layer split, harness build), `context/changes/auth-gate-throttle/spike-notes.md` (`unstable_startWorker` recipe, `Origin`/credentials gotchas)
- Live code: `src/pages/api/reports/[id]/send.ts:44-88` (recipient + ordering + warning), `src/lib/email/send-report.ts:21-28,59,79-81` (base64 + render + throw), `src/lib/report-sends/queries.ts:30-67`, `src/lib/pm-contacts/queries.ts:11,20` (unique email + listContacts), `src/pages/api/reports/[id]/pdf.ts:25` (render parity)
- Harness: `test/workers-harness.ts`, `test/load-dev-vars.ts`
- Lessons: `context/foundation/lessons.md` (relative sibling imports; zod v4 top-level; types-sanitize; lint/build by exit code)
- Archive: `context/archive/2026-05-30-report-email-send/plan.md:50` (record-on-success intent + base64 lesson origin — note its redirect contract is superseded by S-11 JSON)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Server-side recipient + double-send guards

#### Automated

- [x] 1.1 Migration applies locally: `supabase migration up --local` — 96beb90
- [x] 1.2 Types regenerate clean and typecheck: `npx astro check` (exit 0) — 96beb90
- [x] 1.3 Lint passes: `npm run lint` (exit 0) — 96beb90
- [x] 1.4 Build passes: `npm run build` (exit 0) — 96beb90
- [x] 1.5 Plain-Node suite still green: `npm test` — 96beb90

#### Manual

- [ ] 1.6 Dev: normal PM send works; forged `pm_email` → 400 no email; rapid duplicate → one email/row
- [ ] 1.7 Client send + UI re-send unchanged

### Phase 2: Real-DB workers harness + Resend-intercept stub

#### Automated

- [x] 2.1 Scratch harness boot inserts+reads+cleans one `report_sends` row (DB wiring proven)
- [x] 2.2 Resend stub drives a forced success and a forced error through the real route (intercept proven)
- [x] 2.3 Lint + type-check pass on harness/spike files: `npm run lint` && `npx astro check` (exit 0)

#### Manual

- [ ] 2.4 `spike-notes.md` records the Resend-intercept verdict + working config + gotchas
- [ ] 2.5 Supabase down → DB-dependent cases skip (not error); up + migrated → they run
- [ ] 2.6 Any production seam for the stub is behavior-preserving; any dep installed only after approval

### Phase 3: Send-path route integration suite (S1–S6)

#### Automated

- [ ] 3.1 Workers suite green: `npm run test:workers` (S1–S6)
- [ ] 3.2 `npm run build` succeeds before the suite
- [ ] 3.3 S1 asserts zero rows on Resend-error and exactly one on success (record-on-success)
- [ ] 3.4 S5 forged `pm_email` → 400 + zero rows; S6 duplicate → one row + one dispatch
- [ ] 3.5 Plain-Node suite still green + lint + type-check: `npm test` && `npm run lint` && `npx astro check`

#### Manual

- [ ] 3.6 Suite leaves no orphan rows on a fresh migrated DB; re-run idempotent
- [ ] 3.7 Reverting a Phase-1 guard makes the matching case fail, then restore

### Phase 4: Cookbook + test-plan sync

#### Automated

- [ ] 4.1 Full suites green: `npm test` and `npm run test:workers`
- [ ] 4.2 `test-plan.md §6.3` no longer says "TBD — see §3 Phase 2" for the send-path pattern
- [ ] 4.3 `test-plan.md §3` Phase-2 Status updated for risk #3; §6.5 has a dated note

#### Manual

- [ ] 4.4 A reader can follow §6.3 + §6.2 to add a real-DB send test without this plan
- [ ] 4.5 `change.md` status is `implemented`
