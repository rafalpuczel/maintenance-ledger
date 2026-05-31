import { describe, it, expect } from "vitest";
import { emailTemplatesSchema } from "./schema";

const base = { pm_subject: "", pm_body: "", client_subject: "", client_body: "" };

describe("emailTemplatesSchema", () => {
  it("accepts all empty fields (empty = fall back to defaults)", () => {
    expect(emailTemplatesSchema.safeParse(base).success).toBe(true);
  });

  it("accepts every vetted token", () => {
    const r = emailTemplatesSchema.safeParse({
      ...base,
      pm_subject: "{{project}} {{month}} {{month_label}}",
      pm_body: "{{agency}} {{client_name}}",
    });
    expect(r.success).toBe(true);
  });

  it("tolerates whitespace inside the braces", () => {
    expect(emailTemplatesSchema.safeParse({ ...base, pm_subject: "{{ project }}" }).success).toBe(true);
  });

  it("rejects an unknown token and names it", () => {
    const r = emailTemplatesSchema.safeParse({ ...base, pm_subject: "Hi {{projct}}" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toContain("{{projct}}");
    }
  });

  it("rejects a leak-seeking token (contact_email is not vetted)", () => {
    const r = emailTemplatesSchema.safeParse({ ...base, client_body: "Reach us at {{contact_email}}" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toContain("{{contact_email}}");
    }
  });

  it("trims fields", () => {
    const r = emailTemplatesSchema.safeParse({ ...base, pm_subject: "  hello  " });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.pm_subject).toBe("hello");
    }
  });
});
