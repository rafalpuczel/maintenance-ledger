import { describe, it, expect } from "vitest";
import { pluginIdSchema, recurringNameSchema } from "./schema";
import { parseAddRecurringForm } from "./form";

describe("pluginIdSchema", () => {
  it("accepts a uuid", () => {
    expect(pluginIdSchema.safeParse("11111111-1111-4111-8111-111111111111").success).toBe(true);
  });

  it("rejects a non-uuid", () => {
    const r = pluginIdSchema.safeParse("not-a-uuid");
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe("Pick a plugin from the list");
    }
  });
});

describe("recurringNameSchema", () => {
  it("trims a valid name", () => {
    const r = recurringNameSchema.safeParse("  Akismet  ");
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).toBe("Akismet");
    }
  });

  it("rejects a whitespace-only name with the required message", () => {
    const r = recurringNameSchema.safeParse("   ");
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe("Plugin name is required");
    }
  });
});

describe("parseAddRecurringForm", () => {
  function form(entries: Record<string, string>): FormData {
    const f = new FormData();
    for (const [k, v] of Object.entries(entries)) {
      f.set(k, v);
    }
    return f;
  }

  it("returns kind 'id' when a valid plugin_id is present", () => {
    const r = parseAddRecurringForm(form({ plugin_id: "11111111-1111-4111-8111-111111111111" }));
    expect(r).toEqual({ ok: true, kind: "id", pluginId: "11111111-1111-4111-8111-111111111111" });
  });

  it("returns kind 'name' when only a name is present", () => {
    const r = parseAddRecurringForm(form({ name: "  Jetpack  " }));
    expect(r).toEqual({ ok: true, kind: "name", name: "Jetpack" });
  });

  it("prefers plugin_id when both are present", () => {
    const r = parseAddRecurringForm(form({ plugin_id: "11111111-1111-4111-8111-111111111111", name: "Jetpack" }));
    expect(r.ok && r.kind).toBe("id");
  });

  it("falls through to the name path when plugin_id is blank", () => {
    const r = parseAddRecurringForm(form({ plugin_id: "   ", name: "Jetpack" }));
    expect(r).toEqual({ ok: true, kind: "name", name: "Jetpack" });
  });

  it("fails when neither field is present", () => {
    const r = parseAddRecurringForm(form({}));
    expect(r).toEqual({ ok: false, message: "Pick a plugin or enter a name" });
  });

  it("fails with the id message when plugin_id is a non-uuid", () => {
    const r = parseAddRecurringForm(form({ plugin_id: "garbage" }));
    expect(r).toEqual({ ok: false, message: "Pick a plugin from the list" });
  });
});
