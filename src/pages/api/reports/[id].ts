import type { APIRoute } from "astro";
import { createSupabaseClient } from "@/lib/supabase";
import { getReport, updateReport } from "@/lib/reports/queries";
import { getBrand } from "@/lib/brand-settings/queries";
import { parseReportForm } from "@/lib/reports/form";
import { renderReportPdf } from "@/lib/pdf/render";
import { reportDocument } from "@/lib/pdf/report-document";

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

  const client = createSupabaseClient();
  try {
    await updateReport(client, id, parsed.data);
  } catch {
    return context.redirect(`${reportUrl}?error=${encodeURIComponent("Could not save the report")}`);
  }

  // FR-017: a saved report must always be able to produce its branded PDF.
  // Render the freshly-saved report (discarding the bytes — the GET pdf route
  // re-renders on download) so an unrenderable report surfaces as an error
  // rather than silently saving. Wall-clock headroom is ample (F-02 p95 ~197ms).
  try {
    const report = await getReport(client, id);
    if (report) {
      const brand = await getBrand(client);
      await renderReportPdf(reportDocument({ report, brand }));
    }
  } catch {
    return context.redirect(`${reportUrl}?error=${encodeURIComponent("Saved, but the PDF could not be generated")}`);
  }

  return context.redirect(`${reportUrl}?ok=saved`);
};
