import type { PmContactInput } from "./schema";
import { pmContactSchema } from "./schema";

const FIELDS = ["name", "email"] as const;

export type ParseResult = { ok: true; data: PmContactInput } | { ok: false; message: string; field?: string };

// Parse a submitted PM-contact form into a validated PmContactInput, or the
// first validation message (with the offending field, for inline error display).
export function parsePmContactForm(form: FormData): ParseResult {
  const raw: Record<string, string> = {};
  for (const field of FIELDS) {
    raw[field] = (form.get(field) as string | null) ?? "";
  }
  const result = pmContactSchema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    const field = issue.path.length > 0 ? String(issue.path[0]) : undefined;
    return { ok: false, message: issue.message, field };
  }
  return { ok: true, data: result.data };
}
