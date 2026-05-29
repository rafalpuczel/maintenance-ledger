import type { PmContactInput } from "./schema";
import { pmContactSchema } from "./schema";

const FIELDS = ["name", "email"] as const;

export type ParseResult = { ok: true; data: PmContactInput } | { ok: false; message: string };

// Parse a submitted PM-contact form into a validated PmContactInput, or the
// first validation message for the redirect-with-error path.
export function parsePmContactForm(form: FormData): ParseResult {
  const raw: Record<string, string> = {};
  for (const field of FIELDS) {
    raw[field] = (form.get(field) as string | null) ?? "";
  }
  const result = pmContactSchema.safeParse(raw);
  if (!result.success) {
    return { ok: false, message: result.error.issues[0]?.message ?? "Invalid input" };
  }
  return { ok: true, data: result.data };
}
