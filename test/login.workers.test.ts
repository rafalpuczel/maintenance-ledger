import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startTestWorker, type WorkerHarness } from "./workers-harness";

// Real-runtime route integration tests (workerd via unstable_startWorker). These
// prove the two behaviors that only manifest in the actual runtime and cannot be
// reached by the plain-Node seam tests: G5 (the fail-closed catch, which needs a
// real formData() throw) and G7 (the real Set-Cookie attributes emitted by
// context.cookies.set). Run via `npm run test:workers` (builds first).
//
// Credentials are read from the environment (loaded from the gitignored .dev.vars
// by test/load-dev-vars.ts) — NEVER hardcoded, so no secret enters git. The worker
// reads the same .dev.vars when it boots, so the env values match what it expects.
// Each request carries CF-Connecting-IP to emulate the Cloudflare edge — without it
// the route treats the request as untrusted (ip === null) and applies MAX_DELAY_MS
// (a 5s sleep on every call).

// Read via an explicitly-optional view of process.env: under the project's strict
// types some keys are typed as plain `string`, which makes `?? ""` a lint error
// (no-unnecessary-condition). These credentials are loaded from gitignored
// .dev.vars by test/load-dev-vars.ts and may genuinely be absent in CI.
const ENV = process.env as Record<string, string | undefined>;
const VALID_USERNAME = ENV.SHARED_USERNAME ?? "";
// Plaintext that matches SHARED_PASSWORD_HASH, supplied only via gitignored
// .dev.vars. If absent (e.g. CI without local secrets), the G7 valid-login case
// skips rather than hardcoding or failing.
const VALID_PASSWORD = ENV.TEST_LOGIN_PASSWORD ?? "";
const COOKIE_NAME = "ml_session";

// The harness builds request URLs against this host, so a same-origin form POST
// must send a matching Origin. Astro's default security.checkOrigin rejects a
// form-encoded POST whose Origin ≠ host with 403 (a real browser submitting the
// login form always sends the matching Origin) — so we emulate that here.
const ORIGIN = "http://worker.test";

// A stable, syntactically-valid client IP so the throttle uses a real bucket
// (fresh KV → 0 failures → 0 delay) instead of the null-IP max-delay path.
const EDGE_HEADERS = { "CF-Connecting-IP": "203.0.113.50" };

let worker: WorkerHarness;

beforeAll(async () => {
  worker = await startTestWorker();
}, 60_000);

afterAll(async () => {
  await worker.dispose();
});

describe("login route — workerd integration", () => {
  it("G5: malformed (non-form) body fails closed → 302 /login, no session, not 5xx", async () => {
    // A JSON body makes request.formData() throw inside the route → the outer
    // catch redirects with the generic error. Never a 500, never an auth cookie.
    const res = await worker.fetch("/api/auth/login", {
      method: "POST",
      headers: { ...EDGE_HEADERS, "Content-Type": "application/json" },
      body: "}{ not a form",
    });

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toMatch(/^\/login/);
    expect(res.status).toBeLessThan(500); // explicitly not a 5xx

    // No valid session cookie issued on the fail-closed path. A real cookie looks
    // like `ml_session=<value>; ...`; a deletion looks like `ml_session=;`. Treat
    // only a non-empty value as "issued".
    const setCookie = res.headers.get("set-cookie") ?? "";
    const issuedSession = setCookie.includes(`${COOKIE_NAME}=`) && !setCookie.includes(`${COOKIE_NAME}=;`);
    expect(issuedSession).toBe(false);
  });

  const hasCreds = VALID_USERNAME !== "" && VALID_PASSWORD !== "";
  it.skipIf(!hasCreds)("G7: valid login → 302 / with an ml_session cookie carrying all five flags", async () => {
    const form = new URLSearchParams({ username: VALID_USERNAME, password: VALID_PASSWORD });
    const res = await worker.fetch("/api/auth/login", {
      method: "POST",
      headers: {
        ...EDGE_HEADERS,
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: ORIGIN, // same-origin form POST — satisfies Astro's checkOrigin
      },
      body: form.toString(),
    });

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/");

    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${COOKIE_NAME}=`);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/Secure/i);
    // Lax is load-bearing: Strict would drop the cookie on the post-login 302.
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(setCookie).toMatch(/Path=\//i);
    expect(setCookie).toMatch(/Max-Age=\d+/i);
  });
});
