# Cloudflare Workers Integration & First Deploy

## Context

`maintenance-ledger` is an Astro 6 + React 19 + Supabase SSR app for an agency producing branded maintenance-report PDFs (PRD: FR-001 shared-credential auth, FR-017 PDF on Save, FR-019/020 emailed PDF to PM + client). `/10x-infra-research` picked **Cloudflare Workers + Static Assets** (`context/foundation/infrastructure.md`), but the project still carries Pages-era hints and the env / secrets surface is half-wired.

This plan reconciles the contracts, finishes the local integration, provisions production secrets, and performs the first `wrangler deploy` of a working shell — so subsequent feature work (PDF rendering, email send, settings UI) lands on a verified deployment baseline. Decisions locked this session: **PDF = FormePDF**, **Email = Resend**, **scope = integration + first deploy (auth page loads in prod)**. Cloudflare and Supabase accounts already exist.

Risks R1–R8 from `infrastructure.md` are addressed inline (each phase calls out which risk it mitigates and how) rather than treated as a separate workstream.

## Current State (verified 2026-05-23)

| Already in place | Still needed |
|---|---|
| `@astrojs/cloudflare` v13.5.0 installed | `tech-stack.md` says `cloudflare-pages` (R2) |
| `wrangler` v4.90.0 installed | `astro.config.mjs` env schema is missing 4 of 6 secrets |
| `wrangler.jsonc` already Workers-shaped (assets binding, observability on) | `compatibility_date: 2026-05-08` lags infra recommendation by ~2 weeks |
| `astro.config.mjs` has `output: "server"` + `adapter: cloudflare()` | No FormePDF or Resend SDK installed |
| `AGENTS.md` already says "Cloudflare Workers via `@astrojs/cloudflare`" + `npx wrangler deploy` | No `.dev.vars`; no production secrets provisioned |
| `@supabase/supabase-js` + `@supabase/ssr` installed (R4 path already correct) | `CLAUDE.md` has only skill metadata — no project rules pinning Workers/FormePDF/PostgREST guidance |
| Git is clean (only intentional staged AGENTS.md + CLAUDE.md changes) | No Windows `CLOUDFLARE_API_TOKEN` configured (R7) |

## Prerequisites

One-time external setup. Until every box here is ticked, Phases 0–6 will hit avoidable failures (auth popups, missing project IDs, "permission denied" on `supabase link`, etc.). Order matters: Cloudflare → Supabase → Resend. Re-running any step is safe.

### A. Cloudflare CLI prerequisites — ⬜ Pending

- [ ] **Node version** ≥ 18 (project pins **22.14.0** in `.nvmrc`). Verify:
  ```powershell
  node --version
  ```
  Edge case — if you use `nvm-windows`, run `nvm use 22.14.0` and confirm it persists in new terminals. Wrangler's bundled workerd binary downloads on first run (~50 MB); behind a corporate proxy, set `HTTPS_PROXY` *before* the first `wrangler` invocation.
- [ ] **Wrangler reachable** (already in devDeps, no install needed — call via `npx`):
  ```powershell
  npx wrangler --version
  ```
  Expected: `4.90.0` or higher. If the project deps aren't installed yet: `npm ci` first.
- [ ] **Cloudflare account exists** — sign up at `dash.cloudflare.com/sign-up` if not. Free is fine; Workers Paid ($5/mo) is a Phase 5 upgrade decision, not a prerequisite. Record the **Account ID** (dashboard right sidebar, "Account ID" — needed later if you script it into `wrangler.jsonc`).
- [ ] **Pick an auth mode** — there are two; the project uses **API token** because the agent runs unattended:
  - **API token (recommended, used by this plan)** — minted in Phase 3, set via Windows `setx` so `wrangler` reads it from the environment without browser interaction. R7 mitigation.
  - **Browser OAuth (`wrangler login`)** — interactive, opens a browser tab, stores creds in `~/.config/.wrangler/config/default.toml`. Fine for one-off human use but **breaks unattended agent deploys** the moment the token expires. Do not use as the primary path.
- [ ] **Confirm 2FA is enabled** on the Cloudflare account (Account → Members → 2FA). Tokens minted under a 2FA account have a much smaller blast radius if leaked.
- [ ] **Mint the API token now** *(this is the Phase 3 minting step pulled forward into prereqs — same instructions, persistence step stays in Phase 3)*:
  - `dash.cloudflare.com/profile/api-tokens` → **Create Token** → template **"Edit Cloudflare Workers"**
  - Account resources: **Include → only this account**
  - Zone resources: **None** (no DNS edits)
  - Remove from the template if present: anything DNS/Billing/Stream/R2-write you don't actually need
  - Copy the token to a password manager — Cloudflare won't show it again
- [ ] **Smoke-test the token** without persisting it yet (one-off, session-scoped):
  ```powershell
  $env:CLOUDFLARE_API_TOKEN = "<paste-token>"
  npx wrangler whoami
  ```
  Expected: your email + account ID, no browser popup. If you see *"Authentication error \[code: 10000\]"* the token's scope is wrong — re-mint with the correct template. Close this terminal afterward — the `$env:` value vanishes, which is the right behavior (Phase 3 persists it properly).

### B. Supabase prerequisites — ⬜ Pending

The project uses Supabase as Postgres + Storage, accessed from Workers via `@supabase/supabase-js` over HTTPS (R4: never the direct `pg` driver). Decide once: **cloud-only**, **local-only**, or **hybrid** (cloud for prod, local for dev). Hybrid is the recommended path — the same one AGENTS.md (`Local Supabase: npx supabase start`) already assumes.

- [ ] **Pick the topology**:
  - **Hybrid (recommended)** — local Supabase via Docker for `npm run dev` + cloud project for production. Catches environment-specific bugs cheaply.
  - **Cloud-only** — single Supabase project, same instance for dev and prod. Simplest but every dev mistake hits the prod database; only acceptable for a true solo MVP with no real data yet.
  - **Local-only** — fine for prototyping; can't ship since the deployed Worker can't reach `localhost`.
- [ ] **Cloud project — create** at `app.supabase.com/projects` → **New project**:
  - Organization: existing or new
  - Name: `maintenance-ledger`
  - Database password: generate via Supabase's button, save to password manager (recovery only — the app uses the service-role key, not this password)
  - Region: pick the one closest to your Workers default (Cloudflare's edge means region matters less for read latency than for write round-trips; West EU / East US are safe defaults)
  - Wait ~2 min for provisioning
- [ ] **Cloud project — grab credentials** from Settings → API:
  - **Project URL** (e.g. `https://abcd1234.supabase.co`) → will become `SUPABASE_URL`
  - **service_role secret** → will become `SUPABASE_SERVICE_ROLE_KEY` (this bypasses RLS — Worker-only, never bundled to the client)
  - **anon public key** → only needed if the client-side React code ever talks directly to Supabase (PRD doesn't require this for MVP; skip unless used)
  - Save all to password manager — do not paste into chat
- [ ] **Cloud project — note the Project Ref** (Settings → General → "Reference ID", a short slug like `abcd1234`). Used by `supabase link`.
- [ ] **Supabase CLI** (already in devDeps as `supabase@^2.23.4` — no install needed):
  ```powershell
  npx supabase --version
  ```
  Edge case — `npx supabase` on Windows occasionally errors on long PATH lookups; if it hangs > 30 s, install globally: `npm install -g supabase`.
- [ ] **Supabase CLI — login** (browser OAuth, one-time):
  ```powershell
  npx supabase login
  ```
  Opens a browser; click "Authorize". Token is stored in `%APPDATA%\supabase\` (Windows) — survives terminal restarts.
- [ ] **Link local repo to cloud project** (required for `db push`, `migration list`, etc.):
  ```powershell
  npx supabase link --project-ref <ref-from-Settings-General>
  ```
  Will prompt for the database password from project creation. Sets `supabase/config.toml` `project_id`.
  Edge case — if you see *"failed to connect: dial tcp ... i/o timeout"*, your network blocks port 5432 to Supabase. Use Supabase's pooler endpoint (port 6543) by editing `supabase/config.toml`, or switch networks.
- [ ] **Local Supabase (only if hybrid/local topology)** — Docker Desktop must be running, ~7 GB RAM allocated (Docker settings → Resources):
  ```powershell
  npx supabase start
  ```
  First run pulls ~5 GB of images (~10 min on a fast connection). On success it prints local URLs and keys — copy `API URL`, `anon key`, `service_role key` into `.dev.vars` (Phase 2). To shut down later: `npx supabase stop`.
  Edge cases:
  - *"Cannot connect to the Docker daemon"* — Docker Desktop isn't running or your user isn't in the `docker-users` group on Windows
  - Port conflicts (54321, 54322, 54323) — `npx supabase stop --no-backup` then `npx supabase start`; if persistent, change ports in `supabase/config.toml`
  - WSL2 backend recommended over Hyper-V on Windows for memory efficiency
- [ ] **Confirm `supabase/migrations/` exists** (AGENTS.md says it should). If empty, that's fine — migrations land here in feature work. Schema design itself is out of scope for this deploy plan.

### C. Resend (email) prerequisites — ⬜ Pending

Resend handles FR-019/020 (PDF emails to PM + client). Account setup must be done before the API key can be provisioned to the Worker.

- [ ] **Account at `resend.com`** — free tier is 3k emails/mo, 100/day. Sign up with the email you want as the default `from` sender.
- [ ] **Verify a sending domain** — Resend → Domains → Add Domain → enter your sending domain → add the printed DNS records (SPF, DKIM, optional DMARC) at your DNS provider. Verification takes 1 min – 24 h depending on DNS TTL.
  Edge case — for MVP smoke tests you can send from `onboarding@resend.dev` (Resend's shared domain) without verifying anything, but production sends to client addresses must use your verified domain or they'll silently land in spam.
- [ ] **Mint an API key** — Resend → API Keys → Create API Key. Permissions: **Sending access** only (not "Full access"). Scope to your single domain. Copy once; save to password manager.

---

## Phase Tracker

Each phase has a status indicator and a checkboxed task list. Tick boxes as you complete tasks; flip the phase indicator (`⬜ Pending` → `🟡 In progress` → `✅ Done` → `❌ Blocked`) at the boundaries.

---

### Phase 0 — Pre-flight (manual, human-only) — ⬜ Pending

Project-specific decisions and secret generation. Run **after** Prerequisites A/B/C are all ticked.

- [ ] Decide deploy worker name: keep `10x-astro-starter` from `wrangler.jsonc` **or** rename to `maintenance-ledger` (matches frontmatter; recommended). Rename is irreversible-ish (creates a new subdomain), pick once.
- [ ] Generate `SESSION_HMAC_KEY`: 32 random bytes, base64. PowerShell one-liner:
  ```powershell
  [Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 } | ForEach-Object { [byte]$_ }))
  ```
  Save in password manager. **Never commit, never paste in chat.**
- [ ] Generate `SHARED_PASSWORD_HASH` for FR-001 (bcrypt or argon2 of the cleartext shared password). Use a local script — do not generate it inside the agent context.

---

### Phase 1 — Reconcile contracts (R2 mitigation) — ⬜ Pending

Stop the agent reading stale "Pages" hints on future sessions.

- [ ] **Edit** `context/foundation/tech-stack.md` frontmatter: `deployment_target: cloudflare-pages` → `cloudflare-workers`. Also fix the "Why this stack" paragraph that still says *"Cloudflare Pages is the starter default"* — change to *"Cloudflare Workers (Static Assets) — see `infrastructure.md` for the Pages-vs-Workers analysis"*.
- [ ] **Add to `CLAUDE.md`** (new section near top, inside or below the 10x-cli skill block — keep skill block intact):
  ```markdown
  ## Project rules (load-bearing)
  - **Deploy via `wrangler deploy`** (Workers Static Assets). NEVER `wrangler pages deploy` — `@astrojs/cloudflare` v13 removed Pages support.
  - **PDF rendering uses FormePDF** (workerd-safe, JSX/React API). `@react-pdf/renderer` is blocked on workerd (yoga-layout WASM). `@pdf-lib/fontkit` does not bundle on Workers (workers-sdk#8140) — if you ever fall back to `pdf-lib`, you're locked to the 14 standard fonts.
  - **Supabase from Workers = `@supabase/supabase-js` over HTTP/PostgREST.** Never import `pg` from a Worker. Migrations and seed scripts run from a local Node process against the Supabase host directly.
  - **CPU budget**: Workers free tier is 10 ms/req. PDF generation will push past this on real-shaped reports — plan to upgrade to Workers Paid ($5/mo, 30s/req) at the first p95 timeout. Watch via `wrangler tail` + observability dashboard.
  ```
- [ ] **Verify** `AGENTS.md` line 3 (`deployed to Cloudflare Workers via @astrojs/cloudflare`) and line 37 (`npx wrangler deploy`) — already correct, no edit needed.
- [ ] **Decide** what to do with the staged `CLAUDE.md.scaffold` deletion already in git — keep the deletion, the scaffold is superseded.

---

### Phase 2 — Local integration (env schema, deps, dev.vars) — ⬜ Pending

Land all dependency/config changes locally before touching production.

- [ ] **Edit** `astro.config.mjs` env schema. Current block (lines 17–22) only declares `SUPABASE_URL` and `SUPABASE_KEY` as optional. Replace with the full surface, marking all six as `access: "secret"`, required where appropriate:
  ```ts
  env: {
    schema: {
      SUPABASE_URL: envField.string({ context: "server", access: "secret" }),
      SUPABASE_SERVICE_ROLE_KEY: envField.string({ context: "server", access: "secret" }),
      SHARED_USERNAME: envField.string({ context: "server", access: "secret" }),
      SHARED_PASSWORD_HASH: envField.string({ context: "server", access: "secret" }),
      SESSION_HMAC_KEY: envField.string({ context: "server", access: "secret" }),
      RESEND_API_KEY: envField.string({ context: "server", access: "secret" }),
    },
  },
  ```
  **Naming alignment note:** AGENTS.md line 37 and existing code may reference `SUPABASE_KEY`. Infra doc uses `SUPABASE_SERVICE_ROLE_KEY` (explicit, less ambiguous). Decide once: rename everywhere to `SUPABASE_SERVICE_ROLE_KEY` (recommended), or keep `SUPABASE_KEY` and update infra. If renaming, grep `src/` for `SUPABASE_KEY` and update; also update AGENTS.md line 37.
- [ ] **Bump** `wrangler.jsonc` `compatibility_date` from `2026-05-08` to `2026-05-23` (matches infra research date; picks up any workerd fixes shipped since 5-08).
- [ ] **Optionally** update `wrangler.jsonc` `name` if Phase 0 chose to rename (`10x-astro-starter` → `maintenance-ledger`). Affects the deploy subdomain.
- [ ] **Install** runtime deps:
  ```powershell
  npm install formepdf resend
  ```
  Edge case — if `formepdf` install fails (npm name drift / Rust-WASM build snag), fall back per R1 to either (a) pin a specific version known to bundle on workerd (check `formepdf` GitHub Releases), or (b) escalate to Browser Rendering and accept the 1–2s latency.
- [ ] **Create `.dev.vars`** at repo root (gitignored — verify with `git check-ignore .dev.vars`):
  ```
  SUPABASE_URL=...
  SUPABASE_SERVICE_ROLE_KEY=...
  SHARED_USERNAME=admin
  SHARED_PASSWORD_HASH=...
  SESSION_HMAC_KEY=...
  RESEND_API_KEY=...
  ```
  Use real Supabase credentials (project already exists per Phase 0); placeholders are fine for `SHARED_*` and `RESEND_API_KEY` in dev.
- [ ] **Run** `npx astro sync` then `npm run dev`. Expected: workerd boots, env schema validates, no missing-secret errors. If `astro sync` fails on the new env fields, the schema syntax is wrong — fix before continuing.
- [ ] **Run** `npm run lint` and `npm run build` to confirm no type/build regressions from the env schema change.

---

### Phase 3 — Wrangler authentication on Windows (R7 mitigation) — ⬜ Pending

The agent's deploys will silently fall through to browser-popup login if this isn't done from a fresh terminal.

- [ ] **Mint** a scoped Cloudflare API token at `dash.cloudflare.com/profile/api-tokens`:
  - Template: **"Edit Cloudflare Workers"**
  - Account resources: **Include → only this account**
  - Zone resources: **None** (no DNS access needed)
  - Permissions to **remove** from the template if present: anything DNS-related, billing, Workers Secrets for unrelated projects
  - Copy the token once — Cloudflare won't show it again
- [ ] **Set persistently** in Windows env (NOT `$env:` which is session-scoped). From an **elevated PowerShell**:
  ```powershell
  setx CLOUDFLARE_API_TOKEN "<paste-token>"
  ```
- [ ] **Close and reopen** the terminal (mandatory — `setx` only affects new processes).
- [ ] **Verify**:
  ```powershell
  wrangler whoami
  ```
  Expected output: account email + account ID, no browser popup. If it opens a browser, the env var didn't stick — re-run `setx`, reopen, retry.
- [ ] **Note** Cloudflare Account ID from `wrangler whoami` output — needed if you ever script `account_id` into `wrangler.jsonc`.

---

### Phase 4 — Production secrets (HUMAN-GATED) — ⬜ Pending

Each `wrangler secret put` prompts for the value on stdin — paste, hit Enter, value is encrypted to the Workers Secrets Store. **Do not paste secret values into chat.** Run each command yourself, one at a time.

Pre-check: `wrangler.jsonc` `name` matches the worker you want secrets attached to. If you renamed in Phase 2, this is `maintenance-ledger`; otherwise `10x-astro-starter`.

- [ ] `wrangler secret put SUPABASE_URL` (paste Supabase project URL)
- [ ] `wrangler secret put SUPABASE_SERVICE_ROLE_KEY` (paste service-role key from Supabase dashboard → Settings → API)
- [ ] `wrangler secret put SHARED_USERNAME` (paste the chosen username, e.g. `admin`)
- [ ] `wrangler secret put SHARED_PASSWORD_HASH` (paste the bcrypt/argon2 hash generated in Phase 0)
- [ ] `wrangler secret put SESSION_HMAC_KEY` (paste the base64 random key from Phase 0)
- [ ] `wrangler secret put RESEND_API_KEY` (paste the Resend API key from Phase 0)
- [ ] **Verify all six exist:**
  ```powershell
  wrangler secret list
  ```
  Expected: six entries, names only (values are not shown — that's correct).
- [ ] **Edge case** — `wrangler secret put` requires the worker to exist on Cloudflare. If you've never deployed before, the first `wrangler secret put` will fail with *"Worker not found"*. Fix: do one throwaway `wrangler deploy` first (Phase 5 step 1), then come back to Phase 4. Re-run all six `secret put` commands afterward.

---

### Phase 5 — First production deploy — ⬜ Pending

- [ ] `npm run build` — verify `dist/` is produced, no errors, includes `_worker.js/`.
- [ ] `wrangler deploy` — **NOT** `wrangler pages deploy`. Expected output: a `*.workers.dev` URL and a version ID. Save both.
- [ ] **Open the deployed URL** in a browser. Expected: the auth page renders (or whatever the root route is). If you see a 500, jump to `wrangler tail` (next step) before retrying.
- [ ] In a second terminal: `wrangler tail` — streams live request logs. Keep open during smoke test.
- [ ] **Smoke test**:
  - [ ] GET `/` → 200, page loads
  - [ ] POST login with the FR-001 shared credential → session cookie set, redirected to protected route
  - [ ] Hit one protected route → 200 with session, 302 without
  - [ ] Any Supabase-backed read returns data (proves `@supabase/supabase-js` reaches Supabase from the Worker over HTTPS — R4 verified)
- [ ] **Edge case — CPU exceeded (R3)**: if a route returns 1101 / "CPU exceeded" in tail logs, you've hit the 10 ms free-tier ceiling. Two options: (a) upgrade to Workers Paid in dashboard (`$5/mo`, takes effect immediately, raises to 30s), (b) profile the offending route and reduce work. Don't paper over with retries.
- [ ] **Edge case — `nodejs_compat` missing**: if you see *"Module not found: node:..."* errors, `compatibility_flags: ["nodejs_compat"]` was dropped. Verify it's in `wrangler.jsonc`.
- [ ] **Edge case — env binding undefined**: if `import.meta.env.SUPABASE_URL` is undefined at runtime, the env schema in `astro.config.mjs` didn't match the secret name. They must match exactly (case-sensitive).

---

### Phase 6 — Post-deploy hardening — ⬜ Pending

- [ ] **Save** deploy URL + version ID + Cloudflare Account ID into `context/deployment/deploy-plan.md` (create the file if it doesn't exist — it's the audit trail per the lesson contract).
- [ ] **Connect GitHub** for preview deploys: Cloudflare dashboard → Workers & Pages → your worker → Settings → Builds & deployments → Connect to Git. Branch `master` (or `main`) = production; all other branches → preview URLs via Workers Builds.
- [ ] **Edge case — preview URLs are public** (R8): until the MVP has real client data, this is fine. **Before** the first real client PDF lands in any preview, gate previews with Cloudflare Access (Zero Trust → Access → Applications → Add → "Self-hosted", point at `*.<worker-name>.workers.dev`, free tier covers small teams).
- [ ] **Verify rollback works** (don't wait for the first incident):
  ```powershell
  wrangler versions list
  wrangler rollback   # back to previous version
  wrangler rollback   # forward again (rolls back the rollback)
  ```
  Sanity check the URL still serves after the rollback dance.
- [ ] **Optional but recommended** — wire the Cloudflare docs MCP server in `.mcp.json` (gives the agent live Workers docs on demand):
  ```json
  {
    "mcpServers": {
      "cloudflare-docs": { "url": "https://docs.mcp.cloudflare.com/mcp" }
    }
  }
  ```

---

### Phase 7 — Risk register verification map — ⬜ Pending

One checkbox per risk in `infrastructure.md`. Tick when the mitigation is observably in place.

- [ ] **R1** PDF library: FormePDF installed, a `/api/_pdf-smoke` test route renders a 1-page PDF on Workers. (Build this throwaway route as part of Phase 5 smoke; delete after.)
- [ ] **R2** Pages-era hints: `tech-stack.md` updated, CLAUDE.md project rules added (Phase 1).
- [ ] **R3** Free-tier CPU: observability enabled (already on per current `wrangler.jsonc`). Set a calendar reminder to check p95 CPU after first 50 real reports.
- [ ] **R4** Supabase from Worker: only `@supabase/supabase-js` imported in `src/`, no `pg` package added. `grep` `src/` for `from "pg"` returns nothing.
- [ ] **R5** Pages auto-migration: N/A — already on Workers from day one.
- [ ] **R6** Cloudflare MCP beta-grade: rule of thumb — destructive ops go through `wrangler`, never MCP.
- [ ] **R7** Windows auth: `wrangler whoami` works in a fresh terminal (Phase 3).
- [ ] **R8** Preview URLs: tracked, Access protection scheduled before first real client data lands (Phase 6).

---

## Critical Files

The plan modifies (or creates) only these files. Read each before editing.

- `context/foundation/tech-stack.md` — frontmatter + "Why this stack" paragraph
- `CLAUDE.md` — append project-rules section (do not disturb the `<!-- BEGIN @przeprogramowani/10x-cli -->` block)
- `astro.config.mjs` — env schema rewrite (lines 17–22)
- `wrangler.jsonc` — bump `compatibility_date`; optional `name` rename
- `package.json` — `npm install formepdf resend` will edit this
- `.dev.vars` — new file, gitignored
- `context/deployment/deploy-plan.md` — new file (Phase 6), the audit trail

**Do not touch** without prompting the user:
- `AGENTS.md` (already correct per Phase 1 verification)
- `.github/workflows/ci.yml` (CI tweaks for Workers deploy are post-MVP)
- Anything in `supabase/migrations/` (not in scope for deploy)
- `src/middleware.ts` / `src/lib/supabase.ts` (auth & DB wiring are feature work, not deploy)

## Verification

End-to-end success criteria, in order:

1. **Local**: `npm run dev` boots workerd cleanly, all env fields read from `.dev.vars`, login page loads at `http://localhost:4321/`.
2. **Build**: `npm run lint && npm run build` exits 0.
3. **Auth**: `wrangler whoami` in a fresh terminal returns account info (no browser popup).
4. **Secrets**: `wrangler secret list` shows all six expected names.
5. **Deploy**: `wrangler deploy` succeeds, prints a `*.workers.dev` URL and a version ID.
6. **Live**: that URL serves the auth page (200), POST-login sets a cookie, protected route hits Supabase and returns data.
7. **Rollback**: `wrangler rollback` reverts cleanly; `wrangler rollback` again restores.
8. **Risk map (Phase 7)**: all 8 checkboxes tickable, even if R3/R8 are "scheduled, not yet exercised."

If any of 1–6 fails: stop, diagnose with `wrangler tail`, fix the root cause, re-run from that step. **Do not** add retries, `--no-verify`, or skip-the-build shortcuts to push past errors.

## Out of Scope (defer)

- Building the PDF generation route itself (R1 verification uses a throwaway smoke route only)
- Wiring Resend send for FR-019/020 (only the API key is provisioned)
- Settings UI (FR-002/003) and the full report-edit/save flow (FR-017)
- GitHub Actions CI workflow tuning for Workers deploy (Workers Builds in the dashboard is the day-1 mechanism; explicit Actions workflow is a later cleanup)
- Custom domain on the worker (defaults to `*.workers.dev`; custom domain is a Phase 8+ decision)
- Production observability dashboards beyond what's wired by `observability.enabled` in `wrangler.jsonc`
