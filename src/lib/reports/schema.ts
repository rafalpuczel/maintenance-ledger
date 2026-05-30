import { z } from "zod";

// Optional text field: trim, treat empty/omitted as null. The DB columns are
// nullable and we never want to store "". Mirrors the projects/plugins schemas.
const optionalText = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v == null || v === "" ? null : v));

// A plugin or theme repeater row: name + whether it was updated + the
// version it moved from/to. Stored inside the report's `plugins`/`themes`
// jsonb arrays. The name is required (a blank-name row is meaningless); the
// version fields are optional. zod owns this shape since the DB stores it
// opaquely as json.
export const pluginRowSchema = z.object({
  name: z.string().trim().min(1, "Plugin name is required"),
  updated: z.boolean(),
  from_version: optionalText,
  to_version: optionalText,
});

export const themeRowSchema = z.object({
  name: z.string().trim().min(1, "Theme name is required"),
  updated: z.boolean(),
  from_version: optionalText,
  to_version: optionalText,
});

// A license-renewal row: name + status (expired/expiring) + an optional expiry
// date and notes. Stored inside the report's `licenses` jsonb array.
export const licenseRowSchema = z.object({
  name: z.string().trim().min(1, "License name is required"),
  status: z.enum(["expired", "expiring"]),
  expiry_date: optionalText,
  notes: optionalText,
});

export type PluginRow = z.infer<typeof pluginRowSchema>;
export type ThemeRow = z.infer<typeof themeRowSchema>;
export type LicenseRow = z.infer<typeof licenseRowSchema>;

// The full editable report payload. `month` is server-derived at create-time and
// is not part of the edit form, so it is not in this input schema — the update
// path writes only the fields below. Scalars map 1:1 to columns; the three
// repeaters are validated arrays of the row schemas above.
export const reportInputSchema = z.object({
  wp_core_version: optionalText,
  wp_core_updated: z.boolean(),
  php_updated: z.boolean(),
  php_from_version: optionalText,
  php_to_version: optionalText,
  integrity_status: optionalText,
  integrity_issues: optionalText,
  fixes_applied: optionalText,
  notes_to_client: optionalText,
  plugins: z.array(pluginRowSchema),
  themes: z.array(themeRowSchema),
  licenses: z.array(licenseRowSchema),
});

export type ReportInput = z.infer<typeof reportInputSchema>;
