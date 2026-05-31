import type { APIRoute } from "astro";
import { createSupabaseClient } from "@/lib/supabase";
import { createCatalogEntry, NameTakenError } from "@/lib/plugins-catalog/queries";
import { parsePluginCatalogForm } from "@/lib/plugins-catalog/form";
import { actionOk, actionError } from "@/lib/ui/response";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const parsed = parsePluginCatalogForm(form);
  if (!parsed.ok) {
    return actionError({ error: parsed.message, field: parsed.field });
  }

  try {
    const entry = await createCatalogEntry(createSupabaseClient(), parsed.data);
    return actionOk({ message: "Plugin added.", data: entry });
  } catch (err) {
    if (err instanceof NameTakenError) {
      return actionError({ error: err.message, field: "name" });
    }
    return actionError({ error: "Could not add the plugin" }, 500);
  }
};
