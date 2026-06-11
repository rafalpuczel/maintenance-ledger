# Workerd runner spike — verdict

**Date**: 2026-06-02
**Timebox**: ~half a session (kept well under).

## Verdict: FALLBACK → `unstable_startWorker`

`@cloudflare/vitest-pool-workers` was **not adopted**. `unstable_startWorker`
(shipped inside the already-installed `wrangler@4.93.1`) boots the built
`@astrojs/cloudflare` worker cleanly with **no new dependency**, so the plan's
fallback is taken per its timebox rule ("if the spike hits the timebox without a
clean pool result, take the `unstable_startWorker` fallback and proceed").

Rationale for not spiking the pool further:
- It is uninstalled; adopting it needs an explicit dependency install (plan 3.8 +
  workflow rule require approval first).
- Its support for an **Astro SSR** app is undocumented — research flagged
  `withastro/astro#16029` and `workers-sdk#9521`. The fallback already gives a
  green, real-runtime signal, so the extra risk/setup buys nothing for Phase 1.
- The pool remains a future option to collapse these HTTP tests into in-process
  workerd tests (risks #1/#6 can revisit), but it is not on the critical path now.

## The config that worked (non-obvious)

The bare root `wrangler.jsonc` does **not** boot: its `main` is
`@astrojs/cloudflare/entrypoints/server` (the adapter *source* entry), which
`unstable_startWorker` reports as "entry-point file ... was not found".

The `@astrojs/cloudflare` build (`output: "server"`) emits a **split** layout:
- `dist/client/` — static assets (the `ASSETS` binding dir)
- `dist/server/entry.mjs` — the real worker entry
- `dist/server/wrangler.json` — an **adapter-generated** wrangler config with
  `main: entry.mjs`, `assets.directory: ../client`, the `SESSION` KV binding, and
  `no_bundle: true`.

→ Boot against the **generated** config, not the root one:

```js
import { unstable_startWorker } from "wrangler";
const worker = await unstable_startWorker({ config: "dist/server/wrangler.json" });
// worker.fetch(url, init) → Response ; worker.dispose() to tear down
```

Smoke assertions (spike success criteria, both passed):
- `GET /login` → **200** (public route)
- `GET /` → **302**, `Location: /login` (gate enforced → middleware is wired into
  the deployed entry, not just unit-tested)

## Gotchas hit

- **Build-first is mandatory.** The suite depends on `dist/server/` existing. Run
  `npm run build` before `npm run test:workers`. (The generated config + entry are
  build artifacts; a stale/missing `dist/` makes the boot fail with the
  entry-point error above.)
- **WASM cost is real but fine.** The worker bundles the 6.45 MiB
  `forme_bg.*.wasm` (FormePDF); total ~10.18 MiB. It boots in local mode without
  hitting the 10 MiB *gzipped* deploy cap (that cap is on the compressed upload,
  not the local boot). First `GET /login` took ~830 ms — boot/JIT warmup; keep the
  workers suite off the fast inner loop.
- **Secrets resolve from `.dev.vars` automatically.** Booting from
  `dist/server/wrangler.json` still picked up the project-root `.dev.vars` (the
  gate returned 302 only because `SESSION_HMAC_KEY` was readable). So the G7
  happy-path login can use the real `.dev.vars` credentials — no separate
  binding-seed needed for the auth secrets. KV `SESSION` is Miniflare-simulated
  locally (the real cloud `id` in the config is ignored in local mode).
- **Node module resolution**: the boot script must live **inside** the project
  tree (it imports `wrangler` from `node_modules`); a script under `/tmp` fails
  with `ERR_MODULE_NOT_FOUND`.

## Gotcha: Astro checkOrigin → 403 on form POSTs without a matching Origin

A valid-credentials POST to `/api/auth/login` first came back **403 Forbidden**,
not 302. Cause: Astro's default `security.checkOrigin` (on for `output: "server"`)
rejects a POST with a **form content-type**
(`application/x-www-form-urlencoded` / `multipart/form-data` / `text/plain`) when
the `Origin` header doesn't match the host — classic CSRF defense. A real browser
submitting the login form always sends a same-origin `Origin`, so the fix is to do
the same in the test: send `Origin: http://worker.test` (matching the host the
harness builds URLs against). This is faithful, not a workaround.

Note the asymmetry that initially masked it: the **G5** malformed-body test sends
`Content-Type: application/json` (NOT a form type), so checkOrigin skips it and the
request reaches the route's fail-closed catch (302) without an Origin header. Only
the **G7** form-encoded POST trips the check. Any future POST-route integration
test that submits a form must set `Origin`.

## Credentials: read from env, never hardcode (and injected `vars` do NOT override `.dev.vars`)

The G7 valid-login needs the plaintext password that matches `SHARED_PASSWORD_HASH`.
Two rules learned here:

1. **Never hardcode the secret in the committed test.** The plaintext lives only in
   gitignored `.dev.vars` as a dedicated `TEST_LOGIN_PASSWORD` key. A Vitest
   `setupFiles` (`test/load-dev-vars.ts`) loads `.dev.vars` into `process.env`; the
   test reads `process.env.TEST_LOGIN_PASSWORD` / `SHARED_USERNAME` and **skips**
   (`it.skipIf`) when absent (CI without local secrets). A first cut hardcoded the
   password and was correctly blocked before commit — don't repeat it.
2. **`unstable_startWorker({ vars })` does NOT override `.dev.vars` secrets.** A
   probe injected a throwaway `SHARED_USERNAME`/`SHARED_PASSWORD_HASH`/`PEPPER`/
   `SESSION_HMAC_KEY` via `vars` and logged in with the throwaway password → got
   `302 /login?error=` (rejected): the worker still read `.dev.vars`. So the
   hermetic "inject a throwaway credential" approach is not available with this
   runner; the test must use whatever credential `.dev.vars` actually holds. (For
   risks #1/#6, `vars` is still fine for *new* bindings like `SUPABASE_URL` that
   `.dev.vars` doesn't already define — it's the *override* that doesn't take.)

## Compatibility

- `wrangler` 4.93.1, Astro 6.3.1, `@astrojs/cloudflare` 13.5.0, Vitest 3.2.4 — no
  version conflict encountered on the `unstable_startWorker` path.
