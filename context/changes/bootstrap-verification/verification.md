---
bootstrapped_at: 2026-05-21T15:35:00Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: maintenance-ledger
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

```yaml
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
```

### Why this stack

A small agency team shipping a maintenance-report tool in 3 weeks of after-hours
work needs an agent-friendly starter that handles file upload for the brand
logo, a relational store for projects and reports, and deploys cheaply.
10x-astro-starter is the recommended default for `(web, js)` and clears all
four agent-friendly gates. Auth diverges from the starter's shipped Supabase
Auth: FR-001's shared single-credential model is implemented with a hand-rolled
HMAC-signed session cookie against env-provisioned `SHARED_USERNAME` /
`SHARED_PASSWORD_HASH`, rotated by redeploy. Supabase is kept as Postgres +
storage, accessed only from Astro server endpoints with the service role key.
Cloudflare Pages is the starter default; PDF generation on the edge runtime
uses a workerd-compatible library (pdf-lib or @react-pdf/renderer) or
Cloudflare Browser Rendering.

## Pre-scaffold verification

| Signal       | Value                                                | Severity | Notes                                                                |
| ------------ | ---------------------------------------------------- | -------- | -------------------------------------------------------------------- |
| npm package  | not run                                              | n/a      | starter uses `git clone`; no `npm create-*` package to query          |
| GitHub repo  | not run (`przeprogramowani/10x-astro-starter`)       | n/a      | `gh` CLI not installed on this machine; pushed_at could not be read   |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install --no-bin-links`
**Strategy**: git-clone
**Exit code**: 0 (after user manually re-ran with `--no-bin-links` to work around Windows EPERM on `.ps1` bin-shim creation)
**Files moved**: 19 (18 silent moves + 1 sidelined as `.scaffold` sibling)
**Conflicts (.scaffold siblings)**: `CLAUDE.md.scaffold` (user's CLAUDE.md preserved; scaffold's saved alongside for diffing)
**.gitignore handling**: append-merged (cwd lines kept first, then 19 lines from scaffold under a `# from 10x-astro-starter` separator; no duplicate lines)
**.bootstrap-scaffold cleanup**: deleted

### Initial-attempt failure (for the record)

First scaffold attempt failed at the `npm install` step with `EPERM` on `chmod` of `node_modules/.bin/miniflare.ps1`. This is a known Windows EPERM pattern caused by an antivirus, file watcher, or filesystem permission quirk holding `.ps1` shims during install. Workaround applied on the manual re-run: `npm install --no-bin-links` (skips the `.bin/` shim creation entirely).

## Post-scaffold audit

**Tool**: `npm audit --json`
**Initial summary** (post-scaffold): 0 CRITICAL, 1 HIGH, 9 MODERATE, 0 LOW.
**After `npm audit fix --no-bin-links`**: 0 CRITICAL, 0 HIGH, 5 MODERATE, 0 LOW. Removed 1 package, changed 52.

### Remediation applied

`npm audit fix --no-bin-links` cleared the HIGH `devalue` finding and the wrangler/miniflare/ws/@cloudflare/vite-plugin chain (all moderate). One package removed, 52 changed. No breaking changes applied.

### Findings left in place (5 MODERATE, deliberately not fixed)

All five remaining findings are in **dev/build tooling** (not shipped to production runtime). They form one transitive chain rooted at `@astrojs/check`:

```
@astrojs/check  →  @astrojs/language-server  →  volar-service-yaml
    →  yaml-language-server  →  yaml  (GHSA-48c2-rrv3-qjmp — stack overflow on deeply nested YAML)
```

- **yaml** (`2.0.0 - 2.8.2`) — CVSS 4.3. Triggered only when parsing untrusted YAML, which the IDE/build tools never do here.
- **yaml-language-server**, **volar-service-yaml**, **@astrojs/language-server**, **@astrojs/check** — depend on the vulnerable `yaml`.

`npm audit fix --force` would install `@astrojs/check@0.9.2` as a breaking change (a likely downgrade). User chose to accept the residual dev-tooling risk rather than absorb the breaking change for a vuln that does not apply to the build pipeline. Revisit if `@astrojs/check` ships a non-breaking patched line.

#### LOW / INFO findings

None.

## Hints recorded but not acted on

| Hint                       | Value                              |
| -------------------------- | ---------------------------------- |
| bootstrapper_confidence    | first-class                        |
| quality_override           | false                              |
| path_taken                 | standard                           |
| self_check_answers         | null                               |
| team_size                  | solo                               |
| deployment_target          | cloudflare-pages                   |
| ci_provider                | github-actions                     |
| ci_default_flow            | auto-deploy-on-merge               |
| has_auth                   | true                               |
| has_payments               | false                              |
| has_realtime               | false                              |
| has_ai                     | false                              |
| has_background_jobs        | false                              |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:

- **Review `CLAUDE.md.scaffold`** — it carries the starter's own agent guidance (Astro 6 + React 19 + Supabase + Cloudflare conventions, shadcn/ui setup, RLS-on-migrations expectation). Decide which pieces to merge into your existing `CLAUDE.md`.
- **Re-run `npm install` without `--no-bin-links`** once you've addressed the Windows EPERM root cause (Defender exclusion / closing watchers / different drive). Bin shims are useful for invoking tools like `npx wrangler`, `npx astro` directly; without them you must call into `node_modules/.bin/...` explicitly or use `npx`.
- **Address audit findings** at your discretion. `npm audit fix` covers most of these without a major-version bump; the `@astrojs/check 0.9.2` upgrade is semver-major (read the changelog before applying).
- **Implement shared-login per the hand-off rationale** — strip `src/pages/api/auth/{signup,signin,signout}.ts` and the Supabase Auth wiring, replace with a single `/api/login` endpoint that checks env-var credentials and sets a signed session cookie (see conversation history for the full pattern).
- **Pick a workerd-compatible PDF library** for FR-017 — `pdf-lib` and `@react-pdf/renderer` both run on Cloudflare Workers; Puppeteer does not (use Cloudflare Browser Rendering binding if you need a real headless browser).
- **Run `git init`** is NOT needed — your existing `.git/` is preserved and untouched; the scaffold's `.git/` was deleted before merge.
