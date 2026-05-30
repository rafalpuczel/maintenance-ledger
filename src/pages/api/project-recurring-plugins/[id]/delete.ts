import type { APIRoute } from "astro";
import { createSupabaseClient } from "@/lib/supabase";
import { removeRecurringPlugin } from "@/lib/project-recurring-plugins/queries";

export const POST: APIRoute = async (context) => {
  const id = context.params.id ?? "";
  const form = await context.request.formData();
  const slug = (form.get("slug") as string | null) ?? "";
  const detailUrl = `/projects/${slug}`;

  try {
    await removeRecurringPlugin(createSupabaseClient(), id);
    return context.redirect(`${detailUrl}?ok=plugin-removed`);
  } catch {
    return context.redirect(`${detailUrl}?error=${encodeURIComponent("Could not remove the plugin")}`);
  }
};
