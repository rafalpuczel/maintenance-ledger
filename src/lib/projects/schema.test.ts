import { describe, it, expect } from "vitest";
import { projectSchema } from "./schema";

describe("projectSchema", () => {
  const valid = {
    name: "Acme",
    slug: "acme",
    url: "https://acme.test",
    contact_company: "Acme Inc",
    contact_name: "Jane",
    contact_email: "jane@acme.test",
    internal_notes: "renewal in March",
  };

  it("accepts a fully populated project", () => {
    const r = projectSchema.safeParse(valid);
    expect(r.success).toBe(true);
  });

  it("rejects a missing name", () => {
    const r = projectSchema.safeParse({ ...valid, name: "" });
    expect(r.success).toBe(false);
  });

  it("rejects a missing slug", () => {
    const r = projectSchema.safeParse({ ...valid, slug: "" });
    expect(r.success).toBe(false);
  });

  it("rejects a non-kebab-case slug", () => {
    expect(projectSchema.safeParse({ ...valid, slug: "Acme Shop" }).success).toBe(false);
    expect(projectSchema.safeParse({ ...valid, slug: "acme_shop" }).success).toBe(false);
    expect(projectSchema.safeParse({ ...valid, slug: "-acme" }).success).toBe(false);
  });

  it("rejects an invalid email", () => {
    expect(projectSchema.safeParse({ ...valid, contact_email: "not-an-email" }).success).toBe(false);
  });

  it("rejects an invalid url", () => {
    expect(projectSchema.safeParse({ ...valid, url: "not a url" }).success).toBe(false);
  });

  it("normalizes empty optional fields to null", () => {
    const r = projectSchema.safeParse({
      name: "Acme",
      slug: "acme",
      url: "",
      contact_company: "",
      contact_name: "",
      contact_email: "",
      internal_notes: "",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.url).toBeNull();
      expect(r.data.contact_company).toBeNull();
      expect(r.data.contact_name).toBeNull();
      expect(r.data.contact_email).toBeNull();
      expect(r.data.internal_notes).toBeNull();
    }
  });

  it("accepts empty optionals while still validating provided ones", () => {
    const r = projectSchema.safeParse({ name: "Acme", slug: "acme", contact_email: "x@y.test" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.contact_email).toBe("x@y.test");
      expect(r.data.url).toBeNull();
    }
  });
});
