import { describe, it, expect } from "vitest";
import { isPublic } from "./lib/auth/public-paths";

// Oracle (research G1, PRD "every page except the login page requires an
// authenticated session"): the gate is deny-by-default. Any non-public path —
// including an unknown/made-up one — must be gated; only the explicit public
// set and the two public prefixes pass through. These assert the gate DECISION,
// not the middleware plumbing (the redirect/cookie wiring is workerd-only, Phase 3).

describe("isPublic — deny-by-default gate (G1)", () => {
  it.each([
    "/totally-made-up",
    "/api/secret",
    "/", // representative gated page
    "/api/reports/x", // representative gated API route
    "/dashboard",
    "/projects/some-slug",
  ])("gates non-public path %s", (path) => {
    expect(isPublic(path)).toBe(false);
  });

  it.each(["/login", "/api/auth/login", "/api/auth/logout"])("allows exact public path %s", (path) => {
    expect(isPublic(path)).toBe(true);
  });

  it.each(["/_astro/asset.js", "/favicon.svg"])("allows public-prefix asset %s", (path) => {
    expect(isPublic(path)).toBe(true);
  });

  it.each([
    "/loginx", // near-miss of /login
    "/api/auth/loginx", // near-miss of /api/auth/login
    "/api/auth/logoutx", // near-miss of /api/auth/logout
  ])("gates near-miss path %s (no prefix/exact confusion)", (path) => {
    expect(isPublic(path)).toBe(false);
  });
});
