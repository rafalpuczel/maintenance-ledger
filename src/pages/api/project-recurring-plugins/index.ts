import type { APIRoute } from "astro";
import { createSupabaseClient } from "@/lib/supabase";
import {
  addRecurringPluginById,
  addRecurringPluginByName,
  listRecurringPlugins,
  AlreadyOnListError,
} from "@/lib/project-recurring-plugins/queries";
import { parseAddRecurringForm } from "@/lib/project-recurring-plugins/form";
import { actionOk, actionError } from "@/lib/ui/response";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const projectId = (form.get("project_id") as string | null) ?? "";

  const parsed = parseAddRecurringForm(form);
  if (!parsed.ok) {
    return actionError({ error: parsed.message });
  }

  try {
    const client = createSupabaseClient();
    if (parsed.kind === "id") {
      await addRecurringPluginById(client, projectId, parsed.pluginId);
    } else {
      await addRecurringPluginByName(client, projectId, parsed.name);
    }
    // The add helpers return void; re-list so the client gets the full, sorted
    // recurring list (with the joined plugin name) to render in place.
    const list = await listRecurringPlugins(client, projectId);
    return actionOk({ message: "Plugin added to the recurring list.", data: list });
  } catch (err) {
    if (err instanceof AlreadyOnListError) {
      return actionError({ error: err.message });
    }
    return actionError({ error: "Could not add the plugin" }, 500);
  }
};
