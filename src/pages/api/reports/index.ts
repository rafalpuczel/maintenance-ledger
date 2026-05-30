import type { APIRoute } from "astro";
import { createSupabaseClient } from "@/lib/supabase";
import { createReport } from "@/lib/reports/queries";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const projectId = (form.get("project_id") as string | null) ?? "";
  // The project page sends its slug so we can redirect into the new report's
  // edit page (and back to the project on failure).
  const slug = (form.get("slug") as string | null) ?? "";

  try {
    const report = await createReport(createSupabaseClient(), projectId);
    return context.redirect(`/projects/${slug}/reports/${report.id}?ok=created`);
  } catch {
    return context.redirect(`/projects/${slug}?error=${encodeURIComponent("Could not create the report")}`);
  }
};
