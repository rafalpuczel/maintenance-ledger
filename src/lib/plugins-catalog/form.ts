import type { PluginCatalogInput } from "./schema";
import { pluginCatalogSchema } from "./schema";

const FIELDS = ["name", "notes"] as const;

export type ParseResult = { ok: true; data: PluginCatalogInput } | { ok: false; message: string; field?: string };

// Parse a submitted catalog-entry form into a validated PluginCatalogInput, or
// the first validation message (with the offending field, for inline display).
export function parsePluginCatalogForm(form: FormData): ParseResult {
  const raw: Record<string, string> = {};
  for (const field of FIELDS) {
    raw[field] = (form.get(field) as string | null) ?? "";
  }
  const result = pluginCatalogSchema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    const field = issue.path.length > 0 ? String(issue.path[0]) : undefined;
    return { ok: false, message: issue.message, field };
  }
  return { ok: true, data: result.data };
}
