import type { RecipientType } from "../report-sends/schema";
import type { EmailTemplates } from "./queries";
import { EMAIL_DEFAULTS } from "./tokens";
import { sanitizeBody, escapeHtml } from "./sanitize";

// The send-time engine. Given the stored templates (or null) and a data context,
// produce the final { subject, html } for one recipient type. Pure and
// dependency-free so it is unit-testable and reusable by the form's live preview.
//
// Order of operations (matters for safety):
//   1. per-field fallback: an empty/whitespace stored field uses EMAIL_DEFAULTS
//   2. resolve {{tokens}} -> HTML-ESCAPED values (so a value with < or & can
//      never inject markup), unknown tokens -> "" (defensive; save already
//      rejects them)
//   3. body: sanitize the resulting HTML to the allowlist
//      subject: strip any newline/tag so it is a clean single-line plain string

// Resolved token values for one send. Built from report/project/brand at the
// call site (see send-report.ts). All values are plain text (un-escaped here).
export interface TemplateContext {
  project: string;
  month: string;
  month_label: string;
  agency: string;
  client_name: string;
}

// Humanize a YYYY-MM cycle the same way the report detail page does
// (reports/[id].astro), so the email's month label matches the app. Falls back
// to the raw value when the input is not a YYYY-MM cycle. The strict format
// guard is required because V8's Date parser is lenient (e.g. `new Date("zzz-01")`
// resolves to a real date rather than NaN), so a NaN check alone is not enough.
export function monthLabel(month: string): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return month;
  const date = new Date(`${month}-01T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return month;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "long", timeZone: "UTC" });
}

// Replace each {{token}} with its HTML-escaped value. Unknown tokens resolve to
// an empty string (belt-and-suspenders; the schema rejects them on save).
export function resolveTokens(text: string, ctx: TemplateContext): string {
  const values: Record<string, string> = {
    project: ctx.project,
    month: ctx.month,
    month_label: ctx.month_label,
    agency: ctx.agency,
    client_name: ctx.client_name,
  };
  return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_full, key: string) => escapeHtml(values[key] ?? ""));
}

// Pick a stored field, falling back to a default when it is empty/whitespace.
function fieldOrDefault(stored: string | undefined, fallback: string): string {
  return stored && stored.trim() !== "" ? stored : fallback;
}

interface RenderArgs {
  templates: EmailTemplates | null;
  recipientType: RecipientType;
  ctx: TemplateContext;
}

export function renderTemplate({ templates, recipientType, ctx }: RenderArgs): { subject: string; html: string } {
  const isPm = recipientType === "pm";
  const storedSubject = isPm ? templates?.pm_subject : templates?.client_subject;
  const storedBody = isPm ? templates?.pm_body : templates?.client_body;

  const subjectTemplate = fieldOrDefault(storedSubject, isPm ? EMAIL_DEFAULTS.pmSubject : EMAIL_DEFAULTS.clientSubject);
  const bodyTemplate = fieldOrDefault(storedBody, isPm ? EMAIL_DEFAULTS.pmBody : EMAIL_DEFAULTS.clientBody);

  // Subject must be plain text (it is sent as the `subject` string, not HTML):
  // resolve tokens, strip any tag-like markup the user typed into the subject
  // template, then collapse whitespace/newlines to a single line. Token values
  // are already HTML-escaped by resolveTokens, so this only removes literal tags.
  const subject = resolveTokens(subjectTemplate, ctx)
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // Body: resolve tokens (escaped values), then sanitize to the allowlist.
  const html = sanitizeBody(resolveTokens(bodyTemplate, ctx));

  return { subject, html };
}
