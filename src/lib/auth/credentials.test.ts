import { describe, it, expect, beforeAll } from "vitest";
import bcrypt from "bcryptjs";
import { verifyCredentials } from "./credentials";

const USERNAME = "admin";
const PASSWORD = "correct horse battery staple";
let HASH: string;

beforeAll(() => {
  HASH = bcrypt.hashSync(PASSWORD, 10);
});

describe("verifyCredentials", () => {
  it("accepts the correct username and password", async () => {
    expect(await verifyCredentials(USERNAME, PASSWORD, USERNAME, HASH)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    expect(await verifyCredentials(USERNAME, "wrong", USERNAME, HASH)).toBe(false);
  });

  it("rejects a wrong username", async () => {
    expect(await verifyCredentials("root", PASSWORD, USERNAME, HASH)).toBe(false);
  });

  it("rejects when both are wrong", async () => {
    expect(await verifyCredentials("root", "wrong", USERNAME, HASH)).toBe(false);
  });
});
