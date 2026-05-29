import type { PluginCatalogInput } from "./schema";
import { pluginCatalogSchema } from "./schema";

const FIELDS = ["name", "notes"] as const;

export type ParseResult = { ok: true; data: PluginCatalogInput } | { ok: false; message: string };

// Parse a submitted catalog-entry form into a validated PluginCatalogInput, or
// the first validation message for the redirect-with-error path.
export function parsePluginCatalogForm(form: FormData): ParseResult {
  const raw: Record<string, string> = {};
  for (const field of FIELDS) {
    raw[field] = (form.get(field) as string | null) ?? "";
  }
  const result = pluginCatalogSchema.safeParse(raw);
  if (!result.success) {
    return { ok: false, message: result.error.issues[0]?.message ?? "Invalid input" };
  }
  return { ok: true, data: result.data };
}
