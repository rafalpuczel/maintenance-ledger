---
change_id: report-email-send-tests
title: "Test rollout Phase 2 (Risk #3): send-path dispatch→record + recipient integrity"
status: implementing
created: 2026-06-04
updated: 2026-06-04
last_phase: 2
archived_at: null
---

## Notes

Risk #3 from `context/foundation/test-plan.md` §2 (the Send-path row). Failure scenario:
a Send dispatches the wrong/stale PDF, sends to the wrong recipient, or a failed send
still writes a "sent" record (or a double-click double-sends) — the agency emails a
client a broken artifact, or the re-send guard is defeated. Part of test-plan §3
**Phase 2** (paired with risk #4, the no-leak boundary — this research covers R3 send
mechanics only, scoped out R4).

The send feature shipped under S-09 (`context/archive/2026-05-30-report-email-send/`);
this change adds the integration tests the test-plan rollout calls for.

Research artifact: `research.md` (oracle grounded against the **live** `src/` code, not
the archived S-09 plan — the plan describes a redirect-based route that no longer exists).

**Load-bearing corrections surfaced by research:**
1. The route returns **JSON** (`actionOk`/`actionError`), NOT the `?ok=`/`?error=`
   redirect the archived S-09 plan describes — the S-11 async-UX SPA refactor replaced it.
   The oracle asserts a JSON body shape + status, not a `Location` header.
2. There is a **partial-success warning path** the plan never mentions: email sent but
   `recordSend` throws → **HTTP 200 with `warning: true`** (not an error). The oracle must
   treat this as a distinct third outcome, not fold it into success or failure.
3. The PM recipient address is the **client-supplied `pm_email`** form field with no
   server-side re-lookup against `pm_contacts` — the wrong-recipient guard for PM sends
   is UI-only. The re-send confirm and double-send guard are likewise **UI-only**.
