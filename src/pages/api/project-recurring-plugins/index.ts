import type { APIRoute } from "astro";
import { createSupabaseClient } from "@/lib/supabase";
import {
  addRecurringPluginById,
  addRecurringPluginByName,
  AlreadyOnListError,
} from "@/lib/project-recurring-plugins/queries";
import { parseAddRecurringForm } from "@/lib/project-recurring-plugins/form";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const projectId = (form.get("project_id") as string | null) ?? "";
  // The project page sends its slug so every redirect lands back on the detail URL.
  const slug = (form.get("slug") as string | null) ?? "";
  const detailUrl = `/projects/${slug}`;

  const parsed = parseAddRecurringForm(form);
  if (!parsed.ok) {
    return context.redirect(`${detailUrl}?error=${encodeURIComponent(parsed.message)}`);
  }

  try {
    const client = createSupabaseClient();
    if (parsed.kind === "id") {
      await addRecurringPluginById(client, projectId, parsed.pluginId);
    } else {
      await addRecurringPluginByName(client, projectId, parsed.name);
    }
    return context.redirect(`${detailUrl}?ok=plugin-added`);
  } catch (err) {
    const message = err instanceof AlreadyOnListError ? err.message : "Could not add the plugin";
    return context.redirect(`${detailUrl}?error=${encodeURIComponent(message)}`);
  }
};
