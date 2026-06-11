---
change_id: auth-gate-throttle
title: "Test rollout Phase 1 (Risk #2): auth route-gate + credential-stuffing throttle"
status: archived
created: 2026-06-02
updated: 2026-06-11
archived_at: 2026-06-11T14:37:52Z
---

## Notes

Risk #2 from `context/foundation/test-plan.md` §2 (the auth row). Failure scenario:
an unauthenticated visitor reaches a gated route, OR a legitimate user is locked out
by the credential-stuffing throttle. Part of test-plan §3 **Phase 1** (shares the
integration-harness decision with risks #1 and #6).

Research artifact: `research.md` (oracle grounded against PRD + the
`2026-05-26-shared-credential-auth` archive, not against the implementation shape).

**Load-bearing correction surfaced by research:** the gate is a **deny-by-default
public allowlist** (`src/middleware.ts` `PUBLIC_PATHS`/`PUBLIC_PREFIXES`), NOT the
`PROTECTED_ROUTES` allowlist the test-plan risk row's wording implied. The oracle for
the gate test is "any non-public path → 302 /login", never an enumerated protected list.
