---
starter_id: 10x-astro-starter
package_manager: npm
project_name: maintenance-ledger
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
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
work needs an agent-friendly starter that already handles shared-credential
auth, file upload for brand logo, and a PostgreSQL store for projects and
reports without assembly. 10x-astro-starter is the recommended default for
`(web, js)` and clears all four agent-friendly gates: TypeScript end-to-end,
strong conventions, popular in training data, current docs. Supabase covers
auth, Postgres, and storage out of the box; Astro+React handles the editor UI
plus server endpoints for save/PDF/send. Cloudflare Pages is the starter
default and matches the small target_scale; PDF generation on the edge runtime
will be done with a workerd-compatible library (pdf-lib or @react-pdf/renderer)
or Cloudflare Browser Rendering — surfaced as a setup decision the
bootstrapper's instruction file should note. GitHub Actions with
auto-deploy-on-merge is what the starter ships with.
