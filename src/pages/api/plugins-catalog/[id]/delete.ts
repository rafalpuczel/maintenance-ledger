import type { APIRoute } from "astro";
import { createSupabaseClient } from "@/lib/supabase";
import { deleteCatalogEntry } from "@/lib/plugins-catalog/queries";

export const POST: APIRoute = async (context) => {
  const id = context.params.id ?? "";

  try {
    await deleteCatalogEntry(createSupabaseClient(), id);
    return context.redirect("/plugins-catalog?ok=deleted");
  } catch {
    return context.redirect(`/plugins-catalog?error=${encodeURIComponent("Could not delete the plugin")}`);
  }
};
