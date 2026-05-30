---
project: "Maintenance Ledger"
version: 2
status: active
created: 2026-05-25
updated: 2026-05-30
prd_version: 2
main_goal: speed
top_blocker: time
post_mvp_round:
  prd_version: 2
  main_goal: quality
  top_blocker: none
  slices: [S-10, S-11, S-12, S-13]
---

# Roadmap: Maintenance Ledger

> Derived from `context/foundation/prd.md` (v1, MVP) + `context/foundation/prd-v2.md` (v2, post-MVP) + auto-researched codebase baseline (2026-05-25).
> The MVP block (F-01–F-02, S-01–S-09) is shipped/immutable; the **Post-MVP slices** section (S-10–S-13) is the round-2 polish-and-extend pass. The top-level `main_goal`/`top_blocker` describe the MVP round; the post-MVP round's framing (`quality`/`none`) is in `post_mvp_round` and in that section's header.
> Edit-in-place; archive when superseded. Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

Maintenance reports for client WordPress retainers are produced today through a multi-handoff pipeline — a developer writes loose notes in Slack/Basecamp, a PM reformats them in a Google Docs template, exports a PDF, and emails the client. This MVP collapses that into one in-app flow: the developer authors the report in its final shape, the system renders a deterministic agency-branded PDF that hides any section left empty, and two one-click buttons send it to the PM and the client. The payoff is a tool the agency owns outright — replacing a per-site SaaS subscription (ManageWP / MainWP / WP Umbrella) and removing the dev → PM copy-paste step entirely.

## North star

**S-09 — `report-email-send`: the user authors a report, gets a branded PDF on save, and sends it to both the assigned PM and the client in one session (the complete US-01 loop).** This is the validation milestone — the single deliverable whose success proves the whole Slack → Docs → PDF → email pipeline can be replaced in-app, which is the PRD's primary Success Criterion.

> "North star" here means the smallest end-to-end slice whose delivery proves the core product idea works. For this MVP you chose the *complete* author → PDF → send loop as that milestone, so — unlike a wedge slice you ship first — it sits at the **end** of the critical path: everything before S-09 exists to make S-09 possible. The roadmap is therefore sequenced as the leanest march toward S-09, and the riskiest enabler (F-02, PDF rendering on the Cloudflare Workers runtime) is pulled as early as its prerequisites allow so a dead-end surfaces in week 1, not week 3.

## At a glance

| ID    | Change ID                  | Outcome (user can …)                                            | Prerequisites          | PRD refs                                       | Status   |
| ----- | -------------------------- | --------------------------------------------------------------- | ---------------------- | ---------------------------------------------- | -------- |
| F-01  | shared-credential-auth     | (foundation) shared-credential login works; every non-login route requires a session | —          | FR-001                                         | done     |
| F-02  | pdf-render-pipeline        | (foundation) a branded PDF renders on workerd within the 5 s budget, empty sections hidden | —      | FR-017                                         | done     |
| S-01  | projects-crud              | create, list, edit, and delete projects                         | F-01                   | FR-005, FR-006, FR-007, FR-008                 | done     |
| S-02  | brand-settings             | upload/replace a logo and set brand colors                      | F-01                   | FR-002                                         | done     |
| S-03  | plugins-catalog            | manage the global predefined plugins catalog                    | F-01                   | FR-003                                         | done     |
| S-04  | pm-contact-list            | manage the PM contact list (name + email)                       | F-01                   | FR-004                                         | done     |
| S-05  | project-recurring-plugins  | compose a project's recurring plugins list                      | S-01, S-03             | FR-009                                         | done     |
| S-06  | report-authoring           | author a report's fixed sections (CRUD + row repeaters, recurring-seeded) | F-01, S-01, S-03, S-05 | FR-010, FR-011, FR-012, FR-013, FR-014, FR-016, US-01 | done     |
| S-07  | wp-cli-bulk-paste          | bulk-paste a WP-CLI table into the plugins/themes repeaters     | S-06                   | FR-015, US-01                                  | done     |
| S-08  | branded-pdf-on-save        | get a branded PDF on every save + a visible download link       | S-06, F-02, S-02       | FR-017, FR-018, US-01                          | done     |
| S-09  | report-email-send          | send the branded PDF to the PM and the client (north star)      | S-08, S-04             | FR-019, FR-020, FR-021, US-01                  | done     |
| S-10  | frontend-redesign          | use a redesigned, light-themed, responsive, accessible app with a shared header + real dashboard (post-MVP north star) | S-09 (shipped MVP) | v2 US-01, US-02, US-04 | ready    |
| S-11  | async-ux                   | act without full-page reloads — async submits, optimistic UI, spinners, toasts, confirm dialogs | S-10           | v2 US-03                                       | proposed |
| S-12  | pdf-inline-view            | open the report PDF in the browser (new tab) instead of forcing a download | S-09 (shipped MVP) | v2 US-05                            | ready    |
| S-13  | email-templates            | edit separate PM + client email subject/body with placeholders | S-09 (shipped MVP)     | v2 US-06                                       | ready    |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme                  | Chain                                  | Note                                                                                  |
| ------ | ---------------------- | -------------------------------------- | ------------------------------------------------------------------------------------- |
| A      | Auth gate              | `F-01`                                 | Universal prerequisite; unlocks Streams B, C, and D. Start here.                      |
| B      | Configuration surfaces | `S-02` / `S-03` / `S-04` → `S-05`      | Independent settings CRUD (parallel). `S-05` also needs `S-01` (Stream C); feeds the report flow. |
| C      | Core report flow       | `S-01` → `S-06` → `S-07` → `S-09`      | Critical path to the north star. `S-06` consumes Stream B; `S-09` needs `S-04` + `S-08`. |
| D      | PDF pipeline           | `F-02` → `S-08`                        | De-risks R1 (PDF on workerd) early; runs parallel to A/B/C. `S-08` joins Stream C at `S-06` and needs brand (`S-02`). |

## Baseline

What's already in place in the codebase as of 2026-05-25 (auto-researched + user-confirmed). Foundations below assume these and do NOT re-scaffold them.

- **Frontend:** partial — Astro 5 + Tailwind starter scaffold plus auth UI only (`src/pages/auth/*`, `src/pages/dashboard.astro`, `src/components/auth/*`). No projects/reports/settings/brand pages yet.
- **Backend / API:** partial — only auth endpoints (`src/pages/api/auth/{signin,signup,signout}.ts`) and a Supabase server client (`src/lib/supabase.ts`). No email/Resend code.
- **Data:** absent — no schema, migrations, generated types, or seeds. `supabase/config.toml` references a `seed.sql` that does not exist; the Supabase client is instantiated but zero domain tables exist.
- **Auth:** partial, **wrong shape** — the starter's Supabase Auth is wired (`signInWithPassword`, `getUser`; only `/dashboard` protected). PRD FR-001 requires an HMAC shared-credential cookie over **all** routes. No HMAC/bcrypt/shared-credential code present yet. → F-01 replaces this.
- **Deploy / infra:** present — Cloudflare Workers, live at `maintenance-ledger.rpuczel.workers.dev`. Workers Builds auto-deploy on push to `master`; CI lint+build gate. FR-001 secrets (`SHARED_USERNAME`, `SHARED_PASSWORD_HASH`, `SESSION_HMAC_KEY`) and Supabase secrets already provisioned; `RESEND_API_KEY` deferred. (`context/deployment/deploy-plan.md`)
- **Observability:** present — `observability.enabled` in `wrangler.jsonc`; `wrangler tail` + Cloudflare observability MCP available. (`context/deployment/deploy-plan.md`)

## Foundations

### F-01: Shared-credential auth (replace starter Supabase Auth)

- **Outcome:** (foundation) the shared-credential login works against the provisioned `SHARED_USERNAME` / `SHARED_PASSWORD_HASH`, an HMAC-signed session cookie is issued and verified, and every route except the login page redirects unauthenticated visitors — the starter's Supabase Auth (signup / reset / JWT-refresh) is removed.
- **Change ID:** shared-credential-auth
- **PRD refs:** FR-001; Access Control (single shared login, all-route enforcement); NFR (login resists credential-stuffing at scale yet does not lock out a user mistyping the password 3×).
- **Unlocks:** every user-facing slice (S-01 through S-09) — all live behind the shared login per the "no route except login is reachable unauthenticated" guardrail. Removes the baseline's wrong-shape auth so later work isn't built on Supabase Auth assumptions.
- **Prerequisites:** — (deploy + secrets already present per Baseline)
- **Parallel with:** F-02
- **Blockers:** —
- **Unknowns:** How to resist automated credential-stuffing on workerd without locking out a legitimate user who mistypes 3× — KV-backed throttle vs. Cloudflare Turnstile vs. rate-limit binding? Owner: team. Block: no.
- **Risk:** Sequenced first because it is the universal gate. Main hazard is leaving dead Supabase-Auth code paths after the rip-out (signin/signup/confirm-email pages, middleware `getUser`), and getting the credential-stuffing-vs-no-lockout NFR balance right. Doing it first means no other slice is built against the wrong auth model.
- **Status:** done

### F-02: PDF rendering pipeline proven on workerd

- **Outcome:** (foundation) FormePDF renders the fixed agency-branded report template (logo + brand colors, empty-section hiding) to a `Uint8Array` on the deployed Cloudflare Workers runtime, from a representative sample payload (~30 plugin rows, 5 theme rows), measured against the 5 s p95 NFR.
- **Change ID:** pdf-render-pipeline
- **PRD refs:** FR-017 (proof of the "PDF on every save" mechanism); NFR (save → PDF link under 5 s p95 for ≤30 plugin / 5 theme rows).
- **Unlocks:** S-08 (branded PDF on save — productionizes this pipeline against real report data) and, transitively, S-09 (send needs a rendered PDF). Reduces blocking unknown R1 (the infrastructure pre-mortem's project-killer: `@react-pdf/renderer` is blocked on workerd, `@pdf-lib/fontkit` won't bundle, free-tier CPU is tight).
- **Prerequisites:** — (spikes against the live Worker with a hardcoded payload; needs no domain data)
- **Parallel with:** F-01, S-01, S-02, S-03, S-04, S-05, S-06
- **Blockers:** —
- **Unknowns:** Does FormePDF hold the 5 s p95 on the free-tier 10 ms CPU budget for a real-shaped report, or is the Workers Paid plan ($5/mo, 30 s CPU) required from day one? Owner: team. Block: no — the spike *is* how this is answered; if FormePDF fails on workerd, the fallback is Cloudflare Browser Rendering (paid, ~1–2 s overhead) and the cost is far lower discovered now than in week 3.
- **Risk:** This is risk-insurance, not user-visible work. It exists because R1 is the highest-impact unknown in the project and the pre-mortem describes building everything then discovering the PDF path is dead. Proving (or breaking) the FormePDF-on-workerd assumption before CRUD work is sunk is the single most valuable early move under a fixed deadline.
- **Status:** done

## Slices

### S-01: Projects CRUD

- **Outcome:** user can create a project (name, slug, URL, contact company/name/email, internal notes), view a list of all projects, edit any field, and hard-delete a project.
- **Change ID:** projects-crud
- **PRD refs:** FR-005, FR-006, FR-007, FR-008
- **Prerequisites:** F-01
- **Parallel with:** S-02, S-03, S-04 (and F-02)
- **Blockers:** —
- **Unknowns:** —
- **Risk:** First domain entity; establishes the Supabase migration + `@supabase/supabase-js`-over-HTTP data pattern (per CLAUDE.md: never `pg` from a Worker) that every later slice copies. Mostly plumbing; low risk. Hard delete is intentional (soft delete is parked).
- **Status:** done

### S-02: Brand settings

- **Outcome:** user can upload/replace the agency logo and set brand colors; these are the single global brand consumed at PDF render time.
- **Change ID:** brand-settings
- **PRD refs:** FR-002
- **Prerequisites:** F-01
- **Parallel with:** S-01, S-03, S-04 (and F-02); independent of the report flow until S-08 consumes the brand
- **Blockers:** —
- **Unknowns:** Logo storage target — Cloudflare Images (the `env.IMAGES` binding is already provisioned per deploy-plan) vs. Supabase Storage? Owner: team. Block: no.
- **Risk:** Logo upload introduces the one non-trivial bit (binary/file storage on the edge); colors are trivial. Single agency brand only — per-project brand override is parked.
- **Status:** done

### S-03: Plugins catalog

- **Outcome:** user can add / edit / remove entries in the global predefined plugins catalog (plugin name + optional notes); the catalog is the canonical name source for the report plugin-row dropdown and the project recurring-list pick-source.
- **Change ID:** plugins-catalog
- **PRD refs:** FR-003
- **Prerequisites:** F-01
- **Parallel with:** S-01, S-02, S-04 (and F-02)
- **Blockers:** —
- **Unknowns:** —
- **Risk:** The auto-promote rule (a free-text plugin name typed on a report row is added to the catalog) couples this slice to S-06; keep that promote hook a thin write so S-06 can call it. Low risk otherwise.
- **Status:** done

### S-04: PM contact list

- **Outcome:** user can add / edit / remove PM contacts (name + email); this list is the "Send to PM" recipient picker.
- **Change ID:** pm-contact-list
- **PRD refs:** FR-004
- **Prerequisites:** F-01
- **Parallel with:** S-01, S-02, S-03, S-05, S-06, S-07, S-08 (only S-09 consumes it)
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Simplest CRUD surface in the system. Feeds S-09's PM picker; can be built any time before S-09. PMs are contacts, not user accounts (no login) — keep it that way.
- **Status:** done

### S-05: Project recurring plugins list

- **Outcome:** user can compose a project's recurring plugins list by picking from the global catalog (S-03) and optionally adding free-text entries; this list is what later seeds new reports.
- **Change ID:** project-recurring-plugins
- **PRD refs:** FR-009
- **Prerequisites:** S-01, S-03
- **Parallel with:** S-02, S-04
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Bridges catalog → project → report seeding and delivers the Secondary Success Criterion (no re-entering the same plugin rows each cycle). The *seeding into a new report* behavior is realized in S-06; this slice only delivers list composition, so keep the read contract simple for S-06 to consume.
- **Status:** done

### S-06: Report authoring

- **Outcome:** user can create a report on a project, view the per-project report list, edit any field, and delete a report; fill the fixed section set (month auto from date, WP core, PHP, plugins repeater, themes repeater, integrity checks, fixes, license renewals, notes to client) with individual add/edit/remove on the plugins, themes, and license rows; new reports are auto-seeded with the project's recurring plugins (S-05), and plugin-row names come from the catalog dropdown (S-03) with free-text auto-promoted into the catalog.
- **Change ID:** report-authoring
- **PRD refs:** FR-010, FR-011, FR-012, FR-013, FR-014, FR-016, US-01
- **Prerequisites:** F-01, S-01, S-03, S-05
- **Parallel with:** S-02, S-04 (and F-02)
- **Blockers:** —
- **Unknowns:** —
- **Risk:** The largest surface in the roadmap (9 section types + three row repeaters + seeding + catalog integration) — `/10x-plan` may legitimately split this into multiple changes. Post-send edits are explicitly allowed (no locking on send); the resulting PDF-vs-stored-data divergence is an accepted MVP trade (Open Roadmap Question 2). PDF generation is deliberately *not* here — it lands in S-08 so this slice stays a pure authoring surface.
- **Status:** done

### S-07: WP-CLI bulk-paste

- **Outcome:** user can paste a WP-CLI plugin/theme update table into a bulk field and have it parsed into individual repeater rows (name, current version, target version, updated yes/no); on parse failure the whole paste lands as one row so nothing is lost; the expected format is shown inline.
- **Change ID:** wp-cli-bulk-paste
- **PRD refs:** FR-015, US-01
- **Prerequisites:** S-06
- **Parallel with:** S-02, S-04, S-08
- **Blockers:** —
- **Unknowns:** Exact WP-CLI table format to pin (column order / whitespace of the targeted `wp plugin update --all` version)? Owner: team. Block: no — the single-row fallback de-risks a wrong guess, and multi-format auto-detection is explicitly out of scope.
- **Risk:** The parser is fragile by design (FR-015 accepts this): pin one documented format, lean on the single-row fallback. Worth its own slice so the parser can be unit-tested in isolation rather than entangled with the S-06 form.
- **Status:** done

### S-08: Branded PDF on save + download

- **Outcome:** on every Save, the user gets a freshly rendered branded PDF (real brand from S-02) reflecting the current report content with empty sections hidden, plus a visible download link on the report page.
- **Change ID:** branded-pdf-on-save
- **PRD refs:** FR-017, FR-018, US-01
- **Prerequisites:** S-06, F-02, S-02
- **Parallel with:** S-07, S-04
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Productionizes the F-02 pipeline against real report data and the real brand. Two guardrails are enforced here: empty-section hiding (no headers, no "none" placeholders), and the no-leak NFR — internal notes and the project contact email must never appear in the client-facing PDF unless transcribed into "notes to client." Watch p95 against the 5 s NFR on real-shaped reports; upgrade to Workers Paid at the first timeout (R3). Synchronous PDF-on-save is the chosen mental model despite its latency cost.
- **Status:** done

### S-09: Send report to PM and client  ← north star

- **Outcome:** user can click "Send to PM" (pick from the S-04 list) and "Send to client" (the project's contact email), each emailing the branded PDF via a fixed template; a re-send relabels the button to "Re-send …" and requires explicit confirmation; the most recent send timestamp shows inline per recipient. This completes the full US-01 loop.
- **Change ID:** report-email-send
- **PRD refs:** FR-019, FR-020, FR-021, US-01
- **Prerequisites:** S-08, S-04
- **Parallel with:** —
- **Blockers:** Resend (or Postmark) account + verified sending domain + `RESEND_API_KEY` secret — `deploy-plan.md` marks this Outstanding/deferred; email cannot be sent until it is provisioned (see Open Roadmap Question 4).
- **Unknowns:** Final email provider pick — Resend vs. Postmark? Owner: user. Block: no — either satisfies the FR; the deploy plan leans Resend.
- **Risk:** The capstone that lights up the north star. The footgun guards (re-send confirmation, inline send history) are the point of FR-019–021. NFR: the email must leave the system within 3 s p95. A failed send must surface in-app and must NOT write a send record (US-01 acceptance criterion). Email deliverability beyond dispatch is explicitly out of the commitment.
- **Status:** done

## Post-MVP slices (round 2 — experience + small features)

> Added 2026-05-30 from `context/foundation/prd-v2.md` (brownfield, v2). The MVP above (F-01–F-02, S-01–S-09) is shipped and immutable; these four slices are a polish-and-extend pass on top of it. `main_goal` for this round is **quality** (craft/polish, not new-market validation); `top_blocker` is **none** (every slice is plannable now — no external or decision blocker). The round's north star is **S-10** — the redesign is what makes the proven MVP feel like a real product, and S-11 builds directly on its components.
>
> All four trace to PRD-v2 user stories (cited as `v2 US-NN` to disambiguate from the MVP's US-01). S-10 may legitimately **sub-split** during `/10x-plan` into shell+nav+dashboard / theme+forms / responsive+a11y — that's a planning decision, not a roadmap one. Use the `frontend-design` skill for S-10's visual direction before building.

### S-10: Frontend redesign + shared shell  ← post-MVP north star

- **Outcome:** user works in a redesigned app — a shared header with navigation on every authenticated page, a real work dashboard at home (recent projects + reports, quick actions, settings links) replacing the starter splash, a light professional B2B theme replacing the dark "cosmic" gradient, a wider content area, nicer forms, button tooltips (the disabled Send-to-PM/Send-to-client explanations move out of the broken inline button row into tooltips), polished empty states + loading skeletons, full responsive layout (phone/tablet/desktop), and a WCAG-AA accessibility pass.
- **Change ID:** frontend-redesign
- **PRD refs:** v2 US-01 (consistent nav), v2 US-02 (work dashboard), v2 US-04 (tooltips); v2 Success Criteria Primary + Secondary; v2 Non-Functional Requirements (responsiveness ≥360px, WCAG 2.1 AA). Reopens MVP Non-Goals "mobile-responsive layout" and "WCAG-AA accessibility" — now in scope.
- **Prerequisites:** S-09 (the shipped MVP — this redesigns existing pages)
- **Parallel with:** S-12, S-13 (both touch unrelated surfaces; S-12 is a one-route change, S-13 is a new settings page). Avoid running S-11 in parallel — it consumes S-10's components.
- **Blockers:** —
- **Unknowns:**
  - Whether to split into multiple changes (shell+dashboard / theme+forms / responsive+a11y) — Owner: user/planner. Block: no (resolved in `/10x-plan`; doesn't gate starting).
  - Exact light-theme token palette — Owner: user (via `frontend-design`). Block: no.
- **Risk:** The largest surface in either round — touches `Layout.astro`, the unused `Topbar.astro`, every page under `src/pages/`, the `global.css` design tokens, and most components. The re-theme risks regressing the deliberate no-leak / empty-section-hiding behaviors only at the presentation layer (logic is untouched), so the guardrail is visual-only changes to report/PDF-adjacent UI. Introduce reusable primitives here (header/nav, Tooltip, Dialog, Toast, empty-state, skeleton) so S-11 composes with them instead of duplicating. Sequenced first in the round because S-11 depends on it and because the redesign is the round's validation milestone.
- **Status:** ready

### S-11: Asynchronous actions + UX feedback

- **Outcome:** user performs every create/edit/delete/send without a full-page white-flash reload — native POST→redirect forms become async in-place submits, list and repeater mutations apply optimistically and roll back on error, every action shows an in-progress spinner with controls disabled in flight, toasts replace the `?ok=`/`?error=` query-string banners, and all destructive actions get a consistent confirmation dialog (matching the existing send re-send confirm). A set of UX recommendations is delivered with the plan.
- **Change ID:** async-ux
- **PRD refs:** v2 US-03 (immediate feedback, no reload, optimistic rollback); v2 Non-Functional Requirements (~200 ms acknowledgement, no false success, a failed send writes no record).
- **Prerequisites:** S-10 (builds on the redesigned components and the shared primitives — Toast, Dialog, spinner states — introduced there)
- **Parallel with:** S-12, S-13 (independent surfaces; could proceed alongside, though they're cheap enough to slot anywhere)
- **Blockers:** —
- **Unknowns:**
  - Optimistic-rollback scope — which mutations are safe to apply optimistically vs. await-confirm (e.g. a send should not be optimistic) — Owner: user/planner. Block: no (a sane default: optimistic for list/row CRUD, await-confirm for sends; pinned in `/10x-plan`).
- **Risk:** The async conversion must degrade safely — a failed `fetch` surfaces an error toast and must never leave the UI showing a false success; the send path keeps the US-01 rule (a failed send writes no send record). The footgun is optimistic UI drifting out of sync with server truth; mitigated by rolling back on any non-2xx and by excluding sends from optimism. Depends entirely on S-10 landing its primitives first.
- **Status:** proposed

### S-12: Open the PDF in the browser

- **Outcome:** user clicks to view a report's PDF and it opens inline in a new browser tab (the report page stays put behind it) instead of forcing a file download; an explicit save-to-file path remains available; the email-attachment behavior is unchanged.
- **Change ID:** pdf-inline-view
- **PRD refs:** v2 US-05 (view PDF in browser, keep download)
- **Prerequisites:** S-09 (the shipped MVP — the PDF route and report page already exist)
- **Parallel with:** S-10, S-11, S-13 (fully independent — touches only the PDF response and the report-page link)
- **Blockers:** —
- **Unknowns:** —
- **Risk:** The smallest slice in either round — flips `content-disposition` from `attachment` to `inline` on `GET /api/reports/[id]/pdf` (or serves an inline variant) and adds `target="_blank"` to the report-page link, keeping a separate explicit-download affordance. The render itself is untouched, so the 5 s p95 budget and empty-section hiding are unaffected. A genuine quick win; ship any time.
- **Status:** ready

### S-13: Editable email configuration (separate PM + client templates)

- **Outcome:** user opens an email-configuration settings page and edits two independent templates — one for "Send to PM" and one for "Send to client" — each an editable subject + body supporting a vetted placeholder set (e.g. `{{project}}`, `{{month}}`, `{{agency}}`) resolved at send time; sends use the stored template for the recipient type, falling back to the current hardcoded copy when no template is saved.
- **Change ID:** email-templates
- **PRD refs:** v2 US-06 (per-recipient editable templates with placeholders); v2 Business Logic Changes (template-interpolation rule); v2 Non-Functional Requirements (no new leak surface). Reopens MVP Non-Goal "editable email body templates" — now in scope.
- **Prerequisites:** S-09 (the shipped MVP — extends the existing `send-report` path)
- **Parallel with:** S-10, S-11, S-12 (independent — a new settings table + page + a swap of the send path's subject/body source)
- **Blockers:** —
- **Unknowns:**
  - Final placeholder token set — Owner: user. Block: no (a default set ships; additions are cheap). Constraint already fixed: tokens restricted to non-leaky fields so the client template cannot surface internal notes or the internal contact email.
- **Risk:** Adds one global settings table following the established S-01 data-access pattern (`src/lib/email-templates/{queries,schema,form}.ts` + an Astro `.ts` settings route + a settings page mirroring brand-settings), and swaps `send-report.ts`'s hardcoded literals for stored-template interpolation with a fallback. The load-bearing guardrail is the no-leak NFR — the client template must not become a vector for internal-only fields, enforced by restricting the token whitelist. Dispatch mechanism and PDF attachment are unchanged. Independent of the redesign; ship any time.
- **Status:** ready

## Backlog Handoff

| Roadmap ID | Change ID                  | Suggested issue title                                          | Ready for `/10x-plan` | Notes |
| ---------- | -------------------------- | ------------------------------------------------------------- | --------------------- | ----- |
| F-01       | shared-credential-auth     | Replace Supabase Auth with HMAC shared-credential session     | yes                   | Run `/10x-plan shared-credential-auth`. Universal gate; secrets already set. |
| F-02       | pdf-render-pipeline        | Prove FormePDF renders a branded PDF on workerd within 5 s    | yes                   | Run `/10x-plan pdf-render-pipeline`. De-risks R1; can run parallel to F-01. |
| S-01       | projects-crud              | Projects CRUD (create/list/edit/delete)                       | no                    | Needs F-01. |
| S-02       | brand-settings             | Brand settings — logo upload + brand colors                   | no                    | Needs F-01. |
| S-03       | plugins-catalog            | Global plugins catalog CRUD + auto-promote                    | no                    | Needs F-01. |
| S-04       | pm-contact-list            | PM contact list CRUD                                          | no                    | Needs F-01. |
| S-05       | project-recurring-plugins  | Project recurring plugins list                                | no                    | Needs S-01, S-03. |
| S-06       | report-authoring           | Report authoring — sections, repeaters, recurring seeding     | no                    | Needs F-01, S-01, S-03, S-05. May split in `/10x-plan`. |
| S-07       | wp-cli-bulk-paste          | WP-CLI table bulk-paste parser                                | no                    | Needs S-06. |
| S-08       | branded-pdf-on-save        | Branded PDF on save + download link                           | no                    | Needs S-06, F-02, S-02. |
| S-09       | report-email-send          | Send report PDF to PM + client (re-send guard + history)      | no                    | Needs S-08, S-04 + Resend setup. North star. |
| S-10       | frontend-redesign          | Frontend redesign + shared shell + dashboard + responsive + WCAG-AA | yes             | Post-MVP north star. May split in `/10x-plan`. Use `frontend-design`. |
| S-11       | async-ux                   | Async actions + optimistic UI + spinners + toasts + confirms  | no                    | Needs S-10's components. |
| S-12       | pdf-inline-view            | Open report PDF in browser (new tab) + keep download          | yes                   | Quick win; independent. Run `/10x-plan pdf-inline-view`. |
| S-13       | email-templates            | Editable per-recipient (PM/client) email subject/body + placeholders | yes            | Independent; adds one settings table (S-01 data pattern). |

## Open Roadmap Questions

1. **Shared-credentials inherent leak risk** (PRD Open Q1). The single login/password pair for the whole agency is effectively public once staff change or a screenshot leaks. Accepted as a time-bounded MVP trade; mitigation is rotation-by-redeploy + password-manager discipline. Owner: user. Block: roadmap-wide — resolved only when per-user accounts ship post-MVP.
2. **Post-send edit divergence** (PRD Open Q2, FR-012). Reports stay editable after sending, so the stored data can drift from the sent PDF (the artifact of record). Accepted for MVP; revisit on a real client dispute or when audit history ships. Owner: user. Block: none (does not gate any slice).
3. **Multi-tenant data model** (PRD Open Q3). MVP is single-tenant with no `agency_id` columns; whether to retrofit row-level tenancy or rewrite later is deferred until multi-tenancy is actually planned. Owner: user. Block: none — do NOT pre-build tenancy columns (explicit tech-stack instruction).
4. **Email provider provisioning gates S-09.** A Resend (or Postmark) account, a verified sending domain, and the `RESEND_API_KEY` secret are not yet in place (`deploy-plan.md` Outstanding). Owner: user. Block: S-09 — resolving this is the only thing standing between a finished S-08 and the north star, so provision it before S-08 completes. *(Resolved — S-09 shipped.)*
5. **S-13 placeholder token set** (post-MVP, PRD-v2 Open Q1). The vetted set of email-template placeholders (e.g. `{{project}}`, `{{month}}`, `{{agency}}`) is pinned during S-13's `/10x-plan`. Owner: user. Block: none — a default set ships; the load-bearing constraint is that tokens stay restricted to non-leaky fields so the client template cannot surface project internal notes or the internal contact email.
6. **S-10 scope split** (post-MVP). S-10 is large (shared shell + dashboard, re-theme + forms, responsive + a11y) and may be split into multiple changes during `/10x-plan`. Owner: user/planner. Block: none — does not gate starting.

## Parked

Lifted from PRD `## Non-Goals` — explicitly out of MVP scope (post-MVP unless noted).

- **User accounts & roles** — Why parked: single shared login only; cuts ~1 week of auth + invitation + activation work to fit the 3-week budget.
- **Invitations / allowed-users list / activation flow** — Why parked: implies user accounts.
- **Per-user identity / audit trail** — Why parked: implies user accounts; no record of who created/sent a report.
- **Multi-tenancy** — Why parked: single-agency lock; v2 path with non-trivial migration cost (Open Roadmap Question 3).
- **Per-project / per-client brand override** — Why parked: one agency brand for MVP (FR-002 Socratic).
- **Custom freeform report sections** — Why parked: section list is fixed (FR-014); empty-section hiding handles the over-spec case.
- **PDF preview before save** — Why parked: explicit seed-note lock; users download to view.
- **Editable email body templates** — Why parked: fixed transactional template for MVP. **→ Reopened 2026-05-30 as S-13** (separate PM + client templates with placeholders).
- **Inbound email / reply tracking** — Why parked: post-MVP email-integration item.
- **Schedules / reminders / "report due" notifications** — Why parked: explicit seed-note lock.
- **Annual summary PDF** — Why parked: explicit seed-note lock.
- **Soft delete / archive** — Why parked: hard delete only for MVP; recovery via operator data restore.
- **Client portal** — Why parked: clients receive PDFs by email; no client-facing login surface.
- **WP-CLI / WP REST API auto-pull** — Why parked: dev pastes update data manually; auto-detection overlaps existing dashboards.
- **AI-assisted notes / drafting** — Why parked: the dev writes; no LLM add-on in MVP.
- **Cross-project reports feed** — Why parked: reports listed per-project only (FR-011).
- **WCAG-AA accessibility, mobile apps, mobile-responsive layout** — Why parked: don't fit the 3-week budget; MVP commits only to keyboard-navigable primary forms on desktop Chrome/Firefox/Safari/Edge. **→ WCAG-AA + mobile-responsive layout reopened 2026-05-30 in S-10** (native mobile apps stay parked).

## Done

- **F-01: (foundation) the shared-credential login works against the provisioned `SHARED_USERNAME` / `SHARED_PASSWORD_HASH`, an HMAC-signed session cookie is issued and verified, and every route except the login page redirects unauthenticated visitors** — Archived 2026-05-30 → `context/archive/2026-05-26-shared-credential-auth/`. Lesson: —.
- **F-02: (foundation) FormePDF renders the fixed agency-branded report template to a `Uint8Array` on the deployed Cloudflare Workers runtime within the 5 s p95 NFR** — Archived 2026-05-30 → `context/archive/2026-05-28-pdf-render-pipeline/`. Lesson: —.
- **S-01: user can create a project, view a list of all projects, edit any field, and hard-delete a project** — Archived 2026-05-30 → `context/archive/2026-05-29-projects-crud/`. Lesson: —.
- **S-02: user can upload/replace the agency logo and set brand colors** — Archived 2026-05-30 → `context/archive/2026-05-29-brand-settings/`. Lesson: —.
- **S-03: user can add / edit / remove entries in the global predefined plugins catalog** — Archived 2026-05-30 → `context/archive/2026-05-29-plugins-catalog/`. Lesson: —.
- **S-04: user can add / edit / remove PM contacts (name + email)** — Archived 2026-05-30 → `context/archive/2026-05-29-pm-contact-list/`. Lesson: —.
- **S-05: user can compose a project's recurring plugins list by picking from the global catalog and optionally adding free-text entries** — Archived 2026-05-30 → `context/archive/2026-05-30-project-recurring-plugins/`. Lesson: zod v4 `z.uuid()` over deprecated `z.string().uuid()`; pre-commit `eslint --fix` only lints staged files so run full `npm run lint`.
- **S-06: user can author a report's fixed sections (CRUD + row repeaters, recurring-seeded)** — Archived 2026-05-30 → `context/archive/2026-05-30-report-authoring/`. Lesson: vitest has no `@/` alias — import a `src/lib/<domain>/` module's siblings relatively; `supabase gen types` pollutes the output file with CLI banners (sanitize, verify with `astro check`).
- **S-07: user can bulk-paste a WP-CLI table into the plugins/themes repeaters (single-row fallback on parse failure)** — Archived 2026-05-30 → `context/archive/2026-05-30-wp-cli-bulk-paste/`. Lesson: —.
- **S-08: user gets a branded PDF on every save (real brand, empty sections hidden) + a visible download link** — Archived 2026-05-30 → `context/archive/2026-05-30-branded-pdf-on-save/`. Lesson: —.
- **S-09: user can send the branded PDF to the PM and the client (re-send guard + inline send history) — the north star, verified in prod** — Archived 2026-05-30 → `context/archive/2026-05-30-report-email-send/`. Lesson: Resend attachments take chunked standard-base64 (not base64url) of the PDF `Uint8Array` on workerd; record the send only after a confirmed dispatch (US-01: a failed send writes no record).
