import { describe, it, expect } from "vitest";
import { parsePluginCatalogForm } from "./form";

function formOf(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    fd.set(k, v);
  }
  return fd;
}

describe("parsePluginCatalogForm", () => {
  it("parses a valid entry", () => {
    const r = parsePluginCatalogForm(formOf({ name: "Akismet", notes: "spam filter" }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.name).toBe("Akismet");
      expect(r.data.notes).toBe("spam filter");
    }
  });

  it("treats missing notes as null", () => {
    const r = parsePluginCatalogForm(formOf({ name: "Yoast SEO" }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.notes).toBeNull();
    }
  });

  it("returns an error message for a missing name", () => {
    const r = parsePluginCatalogForm(formOf({ notes: "orphan note" }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).toBe("Plugin name is required");
    }
  });
});
