import type { APIRoute } from "astro";
import { createSupabaseClient } from "@/lib/supabase";
import { updateCatalogEntry, NameTakenError } from "@/lib/plugins-catalog/queries";
import { parsePluginCatalogForm } from "@/lib/plugins-catalog/form";

export const POST: APIRoute = async (context) => {
  const id = context.params.id ?? "";
  const form = await context.request.formData();
  const parsed = parsePluginCatalogForm(form);
  if (!parsed.ok) {
    return context.redirect(`/plugins-catalog?error=${encodeURIComponent(parsed.message)}`);
  }

  try {
    await updateCatalogEntry(createSupabaseClient(), id, parsed.data);
    return context.redirect("/plugins-catalog?ok=updated");
  } catch (err) {
    const message = err instanceof NameTakenError ? err.message : "Could not update the plugin";
    return context.redirect(`/plugins-catalog?error=${encodeURIComponent(message)}`);
  }
};
