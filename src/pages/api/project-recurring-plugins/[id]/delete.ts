import type { APIRoute } from "astro";
import { createSupabaseClient } from "@/lib/supabase";
import { removeRecurringPlugin } from "@/lib/project-recurring-plugins/queries";
import { actionOk, actionError } from "@/lib/ui/response";

export const POST: APIRoute = async (context) => {
  const id = context.params.id ?? "";

  try {
    await removeRecurringPlugin(createSupabaseClient(), id);
    return actionOk({ message: "Plugin removed from the recurring list.", data: { id } });
  } catch {
    return actionError({ error: "Could not remove the plugin" }, 500);
  }
};
