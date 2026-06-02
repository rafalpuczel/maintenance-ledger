import { defineConfig } from "vitest/config";

// Workerd route-integration suite — boots the BUILT @astrojs/cloudflare worker via
// unstable_startWorker (see src/test/workers-harness.ts + the Phase-1 spike notes).
// Separate from the default config because it is materially slower (needs an
// `astro build` and boots the ~10 MiB worker incl. the FormePDF WASM). Run via
// `npm run test:workers`, which builds first. The test files run in plain Node and
// talk to the worker over HTTP, so `environment: "node"` is correct here.
export default defineConfig({
  test: {
    // The workerd tests live in top-level test/ (NOT src/) so `astro build` never
    // drags wrangler into the SSR worker graph. See test/workers-harness.ts.
    include: ["test/**/*.workers.test.ts"],
    // Loads gitignored .dev.vars into process.env so tests read credentials at
    // runtime — no secret is ever hardcoded in a committed test file.
    setupFiles: ["test/load-dev-vars.ts"],
    environment: "node",
    // Booting/tearing the worker per file is expensive; give generous timeouts and
    // do not parallelize across worker-booting files.
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
