// Shared workerd test harness for the real-runtime route integration suite.
//
// Lives OUTSIDE src/ on purpose: it imports `wrangler` (for unstable_startWorker),
// and `wrangler` pulls transitive deps (blake3-wasm) that cannot be bundled for
// workerd. If this file sat under src/, `astro build` would drag it into the SSR
// worker graph and fail with: Could not resolve "./node.js" from blake3-wasm.
// Keeping it in the top-level test/ dir keeps it off the Astro build entirely while
// the plain-Node Vitest suites still import it fine.
//
// Boots the BUILT @astrojs/cloudflare worker via `unstable_startWorker` (shipped
// inside wrangler — no extra dependency) and returns a `fetch` bound to it. This is
// the runner the Phase-1 spike adopted (see
// context/changes/auth-gate-throttle/spike-notes.md): the bare root wrangler.jsonc
// does NOT boot (its `main` is the adapter *source* entry); you must point at the
// adapter-GENERATED dist/server/wrangler.json, which has main=entry.mjs + the
// SESSION KV binding + assets.directory=../client.
//
// BUILD FIRST. The suite depends on `dist/server/` existing. Run `npm run build`
// (or `npm run test:workers`, which chains it) before importing this helper — a
// missing/stale dist makes the boot fail with "entry-point file ... was not found".
// Project-root `.dev.vars` is picked up automatically, so the auth secrets
// (SHARED_USERNAME / SHARED_PASSWORD_HASH / SHARED_PASSWORD_PEPPER /
// SESSION_HMAC_KEY) need no separate seeding. KV `SESSION` is Miniflare-simulated
// locally. Risks #1/#6 extend this by passing extra `vars` (e.g. SUPABASE_URL).

import { unstable_startWorker } from "wrangler";

// The adapter-generated config — NOT the root wrangler.jsonc. See the spike notes.
const GENERATED_CONFIG = "dist/server/wrangler.json";

// Mirror the worker's own fetch types (workerd's RequestInit/Response, which carry
// `cf` props and undici FormData) instead of the global DOM types — otherwise
// `astro check` flags a DOM-vs-workerd Response/RequestInit clash at the boundary.
type StartedWorker = Awaited<ReturnType<typeof unstable_startWorker>>;
type WorkerFetchInit = Parameters<StartedWorker["fetch"]>[1];
type WorkerFetchResponse = ReturnType<StartedWorker["fetch"]>;

export interface WorkerHarness {
  // fetch a path on the booted worker. `path` may be absolute or a path-only
  // string ("/login"); a dummy origin is supplied when one is missing. Defaults
  // to manual redirect handling so tests can assert 3xx + Location directly.
  fetch(path: string, init?: WorkerFetchInit): WorkerFetchResponse;
  // Tear the worker down. Always call in an afterAll/finally.
  dispose(): Promise<void>;
}

export interface StartWorkerOptions {
  // Extra/overriding bindings injected as worker `vars` (e.g. SUPABASE_URL for
  // risks #1/#6). The auth secrets already come from .dev.vars.
  vars?: Record<string, string>;
}

export async function startTestWorker(options: StartWorkerOptions = {}): Promise<WorkerHarness> {
  const worker = await unstable_startWorker({
    config: GENERATED_CONFIG,
    ...(options.vars ? { vars: options.vars } : {}),
  });

  return {
    async fetch(path, init) {
      const url = path.startsWith("http") ? path : `http://worker.test${path}`;
      // Manual redirect by default: the auth route asserts on 302 + Location,
      // which `fetch` would otherwise follow and hide.
      return worker.fetch(url, { redirect: "manual", ...init });
    },
    async dispose() {
      await worker.dispose();
    },
  };
}
