---
project: maintenance-ledger
platform: cloudflare-workers
status: deployed
first_deploy: 2026-05-23
last_deploy: 2026-05-23
deploy_mechanism: cloudflare-workers-builds-from-master
---

# Deployment audit trail — maintenance-ledger

What's currently live on Cloudflare and how it got there. The implementation plan that produced this state lives at `context/changes/deployment/deployment-plan.md`. This file is the durable "what's deployed" snapshot — milestone-planning skills downstream read from here to know what they can assume is in production.

## Live state

| Field | Value |
|---|---|
| Worker name | `maintenance-ledger` |
| Production URL | https://maintenance-ledger.rpuczel.workers.dev |
| Cloudflare account | rpuczel@gmail.com |
| Cloudflare Account ID | `cb3c1f3a9930d60a8d18a74836216769` |
| Current version | `16400f2a-5426-4674-9164-95607c36f004` (2026-05-23, Workers Builds from `master@558ad18`) |
| Deploy mechanism | **Cloudflare Workers Builds** on push to `master` |
| Manual fallback | `npx wrangler deploy` (emergency / local-test only) |
| CI gate | `.github/workflows/ci.yml` — lint + build on every push/PR to `master`, no deploy |
| Compatibility date | `2026-05-23` |
| Bundle size | 1914 KiB raw / 391 KiB gzipped (under free-tier 3 MiB compressed limit) |
| Worker startup | 19–21 ms |

## Auto-provisioned bindings

| Binding | Type | Resource ID |
|---|---|---|
| `env.SESSION` | KV Namespace (`maintenance-ledger-session`) | `6da5b0d1c8484b98820b32b83d2a2e5e` |
| `env.IMAGES` | Cloudflare Images | — |
| `env.ASSETS` | Static assets fetcher | bound to `./dist` |

`SESSION` was auto-provisioned by `@astrojs/cloudflare` on first `wrangler deploy`; it's used by Astro's session driver. `IMAGES` was enabled by the adapter for image processing in production.

## Secrets provisioned via `wrangler secret put`

| Secret | Status | Notes |
|---|---|---|
| `SUPABASE_URL` | ✅ Set | Cloud project URL |
| `SUPABASE_SECRET_KEY` | ✅ Set | `sb_secret_...` (new Supabase key system, July 2025+) |
| `SHARED_USERNAME` | ✅ Set | FR-001 |
| `SHARED_PASSWORD_HASH` | ✅ Set | bcryptjs hash, cost 12 |
| `SESSION_HMAC_KEY` | ✅ Set | 32 random bytes base64 |
| `RESEND_API_KEY` | ⬜ Deferred | Marked `optional: true` in `astro.config.mjs` env schema; required before FR-019/020 are wired |

`wrangler secret list` is the source of truth for what's in the Workers Secrets Store.

## Version history

| Created (UTC) | Version | Source | Notes |
|---|---|---|---|
| 2026-05-23 16:57:06 | `34e4f5ba-3f66-4961-9e50-13c0bc7c24fc` | Upload | Initial deploy (placeholder worker entity) |
| 2026-05-23 16:57:15 | `41098f91-d0ea-4197-ae64-2da8a5bc2d57` | Upload | First manual `wrangler deploy` — KV `SESSION` auto-provisioned here |
| 2026-05-23 17:00:51 | — | Secret Change | `SUPABASE_URL` set |
| 2026-05-23 17:02:17 | `4508feed-ebbe-479b-8297-67dc7a384873` | Secret Change | Sequence of `wrangler secret put` (auth + Supabase secrets) |
| 2026-05-23 17:02:32 | `c96a61b2-5bff-405d-a73f-f35727575770` | Secret Change | (continued) |
| 2026-05-23 17:04:36 | `42739f9c-2921-4991-b46d-92bdfab1059c` | Manual deploy | Redeploy after `RESEND_API_KEY` made `optional: true` |
| 2026-05-23 17:33:35 | `16400f2a-5426-4674-9164-95607c36f004` | Workers Builds | **First auto-deploy** triggered by push of `558ad18` to `master` |

## Operational commands

- Watch live logs: `npx wrangler tail`
- List deployments: `npx wrangler deployments list --name maintenance-ledger`
- List secrets (names only): `npx wrangler secret list`
- Rollback to previous version: `npx wrangler rollback`
- List versions: `npx wrangler versions list`
- Manual deploy (emergency): `npx wrangler deploy`

`CLOUDFLARE_API_TOKEN` must be in env (persisted via `setx` per Phase 3). If a new terminal session doesn't have it: `$env:CLOUDFLARE_API_TOKEN = [Environment]::GetEnvironmentVariable('CLOUDFLARE_API_TOKEN','User')`.

## Outstanding (post-deploy follow-ups)

- **Prereq C — Resend**: account signup + verified domain + API key, then `wrangler secret put RESEND_API_KEY`. Required before FR-019/020 are built.
- **R8 hardening**: gate preview URLs with Cloudflare Access before any real client data lands.
- **Rollback drill**: not yet exercised. Run `wrangler rollback` once as a dry run so the first real incident isn't the first time you've used it.
- **FR-001 implementation**: starter currently ships with Supabase Auth flow in `src/middleware.ts`. PRD specifies HMAC-signed shared-credential cookie. Feature work, not deploy work.

## Smoke test results (2026-05-23)

| Probe | Result | Proves |
|---|---|---|
| `GET /` | 200 | Worker boots, root page renders |
| `GET /dashboard` | 302 to `/auth/signin` | Middleware runs → Supabase client created → `getUser()` works → R4 verified |
| `GET /auth/signin` | 200 | Signin page renders |
| `GET /nonexistent` | 404 | Asset 404 fallback works |
