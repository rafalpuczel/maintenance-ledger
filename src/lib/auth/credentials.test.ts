import { describe, it, expect, beforeAll } from "vitest";
import { verifyCredentials, hashPassword } from "./credentials";

const USERNAME = "admin";
const PASSWORD = "correct horse battery staple";
// 32 random bytes, base64 — same shape as a provisioned SHARED_PASSWORD_PEPPER.
const PEPPER = "c2hhcmVkLXBlcHBlci10ZXN0LXZhbHVlLTMyLWJ5dGVzISE=";
let HASH: string;

beforeAll(async () => {
  HASH = await hashPassword(PASSWORD, PEPPER);
});

describe("verifyCredentials", () => {
  it("accepts the correct username and password", async () => {
    expect(await verifyCredentials(USERNAME, PASSWORD, USERNAME, HASH, PEPPER)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    expect(await verifyCredentials(USERNAME, "wrong", USERNAME, HASH, PEPPER)).toBe(false);
  });

  it("rejects a wrong username", async () => {
    expect(await verifyCredentials("root", PASSWORD, USERNAME, HASH, PEPPER)).toBe(false);
  });

  it("rejects when both are wrong", async () => {
    expect(await verifyCredentials("root", "wrong", USERNAME, HASH, PEPPER)).toBe(false);
  });

  it("rejects when the pepper differs (wrong key cannot reproduce the hash)", async () => {
    const otherPepper = "ZGlmZmVyZW50LXBlcHBlci0zMi1ieXRlcy12YWx1ZS1oZXJlAA==";
    expect(await verifyCredentials(USERNAME, PASSWORD, USERNAME, HASH, otherPepper)).toBe(false);
  });
});
