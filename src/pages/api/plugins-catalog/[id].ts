import type { APIRoute } from "astro";
import { createSupabaseClient } from "@/lib/supabase";
import { updateCatalogEntry, NameTakenError } from "@/lib/plugins-catalog/queries";
import { parsePluginCatalogForm } from "@/lib/plugins-catalog/form";
import { actionOk, actionError } from "@/lib/ui/response";

export const POST: APIRoute = async (context) => {
  const id = context.params.id ?? "";
  const form = await context.request.formData();
  const parsed = parsePluginCatalogForm(form);
  if (!parsed.ok) {
    return actionError({ error: parsed.message, field: parsed.field });
  }

  try {
    const entry = await updateCatalogEntry(createSupabaseClient(), id, parsed.data);
    return actionOk({ message: "Changes saved.", data: entry });
  } catch (err) {
    if (err instanceof NameTakenError) {
      return actionError({ error: err.message, field: "name" });
    }
    return actionError({ error: "Could not update the plugin" }, 500);
  }
};
