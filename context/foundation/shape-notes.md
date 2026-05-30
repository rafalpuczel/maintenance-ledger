---
project: "Maintenance Ledger"
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
created: 2026-05-30
updated: 2026-05-30
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: "process / slicing"
      decision: "shape all 4 improvements together, then /10x-plan each as its own slice (4 slices A–D; A may sub-split in planning)"
    - topic: "responsive + accessibility"
      decision: "FULL responsive layout + WCAG-AA accessibility pass — REVERSES the MVP Non-Goals 'mobile-responsive layout' and 'WCAG-AA accessibility'"
    - topic: "email template flexibility"
      decision: "SEPARATE PM and client templates (two editable subject/body pairs), both with placeholder support ({{project}}, {{month}}, {{agency}}) interpolated at send time — REVERSES the MVP Non-Goal 'Editable email body templates'"
    - topic: "visual direction"
      decision: "switch to a LIGHT, professional B2B aesthetic (Linear/Stripe dashboard style), away from the current dark 'cosmic' gradient theme; use the frontend-design skill"
    - topic: "PDF open behavior"
      decision: "open the PDF inline in a NEW browser tab on download-button click; keep a separate explicit download affordance (content-disposition attachment → inline + target=_blank)"
    - topic: "homepage"
      decision: "real work dashboard at home (recent projects + recent reports + quick actions + settings links); replaces the starter Welcome splash and the thin /dashboard card"
    - topic: "async depth"
      decision: "full SPA-like optimistic UI (fetch + spinners; list/repeater mutations reflect immediately and roll back on error), not just spinners on POST→redirect"
    - topic: "extras scope"
      decision: "fold toasts, consistent destructive-confirm dialogs, and empty-states/skeletons INTO Slices A/B as part of 'making it a real product'; do NOT expand beyond the 4 items into separate extra slices"
  frs_drafted: 0
  quality_check_status: accepted
---

## Current System Overview

**System purpose (one sentence):** Maintenance Ledger collapses the agency's WordPress-retainer reporting pipeline (dev notes → PM reformat in Google Docs → PDF → email) into one in-app flow — author the report, get a deterministic agency-branded PDF, send it to the PM and the client.

**Status:** feature-complete MVP. Roadmap slices F-01–F-02 and S-01–S-09 (the north star, `report-email-send`) are all shipped and archived as of 2026-05-30. This brownfield round is a post-MVP improvement pass, not new core functionality.

**Key architecture:** serverless / edge. Astro 5 SSR app deployed to Cloudflare Workers (Static Assets; deploy via `wrangler deploy`, never `wrangler pages deploy`). React islands for interactive surfaces (`client:load`). Shared-credential HMAC session cookie gates every route except `/login` via `src/middleware.ts`.

**Tech stack:**
- Frontend: Astro 5 + React 19 islands + Tailwind CSS v4 (shadcn-style design tokens in `src/styles/global.css`; lucide-react icons; a `bg-cosmic` dark-gradient utility is the current theme).
- Forms: native HTML `<form method="POST">` → API route → 303 redirect back with `?ok=`/`?error=` query flags. React islands do client-side zod validation and use `useFormStatus` for a pending label, but the navigation itself is a full-page POST/redirect (no fetch/async).
- Backend / API: Astro `.ts` API routes under `src/pages/api/**`. Data access via `@supabase/supabase-js` over HTTP/PostgREST (never `pg` from a Worker). Per-domain pattern: client factory (`src/lib/supabase.ts`) + query module (`src/lib/<domain>/queries.ts`) + zod schema (`schema.ts`) + form mapper (`form.ts`).
- PDF: FormePDF (`@formepdf/react` + `@formepdf/core`) rendering on workerd, requires Workers Paid. Render-on-demand at `GET /api/reports/[id]/pdf` (no bytes persisted).
- Email: Resend, single hardcoded transactional template in `src/lib/email/send-report.ts` (subject + HTML body are string literals; PDF attached as chunked base64).
- Auth: peppered Web Crypto HMAC shared-credential (`src/lib/auth/credentials.ts`); per-IP KV throttle; not bcrypt (CPU budget).
- Data: Supabase Postgres; migrations + seeds run from a local Node process against the Supabase host.

**Current user base:** a single agency team (~5 PMs + ~15 devs) sharing one login credential set. Small scale, low QPS. Desktop Chrome/Firefox/Safari/Edge only today.

**Core functionality today:** shared-credential login; projects CRUD; brand settings (logo + colors); global plugins catalog; PM contact list; per-project recurring plugins; report authoring (fixed sections + plugins/themes/licenses repeaters, recurring-seeded, WP-CLI bulk-paste); branded PDF on save + download link; send report to PM and client with re-send guard + inline send history.

## Vision & Problem Statement

The MVP works but looks and feels like an unstyled starter, not a product the agency is proud to use daily. Concretely, observed in the codebase:

- **No real homepage.** `/` renders the Astro starter `Welcome.astro` splash; `/dashboard` is a single centered glass card with hand-rolled nav links.
- **No shared navigation.** A `Topbar.astro` component exists but is imported by no page; every page re-implements its own back-links and sign-out. There is no consistent header across the app.
- **Cramped, narrow layouts.** Every page is a centered card capped at `max-w-xl`/`2xl`/`3xl` on a dark gradient. The report detail page crams Download / Send-to-PM / Send-to-client / Delete into one flex row, and the disabled-button states leak warning text ("No client email — add one on the project", `SendToClientButton.tsx:44`; "No PM contacts — add one in Settings", `SendToPmButton.tsx:55`) as inline text that doesn't fit the button grid — this is the "broken inline text" the user called out. These belong in **tooltips**.
- **Full-page reloads on every action.** Saving, sending, deleting all POST → redirect, so the screen flashes white and reloads instead of updating in place. There is no async feedback beyond a button label flip on the islands that do use `useFormStatus`.
- **PDF forces a download** rather than opening in the browser for a quick look (`content-disposition: attachment`).
- **Email body is frozen.** The subject and body are hardcoded; the agency cannot tailor the message to PMs vs clients.

The insight: the product's *function* is done and validated, so the remaining gap is entirely **experience quality** — visual design, layout width, a shared shell, asynchronous interactions, and a couple of small capability gaps (inline PDF, editable email copy). This round deliberately reopens three MVP Non-Goals that were cut for the 3-week budget (mobile-responsive layout, WCAG-AA accessibility, editable email templates) now that the core is proven and there is room to invest in polish.

## User & Persona

Same primary persona as the MVP, experience-affected by this change:

- **Developer** (≈15) — authors reports; today tolerates the cramped report form and the full-page reloads. Benefits most from nicer/wider forms, async save with a spinner, button tooltips replacing the broken inline warnings, and inline-PDF preview to eyeball the render without a download round-trip.
- **PM / team lead** (≈5) — reviews and sends reports; benefits from the shared header/nav (faster movement between projects/reports/settings), async send with clear in-progress + success feedback, and the editable per-recipient email templates (PMs and clients get appropriately different messaging).

No new persona is introduced. The full-responsive + a11y work widens *where* the existing personas can use the tool (phones/tablets, assistive tech) without adding a new user type.

## Access Control Changes

**No access control changes — current model preserved.** The single shared-credential HMAC login continues to gate every route except `/login` (via `src/middleware.ts`). The new surfaces introduced here live behind that same gate:

- The new **work dashboard** (the redesigned `/` / home) is an authenticated route like every other non-login page.
- The new **email configuration page** is global settings, editable by anyone with the shared login — identical to the existing brand-settings / PM-contacts / plugins-catalog model. No per-user identity, no roles, no audit trail (all post-MVP, unchanged).

No new auth mechanism, no sign-up, no role split. A logged-out visitor hitting any new route gets the same redirect-to-login behavior as today.

## Scope of Change

Grouped by the intended slices (process decision: shape together, plan each separately).

### Slice A — Visual redesign + shared shell (light B2B theme)
- [new] A shared application **header with navigation** rendered on all authenticated pages (Dashboard, Projects, project detail, report detail, all Settings pages), replacing the unused `Topbar.astro` and the per-page hand-rolled back-links/sign-out.
- [new] A real **work dashboard** at the home route: recent projects, recent reports, quick actions (new project / new report), and links into settings. Replaces the starter `Welcome.astro` splash at `/` and the thin `/dashboard` card.
- [modified] **Visual identity switches** from the dark `bg-cosmic` gradient theme to a **light, professional B2B aesthetic** (Linear/Stripe-style). Design tokens in `src/styles/global.css` are re-themed; `frontend-design` skill drives the direction.
- [modified] **Wider content area** — pages move off the narrow centered `max-w-xl/2xl/3xl` cards to a wider, structured layout appropriate to each page.
- [modified] **Nicer forms** — restyled fields, grouping, spacing, and validation presentation across project/report/settings forms.
- [modified] The report detail page's **action buttons get tooltips**: the disabled Send-to-PM / Send-to-client states currently leak warning text inline ("No client email — add one on the project", `SendToClientButton.tsx:44`; "No PM contacts — add one in Settings", `SendToPmButton.tsx:55`). The explanation moves into a **tooltip** on the disabled button so it no longer breaks the button row.
- [new] **Polished empty states and loading skeletons** for lists (projects, reports, contacts, catalog) instead of bare text — folded into this slice as part of "a real product," not a separate slice.
- [modified] **Full responsive layout** — pages work across phone / tablet / desktop breakpoints. REVERSES the MVP Non-Goals "mobile applications (web-only)" partial and "mobile-responsive layout."
- [new] **WCAG-AA accessibility pass** — focus states, semantic landmarks, ARIA where needed, color contrast meeting AA, keyboard operability of all interactive elements (including the new tooltips, dialogs, toasts). REVERSES the MVP Non-Goal "WCAG-AA accessibility commitment."

### Slice B — Asynchronous actions + UX feedback (depends on Slice A)
- [modified] **Form submissions become asynchronous** — intercept submits with `fetch` instead of native POST→full-page redirect, so there is no white-flash reload. Applies to create/edit/delete on projects, reports, repeater rows, settings, and the send actions.
- [new] **Optimistic UI** — list and repeater mutations (add/remove/edit a row, delete a project/report/contact/catalog entry) reflect immediately in the UI before the server confirms, rolling back on error. (User chose full SPA-like optimistic UI over a simpler async-submit model.)
- [new] **Spinners / in-progress states** on every async action (the user's literal ask), with disabled controls during flight.
- [new] **Toast notifications** for save / send / delete / error outcomes, replacing the current `?ok=`/`?error=` query-string banner pattern. Folded into this slice.
- [modified] **Consistent confirmation dialogs** for all destructive actions (delete project / report / PM contact / catalog entry), matching the existing send re-send confirm. Folded into this slice.
- [new] **UX recommendations** are delivered as part of this slice's plan (the user explicitly asked for UX recommendations alongside the async work).

### Slice C — Open PDF in the browser
- [modified] The **Download PDF** action **opens the PDF inline in a new browser tab** instead of forcing a file download. `GET /api/reports/[id]/pdf` switches `content-disposition` from `attachment` to `inline` (or serves an inline variant); the report page link gains `target="_blank"`.
- [preserved] An **explicit save-to-disk path remains available** (a separate Download affordance) so users who want the file still get it. The existing attachment-on-email behavior is unchanged.

### Slice D — Editable email configuration (separate PM + client templates)
- [new] An **email configuration settings page** where the user edits the subject and body for outbound report emails.
- [new] **Two independent templates** — one for "Send to PM" and one for "Send to client" — each an editable subject + body pair. REVERSES the MVP Non-Goal "Editable email body templates."
- [new] **Placeholder interpolation** — templates support variables such as `{{project}}`, `{{month}}`, `{{agency}}` (final token set pinned in planning), substituted at send time.
- [modified] `src/lib/email/send-report.ts` stops using its hardcoded literal subject/body and instead renders the stored template for the recipient type, interpolating placeholders. Falls back to the current hardcoded copy as a default if no template is saved.
- [new] DB-backed storage for the two templates, following the established S-01 data-access pattern (client factory + `queries.ts` + zod `schema.ts` + form mapper + Astro `.ts` route). Single global config (single-tenant), like brand settings.

## Constraints & Compatibility

- **Stack constraints (unchanged, load-bearing — from CLAUDE.md):** deploy via `wrangler deploy` (never `pages deploy`); Supabase only over HTTP/PostgREST (never `pg` from a Worker); PDF via FormePDF on workerd (Workers Paid required); auth is peppered Web Crypto HMAC (never bcrypt in the request path). New work must not violate these.
- **Backward compatibility:** all existing routes and the report-send flow keep working throughout. The async conversion (Slice B) must degrade gracefully — a failed `fetch` surfaces an error (toast) and must NOT leave the UI in a false-success state; for the send action specifically, the US-01 rule still holds (a failed send writes no send record).
- **Data migration:** only Slice D adds schema — a new settings table (or row) for the two email templates. Additive, no destructive migration. Seed/migrate from a local Node process (per CLAUDE.md). No changes to existing tables.
- **Existing integrations that must keep working:** Resend send path (Slice D changes only the body/subject source, not the dispatch mechanism or the chunked-base64 attachment); FormePDF render (Slice C changes only the response `content-disposition`, not the render); Supabase queries for all current domains.
- **Preserved behavior (must NOT break):**
  - The no-leak guarantee — client-facing PDF and now the **client email template** must not expose internal notes or the contact email beyond what the user types into the template/notes. The email-template feature must not become a new leak vector (e.g., a placeholder that injects internal-only fields into the client message).
  - Empty-section hiding in the PDF.
  - The shared-login gate on every non-login route.
  - The send re-send confirmation + inline send-history footguns.
  - Synchronous PDF-on-save semantics (Slice B's async work is about the request/response UX, not about making PDF generation a background job).

## Business Logic Changes

Mostly **no domain-logic change** — Slices A, B, C are experience/presentation changes (visual design, async request handling, HTTP content-disposition). They alter how the user encounters the existing rules, not the rules themselves.

**One domain addition, in Slice D (email templating):**

- **Current rule:** outbound report emails use a single fixed transactional subject + body for both recipients.
- **Change:** the outbound email's subject and body are now drawn from a per-recipient-type (PM vs client) editable template, with placeholder tokens (`{{project}}`, `{{month}}`, `{{agency}}`, …) resolved from the report/project/brand at send time. The rule the app applies: *select the template for the recipient type, interpolate the known tokens, and send that as the message body* — falling back to the built-in default copy when no template has been saved. The deterministic PDF artifact and the dispatch mechanism are unchanged; only the human-readable message text becomes data-driven instead of code-frozen.

## Non-Functional Requirements

- **Accessibility:** the application meets **WCAG 2.1 AA** for the primary flows — perceivable contrast (≥ 4.5:1 normal text), full keyboard operability of every interactive control (including tooltips, dialogs, toasts), visible focus indicators, and correct semantic structure / landmarks. (Reverses the MVP a11y non-goal.)
- **Responsiveness:** the application is usable and laid out correctly across mobile (≥ 360px), tablet, and desktop widths, in addition to the latest two major versions of the four mainstream desktop browsers. (Reverses the MVP responsive non-goal.)
- **Async feedback:** any user action acknowledges within ~200 ms (immediate spinner / optimistic reflection) and shows continuous visible progress for anything taking longer than ~1–2 s; no action produces a full-page white-flash reload.
- **No false success:** an action's success state is shown only after the server confirms (optimistic UI rolls back and surfaces an error on failure); for report sends, a failure writes no send record (preserved US-01 acceptance criterion).
- **No new leak surface:** the client email template cannot emit project internal notes or the internal contact email except where the user explicitly authored such text; placeholder tokens are restricted to non-leaky fields.
- **PDF responsiveness (preserved):** save → PDF availability stays under the existing 5 s p95 budget for ≤30 plugin / 5 theme rows; inline-open does not regress it.

## Non-Goals

Functional scope avoids (this round will NOT):
- **Per-user accounts / roles / audit trail** — still single shared login. *Rationale: out of scope for a UX + small-features pass; remains the big post-MVP item.*
- **Multi-tenancy / per-project brand override** — single agency brand, single tenant, unchanged. *Rationale: untouched by this round.*
- **Rich email body editor (WYSIWYG / HTML design)** — the editable email templates are subject + body text with simple `{{placeholder}}` tokens, not a drag-and-drop or HTML-styling editor. *Rationale: keeps Slice D small; full template design is post-this-round.*
- **Arbitrary / user-defined placeholder tokens** — only a fixed, vetted token set (e.g. `{{project}}`, `{{month}}`, `{{agency}}`) is supported, specifically so the client template can't be pointed at internal-only fields. *Rationale: no-leak guardrail.*
- **PDF preview before save / in-app PDF editor** — Slice C only opens the *already-rendered* PDF inline; it does not add a pre-save preview or editing. *Rationale: preview-before-save remains an explicit MVP-era lock.*
- **Making PDF generation or email sending a background/queued job** — async here means request/response UX (fetch + spinners + optimistic UI), not moving work off the request path. *Rationale: synchronous PDF-on-save was proven fine (p95 ~197 ms); no queue needed.*
- **New report sections / cross-project feeds / scheduling / annual summaries / client portal / WP auto-pull / AI drafting** — all remain post-MVP, untouched by this round. *Rationale: unchanged scope locks from the MVP.*

Non-functional scope avoids:
- **Offline-first / PWA / installable app** — responsive web only; no service-worker offline mode. *Rationale: not requested; out of scope.*
- **Localization / i18n of the UI** — English UI only, as today. *Rationale: not requested.*
- **AAA accessibility** — the commitment is WCAG **AA**, not AAA. *Rationale: AA is the professional bar; AAA is disproportionate.*

## Forward: technical-roadmap

Informational hand-off for `/10x-plan` per slice (NOT part of the PRD schema):
- **Slice ordering / dependencies:** A (shell + theme) is the prerequisite for B (async/optimistic UI builds on the redesigned components). C (inline PDF) and D (email config) are independent of A/B and of each other — they can be planned and shipped in any order. Suggested plan order: A → B, with C and D slotted whenever convenient (C is tiny).
- **Slice A is the big one** — it touches `Layout.astro`, every page under `src/pages/`, `global.css` tokens, and most components; `/10x-plan` may legitimately split it (e.g. shell+nav+dashboard vs. theme+forms vs. responsive+a11y). Use the `frontend-design` skill for the visual direction before planning the build.
- **Reusable primitives to introduce in A and reuse in B:** a shared header/nav, a Tooltip, a Dialog/confirm, a Toast system, empty-state and skeleton components — so B's async/confirm/toast work composes with A's components instead of duplicating them.
- **Slice D data-access** follows the S-01 pattern (see the supabase-data-access memory): `src/lib/email-templates/{queries,schema,form}.ts` + an Astro `.ts` settings route + a settings page, mirroring brand-settings. `send-report.ts` consumes the stored template with a hardcoded-copy fallback.
- **Each slice gets its own `context/changes/<id>/` folder** (`change.md` via `/10x-new`, then `plan.md` via `/10x-plan`), consistent with the shipped slice format. Do not write to `context/archive/`.

## Quality cross-check

All required brownfield elements present:
- **Access Control:** present — "No access control changes — current model preserved."
- **Business Logic:** present — domain delta is the email-template interpolation rule (Slice D); A/B/C are explicitly presentation-only.
- **Project artifacts:** present — this `shape-notes.md` with a valid brownfield checkpoint.
- **Timeline-cost ack:** present — `delivery_weeks: 2`, ≤ 3; within the after-hours budget, no acknowledgment block needed.
- **Non-Goals:** present — functional + non-functional avoids, including the placeholder-token leak guard.
- **Preserved behavior:** present — `## Constraints & Compatibility` explicitly names the no-leak guarantee, empty-section hiding, the auth gate, send footguns, and synchronous PDF-on-save as must-not-break.

No gaps. `quality_check_status: accepted`.
