import type { ProjectInput } from "@/lib/projects/schema";
import { projectSchema } from "@/lib/projects/schema";

const FIELDS = ["name", "slug", "url", "contact_company", "contact_name", "contact_email", "internal_notes"] as const;

export type ParseResult = { ok: true; data: ProjectInput } | { ok: false; message: string; field?: string };

// Parse a submitted project form into a validated ProjectInput, or the first
// validation message (with the offending field, for inline error display).
export function parseProjectForm(form: FormData): ParseResult {
  const raw: Record<string, string> = {};
  for (const field of FIELDS) {
    raw[field] = (form.get(field) as string | null) ?? "";
  }
  const result = projectSchema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    const field = issue.path.length > 0 ? String(issue.path[0]) : undefined;
    return { ok: false, message: issue.message, field };
  }
  return { ok: true, data: result.data };
}
