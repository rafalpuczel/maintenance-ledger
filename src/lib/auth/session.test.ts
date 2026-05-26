import { describe, it, expect } from "vitest";
import { signSession, verifySession, SESSION_TTL_SECONDS } from "./session";

const KEY = "+CgcHPtGt8hjYChdRJgjS+T/D1cvtQgZ7b1HO6Ge1ow=";

describe("session", () => {
  it("round-trips a freshly signed token", async () => {
    const token = await signSession(KEY);
    expect(await verifySession(KEY, token)).toBe(true);
  });

  it("rejects a tampered signature", async () => {
    const token = await signSession(KEY);
    const [payload, sig] = token.split(".");
    const flipped = sig.startsWith("A") ? "B" : "A";
    expect(await verifySession(KEY, `${payload}.${flipped}${sig.slice(1)}`)).toBe(false);
  });

  it("rejects a tampered payload", async () => {
    const token = await signSession(KEY);
    const [, sig] = token.split(".");
    expect(await verifySession(KEY, `Zm9yZ2Vk.${sig}`)).toBe(false);
  });

  it("rejects an expired token", async () => {
    const past = new Date(0);
    const token = await signSession(KEY, past);
    const afterExpiry = new Date((SESSION_TTL_SECONDS + 10) * 1000);
    expect(await verifySession(KEY, token, afterExpiry)).toBe(false);
  });

  it("accepts a token just before its expiry boundary", async () => {
    const issued = new Date(1_000_000_000_000);
    const token = await signSession(KEY, issued);
    const justBefore = new Date(issued.getTime() + (SESSION_TTL_SECONDS - 5) * 1000);
    expect(await verifySession(KEY, token, justBefore)).toBe(true);
  });

  it("rejects malformed input", async () => {
    expect(await verifySession(KEY, "not-a-token")).toBe(false);
    expect(await verifySession(KEY, "")).toBe(false);
  });

  it("rejects a token signed with a different key", async () => {
    const token = await signSession(KEY);
    const otherKey = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
    expect(await verifySession(otherKey, token)).toBe(false);
  });
});
