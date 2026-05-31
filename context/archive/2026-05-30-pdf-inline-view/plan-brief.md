# PDF Inline View — Plan Brief

> Full plan: `context/changes/pdf-inline-view/plan.md`

## What & Why

Make the report PDF open inline in the browser (a new tab) when viewed, instead of forcing a file download. This is roadmap slice **S-12** — the smallest post-MVP slice, a genuine quick win. Today the download interrupts the flow; viewing inline lets the user glance at the rendered report without leaving a file on disk.

## Starting Point

`GET /api/reports/[id]/pdf` renders the report on demand and returns it with `content-disposition: attachment`, forcing a download. The report page (`.../reports/[id].astro`) links to it with a single plain "Download PDF" `<a>` (no `target`). The email send path renders its own bytes separately and is unaffected.

## Desired End State

The report-page link reads "View PDF" and opens the branded PDF inline in a new tab (the report page stays put behind it). No separate download link is shown — saving is left to the browser viewer's built-in control. Email attachments are unchanged.

## Key Decisions Made

| Decision                       | Choice                                  | Why (1 sentence)                                              | Source |
| ------------------------------ | --------------------------------------- | ------------------------------------------------------------ | ------ |
| Route mechanism                | Always `inline`, no `?download` variant | User chose the simplest path — rely on the browser viewer's save button rather than a second route. | Plan   |
| Page UI                        | One "View PDF" link only                | Keeps the button row at one element; no explicit download affordance. | Plan   |
| Inline `content-disposition`   | Bare `inline` (no `filename`)           | User opted out of a filename hint on the inline response.    | Plan   |
| Phase structure                | Single phase                            | ~2-line change across 2 coupled files — nothing to checkpoint between. | Plan   |

## Scope

**In scope:**
- Flip `content-disposition` from `attachment` to bare `inline` in `src/pages/api/reports/[id]/pdf.ts`; drop the now-dead `filename` computation.
- Relabel the report-page link to "View PDF" + add `target="_blank"` / `rel="noopener"`.

**Out of scope:**
- A separate explicit-download link or `?download=1` route variant (consciously dropped — see risks).
- Any change to the renderer, the 5 s p95 budget, empty-section hiding, or the email-attachment path.
- The S-10 redesign — the link keeps the current `bg-cosmic` styling.

## Architecture / Approach

Two coupled edits in one phase: the route serves `inline` so the browser displays the PDF; the page link opens that route in a new tab. They verify together because the new-tab link only makes sense once the route is inline. Render bytes are byte-identical to today.

## Phases at a Glance

| Phase                                   | What it delivers                                            | Key risk                                                       |
| --------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------- |
| 1. Inline PDF view + report-page link   | PDF opens inline in a new tab; link relabeled "View PDF"    | A browser configured to always-download PDFs still downloads (out of our control). |

**Prerequisites:** None beyond the shipped MVP (the route and report page already exist; S-09 is done).
**Estimated effort:** One short session — two small edits + a manual tab-open check.

## Open Risks & Assumptions

- **No explicit download affordance** — page offers only "View PDF"; saving relies on the browser viewer's control. This narrows S-12's stated "keep a save-to-file path" outcome (user-accepted). A `?download=1` branch is a cheap follow-up if wanted.
- **Bare `inline` → save-as defaults to `pdf`**, not `<slug>-<month>.pdf`, because no `filename` is set. Accepted; re-add `filename` to the `inline` header if the readable name matters.
- **Browser assumption** — `inline` PDFs render in the built-in viewer on the committed desktop browser matrix; a PDF-always-download setting or handler extension may still download.

## Success Criteria (Summary)

- Clicking "View PDF" opens the branded PDF inline in a new tab (not a download); the report page stays open behind it.
- The rendered PDF is unchanged (brand, content, empty-section hiding intact).
- "Send to PM" / "Send to client" still attaches the PDF — the email path is unaffected.
