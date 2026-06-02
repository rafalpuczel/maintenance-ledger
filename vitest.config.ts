import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Plain-Node suite only. The workerd route-integration suite lives in
    // top-level test/ with its own config (vitest.workers.config.ts) and stays off
    // this fast inner loop — it needs a build + boots the ~10 MiB worker.
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
