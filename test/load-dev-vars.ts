// Vitest setup for the workerd integration suite: load the gitignored .dev.vars
// into process.env so tests can read credentials (e.g. TEST_LOGIN_PASSWORD,
// SHARED_USERNAME) at runtime instead of hardcoding any secret in a committed
// file. Only keys not already present in the environment are set, so a real env
// var (or CI secret) wins over the local file.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const DEV_VARS_PATH = resolve(process.cwd(), ".dev.vars");

try {
  const raw = readFileSync(DEV_VARS_PATH, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq === -1) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
} catch {
  // No .dev.vars (e.g. CI without local secrets) — tests that need a secret skip
  // themselves via an explicit guard. Missing file is not a setup failure.
}
