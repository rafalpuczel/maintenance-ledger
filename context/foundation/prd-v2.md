---
project: "Maintenance Ledger"
version: 2
status: draft
created: 2026-05-30
context_type: brownfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  delivery_weeks: 2
  hard_deadline: null
  after_hours_only: true
---

> Brownfield PRD for the post-MVP improvement round. The greenfield MVP product
> spec lives in `prd.md` (v1) and is unchanged; this document describes the
> *delta* on top of the shipped MVP. Sourced from `context/foundation/shape-notes.md`.

## Current System Overview

**System purpose (one sentence):** Maintenance Ledger collapses the agency's WordPress-retainer reporting pipeline (dev notes → PM reformat in a docs template → PDF → email) into one in-app flow — author the report, get a deterministic agency-branded PDF, send it to the PM and the client.

**Status:** feature-complete MVP. The full author → branded-PDF → send-to-PM-and-client loop is shipped and in production as of 2026-05-30. This round is a post-MVP experience-quality pass plus two small capability additions, not new core functionality.

**Key architecture:** server-rendered web application on a serverless/edge runtime, with interactive client-side islands hydrated into otherwise static pages. A shared-credential signed session cookie gates every route except the login page.

**Tech stack (current reality — named here because this section describes what exists, not a choice):**
- Frontend: Astro 5 server-rendered pages + React 19 islands + Tailwind CSS v4 (shadcn-style design tokens; lucide-react icons). The current visual theme is a dark gradient ("cosmic") utility.
- Forms today: native HTML `<form method="POST">` that posts to an API route and receives a full-page redirect back with `?ok=`/`?error=` query flags. Islands do client-side validation and show a pending button label, but the navigation itself is a full-page reload — there is no in-place/async submit.
- Backend/API: Astro `.ts` API routes; data access via the Supabase JS client over HTTP/PostgREST. Per-domain code pattern: client factory + query module + zod schema + form mapper.
- PDF: rendered on-demand on the edge runtime (FormePDF), no bytes persisted; requires the paid runtime tier.
- Email: transactional send via Resend using a single hardcoded subject + body; the PDF rides as an attachment.
- Auth: peppered Web Crypto HMAC shared-credential check with a per-IP throttle.
- Data: Supabase Postgres; migrations and seeds run from a local process against the host.

**Current user base:** one agency team (~5 PMs + ~15 devs) sharing a single login credential set. Small scale, low request volume. Usable on desktop Chrome/Firefox/Safari/Edge only today.

**Core functionality today:** shared-credential login; projects CRUD; brand settings (logo + colors); global plugins catalog; PM contact list; per-project recurring plugins; report authoring (fixed sections + plugins/themes/licenses row repeaters, recurring-seeded, with WP-CLI table bulk-paste); branded PDF on every save plus a download link; send report to PM and to client with a re-send confirmation guard and inline send history.

## Problem Statement & Motivation

The MVP works but presents like an unstyled starter rather than a product the agency is proud to use daily. Concrete gaps, observed in the running system:

- **No real homepage.** The site root is the starter splash; the post-login landing is a single narrow centered card with hand-rolled navigation links.
- **No shared navigation.** There is no consistent header across the app — every page re-implements its own back-links and sign-out, and a navigation component that was built sits unused.
- **Cramped, narrow layouts.** Every page is a centered card capped at a small fixed width on a dark background. On the report page, the Download / Send-to-PM / Send-to-client / Delete actions are crammed into one row, and when a Send button is disabled its explanation spills out as inline text that does not fit the button row (e.g. "No client email — add one on the project", "No PM contacts — add one in Settings"). This is the "broken inline text" the user called out; the explanation belongs in a tooltip on the disabled control.
- **Full-page reloads on every action.** Saving, sending, and deleting each reload the whole page (the screen flashes blank) instead of updating in place; there is no continuous in-progress feedback beyond a button-label flip on a few surfaces.
- **The PDF forces a file download** rather than opening in the browser for a quick look.
- **The outbound email copy is frozen.** Subject and body are fixed in code, so the agency cannot tailor the message — and cannot give PMs and clients appropriately different wording.

**Why now:** the product's *function* is done and validated in production, so the remaining gap is entirely experience quality (visual design, layout width, a shared shell, asynchronous interactions) plus two small capability gaps (open the PDF in the browser, edit the email copy). With the core proven, there is now room to invest in polish and to deliberately reopen three scope locks the MVP cut for its three-week budget — mobile-responsive layout, WCAG-AA accessibility, and editable email templates.

**Current workaround and its cost:** none in-tool — users simply tolerate the cramped forms, the page flashes, the forced PDF download, and the one-size message. The cost is daily friction and a tool that under-represents the agency's professionalism for an artifact that ultimately reaches clients.

## User & Persona

Same primary persona as the MVP; this round changes their *experience*, and widens *where* they can work.

**Developer** (≈15) — runs the maintenance round and authors the report. Today tolerates the cramped report form and the full-page reloads. Most affected by: nicer and wider forms, asynchronous save with a visible in-progress state, button tooltips that replace the broken inline warnings, and opening the rendered PDF in the browser to eyeball it without a download round-trip.

**PM / team lead** (≈5) — reviews and sends reports. Most affected by: the shared header/navigation (faster movement between dashboard, projects, reports, and settings), asynchronous send with clear in-progress and success feedback, and the editable per-recipient email templates (PMs and clients receive appropriately different messaging).

No new persona is introduced. The full-responsive and accessibility work widens where the existing personas can use the tool — phones, tablets, and with assistive technology — without adding a new user type.

## Success Criteria

### Primary
- A user can complete the existing end-to-end flow (sign in → dashboard → project → author report → save → open/inspect PDF → send to PM and client) through a redesigned, consistently-navigated, wider interface, with every action giving immediate in-progress feedback and no full-page blank-flash reload.
- The home route presents a usable work dashboard (recent projects, recent reports, quick actions to create a project or report, links into settings) instead of the starter splash.
- The agency can set distinct subject and body copy for PM emails and for client emails, with supported placeholders filled in automatically at send time, and those templates are used when reports are sent.
- The rendered report PDF opens for viewing in the browser from the report page, while an explicit save-to-file path remains available.

### Secondary
- The application is laid out correctly and is usable on phone and tablet widths, not only desktop.
- Disabled actions explain themselves through tooltips rather than inline text that breaks the layout.
- Lists present polished empty states and loading placeholders rather than bare text.

### Guardrails (existing behavior that must NOT regress)
- The shared-login gate remains in force on every route except the login page.
- Empty report sections stay hidden in the PDF (no headers, no "none" placeholders).
- A client-facing artifact — now including the client email copy — never exposes project internal notes or the internal contact email beyond what the user has explicitly written into the visible fields. The editable email copy must not become a new leak path.
- A failed send still surfaces an error in-app and records no send; success is shown only after the system confirms it (no false-success state from the asynchronous interactions).
- Saving a report and obtaining its PDF stays within the existing five-second 95th-percentile budget for reports of up to 30 plugin and 5 theme rows; opening the PDF in the browser does not regress this.
- The re-send confirmation and inline send-history safeguards remain.

## User Stories

> Delta-framed: each story describes the new behavior and notes what was different before. Derived from the Scope of Change; no scope beyond §"Scope of Change" is introduced here.

### US-01: Consistent navigation across every page

- **Given** a signed-in user on any page (dashboard, a project, a report, or any settings page)
- **When** they want to move to another area of the app or sign out
- **Then** they use one shared header with consistent navigation present on every page
- **Before:** there was no shared header; each page re-implemented its own back-links and sign-out, and the navigation component that existed was unused.

#### Acceptance Criteria
- The same header/navigation appears on all authenticated pages.
- Sign-out is reachable from the header on every page.
- The header meets the accessibility bar in §Success Criteria → Guardrails (keyboard operable, visible focus, landmark structure).

### US-02: A real work dashboard at home

- **Given** a signed-in user lands on the home route
- **When** the page loads
- **Then** they see recent projects, recent reports, quick actions to create a project or a report, and links into settings
- **Before:** the home route was the starter splash and the post-login landing was a thin card with hand-rolled links.

#### Acceptance Criteria
- Recent projects and recent reports are listed with links to their detail pages.
- Quick actions to start a new project and a new report are present.
- An empty system (no projects/reports yet) shows an explanatory empty state, not bare text.

### US-03: Actions give immediate feedback without a page reload

- **Given** a signed-in user saves a form, deletes an item, or sends a report
- **When** they trigger the action
- **Then** the action acknowledges immediately with a visible in-progress indicator, the affected list or row updates in place, and the outcome is announced — without the page reloading or flashing blank; on failure the optimistic change is rolled back and an error is shown
- **Before:** every such action did a full-page reload, surfacing the result via a query-string banner after the reload.

#### Acceptance Criteria
- No create/edit/delete/send action produces a full-page blank-flash reload.
- A list or repeater mutation reflects immediately and rolls back if the server rejects it.
- Success and error outcomes are announced (replacing the prior query-string banners), and the announcement is accessible.
- A send that fails shows an error and writes no send record.

### US-04: Disabled actions explain themselves in a tooltip

- **Given** a report whose Send-to-PM or Send-to-client action is unavailable (no client email on the project, or no PM contacts saved)
- **When** the user looks at the disabled action
- **Then** the reason and the fix are presented in a tooltip on the control, not as inline text in the button row
- **Before:** the explanation rendered as inline text that did not fit and broke the button row.

#### Acceptance Criteria
- The disabled-state explanation appears in a tooltip, reachable by keyboard and pointer.
- The button row layout is no longer broken by the explanatory text.

### US-05: Open the report PDF in the browser

- **Given** a saved report
- **When** the user chooses to view the PDF from the report page
- **Then** the rendered PDF opens for viewing in a new browser tab, leaving the report page in place
- **Before:** the action forced a file download.

#### Acceptance Criteria
- Viewing opens the rendered PDF in a new tab.
- An explicit save-to-file path is still available for users who want the file.
- The PDF content is unchanged; only how it is delivered changes.

### US-06: Edit the email subject and body per recipient

- **Given** a user on the email configuration settings page
- **When** they edit the subject and body for PM emails and, separately, for client emails, using supported placeholders, and save
- **Then** subsequent report sends to a PM use the PM template and sends to a client use the client template, with placeholders filled in from the report, project, and brand at send time
- **Before:** both sends used a single fixed subject and body frozen in code.

#### Acceptance Criteria
- Two independent templates exist (one for PM, one for client), each an editable subject + body.
- Only a fixed, vetted set of placeholders is available; placeholders resolve at send time.
- If no template has been saved, sending falls back to the prior default copy.
- The client template cannot surface internal-only fields (see the no-leak guardrail).

## Scope of Change

Grouped by the four intended delivery slices (shaped together; each planned and shipped separately).

### Slice A — Visual redesign + shared shell
- [new] A shared application header with navigation rendered on all authenticated pages (dashboard, projects, project detail, report detail, all settings pages), replacing the unused navigation component and the per-page hand-rolled back-links and sign-out.
- [new] A real work dashboard at the home route: recent projects, recent reports, quick actions (new project / new report), and links into settings — replacing the starter splash at the root and the thin post-login card.
- [modified] Visual identity switches from the dark gradient theme to a light, professional business-tool aesthetic. The design tokens are re-themed.
- [modified] Wider content area — pages move off the narrow centered fixed-width cards to a wider, structured layout appropriate to each page.
- [modified] Nicer forms — restyled fields, grouping, spacing, and validation presentation across the project, report, and settings forms.
- [modified] The report page's action buttons get tooltips: the disabled Send-to-PM / Send-to-client explanations move out of the button row into a tooltip on the control.
- [new] Polished empty states and loading placeholders for lists (projects, reports, contacts, catalog) — folded into this slice as part of making it a real product.
- [modified] Full responsive layout — pages work across phone, tablet, and desktop widths. Reopens the MVP non-goals "mobile-responsive layout" and the web-only/mobile lock.
- [new] Accessibility pass to WCAG-AA — focus states, semantic landmarks, ARIA where needed, AA color contrast, and keyboard operability of all interactive elements (including the new tooltips, dialogs, and outcome announcements). Reopens the MVP non-goal "WCAG-AA accessibility commitment."

### Slice B — Asynchronous actions + UX feedback (depends on Slice A)
- [modified] Form submissions become asynchronous — submits update in place instead of doing a full-page reload. Applies to create/edit/delete on projects, reports, and repeater rows, to settings, and to the send actions.
- [new] Optimistic UI — list and repeater mutations (add/remove/edit a row; delete a project, report, contact, or catalog entry) reflect immediately before the server confirms, rolling back on error.
- [new] Visible in-progress indicators on every asynchronous action, with controls disabled while the action is in flight.
- [new] Outcome announcements (success/error) replacing the current query-string banner pattern.
- [modified] Consistent confirmation prompts for all destructive actions (delete project / report / PM contact / catalog entry), matching the existing send re-send confirmation.
- [new] A set of UX recommendations is delivered with this slice's plan (explicitly requested).

### Slice C — Open the PDF in the browser
- [modified] The view-PDF action opens the rendered PDF in a new browser tab instead of forcing a file download.
- [preserved] An explicit save-to-file path remains available for users who want the file. The attachment-on-email behavior is unchanged.

### Slice D — Editable email configuration (separate PM + client templates)
- [new] An email configuration settings page where the user edits the subject and body for outbound report emails.
- [new] Two independent templates — one for Send-to-PM and one for Send-to-client — each an editable subject + body. Reopens the MVP non-goal "editable email body templates."
- [new] Placeholder interpolation — templates support a vetted set of variables (e.g. project, month, agency; final set pinned during planning) filled at send time.
- [modified] The send path stops using its hardcoded subject/body and instead renders the stored template for the recipient type, filling placeholders — falling back to the prior default copy when no template is saved.
- [new] Stored configuration for the two templates, following the established per-domain data-access pattern; a single global configuration, like brand settings.

### Explicitly preserved across all slices
- [preserved] The shared-login gate on every non-login route.
- [preserved] Empty-section hiding in the PDF.
- [preserved] The no-leak guarantee for client-facing artifacts (now extended to the client email copy).
- [preserved] The re-send confirmation and inline send-history safeguards.
- [preserved] Save-time PDF generation semantics (this round's asynchronous work is about request/response experience, not moving work off the request path).

## Constraints & Compatibility

**Backward compatibility:** all existing routes and the report-send flow keep working throughout. The asynchronous conversion (Slice B) must degrade safely — a failed action surfaces an error and must never leave the interface showing a false success; for sends specifically, a failure writes no send record (preserved acceptance criterion from the MVP).

**Data migration:** only Slice D adds storage — a single global configuration holding the two email templates. The change is additive (no changes to existing data, no destructive migration) and is applied from the local process used for all schema changes.

**Existing integrations that must keep working:**
- The transactional email send path — Slice D changes only the source of the subject and body (stored template vs. hardcoded copy), not the dispatch mechanism or the PDF attachment.
- The PDF render — Slice C changes only how the rendered bytes are delivered to the browser (view-in-browser vs. forced download), not the rendering itself.
- All existing data queries for current domains.

**Platform constraints (current reality the work must respect):** the deployment, data-access, PDF, and authentication mechanisms of the running system are fixed and load-bearing; this round must not change them. (Specifics live in the repository's contributor instructions and in §Current System Overview.)

**Preserved behavior (must NOT change):**
- The no-leak guarantee — the client-facing PDF and now the client email copy must not expose internal notes or the internal contact email beyond what the user explicitly writes into visible fields. The editable email copy must not become a leak vector (e.g. a placeholder that injects internal-only fields into the client message).
- Empty-section hiding in the PDF.
- The shared-login gate on every non-login route.
- The re-send confirmation and inline send-history safeguards.
- Save-time PDF generation semantics.

## Business Logic Changes

Slices A, B, and C make **no domain-logic change** — they alter how the user encounters the existing rules (visual presentation, how a submission is processed and acknowledged, how the rendered PDF is delivered), not the rules themselves.

**One domain addition, in Slice D (email templating):**
- **Current rule:** outbound report emails use a single fixed subject and body for both recipients.
- **Change:** the outbound email's subject and body are drawn from a per-recipient-type (PM vs client) editable template, with a vetted set of placeholder tokens resolved from the report, project, and brand at send time. The rule the system applies: *select the template for the recipient type, fill the known placeholders, and use that as the message* — falling back to the built-in default copy when no template has been saved. The deterministic PDF artifact and the dispatch are unchanged; only the human-readable message text becomes data-driven rather than fixed in code.

## Access Control Changes

**No access control changes — current model preserved.** The single shared-credential login continues to gate every route except the login page. The new surfaces live behind that same gate:
- The new work dashboard at the home route is an authenticated route like every other non-login page.
- The new email configuration page is global settings, editable by anyone with the shared login — identical to the existing brand-settings / PM-contacts / plugins-catalog model. No per-user identity, no roles, no audit trail (all remain out of scope).

No new authentication mechanism, no sign-up, no role split. A logged-out visitor hitting any new route gets the same redirect-to-login behavior as today.

## Non-Goals

**Functional scope avoids (this round will NOT):**
- **Per-user accounts / roles / audit trail** — still a single shared login. *Rationale: out of scope for an experience-plus-small-features pass; remains the major post-MVP item.*
- **Multi-tenancy / per-project brand override** — single agency brand, single tenant, unchanged. *Rationale: untouched by this round.*
- **A rich (WYSIWYG / HTML-design) email editor** — the editable templates are subject + body text with simple placeholder tokens, not a visual designer. *Rationale: keeps Slice D small; richer template design is later.*
- **Arbitrary / user-defined placeholder tokens** — only a fixed, vetted token set is supported, specifically so the client template cannot be pointed at internal-only fields. *Rationale: no-leak guardrail.*
- **PDF preview before save / an in-app PDF editor** — Slice C only opens the already-rendered PDF; it adds no pre-save preview or editing. *Rationale: preview-before-save remains an explicit prior lock.*
- **Moving PDF generation or email sending to a background/queued job** — "asynchronous" here means in-place request/response feedback, not deferring work off the request path. *Rationale: save-time generation was already proven fast enough; no queue needed.*
- **New report sections, cross-project feeds, scheduling/reminders, annual summaries, a client portal, WordPress auto-pull, or AI-assisted drafting** — all remain out of scope. *Rationale: unchanged scope locks from the MVP.*

**Non-functional scope avoids:**
- **Offline-first / installable-app behavior** — responsive web only; no offline mode. *Rationale: not requested.*
- **UI localization / internationalization** — English-only interface, as today. *Rationale: not requested.*
- **WCAG-AAA** — the commitment is AA, not AAA. *Rationale: AA is the professional bar; AAA is disproportionate here.*

## Open Questions

1. **Final placeholder token set for email templates.** The set (e.g. project, month, agency) is to be pinned during Slice D planning. Owner: user. Block: no (a sensible default set ships; additions are cheap). Constraint already fixed: tokens must be restricted to non-leaky fields so the client template cannot surface internal notes or the internal contact email.
2. **Delivery timeline is an estimate.** `delivery_weeks: 2` is a placeholder; the four slices may land incrementally. Owner: user. Block: no.
3. **Slice A scope split.** Slice A is large (shared shell + dashboard, re-theme + forms, responsive + accessibility) and may be split into multiple changes during `/10x-plan`. Owner: user/planner. Block: no. (Captured as forward guidance in shape-notes, not a PRD concern.)
