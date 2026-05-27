---
change_id: shared-credential-auth
title: Replace Supabase Auth with HMAC shared-credential session
status: impl_reviewed
created: 2026-05-26
updated: 2026-05-27
archived_at: null
---

## Notes

Roadmap item **F-01** (`context/foundation/roadmap.md`) — the universal auth gate. Replace the starter's Supabase Auth (signup / reset / JWT-refresh, only `/dashboard` protected) with a single shared-credential login: validate against provisioned `SHARED_USERNAME` / `SHARED_PASSWORD_HASH`, issue an HMAC-signed session cookie (`SESSION_HMAC_KEY`), and redirect every unauthenticated route except the login page.

- **PRD refs:** FR-001; Access Control (single shared login, all-route enforcement); NFR (resist credential-stuffing at scale without locking out a user who mistypes 3×).
- **Secrets** per `deploy-plan.md`: `SHARED_USERNAME`, `SHARED_PASSWORD_HASH`, `SESSION_HMAC_KEY` provisioned. This change adds `SHARED_PASSWORD_PEPPER` and switches credential verification from bcrypt to a peppered Web Crypto HMAC (free-tier 10 ms CPU limit) — the prod `SHARED_PASSWORD_HASH` (a bcrypt hash) must be re-minted as an HMAC and the pepper provisioned before the next prod deploy.
- **Main hazards:** leaving dead Supabase-Auth code paths after the rip-out (signin/signup/confirm-email pages, middleware `getUser`); getting the credential-stuffing-vs-no-lockout NFR balance right (KV throttle vs. Turnstile vs. rate-limit binding — open unknown).
- **Unlocks:** S-01 through S-09 (all live behind the shared login).
