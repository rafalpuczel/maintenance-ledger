import { pluginIdSchema, recurringNameSchema } from "./schema";

// The add form carries either a catalog pick (plugin_id) or a free-text name.
// The route branches on `kind`. plugin_id wins when both are present.
export type ParseResult =
  | { ok: true; kind: "id"; pluginId: string }
  | { ok: true; kind: "name"; name: string }
  | { ok: false; message: string };

export function parseAddRecurringForm(form: FormData): ParseResult {
  const rawId = ((form.get("plugin_id") as string | null) ?? "").trim();
  const rawName = ((form.get("name") as string | null) ?? "").trim();

  if (rawId !== "") {
    const result = pluginIdSchema.safeParse(rawId);
    if (!result.success) {
      return { ok: false, message: result.error.issues[0]?.message ?? "Invalid input" };
    }
    return { ok: true, kind: "id", pluginId: result.data };
  }

  if (rawName !== "") {
    const result = recurringNameSchema.safeParse(rawName);
    if (!result.success) {
      return { ok: false, message: result.error.issues[0]?.message ?? "Invalid input" };
    }
    return { ok: true, kind: "name", name: result.data };
  }

  return { ok: false, message: "Pick a plugin or enter a name" };
}
