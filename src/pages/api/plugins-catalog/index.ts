import type { APIRoute } from "astro";
import { createSupabaseClient } from "@/lib/supabase";
import { createCatalogEntry, NameTakenError } from "@/lib/plugins-catalog/queries";
import { parsePluginCatalogForm } from "@/lib/plugins-catalog/form";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const parsed = parsePluginCatalogForm(form);
  if (!parsed.ok) {
    return context.redirect(`/plugins-catalog?error=${encodeURIComponent(parsed.message)}`);
  }

  try {
    await createCatalogEntry(createSupabaseClient(), parsed.data);
    return context.redirect("/plugins-catalog?ok=created");
  } catch (err) {
    const message = err instanceof NameTakenError ? err.message : "Could not add the plugin";
    return context.redirect(`/plugins-catalog?error=${encodeURIComponent(message)}`);
  }
};
