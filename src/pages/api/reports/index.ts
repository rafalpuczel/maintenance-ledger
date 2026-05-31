import type { APIRoute } from "astro";
import { createSupabaseClient } from "@/lib/supabase";
import { createReport } from "@/lib/reports/queries";
import { actionOk, actionError } from "@/lib/ui/response";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const projectId = (form.get("project_id") as string | null) ?? "";
  // The project page sends its slug so the client can navigate into the new
  // report's edit page.
  const slug = (form.get("slug") as string | null) ?? "";

  try {
    const report = await createReport(createSupabaseClient(), projectId);
    return actionOk({
      message: "Report created.",
      data: report,
      redirectTo: `/projects/${slug}/reports/${report.id}`,
    });
  } catch {
    return actionError({ error: "Could not create the report" }, 500);
  }
};
