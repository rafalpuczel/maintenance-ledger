---
project: maintenance-ledger
researched_at: 2026-05-23
recommended_platform: cloudflare-workers
runner_up: netlify
context_type: mvp
tech_stack:
  language: typescript
  framework: astro-5
  runtime: cloudflare-workerd
---

## Recommendation

**Deploy on Cloudflare Workers + Static Assets.** Starting on the free tier (100k req/day, 10 ms CPU/req, 3 MB gzipped bundle) and upgrading to the Workers Paid plan ($5/mo, 30 s CPU/req, 10 MB bundle) only if PDF generation pushes past the free CPU budget under real reports.

Full Pass row across the five agent-friendly criteria, the user's only hands-on platform familiarity, cheapest paid tier of all candidates, and `astro dev` already runs the real workerd locally via the Cloudflare Vite plugin so dev-to-prod fidelity is high. The honest trade-off is workerd's PDF library compatibility surface — covered in the risk register and the open library decision below.

> **Stack frontmatter note.** `context/foundation/tech-stack.md` currently sets `deployment_target: cloudflare-pages`. `@astrojs/cloudflare` v13+ dropped Pages support; the current path is **Workers Static Assets** via `wrangler deploy`. Update the frontmatter to `cloudflare-workers` when convenient — the deploy commands and `wrangler.jsonc` shape in "Getting Started" below assume the new path.

> **Open library decision before first build.** Pick one of the three workerd-compatible PDF paths in the Risk Register (R1) — `pdf-lib` with standard fonts, **FormePDF**, or **Cloudflare Browser Rendering**. `@react-pdf/renderer` is **not** an option on Workers as of 2026-05-23 (yoga-layout WASM blocker; community patches are brittle and reportedly still failing on Astro + CF Workers per [react-pdf#2757](https://github.com/diegomura/react-pdf/issues/2757)).

## Platform Comparison

Scoring is Pass / Partial / Fail per criterion from `references/agent-friendly-criteria.md`. Hard filter (persistent connections = No, per interview Q1) dropped no candidate. Interview weights: cost roughly equal (no shift), Cloudflare familiarity (tiebreaker), single region (no edge bonus), external providers fine (no co-location boost).

| Platform | CLI | Managed / Serverless | Docs (llms.txt / md) | Deploy API | MCP Integration | Min paid cost |
|---|---|---|---|---|---|---|
| **Cloudflare Workers + Static Assets** | Pass | Pass (edge serverless) | Pass (`llms.txt` + per-product `llms-full.txt`) | Pass | Pass (16 servers, treat beta-grade) | **$5/mo** |
| **Netlify** | Pass | Pass (Functions + Edge) | Pass (`llms.txt`) | Pass (draft-by-default = safe) | Pass (**GA**) | $20/mo |
| **Vercel** | Pass | Pass (Node serverless) | Pass (`llms.txt`) | Pass | Partial (public **beta, read-only**) | $20/mo |
| **Render** | Pass | Partial (always-on container, no scale-to-zero on paid) | Pass (`llms.txt` + `.md` suffix) | Pass | Pass (**GA**) | $7/mo |
| **Railway** | Pass | Partial (always-on container) | Pass (`llms.txt`) | Pass | Partial (beta, OAuth) | ~$5–8/mo |
| **Fly.io** | Pass | Partial (Firecracker microVM + Dockerfile maintenance) | Pass (markdown source, no `llms.txt`) | Pass | Partial (beta, built into `flyctl`) | ~$1–3/mo (auto-stop) |

### Shortlisted Platforms

#### 1. Cloudflare Workers + Static Assets (Recommended)

Full Pass row. Cheapest paid tier ($5/mo). User's only hands-on familiarity → tiebreaker. `wrangler` covers `deploy / rollback / tail / secret put / versions deploy` non-interactively when `CLOUDFLARE_API_TOKEN` is set. 16 MCP servers (docs, bindings, observability, builds, browser, codemode) give the agent structured live-state access. `astro dev` already runs the real workerd via the Cloudflare Vite plugin, so dev-to-prod fidelity is unusually high. The cost is real but bounded workerd compatibility friction on the PDF rendering library — see Risk Register R1.

#### 2. Netlify

Also a full Pass row including GA MCP. Wins over Cloudflare on one specific axis: **Node Functions remove the PDF library risk class entirely.** Both `pdf-lib` (any font via `@pdf-lib/fontkit`) and `@react-pdf/renderer` (any font via `Font.register()`) work unmodified. Cost is the gap — $20/mo flat for Pro (Hobby is non-commercial only for an agency tool). `@astrojs/netlify` v6.5.0–6.5.1 has SSR/Edge regressions ([withastro/astro#14087](https://github.com/withastro/astro/issues/14087)) — pin away from those versions if swapped to.

#### 3. Render

GA MCP, $7/mo Starter (no realistic free tier for SSR — free spins down after 15 min idle with 30–60 s cold start), always-on Node container that's the simplest mental model and most permissive PDF environment. Future swap to Puppeteer/Playwright stays in scope without a platform move. Trade-off: no scale-to-zero on paid, so you pay for warm idle 24/7.

## Anti-Bias Cross-Check: Cloudflare Workers + Static Assets

### Devil's Advocate — Weaknesses

1. **`@astrojs/cloudflare` v13 removed Pages support.** Tech-stack frontmatter still says `cloudflare-pages`. Every guide older than late-2025 describes a deploy path that no longer works with the pinned adapter. The agent will follow them and produce broken `wrangler` configs until corrected — productivity tax the agent cannot self-diagnose.
2. **`@react-pdf/renderer` is effectively blocked on workerd** by `yoga-layout@^3.2.1` (WASM-only since 3.x; community asm.js downgrade patches reportedly still fail on Astro + CF Workers as of March 2026 per [react-pdf#2757](https://github.com/diegomura/react-pdf/issues/2757)). Locks the PDF library choice to `pdf-lib`, FormePDF, or Browser Rendering.
3. **`@pdf-lib/fontkit` does not bundle into a Worker** ([workers-sdk#8140](https://github.com/cloudflare/workers-sdk/issues/8140)). Custom fonts via `pdfDoc.registerFontkit(fontkit) → embedFont(woffBytes)` throws `registerFontkit is not a function` at runtime. Only standard 14 PDF fonts work with `pdf-lib` out of the box; custom typography requires a workaround (upstream `fontkit` instead of `@pdf-lib/fontkit`, build-time pre-embedding, or pivoting library).
4. **Free tier 10 ms CPU per request is tight for the PDF use case.** A simple text + small JPEG logo PDF lands roughly 5–15 ms of CPU on `pdf-lib` with standard fonts. Free will hold for early demo reports and silently break under real-shaped reports (≥30 plugin rows, larger logo). The failure mode at the margin is timeouts that don't reproduce in `astro dev`.
5. **Supabase service-role from a Worker is not just `pg`.** Direct `pg` driver connections to Supabase's host string silently misbehave from a Worker. Correct paths: `@supabase/supabase-js` over HTTP/PostgREST (the recommended default), or `pg` via Supabase's Supavisor pooler in transaction mode, or Hyperdrive (officially supports any Postgres, Supabase not named in docs).

### Pre-Mortem — How This Could Fail (180 words)

Six months later the MVP had quietly died. The build stalled in week 3 when the developer tried to render the agency's branded PDF and discovered `@pdf-lib/fontkit` would not bundle — every attempt to embed the agency typeface failed at deploy time. Plain `pdf-lib` worked but rendered Helvetica-only reports the PM refused to send to clients. Switching to Cloudflare Browser Rendering recovered the typography but added 1.5 s per Save and pushed past the 5 s NFR. Meanwhile the agent kept reading 2024 tutorials and producing `@astrojs/cloudflare`-with-Pages configs that no longer worked; every other session began with "fix the deployment target." Supabase migrations run from a Worker intermittently timed out because the agent had wired direct `pg` connections instead of the Supavisor pooler. By week 5 the developer considered porting to Netlify Node Functions — `@react-pdf/renderer` would have worked out of the box — but the 3-week budget was already spent. The agency rejoined ManageWP's monthly subscription and the project became a $0 line item in the post-mortem.

### Unknown Unknowns

- **Agent training data is heavily Cloudflare Pages-biased.** Most Astro + CF guides predate the v13 adapter shift. The agent doesn't know it's giving stale advice. CLAUDE.md / AGENTS.md need an explicit "Workers, not Pages" correction near the top.
- **Cloudflare's "Pages auto-migrates to Workers when zero-breakage is possible"** is announced direction without a published date. A project that deploys to Pages today (because tutorials still describe it) may be auto-migrated mid-build. Probably harmless, but a moving target.
- **HTML→PDF on workerd cannot use Puppeteer / Playwright.** The natural escalation path on any Node container is `npm install puppeteer`. On Workers it's "Browser Rendering as a separate paid product with separate quotas" — a cost gate that may not be obvious until you reach for it.
- **Astro's Cloudflare adapter runs real workerd locally via the Vite plugin in dev** — so `astro dev` is correct, `wrangler dev` is redundant. But every error/stack-trace is workerd-flavored, not Node-flavored, and debugging patterns differ subtly.
- **Windows + Wrangler auth.** `CLOUDFLARE_API_TOKEN` must carry Pages-or-Workers scope; PowerShell's `$env:VAR` is session-scoped. From a fresh terminal `wrangler` will silently fall through to interactive `wrangler login` (browser pop-up). Fixable once, but it bites the agent's deploy automation specifically.

## Operational Story

- **Preview deploys**: every push to a non-default branch on the connected GitHub repo produces a Workers preview URL via Workers Builds (the CF-managed CI). Preview URLs are public; if any preview ever contains a real client PDF, gate previews with Cloudflare Access (free tier covers small teams). Fork PRs do not get previews on Workers Builds by default — that matches the single-agency operating model (no external contributors).
- **Secrets**: `wrangler secret put <NAME>` for the Workers Secrets Store. Per the PRD, `SHARED_USERNAME` and `SHARED_PASSWORD_HASH` (FR-001), `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_HMAC_KEY`, and email-sender credentials (Resend / Postmark) all live here. Rotation = re-run `wrangler secret put` and redeploy. Never in `.dev.vars` once production is live; never committed to the repo.
- **Rollback**: `wrangler rollback` reverts to the previous version instantly (no rebuild). Use `wrangler versions list` to pick a specific older version when more than one rollback is needed. Caveat — `wrangler rollback` does not roll back Supabase migrations, so any deploy that includes a migration needs a separately-scripted DB rollback (or a forward-fix).
- **Approval**: agent may unattendedly run `npm run build`, `wrangler deploy` (to staging or to a preview URL), `wrangler tail`, `wrangler secret list`, `wrangler versions list`. **Human-gated**: production deploy of a release containing a Supabase migration; `wrangler secret put` for `SUPABASE_SERVICE_ROLE_KEY`, `SHARED_PASSWORD_HASH`, or `SESSION_HMAC_KEY`; project deletion; account-level changes. Scoped API token (Workers + Pages only, no DNS, no Workers Secrets for unrelated projects, no billing) for the agent.
- **Logs**: `wrangler tail` streams live request logs. `wrangler deployments list` for deploy history. For structured queries, the `observability.mcp.cloudflare.com` MCP server exposes logs/analytics as typed tool calls — useful when the agent makes many discovery-style queries. Enable observability in `wrangler.jsonc` (`"observability": { "enabled": true }`) so logs are retained beyond the live stream.

## Risk Register

| # | Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|---|
| R1 | PDF library choice on workerd: `@react-pdf/renderer` blocked (yoga WASM), `@pdf-lib/fontkit` blocked, free-tier CPU tight for non-trivial PDFs | Devil's advocate / Pre-mortem | High | High | **Pick before first build.** Three workerd-safe paths: (a) `pdf-lib` with standard 14 PDF fonts + JPEG/PNG logo (cheapest, ugliest typography); (b) **FormePDF** (JSX/React component API, Rust→WASM core, confirmed Workers-compatible, MIT — closest replacement for `@react-pdf/renderer`); (c) **Cloudflare Browser Rendering `/pdf`** (most typographic freedom, ~1–2 s overhead per render, separate quotas). Decision goes into CLAUDE.md + agents.md before first build. |
| R2 | Stale `cloudflare-pages` references in tech-stack, agent training data, and 2024-era tutorials | Devil's advocate | High | Medium | Update `tech-stack.md` frontmatter to `deployment_target: cloudflare-workers`. Add a single-line rule near the top of CLAUDE.md / AGENTS.md: "Deploy via `wrangler deploy` (Workers Static Assets); do NOT use `wrangler pages deploy` or older `@astrojs/cloudflare` Pages config." |
| R3 | Free-tier 10 ms CPU exceeded under real reports | Devil's advocate / Research finding | Medium | Medium | Track p95 CPU via `wrangler tail` + the observability MCP during early reports. Upgrade to Workers Paid ($5/mo, 30 s CPU/req default) at the first sign of timeouts. Plan as "paid from day one" if FormePDF or Browser Rendering is the chosen PDF path. |
| R4 | Supabase service-role from Worker via direct `pg` silently misbehaves | Devil's advocate | Medium | High (intermittent data integrity) | Standard: `@supabase/supabase-js` over HTTPS / PostgREST. Migrations and seed scripts run from a local Node process against the Supabase host directly, never from a Worker. If direct SQL from a Worker becomes necessary, route via Supavisor pooler in transaction mode or Hyperdrive — never the bare Supabase Postgres host. |
| R5 | Cloudflare Pages auto-migration into Workers (announced, no date) | Unknown unknowns | Low | Low | Already deploying to Workers from day one — no exposure. Re-check the announcement quarterly via the Cloudflare changelog. |
| R6 | Cloudflare MCP servers labeled "shipped" but no formal GA badges | Research finding | Low | Low | Treat all 16 servers as beta-grade. Don't build automated production runbooks that hard-depend on a specific server's tool surface; use `wrangler` for anything destructive. |
| R7 | Windows + Wrangler interactive auth fallback breaks unattended agent deploys | Unknown unknowns | Medium | Low | Set `CLOUDFLARE_API_TOKEN` (Workers + Pages scope, no DNS, no billing) in the user's Windows persistent environment (`setx CLOUDFLARE_API_TOKEN ...` from an elevated PowerShell), not the session-scoped `$env:`. Verify with `wrangler whoami` from a fresh terminal before agent deploys. |
| R8 | Public preview URLs may contain real client PDFs / data | Pre-mortem implication | Low | High (data exposure) | Once the MVP holds real client data, gate Workers preview URLs with Cloudflare Access (free tier covers small teams). Do not paste preview URLs into shared channels. |

## Getting Started

Validated against the pinned versions: `@astrojs/cloudflare` v13+ targeting Workers Static Assets (NOT Pages), `astro@^5`, `wrangler` current (workerd dev via the Cloudflare Vite plugin).

1. **Pin the PDF library decision (R1) before any other infra step.** Update CLAUDE.md / AGENTS.md with the chosen library and a one-line "why this not @react-pdf/renderer" rationale. The remaining steps assume the choice is made.

2. **Fix the stale `cloudflare-pages` hint.** In `context/foundation/tech-stack.md` frontmatter, change `deployment_target: cloudflare-pages` to `deployment_target: cloudflare-workers`. Add to CLAUDE.md (one line, near the top): *"Deploy via `wrangler deploy` (Workers Static Assets). Do not use `wrangler pages deploy` or any `@astrojs/cloudflare` Pages config."*

3. **Install the Cloudflare adapter and Wrangler:**

   ```powershell
   npm install --save-dev wrangler
   npx astro add cloudflare
   ```

   This adds `@astrojs/cloudflare` (v13+) to the project and wires it into `astro.config.mjs`. Do not run `wrangler pages project create` — that command targets the legacy Pages path.

4. **Create `wrangler.jsonc` at the repo root** (the `npx astro add cloudflare` command may scaffold a starting version — verify it matches this shape):

   ```jsonc
   {
     "$schema": "https://json.schemastore.org/wrangler.json",
     "name": "maintenance-ledger",
     "main": "./dist/_worker.js/index.js",
     "compatibility_date": "2026-05-23",
     "compatibility_flags": ["nodejs_compat"],
     "assets": { "binding": "ASSETS", "directory": "./dist" },
     "observability": { "enabled": true }
   }
   ```

5. **Authenticate Wrangler on Windows (persistent, not session-scoped):**

   ```powershell
   # From an elevated PowerShell, once:
   setx CLOUDFLARE_API_TOKEN "<token-with-workers-and-pages-scope>"
   # Then reopen the terminal and verify:
   wrangler whoami
   ```

   Mint the token at `dash.cloudflare.com/profile/api-tokens` with the "Edit Cloudflare Workers" template, scoped to a single account, no DNS, no billing.

6. **Provision secrets** (these are the FR-001 + Supabase + email secrets the PRD calls out):

   ```powershell
   wrangler secret put SHARED_USERNAME
   wrangler secret put SHARED_PASSWORD_HASH
   wrangler secret put SESSION_HMAC_KEY
   wrangler secret put SUPABASE_URL
   wrangler secret put SUPABASE_SERVICE_ROLE_KEY
   wrangler secret put RESEND_API_KEY     # or POSTMARK_SERVER_TOKEN
   ```

7. **Run locally** — `astro dev` runs the real workerd runtime via the Cloudflare Vite plugin. Do NOT run `wrangler dev` (redundant for this adapter):

   ```powershell
   npm run dev
   ```

8. **Deploy to production:**

   ```powershell
   npm run build
   wrangler deploy
   ```

   Subsequent deploys: `wrangler deploy` (no flag needed). Rollback: `wrangler rollback` (one step back) or `wrangler versions list` + `wrangler versions deploy <id>` for older versions.

9. **Connect GitHub for preview deploys** (Workers Builds, in the Cloudflare dashboard): point at the repo, branch = `main` for production, all other branches → preview URLs. Add Cloudflare Access protection on preview URLs once real client data is in the MVP.

10. **Optional — wire up the Cloudflare docs MCP server** in `.mcp.json` (or your client config) so the agent can pull current Workers docs directly during implementation:

    ```json
    {
      "mcpServers": {
        "cloudflare-docs": { "url": "https://docs.mcp.cloudflare.com/mcp" }
      }
    }
    ```

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration (not applicable to Workers).
- CI/CD pipeline setup (Workers Builds is the default; explicit GitHub Actions workflow is a follow-up).
- Production-scale architecture (multi-region failover, HA, DR — out of MVP scope per the skill).
- PDF library selection (delegated to the build phase; R1 in the Risk Register lists the three workerd-safe candidates).
- Email-sender platform choice (Resend, Postmark, AWS SES — separate decision).
