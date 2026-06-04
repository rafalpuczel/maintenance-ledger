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
// SESSION_HMAC_KEY) and SUPABASE_URL / SUPABASE_SECRET_KEY need no separate
// seeding. KV `SESSION` is Miniflare-simulated locally.
//
// IMPORTANT (spike notes, finding #2): `unstable_startWorker({ vars })` does NOT
// surface a var into `astro:env/server` — the Astro env layer reads `.dev.vars` /
// build-time, not runtime vars. So anything the WORKER must read (e.g.
// RESEND_BASE_URL for the send suite's Resend intercept) belongs in `.dev.vars`,
// not in `vars`. The send suite requires this line in `.dev.vars`:
//     RESEND_BASE_URL=http://127.0.0.1:54399
// (gitignored, test-only, MUST be unset in production — the send-report.ts seam
// falls back to the real Resend SDK when it is absent). The `vars` option below
// remains for genuinely-new workerd bindings that don't flow through Astro env.

import { unstable_startWorker } from "wrangler";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

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

// Test-side admin Supabase client for the real-DB layer (risks #1/#3/#6). The
// worker itself reaches local Supabase via .dev.vars (SUPABASE_URL /
// SUPABASE_SECRET_KEY auto-load on boot — no harness wiring needed); this client
// is for the TEST process to seed fixtures, count rows, and clean up over the same
// HTTP/PostgREST boundary (never `pg`, per CLAUDE.md). Reads the same secrets from
// process.env (loaded by test/load-dev-vars.ts). Returns null when they are absent
// (CI without local Supabase) so callers can `it.skipIf` instead of crashing.
export function createAdminClient(): SupabaseClient<Database> | null {
  const env = process.env as Record<string, string | undefined>;
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    return null;
  }
  return createClient<Database>(url, key, { auth: { persistSession: false } });
}

// Reachability probe — config presence (createAdminClient !== null) only proves the
// secrets are SET, not that the DB is RUNNING. The send suite must skip (not fail)
// when local Supabase is stopped, so callers await this at module scope and feed
// the result into `describe.skipIf`. A trivial head-count select; any error (dead
// host, bad key) → false. Returns false for a null client.
export async function isDbReachable(client: SupabaseClient<Database> | null): Promise<boolean> {
  if (!client) {
    return false;
  }
  try {
    const { error } = await client.from("report_sends").select("id", { count: "exact", head: true });
    return !error;
  } catch {
    return false;
  }
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
