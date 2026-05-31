# PDF Inline View Implementation Plan

## Overview

Make the report PDF open inline in the browser (a new tab) when the user clicks to view it, instead of forcing a file download. This is roadmap slice **S-12** (`pdf-inline-view`) — the smallest slice in the post-MVP round. The change is a single response-header flip plus a one-line report-page link tweak; the render pipeline, the 5 s p95 budget, empty-section hiding, and the email-attachment path are all untouched.

## Current State Analysis

- **`src/pages/api/reports/[id]/pdf.ts`** renders the current report on demand and returns it with `content-disposition: attachment; filename="<slug>-<month>.pdf"` (line 33). The `attachment` disposition is the single thing forcing a download. The render call `renderReportPdf(reportDocument({ report, brand }))` is independent of the header.
- **`src/pages/projects/[slug]/reports/[id].astro`** (lines 58–63) is the **only** consumer of this route: a plain `<a href={`/api/reports/${report.id}/pdf`}>Download PDF</a>` with no `target`, sitting in a flex row beside the Send-to-PM / Send-to-client islands. The page still wears the dark `bg-cosmic` theme (the S-10 redesign has not landed yet).
- **`src/lib/email/send-report.ts`** (line 45) renders its **own** PDF bytes and base64-encodes them for the Resend `attachments` field (line 60). It never reads or sets the HTTP `content-disposition`, so the email-attachment behavior is structurally independent of this change.
- The `filename` value in `pdf.ts` (lines 25–26) is computed **only** to populate the `content-disposition` header; it has no other use in that file.

### Key Discoveries:

- The force-download is exactly one token: `attachment` → `inline` at `src/pages/api/reports/[id]/pdf.ts:33`.
- The send path is genuinely out of scope — it shares the *renderer* (`@/lib/pdf/render`) but not the *HTTP response*, so flipping the disposition cannot affect email attachments (`src/lib/email/send-report.ts:45,60`).
- The report page is the sole link to the route, so the UI change is contained to one `<a>` in one `.astro` file (`src/pages/projects/[slug]/reports/[id].astro:58-63`).

## Desired End State

Clicking the report PDF link opens the branded PDF **inline in a new browser tab** (the report page stays put behind it), rendered by the browser's built-in PDF viewer. The link reads **"View PDF"**. No separate explicit-download affordance is shown on the page — saving is left to the browser viewer's built-in save control (a deliberate simplification, see "What We're NOT Doing"). The email-attachment behavior is unchanged.

Verified by: navigating to a report, clicking "View PDF", and confirming the PDF renders in a new tab (not a download prompt) while the report tab remains open; and confirming a "Send to PM"/"Send to client" still attaches the PDF.

## What We're NOT Doing

- **Not** keeping a separate explicit "Download" link/affordance on the page. The roadmap's S-12 outcome mentions "an explicit save-to-file path remains available"; the user explicitly chose (during planning) to rely on the browser PDF viewer's built-in save button instead of a dedicated download link/route. This is a conscious scope reduction — recorded in Open Risks below.
- **Not** adding a `?download=` query-param variant or a second route. The response is unconditionally `inline`.
- **Not** setting a `filename` on the `inline` response (per the planning decision — bare `inline`). The save-as default will therefore derive from the URL; see Open Risks.
- **Not** touching the PDF renderer, the report document, the 5 s p95 budget, or empty-section hiding — the bytes are identical to today.
- **Not** touching the email send path (`send-report.ts`) — it does not use the HTTP disposition.
- **Not** anticipating the S-10 redesign. The link is styled to match the *current* `bg-cosmic` button row; S-10 will re-lay-out this region later.

## Implementation Approach

Two coupled edits, one phase: (1) flip the route's `content-disposition` to bare `inline` so the browser displays rather than downloads, and remove the now-dead `filename` computation if it has no remaining use; (2) relabel the report-page link to "View PDF" and add `target="_blank"` + `rel="noopener"` so it opens in a new tab while the report page stays put. The two are interdependent — the new-tab link only makes sense once the route serves inline — so they verify together.

## Phase 1: Inline PDF view + report-page link

### Overview

Serve the PDF inline and turn the report-page link into a new-tab "View PDF" affordance.

### Changes Required:

#### 1. PDF route — serve inline

**File**: `src/pages/api/reports/[id]/pdf.ts`

**Intent**: Stop forcing a download so the browser renders the PDF in its built-in viewer. Change the response disposition from `attachment` to a bare `inline` (no `filename`). The `filename` local is computed solely for the old header — remove it (and the now-unused `fileToken` import and the `project`/`slug` plumbing **only if** `project` becomes otherwise unused; verify `project` isn't read elsewhere in the handler before deleting its fetch).

**Contract**: Response header becomes `content-disposition: inline` (no `filename` parameter). `content-type: application/pdf` and the 200/404/500 status behavior are unchanged. The render call and its bytes are unchanged.

#### 2. Report page — "View PDF" link opens in a new tab

**File**: `src/pages/projects/[slug]/reports/[id].astro` (lines 58–63)

**Intent**: Relabel the link from "Download PDF" to "View PDF" and make it open in a new browser tab so the report page stays put behind the viewer.

**Contract**: The existing `<a href={`/api/reports/${report.id}/pdf`}>` gains `target="_blank"` and `rel="noopener"`; its visible text changes to "View PDF". The existing Tailwind classes (current `bg-cosmic`-matching button styling) are kept as-is.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck` (or `astro check`)
- Linting passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification:

- Clicking "View PDF" on a report opens the branded PDF inline in a **new tab** (browser viewer), not a download prompt; the report tab stays open.
- The rendered PDF is correct (brand + content + empty sections hidden) — i.e. the bytes are unchanged from before.
- "Send to PM" / "Send to client" still attaches the PDF to the email (email path unaffected).

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation that the new-tab view and the unaffected send path were verified before closing the change.

---

## Testing Strategy

### Unit Tests:

- None warranted. The change is an HTTP header value and a static link attribute; there is no branching logic, parser, or data transformation to unit-test. (Consistent with the slice's trivial scope.)

### Manual Testing Steps:

1. Open a project → open a report that has a PDF.
2. Click "View PDF" → confirm a new browser tab opens showing the PDF inline (no download dialog), and the report tab is still present.
3. In the viewer, confirm the PDF content matches the saved report (brand applied, empty sections hidden).
4. Use the browser viewer's own save/print control once to confirm saving still works (it relies on viewer chrome by design).
5. Back on the report page, click "Send to PM" (or "Send to client") and confirm the email still carries the PDF attachment.

## Performance Considerations

None. The route still renders on demand with identical bytes; only the response header differs. The 5 s p95 render NFR is unaffected.

## Migration Notes

None. No data, schema, or persisted artifacts are involved. The change is forward-only and trivially revertible (restore the `attachment` disposition and the old link text/attributes).

## References

- Roadmap slice: `context/foundation/roadmap.md` — S-12 `pdf-inline-view` (lines 246–256)
- PRD: `context/foundation/prd-v2.md` — v2 US-05 (view PDF in browser, keep download)
- Route being changed: `src/pages/api/reports/[id]/pdf.ts:33`
- Link being changed: `src/pages/projects/[slug]/reports/[id].astro:58-63`
- Unaffected send path (shares renderer, not HTTP disposition): `src/lib/email/send-report.ts:45,60`

## Open Risks & Assumptions

- **No explicit download affordance** (deliberate). The page will offer only "View PDF". Saving relies on the browser PDF viewer's built-in control. This narrows the roadmap's stated "keep an explicit save-to-file path" outcome — accepted by the user during planning. If a dedicated download link is wanted later, add a `?download=1` branch to the route and a second link (a small follow-up).
- **Bare `inline` → save-as filename loses the readable name.** With `content-disposition: inline` and no `filename`, saving from the viewer defaults the filename to the URL's last segment (`pdf`) rather than `<slug>-<month>.pdf`. Accepted per the planning decision; if the readable save-as name matters, re-add `filename="<slug>-<month>.pdf"` to the `inline` header (keeps the `filename`/`fileToken` plumbing).
- **Browser behavior assumption.** `content-disposition: inline` on `application/pdf` renders in the built-in viewer on current desktop Chrome/Firefox/Safari/Edge (the MVP's committed browser matrix). A browser configured to always download PDFs, or a PDF-handler extension, may still download — outside our control and acceptable.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Inline PDF view + report-page link

#### Automated

- [x] 1.1 Type checking passes (`npm run typecheck` / `astro check`) — 76a32e0
- [x] 1.2 Linting passes (`npm run lint`) — 76a32e0
- [x] 1.3 Build succeeds (`npm run build`) — 76a32e0

#### Manual

- [x] 1.4 "View PDF" opens the PDF inline in a new tab (not a download); report tab stays open — 76a32e0
- [x] 1.5 Rendered PDF is correct (brand + content + empty sections hidden), bytes unchanged — 76a32e0
- [x] 1.6 "Send to PM" / "Send to client" still attaches the PDF (email path unaffected) — 76a32e0
