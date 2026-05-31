// Single source of truth for email-template placeholders and the built-in
// default copy. Imported by:
//   - schema.ts   (the allowlist for reject-unknown-token validation)
//   - render.ts   (token resolution + per-field fallback)
//   - the form island (the token reference shown to the user)
//
// No-leak guardrail: only non-leaky fields are exposed as tokens. The leak-risk
// project fields (internal_notes, contact_email) are deliberately ABSENT here so
// a client template can never be pointed at them.

// The vetted token set, in display order. `key` is the token name used as
// `{{key}}`; `label`/`description` drive the UI reference; `source` documents
// where the value comes from at send time (for humans — not used at runtime).
export const EMAIL_TOKENS = [
  { key: "project", label: "Project name", description: "The project's name.", source: "project.name" },
  { key: "month", label: "Report month", description: "The report cycle, e.g. 2026-05.", source: "report.month" },
  {
    key: "month_label",
    label: "Month (long)",
    description: 'The report cycle in words, e.g. "May 2026".',
    source: "report.month (formatted)",
  },
  {
    key: "agency",
    label: "Agency name",
    description: "Your agency name from Brand settings.",
    source: "brand.agency_name",
  },
  {
    key: "client_name",
    label: "Client name",
    description: "The project contact's name (blank if not set).",
    source: "project.contact_name",
  },
] as const;

export type EmailTokenKey = (typeof EMAIL_TOKENS)[number]["key"];

// Fast membership set for the allowlist (validation + defensive render).
export const EMAIL_TOKEN_KEYS: ReadonlySet<string> = new Set(EMAIL_TOKENS.map((t) => t.key));

// Built-in default copy, expressed with tokens so the defaults and any saved
// template render through the exact same path. This MUST reproduce the copy the
// send path used before this slice (src/lib/email/send-report.ts), so that "no
// template saved" is a true no-op:
//   subject: `${project.name} — maintenance report ${report.month}`
//   body:    Hi, / Please find attached … <strong>project</strong> (month). / — agency
// The body is allowlisted HTML (the same shape sanitizeBody emits).
export const EMAIL_DEFAULTS = {
  pmSubject: "{{project}} — maintenance report {{month}}",
  pmBody:
    "<p>Hi,</p>" +
    "<p>Please find attached the maintenance report for <strong>{{project}}</strong> ({{month}}).</p>" +
    "<p>— {{agency}}</p>",
  clientSubject: "{{project}} — maintenance report {{month}}",
  clientBody:
    "<p>Hi,</p>" +
    "<p>Please find attached the maintenance report for <strong>{{project}}</strong> ({{month}}).</p>" +
    "<p>— {{agency}}</p>",
} as const;
