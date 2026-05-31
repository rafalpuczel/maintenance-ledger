import { emailTemplatesSchema } from "./schema";
import { sanitizeBody } from "./sanitize";
import type { EmailTemplatesInput } from "./schema";

export type ParseResult = { ok: true; data: EmailTemplatesInput } | { ok: false; message: string };

const SUBJECT_FIELDS = ["pm_subject", "client_subject"] as const;
const BODY_FIELDS = ["pm_body", "client_body"] as const;

// Parse a submitted email-templates form into a validated upsert payload, or the
// first validation message for the inline-error path. The two body fields are
// HTML-sanitized to the allowlist BEFORE validation/persist, so stored HTML is
// always clean regardless of what the client editor produced (the client is a
// convenience, not the security boundary). The token check then runs on the
// sanitized body too.
export function parseEmailTemplatesForm(form: FormData): ParseResult {
  const raw: Record<string, string> = {};
  for (const field of SUBJECT_FIELDS) {
    raw[field] = (form.get(field) as string | null) ?? "";
  }
  for (const field of BODY_FIELDS) {
    raw[field] = sanitizeBody((form.get(field) as string | null) ?? "");
  }

  const result = emailTemplatesSchema.safeParse(raw);
  if (!result.success) {
    return { ok: false, message: result.error.issues[0]?.message ?? "Invalid input" };
  }
  return { ok: true, data: result.data };
}
