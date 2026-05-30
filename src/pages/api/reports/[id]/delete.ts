import type { APIRoute } from "astro";
import { createSupabaseClient } from "@/lib/supabase";
import { deleteReport } from "@/lib/reports/queries";

export const POST: APIRoute = async (context) => {
  const id = context.params.id ?? "";
  const form = await context.request.formData();
  const slug = (form.get("slug") as string | null) ?? "";
  const projectUrl = `/projects/${slug}`;

  try {
    await deleteReport(createSupabaseClient(), id);
    return context.redirect(`${projectUrl}?ok=report-deleted`);
  } catch {
    return context.redirect(`${projectUrl}?error=${encodeURIComponent("Could not delete the report")}`);
  }
};
