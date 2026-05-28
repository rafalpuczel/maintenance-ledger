// THROWAWAY — F-02 go/no-go spike (pdf-render-pipeline). Deleted in Phase 5.
//
// Phase 1: smoke target at /api/spike-pdf. Renders a trivial one-line PDF to
// prove the WASM init/bundle contract works on workerd. Grows into the full-
// template render in Phase 3. Auth-gated by default — src/middleware.ts gates
// every path not in its PUBLIC_PATHS/PUBLIC_PREFIXES allowlist.
// NOTE: route is NOT under an `_`-prefixed path — Astro excludes those from
// routing (they 404). `spike-` keeps the throwaway signal without hiding it.
import type { APIRoute } from "astro";
import { createElement as h } from "react";
import { Document, Page, Text } from "@formepdf/react";
import { renderSpikePdf } from "@/lib/pdf/render-spike";

export const GET: APIRoute = async () => {
  const doc = h(
    Document,
    null,
    h(
      Page,
      { size: "A4", margin: 54 },
      h(Text, { style: { fontSize: 24 } }, "Maintenance Ledger — FormePDF workerd smoke test"),
    ),
  );

  const pdf = await renderSpikePdf(doc);

  return new Response(pdf.buffer as ArrayBuffer, {
    headers: {
      "content-type": "application/pdf",
      "cache-control": "no-store",
    },
  });
};
