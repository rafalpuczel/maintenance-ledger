import type { APIRoute } from "astro";
import { createSupabaseClient } from "@/lib/supabase";
import { deleteCatalogEntry } from "@/lib/plugins-catalog/queries";
import { actionOk, actionError } from "@/lib/ui/response";

export const POST: APIRoute = async (context) => {
  const id = context.params.id ?? "";

  try {
    await deleteCatalogEntry(createSupabaseClient(), id);
    return actionOk({ message: "Plugin removed.", data: { id } });
  } catch {
    return actionError({ error: "Could not delete the plugin" }, 500);
  }
};
