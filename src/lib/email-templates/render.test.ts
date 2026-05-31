import { describe, it, expect } from "vitest";
import { renderTemplate, resolveTokens, monthLabel, type TemplateContext } from "./render";
import type { EmailTemplates } from "./queries";

const ctx: TemplateContext = {
  project: "Acme Co",
  month: "2026-05",
  month_label: "May 2026",
  agency: "Pixel Forge",
  client_name: "Jordan Lee",
};

// Build a full EmailTemplates row from partial overrides.
function templates(overrides: Partial<EmailTemplates>): EmailTemplates {
  return {
    id: true,
    pm_subject: "",
    pm_body: "",
    client_subject: "",
    client_body: "",
    created_at: "2026-05-31T00:00:00Z",
    updated_at: "2026-05-31T00:00:00Z",
    ...overrides,
  };
}

describe("monthLabel", () => {
  it("formats a YYYY-MM into a long, humanized label (locale-default month name + year)", () => {
    // Locale-independent: assert it expanded the cycle (year present, month
    // turned into a word — not the raw "2026-05"), not the exact English string,
    // since the engine uses the runtime's default locale (matching the app).
    const out = monthLabel("2026-05");
    expect(out).toContain("2026");
    expect(out).not.toBe("2026-05");
    expect(out).not.toContain("-");
    expect(out).toMatch(/[A-Za-zÀ-ž]/);
  });
  it("falls back to the raw value when unparseable", () => {
    expect(monthLabel("zzz")).toBe("zzz");
  });
});

describe("resolveTokens", () => {
  it("replaces known tokens with their values", () => {
    expect(resolveTokens("{{project}} — {{month_label}}", ctx)).toBe("Acme Co — May 2026");
  });
  it("HTML-escapes token values so they cannot inject markup", () => {
    const evil: TemplateContext = { ...ctx, project: "<script>x</script> & <b>" };
    const out = resolveTokens("Project: {{project}}", evil);
    expect(out).not.toContain("<script");
    expect(out).toContain("&lt;script&gt;");
    expect(out).toContain("&amp;");
  });
  it("resolves unknown tokens to empty string", () => {
    expect(resolveTokens("a {{nope}} b", ctx)).toBe("a  b");
  });
  it("renders an empty client_name as blank without crashing", () => {
    expect(resolveTokens("Hi {{client_name}},", { ...ctx, client_name: "" })).toBe("Hi ,");
  });
});

describe("renderTemplate — fallback to defaults", () => {
  it("null templates produce the built-in default copy", () => {
    const pm = renderTemplate({ templates: null, recipientType: "pm", ctx });
    expect(pm.subject).toBe("Acme Co — maintenance report 2026-05");
    expect(pm.html).toBe(
      "<p>Hi,</p>" +
        "<p>Please find attached the maintenance report for <strong>Acme Co</strong> (2026-05).</p>" +
        "<p>— Pixel Forge</p>",
    );
  });

  it("matches the pre-slice hardcoded copy shape (no-op when nothing saved)", () => {
    // Guards the contract: EMAIL_DEFAULTS must reproduce send-report.ts's old copy.
    const client = renderTemplate({ templates: null, recipientType: "client", ctx });
    expect(client.html).toContain("Please find attached the maintenance report for <strong>Acme Co</strong>");
    expect(client.html).toContain("— Pixel Forge");
  });

  it("per-field fallback: empty body but filled subject uses default body + stored subject", () => {
    const t = templates({ client_subject: "Custom {{project}} subject", client_body: "" });
    const out = renderTemplate({ templates: t, recipientType: "client", ctx });
    expect(out.subject).toBe("Custom Acme Co subject");
    // body fell back to the default (same as the null-templates client body)
    const def = renderTemplate({ templates: null, recipientType: "client", ctx });
    expect(out.html).toBe(def.html);
  });

  it("whitespace-only stored field falls back to default", () => {
    const t = templates({ pm_subject: "   " });
    const out = renderTemplate({ templates: t, recipientType: "pm", ctx });
    expect(out.subject).toBe("Acme Co — maintenance report 2026-05");
  });
});

describe("renderTemplate — recipient selection + safety", () => {
  it("PM and client pick their own stored fields", () => {
    const t = templates({
      pm_subject: "PM: {{project}}",
      pm_body: "<p>PM body</p>",
      client_subject: "Client: {{project}}",
      client_body: "<p>Client body</p>",
    });
    expect(renderTemplate({ templates: t, recipientType: "pm", ctx }).subject).toBe("PM: Acme Co");
    expect(renderTemplate({ templates: t, recipientType: "client", ctx }).subject).toBe("Client: Acme Co");
    expect(renderTemplate({ templates: t, recipientType: "pm", ctx }).html).toBe("<p>PM body</p>");
  });

  it("sanitizes a stored body that contains disallowed markup", () => {
    const t = templates({ pm_body: "<p>ok</p><script>alert(1)</script>" });
    const out = renderTemplate({ templates: t, recipientType: "pm", ctx });
    expect(out.html).toBe("<p>ok</p>");
  });

  it("strips newlines/markup from the subject", () => {
    const t = templates({ pm_subject: "line one\nline two  <b>x</b>" });
    const out = renderTemplate({ templates: t, recipientType: "pm", ctx });
    expect(out.subject).not.toContain("\n");
    expect(out.subject).not.toContain("<b>");
    expect(out.subject).toBe("line one line two x");
  });
});
