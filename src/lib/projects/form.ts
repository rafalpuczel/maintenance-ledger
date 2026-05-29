import type { ProjectInput } from "@/lib/projects/schema";
import { projectSchema } from "@/lib/projects/schema";

const FIELDS = ["name", "slug", "url", "contact_company", "contact_name", "contact_email", "internal_notes"] as const;

export type ParseResult = { ok: true; data: ProjectInput } | { ok: false; message: string };

// Parse a submitted project form into a validated ProjectInput, or the first
// validation message for the redirect-with-error path.
export function parseProjectForm(form: FormData): ParseResult {
  const raw: Record<string, string> = {};
  for (const field of FIELDS) {
    raw[field] = (form.get(field) as string | null) ?? "";
  }
  const result = projectSchema.safeParse(raw);
  if (!result.success) {
    return { ok: false, message: result.error.issues[0]?.message ?? "Invalid input" };
  }
  return { ok: true, data: result.data };
}
