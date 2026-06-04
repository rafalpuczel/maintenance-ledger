# Resend-intercept + real-DB harness spike — verdict

**Date**: 2026-06-04
**Timebox**: ~half a session (kept under).
Builds on `context/changes/auth-gate-throttle/spike-notes.md` (the `unstable_startWorker` runner).

## Verdict: env-gated `fetch` seam in `send-report.ts`, `RESEND_BASE_URL` via `.dev.vars` (NOT harness `vars`)

The workerd route suite needs to drive the route's Resend call to a controlled
success / error / throw without touching the network (test-plan §7). `vi.mock`
can't reach the booted worker (separate process over HTTP), so the stub has to be
something the *worker* honors. Two things had to be discovered:

### 1. The Resend SDK cannot be redirected at call time

`resend@6` freezes its host in a **module-level `const`** read from
`process.env.RESEND_BASE_URL` at import:

```js
const baseUrl = ... process.env.RESEND_BASE_URL || "https://api.resend.com";
async fetchRequest(path, options) { return await fetch(`${baseUrl}${path}`, options); }
```

The `Resend` constructor takes **no** base-URL option. So there is no call-time
hook — by the time the route runs, `baseUrl` is already `api.resend.com`. A test
seam in our own code is the only reliable lever.

→ **Seam** (behavior-preserving, no new dependency): `src/lib/email/send-report.ts`
reads an optional `RESEND_BASE_URL` from `astro:env/server`. When set, it POSTs the
**same wire payload** the SDK would to `<base>/emails` via `fetch`; when unset
(production), it uses the `Resend` SDK byte-identically. Declared
`optional: true` in `astro.config.mjs` `env.schema`.

### 2. `unstable_startWorker({ vars })` does NOT populate `astro:env/server`

The first cut injected `RESEND_BASE_URL` through the harness:
`startTestWorker({ vars: { RESEND_BASE_URL: resend.baseUrl } })`. The intercept got
**0 calls** and the send 502'd — the worker never saw the var. Isolation probe:
putting the **same** `RESEND_BASE_URL` in `.dev.vars` (fixed port) instead → the
intercept was hit, `200 OK`, one row recorded. So:

- Runtime `vars` passed to `unstable_startWorker` reach the workerd **`env`
  binding**, but Astro's `astro:env/server` virtual module resolves from
  `.dev.vars`/build-time inputs, **not** runtime `vars`. A *new* var injected via
  `vars` does not surface in `astro:env/server` (a stronger form of the Phase-1
  finding that `vars` don't *override* `.dev.vars` secrets).
- **Workerd CAN reach `127.0.0.1:<port>`** — loopback to a Node http server in the
  test process works fine. Network reachability was never the problem.

→ **`RESEND_BASE_URL` is supplied via `.dev.vars`** (gitignored, test-only, unset in
prod — same channel as the auth secrets), pointing at the intercept's **fixed
port**. The intercept binds that port; tests `it.skipIf`/`describe.skipIf` when
`RESEND_BASE_URL` (or local Supabase / creds) is absent, so CI without local
secrets stays green.

## The intercept (`test/resend-intercept.ts`)

A tiny Node `http` server speaking the one route the SDK uses (`POST /emails`).
Records each captured send (to / from / subject / attachment base64) and lets a
test flip the next outcome to a Resend-shaped `{ id }` success or an error status,
so the route's record-on-success / 502 / partial-success paths are deterministic.
Bind a **fixed port** that matches `RESEND_BASE_URL` in `.dev.vars`.

## Real-DB layer (`test/workers-harness.ts` `createAdminClient`)

The worker reaches local Supabase via `.dev.vars` (`SUPABASE_URL` /
`SUPABASE_SECRET_KEY` auto-load on boot — **no harness wiring needed**, contrary to
the plan's assumption that `SUPABASE_URL` must be injected via `vars`; the same
`.dev.vars`-not-`vars` rule from finding #2 applies). `createAdminClient()` gives
the **test process** an admin Supabase client (HTTP/PostgREST, never `pg`) to seed
fixtures, count rows, and clean up. Returns `null` when the secrets are absent so
callers `skipIf` instead of crashing. Proven end-to-end: seed project+report+contact
→ PM send through the worker → exactly one `report_sends` row with the looked-up
recipient → cascade cleanup.

## Gotchas

- **`.dev.vars` needs `RESEND_BASE_URL=http://127.0.0.1:<fixed-port>`** for the send
  suite to run; without it the cases skip. Document in the harness/cookbook. It must
  be UNSET in production (the seam falls back to the real SDK).
- Form POSTs to the send route need a matching `Origin` + a `CF-Connecting-IP`
  (inherited from the Phase-1 login gotchas).
- Build first (`npm run test:workers` chains `astro build`); the suite boots
  `dist/server/wrangler.json`.
- Cascade: deleting the seeded `projects` row removes its `reports` and
  `report_sends` (FK `on delete cascade`); delete the `pm_contacts` row separately.

## Compatibility

- `wrangler` 4.93.1, Astro 6.3.1, `@astrojs/cloudflare` 13.5.0, `resend` 6.12.3,
  Vitest 3.2.4 — no conflict on the `.dev.vars` + seam path.
