import type { APIRoute } from "astro";
import { createSupabaseClient } from "@/lib/supabase";
import { updateReport } from "@/lib/reports/queries";
import { parseReportForm } from "@/lib/reports/form";

export const POST: APIRoute = async (context) => {
  const id = context.params.id ?? "";
  const form = await context.request.formData();
  // The edit page sends the project slug so redirects land on the report URL.
  const slug = (form.get("slug") as string | null) ?? "";
  const reportUrl = `/projects/${slug}/reports/${id}`;

  const parsed = parseReportForm(form);
  if (!parsed.ok) {
    return context.redirect(`${reportUrl}?error=${encodeURIComponent(parsed.message)}`);
  }

  try {
    await updateReport(createSupabaseClient(), id, parsed.data);
    return context.redirect(`${reportUrl}?ok=saved`);
  } catch {
    return context.redirect(`${reportUrl}?error=${encodeURIComponent("Could not save the report")}`);
  }
};
