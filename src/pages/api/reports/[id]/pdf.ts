import type { APIRoute } from "astro";
import { createSupabaseClient } from "@/lib/supabase";
import { getReport } from "@/lib/reports/queries";
import { getBrand } from "@/lib/brand-settings/queries";
import { getProjectById } from "@/lib/projects/queries";
import { renderReportPdf } from "@/lib/pdf/render";
import { reportDocument } from "@/lib/pdf/report-document";
import { fileToken } from "@/lib/pdf/filename";

// GET /api/reports/[id]/pdf — render the current report to a branded PDF and
// return it as a download. Inherits the session gate from middleware (the path
// is not in PUBLIC_PATHS). Render-on-demand: no bytes are persisted; the PDF
// always reflects the report as currently saved.
export const GET: APIRoute = async (context) => {
  const id = context.params.id ?? "";
  const client = createSupabaseClient();

  const report = await getReport(client, id);
  if (!report) {
    return new Response("Report not found", { status: 404 });
  }

  const [brand, project] = await Promise.all([getBrand(client), getProjectById(client, report.project_id)]);

  const slug = project ? fileToken(project.slug) : "report";
  const filename = `${slug}-${report.month}.pdf`;

  try {
    const pdf = await renderReportPdf(reportDocument({ report, brand }));
    return new Response(pdf.buffer as ArrayBuffer, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch {
    return new Response("Could not render the report PDF", { status: 500 });
  }
};
