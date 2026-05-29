import { z } from "zod";

// Optional text field: trim, treat empty/omitted as null. The DB column is
// nullable and we never want to store "".
const optionalText = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v == null || v === "" ? null : v));

export const pluginCatalogSchema = z.object({
  name: z.string().trim().min(1, "Plugin name is required"),
  notes: optionalText,
});

export type PluginCatalogInput = z.infer<typeof pluginCatalogSchema>;
