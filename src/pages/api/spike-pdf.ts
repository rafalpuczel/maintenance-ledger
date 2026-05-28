// THROWAWAY — F-02 go/no-go spike (pdf-render-pipeline). Deleted in Phase 5.
//
// Renders the full FR-014 branded report (SAMPLE_REPORT) at /api/spike-pdf.
// Auth-gated by default — src/middleware.ts gates every path not in its
// PUBLIC_PATHS/PUBLIC_PREFIXES allowlist.
// NOTE: route is NOT under an `_`-prefixed path — Astro excludes those from
// routing (they 404). `spike-` keeps the throwaway signal without hiding it.
import type { APIRoute } from "astro";
import { renderSpikePdf } from "@/lib/pdf/render-spike";
import { spikeReportElement } from "@/lib/pdf/spike-template";
import { SAMPLE_REPORT, SAMPLE_BRAND } from "@/lib/pdf/spike-fixtures";

export const GET: APIRoute = async () => {
  const pdf = await renderSpikePdf(spikeReportElement(SAMPLE_REPORT, SAMPLE_BRAND));

  return new Response(pdf.buffer as ArrayBuffer, {
    headers: {
      "content-type": "application/pdf",
      "cache-control": "no-store",
    },
  });
};
