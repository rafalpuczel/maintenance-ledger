import { describe, it, expect } from "vitest";
import { parseReportForm, pluginFieldName, themeFieldName, licenseFieldName } from "./form";

function formOf(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    fd.set(k, v);
  }
  return fd;
}

describe("parseReportForm", () => {
  it("parses scalar fields, treating empty as null", () => {
    const r = parseReportForm(formOf({ wp_core_version: "6.5.2", wp_core_updated: "on", php_from_version: "" }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.wp_core_version).toBe("6.5.2");
      expect(r.data.wp_core_updated).toBe(true);
      expect(r.data.php_from_version).toBeNull();
      expect(r.data.php_updated).toBe(false);
    }
  });

  it("reconstructs a plugin repeater row from indexed field names", () => {
    const r = parseReportForm(
      formOf({
        [pluginFieldName(0, "name")]: "Akismet",
        [pluginFieldName(0, "updated")]: "on",
        [pluginFieldName(0, "from_version")]: "5.1",
        [pluginFieldName(0, "to_version")]: "5.2",
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.plugins).toEqual([{ name: "Akismet", updated: true, from_version: "5.1", to_version: "5.2" }]);
    }
  });

  it("treats an absent 'updated' checkbox as false", () => {
    const r = parseReportForm(formOf({ [pluginFieldName(0, "name")]: "Yoast" }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.plugins[0]?.updated).toBe(false);
      expect(r.data.plugins[0]?.from_version).toBeNull();
    }
  });

  it("compacts non-contiguous row indices into a dense array in order", () => {
    // index 1 then 3 (gaps where rows were removed) -> two rows, ordered.
    const r = parseReportForm(
      formOf({
        [pluginFieldName(1, "name")]: "First",
        [pluginFieldName(3, "name")]: "Second",
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.plugins.map((p) => p.name)).toEqual(["First", "Second"]);
    }
  });

  it("parses themes and licenses repeaters", () => {
    const r = parseReportForm(
      formOf({
        [themeFieldName(0, "name")]: "Twenty Twenty-Four",
        [licenseFieldName(0, "name")]: "ACF Pro",
        [licenseFieldName(0, "status")]: "expiring",
        [licenseFieldName(0, "expiry_date")]: "2026-12-01",
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.themes[0]?.name).toBe("Twenty Twenty-Four");
      expect(r.data.licenses[0]).toEqual({
        name: "ACF Pro",
        status: "expiring",
        expiry_date: "2026-12-01",
        notes: null,
      });
    }
  });

  it("fails with the first issue's message when a plugin row name is blank", () => {
    const r = parseReportForm(
      formOf({
        [pluginFieldName(0, "name")]: "",
        [pluginFieldName(0, "to_version")]: "5.2",
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).toBe("Plugin name is required");
    }
  });

  it("rejects an invalid license status", () => {
    const r = parseReportForm(
      formOf({
        [licenseFieldName(0, "name")]: "ACF Pro",
        [licenseFieldName(0, "status")]: "lapsed",
      }),
    );
    expect(r.ok).toBe(false);
  });

  it("parses an entirely empty form to empty repeaters and null scalars", () => {
    const r = parseReportForm(new FormData());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.plugins).toEqual([]);
      expect(r.data.themes).toEqual([]);
      expect(r.data.licenses).toEqual([]);
      expect(r.data.wp_core_version).toBeNull();
      expect(r.data.wp_core_updated).toBe(false);
      expect(r.data.notes_to_client).toBeNull();
    }
  });
});
