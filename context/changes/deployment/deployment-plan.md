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

### A. Cloudflare CLI prerequisites — ✅ Done (2026-05-23)

OAuth session logged out, scoped API token minted, smoke-tested.  Token is **not yet persisted** — that's Phase 3's job (`setx` so new terminals see it). Current PowerShell sessions show `wrangler whoami` as *"You are not authenticated"* until then; expected.

- [x] **Node version** ≥ 18 (`.nvmrc` pins `22.14.0`).
- [x] **Wrangler reachable** — `4.93.1` (update available to `4.94.0`; not blocking).
- [x] **Cloudflare account** — `rpuczel@gmail.com`, ID `cb3c1f3a9930d60a8d18a74836216769`.
- [x] **2FA enabled.**
- [x] **OAuth session logged out** (`wrangler logout`).
- [x] **Scoped API token minted** ("Edit Cloudflare Workers" template, account-scoped, no DNS / billing).
- [x] **Smoke test passed** (token returned the account info and Workers-only permission list when injected via `$env:` in a one-off terminal).

### B. Supabase prerequisites — ⬜ Pending

The project uses Supabase as Postgres + Storage, accessed from Workers via `@supabase/supabase-js` over HTTPS (R4: never the direct `pg` driver). **Topology: hybrid** (session decision) — local Docker Supabase for `npm run dev`, separate cloud project for production. Matches AGENTS.md line 36 default; catches env-specific bugs cheaply; dev mistakes can't hit the prod database.

- [x] **Topology decided: hybrid** (local Docker for dev, cloud for prod).
- [x] **All Supabase credentials gathered** (2026-05-23): cloud project URL, `sb_secret_...` key, Project Ref, plus local Supabase running with `service_role` key captured for `.dev.vars`.
- [ ] **Cloud project — create** at `app.supabase.com/projects` → **New project**:
  - Organization: existing or new
  - Name: `maintenance-ledger`
  - Database password: generate via Supabase's button, save to password manager (recovery only — the app uses the service-role key, not this password)
  - Region: pick the one closest to your Workers default (Cloudflare's edge means region matters less for read latency than for write round-trips; West EU / East US are safe defaults)
  - Wait ~2 min for provisioning
- [ ] **Cloud project — grab credentials** from Settings → API. **Use the new key system** (`sb_publishable_...` / `sb_secret_...`), not legacy `anon` / `service_role` — Supabase deprecated the legacy pair in July 2025 (individually revocable, multiple secret keys per project for zero-downtime rotation, no JWT-signing-secret coupling). If the dashboard only shows legacy keys, click **"Migrate API keys"** to enable the new pair (or POST to `/v1/projects/{ref}/api-keys` per the platform docs).
  - **Project URL** (e.g. `https://abcd1234.supabase.co`) → becomes `SUPABASE_URL`
  - **Secret key** (`sb_secret_...`) → becomes `SUPABASE_SECRET_KEY` (bypasses RLS — Worker-only, never bundled to the client)
  - **Publishable key** (`sb_publishable_...`) → becomes `SUPABASE_PUBLISHABLE_KEY` only if the client-side React code ever talks directly to Supabase. PRD doesn't require client-side Supabase access for the MVP; skip provisioning unless/until needed.
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
- [ ] **Start local Supabase via Docker** — Docker Desktop must be running, ~7 GB RAM allocated (Docker settings → Resources):
  ```powershell
  npx supabase start
  ```
  First run pulls ~5 GB of images (~10 min on a fast connection). On success it prints local URLs and keys — copy `API URL` and `service_role key` into `.dev.vars` (Phase 2). To shut down later: `npx supabase stop`.
  Edge cases:
  - *"Cannot connect to the Docker daemon"* — Docker Desktop isn't running, or your user isn't in the `docker-users` group on Windows
  - Port conflicts (54321/54322/54323) — `npx supabase stop --no-backup` then `npx supabase start`; if persistent, change ports in `supabase/config.toml`
  - WSL2 backend recommended over Hyper-V on Windows for memory efficiency
  - Local CLI still emits legacy JWT-based `anon`/`service_role` keys (not `sb_publishable_/sb_secret_` yet) — that's expected; `.dev.vars` uses the legacy local key for dev, prod uses the new `sb_secret_...` from the cloud project
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

### Phase 0 — Pre-flight (manual, human-only) — ✅ Done (2026-05-23)

- [x] **Worker name: rename to `maintenance-ledger`** (applied in Phase 2 — update `wrangler.jsonc` `name`).
- [x] `SESSION_HMAC_KEY` generated (32 random bytes, base64) and saved to password manager.
- [x] `SHARED_PASSWORD_HASH` generated via `bcryptjs.hashSync(pw, 12)` in Node REPL, verified round-trip, saved to password manager. **⚠️ Superseded by F-01 (shared-credential-auth):** bcrypt was dropped for a peppered Web Crypto HMAC (10 ms free-tier CPU limit). Re-mint as `base64url(HMAC-SHA256(password, SHARED_PASSWORD_PEPPER))` and provision the new `SHARED_PASSWORD_PEPPER` secret before the next prod deploy.
- [x] **Side effect**: `bcryptjs` added to `package.json` dependencies. **⚠️ Superseded by F-01:** the login handler uses Web Crypto HMAC, not bcrypt; `bcryptjs` is now unused and is removed in F-01's Phase 3 dependency cleanup.

---

### Phase 1 — Reconcile contracts (R2 mitigation) — ✅ Done (2026-05-23)

Stop the agent reading stale "Pages" hints on future sessions.

- [x] **Edit** `context/foundation/tech-stack.md` frontmatter: `deployment_target: cloudflare-pages` → `cloudflare-workers`. Also fix the "Why this stack" paragraph that still says *"Cloudflare Pages is the starter default"* — change to *"Cloudflare Workers (Static Assets) — see `infrastructure.md` for the Pages-vs-Workers analysis"*.
- [x] **Add to `CLAUDE.md`** (new section near top, inside or below the 10x-cli skill block — keep skill block intact):
  ```markdown
  ## Project rules (load-bearing)
  - **Deploy via `wrangler deploy`** (Workers Static Assets). NEVER `wrangler pages deploy` — `@astrojs/cloudflare` v13 removed Pages support.
  - **PDF rendering uses FormePDF** (workerd-safe, JSX/React API). `@react-pdf/renderer` is blocked on workerd (yoga-layout WASM). `@pdf-lib/fontkit` does not bundle on Workers (workers-sdk#8140) — if you ever fall back to `pdf-lib`, you're locked to the 14 standard fonts.
  - **Supabase from Workers = `@supabase/supabase-js` over HTTP/PostgREST.** Never import `pg` from a Worker. Migrations and seed scripts run from a local Node process against the Supabase host directly.
  - **Supabase keys = `sb_publishable_...` / `sb_secret_...`** (new system, July 2025+). Never use legacy `anon` / `service_role` for new code. Server-side (Worker) uses `SUPABASE_SECRET_KEY`; client-side (only if needed) uses `SUPABASE_PUBLISHABLE_KEY`.
  - **CPU budget**: Workers free tier is 10 ms/req. PDF generation will push past this on real-shaped reports — plan to upgrade to Workers Paid ($5/mo, 30s/req) at the first p95 timeout. Watch via `wrangler tail` + observability dashboard.
  ```
- [x] **Verify** `AGENTS.md` line 3 (`deployed to Cloudflare Workers via @astrojs/cloudflare`) and line 37 (`npx wrangler deploy`) — already correct, no edit needed.
- [x] **Decide** what to do with the staged `CLAUDE.md.scaffold` deletion already in git — keep the deletion, the scaffold is superseded.

---

### Phase 2 — Local integration (env schema, deps, dev.vars) — ✅ Done (2026-05-23)

Land all dependency/config changes locally before touching production.

- [x] **Edit** `astro.config.mjs` env schema. Current block (lines 17–22) only declares `SUPABASE_URL` and `SUPABASE_KEY` as optional. Replace with the full surface, marking all six as `access: "secret"`:
  ```ts
  env: {
    schema: {
      SUPABASE_URL: envField.string({ context: "server", access: "secret" }),
      SUPABASE_SECRET_KEY: envField.string({ context: "server", access: "secret" }),
      SHARED_USERNAME: envField.string({ context: "server", access: "secret" }),
      SHARED_PASSWORD_HASH: envField.string({ context: "server", access: "secret" }),
      SESSION_HMAC_KEY: envField.string({ context: "server", access: "secret" }),
      RESEND_API_KEY: envField.string({ context: "server", access: "secret" }),
    },
  },
  ```
  **Naming alignment note:** existing code and AGENTS.md (line 37) reference legacy `SUPABASE_KEY`. The plan adopts Supabase's current recommended naming: `SUPABASE_SECRET_KEY` (matches the `sb_secret_...` key prefix). Rename everywhere: grep `src/` for `SUPABASE_KEY` and replace with `SUPABASE_SECRET_KEY`; update AGENTS.md line 37; update `infrastructure.md` references from `SUPABASE_SERVICE_ROLE_KEY` to `SUPABASE_SECRET_KEY` (the infra doc was written before the July 2025 Supabase key migration).
- [x] **Bump** `wrangler.jsonc` `compatibility_date` from `2026-05-08` to `2026-05-23` (matches infra research date; picks up any workerd fixes shipped since 5-08).
- [x] **`wrangler.jsonc` `name` renamed** `10x-astro-starter` → `maintenance-ledger` (Phase 0 chose rename).
- [x] **Install** runtime deps (verified 2026-05-23: `formepdf` is published as scoped packages, not a single bare name):
  ```powershell
  npm install @formepdf/react @formepdf/core resend
  ```
  `@formepdf/react` = JSX components; `@formepdf/core` = `renderDocument()` returning `Uint8Array`. Optional later: `@formepdf/tailwind` for Tailwind class support in PDF templates.
  Edge case — if a future install fails (Rust→WASM build snag), fall back per R1 to either (a) pin a specific version known to bundle on workerd, or (b) escalate to Cloudflare Browser Rendering and accept the 1–2 s latency.
- [x] **Created `.dev.vars`** at repo root (gitignored — `.gitignore` line 26 covers it). Placeholders in place; user fills in real values from password manager + `npx supabase start` output:
  ```
  SUPABASE_URL=...
  SUPABASE_SECRET_KEY=sb_secret_...
  SHARED_USERNAME=admin
  SHARED_PASSWORD_HASH=...        # F-01: base64url HMAC-SHA256(password, pepper), NOT bcrypt
  SHARED_PASSWORD_PEPPER=...      # F-01: base64, 32 random bytes
  SESSION_HMAC_KEY=...
  RESEND_API_KEY=...
  ```
  For local dev with `npx supabase start`, paste the local instance's `service_role` key here — the local CLI doesn't yet emit `sb_secret_...` keys (it still uses legacy JWT keys). Production uses the new `sb_secret_...` from the cloud project's API page.
  Use real Supabase credentials (project already exists per Phase 0); placeholders are fine for `SHARED_*` and `RESEND_API_KEY` in dev.
- [x] **Ran `npx astro sync`** — passed, types regenerated.
- [x] **Ran `npm run lint`** — passed (only pre-existing parser-option warnings).
- [x] **Ran `npm run build`** — passed, Worker bundle in `dist/_worker.js/`, server built in 9.04 s.
- [x] **`npm run dev` verified by user** — workerd boots with real Supabase + secrets loaded from `.dev.vars`.

---

### Phase 3 — Wrangler authentication on Windows (R7 mitigation) — ✅ Done (2026-05-23)

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

### Phase 4 — Production secrets (HUMAN-GATED) — ✅ Done (2026-05-23) — RESEND_API_KEY deferred to Prereq C

**Order-of-operations note**: Phase 5 step 1 (first `wrangler deploy`) was executed before Phase 4 to create the `maintenance-ledger` worker entity on Cloudflare (workaround for the `wrangler secret put` "Worker not found" edge case noted in the original Phase 4 spec). First deploy URL: **https://maintenance-ledger.rpuczel.workers.dev**, version `41098f91-d0ea-4197-ae64-2da8a5bc2d57`. Adapter auto-provisioned KV namespace `SESSION` (id `6da5b0d1c8484b98820b32b83d2a2e5e`). All 21 routes loaded, gzip bundle 391 KiB (under free-tier 3 MiB compressed limit).

Each `wrangler secret put` prompts for the value on stdin — paste, hit Enter, value is encrypted to the Workers Secrets Store. **Do not paste secret values into chat.** Run each command yourself, one at a time.

Pre-check: `wrangler.jsonc` `name` matches the worker you want secrets attached to. If you renamed in Phase 2, this is `maintenance-ledger`; otherwise `10x-astro-starter`.

- [ ] `wrangler secret put SUPABASE_URL` (paste Supabase project URL)
- [ ] `wrangler secret put SUPABASE_SECRET_KEY` (paste the `sb_secret_...` key from Supabase dashboard → Settings → API → **new** keys section)
- [ ] `wrangler secret put SHARED_USERNAME` (paste the chosen username, e.g. `admin`)
- [ ] `wrangler secret put SHARED_PASSWORD_HASH` (F-01: paste the `base64url(HMAC-SHA256(password, pepper))` value — NOT a bcrypt hash; the Phase 0 bcrypt value is superseded)
- [ ] `wrangler secret put SHARED_PASSWORD_PEPPER` (F-01: paste the base64 32-byte pepper used to mint the hash above)
- [ ] `wrangler secret put SESSION_HMAC_KEY` (paste the base64 random key from Phase 0)
- [ ] `wrangler secret put RESEND_API_KEY` — **deferred** until Prereq C is done. `RESEND_API_KEY` made `optional: true` in `astro.config.mjs` env schema so the worker doesn't 500 without it (re-deployed as version `42739f9c-2921-4991-b46d-92bdfab1059c`). Email features will need this set before FR-019/020 are wired.
- [ ] **Verify all seven exist:**
  ```powershell
  wrangler secret list
  ```
  Expected: seven entries (F-01 added `SHARED_PASSWORD_PEPPER`), names only (values are not shown — that's correct).
- [x] **Edge case mitigated** — first `wrangler deploy` ran before Phase 4 to register the worker entity (see Phase 4 header note). Subsequent `wrangler secret put` calls won't hit "Worker not found".

---

### Phase 5 — First production deploy — ✅ Done (2026-05-23)

- [x] `npm run build` — verified twice (initial + after RESEND_API_KEY optional change).
- [x] `wrangler deploy` — succeeded. URL: **https://maintenance-ledger.rpuczel.workers.dev**. Latest version: `42739f9c-2921-4991-b46d-92bdfab1059c`.
- [x] **Smoke test passed** (HTTP probes, 2026-05-23):
  - [x] GET `/` → 200, root page renders
  - [x] GET `/dashboard` → 302 to `/auth/signin` (middleware runs, Supabase client created, R4 verified)
  - [x] GET `/auth/signin` → 200
  - [x] GET `/nonexistent` → 404 (asset fallback works)
  - [ ] POST login with FR-001 shared credential → deferred (FR-001 implementation not yet built; starter ships with Supabase Auth flow, not the planned HMAC cookie flow)
- [ ] **Edge case — CPU exceeded (R3)**: if a route returns 1101 / "CPU exceeded" in tail logs, you've hit the 10 ms free-tier ceiling. Two options: (a) upgrade to Workers Paid in dashboard (`$5/mo`, takes effect immediately, raises to 30s), (b) profile the offending route and reduce work. Don't paper over with retries.
- [ ] **Edge case — `nodejs_compat` missing**: if you see *"Module not found: node:..."* errors, `compatibility_flags: ["nodejs_compat"]` was dropped. Verify it's in `wrangler.jsonc`.
- [ ] **Edge case — env binding undefined**: if `import.meta.env.SUPABASE_URL` is undefined at runtime, the env schema in `astro.config.mjs` didn't match the secret name. They must match exactly (case-sensitive).

---

### Phase 6 — Wire Workers Builds (canonical deploy) + post-deploy hardening — 🟡 Mostly done (2026-05-23)

**Deploy mechanism going forward** (user decision, 2026-05-23): **Cloudflare Workers Builds**, triggered by push to `master`. Manual `wrangler deploy` from a developer machine becomes the emergency-only / local-test path — NOT the default. Subsequent feature merges deploy themselves.

- [x] **Saved** deploy artifacts into `context/deployment/deploy-plan.md` (created 2026-05-23 — audit trail):
  - Worker name: `maintenance-ledger`
  - Production URL: `https://maintenance-ledger.rpuczel.workers.dev`
  - First version ID: `41098f91-d0ea-4197-ae64-2da8a5bc2d57` (2026-05-23, initial)
  - Second version ID: `42739f9c-2921-4991-b46d-92bdfab1059c` (2026-05-23, RESEND_API_KEY made optional)
  - Account ID: `cb3c1f3a9930d60a8d18a74836216769`
  - Auto-provisioned: KV namespace `SESSION` (id `6da5b0d1c8484b98820b32b83d2a2e5e`)
- [x] **Connected GitHub via Cloudflare Workers Builds** (2026-05-23, user):
  - GitHub OAuth: authorize Cloudflare to access the `10xdev-project` repo (one-time)
  - **Production branch: `master`** (this repo's default; not `main` — see `.github/workflows/ci.yml` line 5)
  - **Preview branches: all non-`master` branches** (Workers Builds default)
  - **Build configuration** (Workers Builds auto-detects Astro; override only if defaults are wrong):
    - Root directory: `/` (repo root)
    - Build command: `npm run build`
    - Build output: `dist` (the adapter writes `dist/_worker.js/` + `dist/client/`)
  - **Build-time environment variables**: none required. `astro:env` `secret` fields validate at runtime, not build-time, and `.dev.vars` isn't shipped to the build container. The first remote build should succeed without setting anything here.
  - Save. The first Workers Build runs immediately against current `master`; subsequent pushes auto-build + deploy.
- [x] **`ci.yml` kept as PR pre-merge gate** (decision 2026-05-23): `SUPABASE_*` env block removed (build compiles without runtime secrets). Workers Builds handles deploy. `AGENTS.md` line 42 updated to reflect new split (CI = lint/build only, Workers Builds = deploy).
- [x] **First Workers Build verified** — push of commit `558ad18` to `master` (2026-05-23 17:33 UTC) triggered Workers Build that landed as version `16400f2a-5426-4674-9164-95607c36f004`. URL still 200 after the deploy. **Auto-deploy loop verified end-to-end** in the same push (the production change was the trigger — no need for a separate trivial-change test).
- [ ] **Edge case — preview URLs are public** (R8): until the MVP has real client data, this is fine. **Before** the first real client PDF lands in any preview, gate previews with Cloudflare Access (Zero Trust → Access → Applications → Add → "Self-hosted", point at `*-maintenance-ledger.<your-subdomain>.workers.dev`, free tier covers small teams). Workers Builds preview URLs use a hashed branch-name prefix.
- [ ] **Edge case — fork PRs don't get preview builds by default** on Workers Builds (security: forks can't be trusted to read repo secrets). Matches the solo-agency operating model; no contributor PRs from outside the org expected.
- [ ] **Verify rollback works** (don't wait for the first incident):
  ```powershell
  npx wrangler versions list
  npx wrangler rollback   # back to previous version
  npx wrangler rollback   # forward again (rolls back the rollback)
  ```
  Sanity check the URL still serves after the rollback dance. `wrangler rollback` still works after Workers Builds is wired — it's a deploy-version operation, independent of the build trigger.
- [ ] **Optional but recommended** — wire the Cloudflare docs MCP server in `.mcp.json` (gives the agent live Workers docs on demand):
  ```json
  {
    "mcpServers": {
      "cloudflare-docs": { "url": "https://docs.mcp.cloudflare.com/mcp" }
    }
  }
  ```

---

### Phase 7 — Risk register verification map — 🟡 6 of 8 done (2026-05-23)

One checkbox per risk in `infrastructure.md`. Tick when the mitigation is observably in place.

- [x] **R1** PDF library: `@formepdf/react` + `@formepdf/core` installed (`package.json` deps). End-to-end render verification deferred — to be exercised when the first PDF route is built (will become a real signal, not a throwaway smoke test). Documented in CLAUDE.md project rules.
- [x] **R2** Pages-era hints: `tech-stack.md` frontmatter updated (`deployment_target: cloudflare-workers`); "Why this stack" paragraph rewritten; CLAUDE.md project-rules section added (Phase 1); AGENTS.md already Workers-aware.
- [x] **R3** Free-tier CPU: observability enabled in `wrangler.jsonc` (`"observability": { "enabled": true }`). Current bundle is 391 KiB gzipped (under 3 MiB free-tier limit), startup 19 ms. CPU usage tracking starts when first real PDF route lands; tail via `wrangler tail` + Cloudflare dashboard observability panel.
- [x] **R4** Supabase from Worker: `@supabase/supabase-js` + `@supabase/ssr` are the only Supabase deps; no `pg` package. `src/lib/supabase.ts` uses `createServerClient` (HTTPS/PostgREST). Live-verified by the `/dashboard → /auth/signin` 302 smoke test.
- [x] **R5** Pages auto-migration: N/A — deployed to Workers from day one.
- [x] **R6** Cloudflare MCP beta-grade: no MCP server connected; all ops go through `wrangler` CLI.
- [x] **R7** Windows auth: `CLOUDFLARE_API_TOKEN` persisted via `setx` (53-char scoped Workers token), verified via `wrangler whoami` in a fresh terminal (Phase 3).
- [ ] **R8** Preview URLs: tracked, Access protection **scheduled** before first real client data lands. Workers Builds is now creating preview URLs on non-`master` branches — they're public until you wire Cloudflare Access on `*-maintenance-ledger.<your-subdomain>.workers.dev`.

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
