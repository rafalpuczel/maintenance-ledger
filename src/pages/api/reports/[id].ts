import type { APIRoute } from "astro";
import { createSupabaseClient } from "@/lib/supabase";
import { getReport, updateReport } from "@/lib/reports/queries";
import { getBrand } from "@/lib/brand-settings/queries";
import { parseReportForm } from "@/lib/reports/form";
import { renderReportPdf } from "@/lib/pdf/render";
import { reportDocument } from "@/lib/pdf/report-document";
import { actionOk, actionError } from "@/lib/ui/response";

export const POST: APIRoute = async (context) => {
  const id = context.params.id ?? "";
  const form = await context.request.formData();

  const parsed = parseReportForm(form);
  if (!parsed.ok) {
    return actionError({ error: parsed.message });
  }

  const client = createSupabaseClient();
  try {
    await updateReport(client, id, parsed.data);
  } catch {
    return actionError({ error: "Could not save the report" }, 500);
  }

  // FR-017: a saved report must always be able to produce its branded PDF.
  // Render the freshly-saved report (discarding the bytes — the GET pdf route
  // re-renders on download) so an unrenderable report surfaces as a warning
  // rather than silently saving. Wall-clock headroom is ample (F-02 p95 ~197ms).
  try {
    const report = await getReport(client, id);
    if (report) {
      const brand = await getBrand(client);
      await renderReportPdf(reportDocument({ report, brand }));
    }
  } catch {
    // The save persisted; only the PDF render failed. Success-with-warning so
    // the client reflects the save but flags that the PDF may be stale.
    return actionOk({ message: "Saved, but the PDF could not be generated.", warning: true });
  }

  return actionOk({ message: "Changes saved." });
};
