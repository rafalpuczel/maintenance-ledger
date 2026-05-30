import type { ReportInput } from "@/lib/reports/schema";
import { reportInputSchema } from "@/lib/reports/schema";

export type ParseResult = { ok: true; data: ReportInput } | { ok: false; message: string };

// ---------------------------------------------------------------------------
// Field-name scheme (the single contract the form island and this parser share)
//
// Scalars use their bare column name. Repeater rows use indexed names of the
// shape `<repeater>[<i>].<key>`, e.g. `plugins[0].name`, `plugins[0].updated`,
// `licenses[2].status`. The helpers below are the ONLY place these names are
// constructed; ReportForm.tsx imports them so the write and read sides cannot
// drift.
// ---------------------------------------------------------------------------

export function pluginFieldName(i: number, key: "name" | "updated" | "from_version" | "to_version"): string {
  return `plugins[${i}].${key}`;
}

export function themeFieldName(i: number, key: "name" | "updated" | "from_version" | "to_version"): string {
  return `themes[${i}].${key}`;
}

export function licenseFieldName(i: number, key: "name" | "status" | "expiry_date" | "notes"): string {
  return `licenses[${i}].${key}`;
}

// A checkbox/boolean field submits "on" when checked and no key at all when
// unchecked. Treat a present, truthy-ish value as true; everything else
// (including absence) as false. NEVER throw on a missing key.
function asBool(form: FormData, name: string): boolean {
  const v = form.get(name);
  if (typeof v !== "string") {
    return false;
  }
  return v === "on" || v === "true" || v === "1";
}

function asText(form: FormData, name: string): string {
  const v = form.get(name);
  return typeof v === "string" ? v : "";
}

// Collect the distinct row indices present for a repeater prefix, in ascending
// numeric order. Tolerates gaps (e.g. if the form ever left a hole after a
// removal) by compacting to a dense array in index order.
function rowIndices(form: FormData, prefix: string): number[] {
  const re = new RegExp(`^${prefix}\\[(\\d+)\\]\\.`);
  const seen = new Set<number>();
  for (const key of form.keys()) {
    const m = re.exec(key);
    if (m) {
      seen.add(Number(m[1]));
    }
  }
  return [...seen].sort((a, b) => a - b);
}

// Parse a submitted report form into a validated ReportInput, or the first
// validation message for the redirect-with-error path. The three repeaters are
// reconstructed from their indexed field names; an unchecked "updated" checkbox
// is absent and resolves to false. `month` is server-derived and not parsed here.
export function parseReportForm(form: FormData): ParseResult {
  const plugins = rowIndices(form, "plugins").map((i) => ({
    name: asText(form, pluginFieldName(i, "name")),
    updated: asBool(form, pluginFieldName(i, "updated")),
    from_version: asText(form, pluginFieldName(i, "from_version")),
    to_version: asText(form, pluginFieldName(i, "to_version")),
  }));

  const themes = rowIndices(form, "themes").map((i) => ({
    name: asText(form, themeFieldName(i, "name")),
    updated: asBool(form, themeFieldName(i, "updated")),
    from_version: asText(form, themeFieldName(i, "from_version")),
    to_version: asText(form, themeFieldName(i, "to_version")),
  }));

  const licenses = rowIndices(form, "licenses").map((i) => ({
    name: asText(form, licenseFieldName(i, "name")),
    status: asText(form, licenseFieldName(i, "status")),
    expiry_date: asText(form, licenseFieldName(i, "expiry_date")),
    notes: asText(form, licenseFieldName(i, "notes")),
  }));

  const raw = {
    wp_core_version: asText(form, "wp_core_version"),
    wp_core_updated: asBool(form, "wp_core_updated"),
    php_updated: asBool(form, "php_updated"),
    php_from_version: asText(form, "php_from_version"),
    php_to_version: asText(form, "php_to_version"),
    integrity_status: asText(form, "integrity_status"),
    integrity_issues: asText(form, "integrity_issues"),
    fixes_applied: asText(form, "fixes_applied"),
    notes_to_client: asText(form, "notes_to_client"),
    plugins,
    themes,
    licenses,
  };

  const result = reportInputSchema.safeParse(raw);
  if (!result.success) {
    return { ok: false, message: result.error.issues[0]?.message ?? "Invalid input" };
  }
  return { ok: true, data: result.data };
}
