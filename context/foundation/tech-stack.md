---
starter_id: 10x-astro-starter
package_manager: npm
project_name: maintenance-ledger
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-workers
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
---

## Why this stack

A small agency team shipping a maintenance-report tool in 3 weeks of after-hours
work needs an agent-friendly starter that handles file upload for the brand
logo, a relational store for projects and reports, and deploys cheaply.
10x-astro-starter is the recommended default for `(web, js)` and clears all
four agent-friendly gates: TypeScript end-to-end, strong Astro conventions,
popular in training data, current docs. Auth diverges from the starter's
shipped Supabase Auth: FR-001's shared single-credential model is implemented
with a hand-rolled HMAC-signed session cookie against env-provisioned
`SHARED_USERNAME` / `SHARED_PASSWORD_HASH`, rotated by redeploy — Supabase
Auth's signup / reset / JWT-refresh machinery is dead weight here. Supabase is
kept as Postgres + storage, accessed only from Astro server endpoints with the
service role key. Cloudflare Workers (Static Assets) — see `infrastructure.md` for the
Pages-vs-Workers analysis; `@astrojs/cloudflare` v13+ dropped Pages support so
deploys go through `wrangler deploy`, not `wrangler pages deploy`. Matches the
small target_scale; PDF generation on the edge runtime uses FormePDF (chosen
2026-05-23 per `infrastructure.md` Risk R1 — `@react-pdf/renderer` is blocked
on workerd by yoga-layout WASM). GitHub Actions with auto-deploy-on-merge is
what the starter ships with.
