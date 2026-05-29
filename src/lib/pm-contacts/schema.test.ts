import { describe, it, expect } from "vitest";
import { pmContactSchema } from "./schema";

describe("pmContactSchema", () => {
  it("accepts a valid name and email", () => {
    const r = pmContactSchema.safeParse({ name: "Anna Kowalska", email: "anna@example.com" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.name).toBe("Anna Kowalska");
      expect(r.data.email).toBe("anna@example.com");
    }
  });

  it("rejects an empty name with the required message", () => {
    const r = pmContactSchema.safeParse({ name: "", email: "anna@example.com" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe("Name is required");
    }
  });

  it("rejects a whitespace-only name", () => {
    expect(pmContactSchema.safeParse({ name: "   ", email: "anna@example.com" }).success).toBe(false);
  });

  it("rejects an empty email with the required message (not the invalid message)", () => {
    const r = pmContactSchema.safeParse({ name: "Anna", email: "" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe("Email is required");
    }
  });

  it.each(["asdf", "a@", "a@b", "no-at-sign.com", "@example.com"])("rejects malformed email %j", (email) => {
    const r = pmContactSchema.safeParse({ name: "Anna", email });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe("Enter a valid email");
    }
  });

  it("normalizes email to trimmed lowercase", () => {
    const r = pmContactSchema.safeParse({ name: "Anna", email: "  Anna.Kowalska@Example.COM  " });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.email).toBe("anna.kowalska@example.com");
    }
  });

  it("trims the name", () => {
    const r = pmContactSchema.safeParse({ name: "  Anna  ", email: "anna@example.com" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.name).toBe("Anna");
    }
  });
});
