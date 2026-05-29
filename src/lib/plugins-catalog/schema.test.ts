import { describe, it, expect } from "vitest";
import { pluginCatalogSchema } from "./schema";

describe("pluginCatalogSchema", () => {
  it("accepts a name with notes", () => {
    const r = pluginCatalogSchema.safeParse({ name: "Akismet", notes: "spam filter" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.name).toBe("Akismet");
      expect(r.data.notes).toBe("spam filter");
    }
  });

  it("accepts a name without notes", () => {
    const r = pluginCatalogSchema.safeParse({ name: "Yoast SEO" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.notes).toBeNull();
    }
  });

  it("rejects an empty name", () => {
    expect(pluginCatalogSchema.safeParse({ name: "" }).success).toBe(false);
  });

  it("rejects a whitespace-only name", () => {
    expect(pluginCatalogSchema.safeParse({ name: "   " }).success).toBe(false);
  });

  it("normalizes empty notes to null", () => {
    const r = pluginCatalogSchema.safeParse({ name: "WP Rocket", notes: "" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.notes).toBeNull();
    }
  });

  it("trims the name", () => {
    const r = pluginCatalogSchema.safeParse({ name: "  Akismet  " });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.name).toBe("Akismet");
    }
  });
});
