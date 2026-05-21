---
project: "Maintenance Ledger"
version: 1
status: draft
created: 2026-05-19
context_type: greenfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: 2026-06-09
  after_hours_only: true
---

## Vision & Problem Statement

Maintenance reports for client WordPress sites are produced today through a multi-handoff pipeline: the developer who performs the update round (WP core, plugins, themes, PHP) writes loose notes in Slack or Basecamp; a PM copies those notes into a Google Docs template, reformats them, exports a PDF, and emails the client with the PDF attached. Every maintenance cycle, for every retainer client, both roles spend time on the same artifact, format consistency drifts between PMs, and the agency depends on Google Docs as the de-facto template layer.

The market answer (ManageWP, MainWP, WP Umbrella, Patchstack reports) charges monthly per-site subscriptions, ships generic branding, and leaves the agency with a tool it does not own. Building this once internally removes a recurring cost, gives full control over branding and report shape, and removes the dev → PM copy-paste step entirely — the dev authors the report in its final shape, the PM reviews and sends.

## User & Persona

Primary persona: **agency team member maintaining client WordPress retainers** — split across two roles inside a single agency (5 PMs + 15 devs):

- **Developer** — runs the actual maintenance round on a client site (WP core, plugin, theme, PHP updates; integrity checks; fixes), then drafts the report. Currently writes loose notes in Slack / Basecamp. Pastes plugin/theme update tables from WP-CLI output. Wants minimal friction to author the report in its final shape so it does not need a second round of polishing.
- **PM / team lead** — owns the client relationship, reviews reports, sends them to the client. Currently formats the dev's loose notes in Google Docs, exports PDF, sends email. Wants format consistency across the team and a single send button.

The MVP serves both at parity through a single shared flow: one editing surface, no copy-paste between tools, the same set of capabilities exposed to everyone signed in.

## Success Criteria

### Primary
- A user with the shared login can complete the full flow end-to-end in a single session: set brand once, create a project, author a report (using bulk-paste from WP-CLI for plugin and theme update tables), save, see a branded PDF generated, and send that PDF to a PM AND to the client via the in-app buttons.
- Generating and sending a maintenance report takes at least 50% less wall-clock time than the current Slack/Basecamp → Google Docs → PDF → email pipeline.

### Secondary
- Format consistency across reports — every PDF for every project comes out structurally identical, with only content differing. (Today, format drifts between PMs.)
- After the first report on a project, subsequent reports start with the recurring plugin list pre-populated so the dev does not re-enter the same plugin rows every cycle.

### Guardrails
- The MVP ships in ≤ 3 weeks of after-hours work. Anything that would push past three weeks is cut, not absorbed.
- The shared login is not bypassable from any route — every page except the login page requires an authenticated session.
- Empty report sections are HIDDEN in the generated PDF, never rendered as empty stubs. ("Plugins: none" looks worse than no Plugins section at all.)
- Client contact emails and internal notes never appear in the client-facing PDF unless the user explicitly puts them in the "notes to client" field.

## User Stories

### US-01: User authors and sends a maintenance report

- **Given** the user is signed in with the shared credentials, brand settings are configured, the predefined plugins catalog and at least one PM are saved in Settings, and a project exists with a client contact email
- **When** they create a new report on that project, fill the relevant sections (using bulk-paste from WP-CLI for plugins and themes), click Save, then click "Send to client" and "Send to PM"
- **Then** the system generates a branded PDF on save, exposes a download link, and dispatches two emails — one to the chosen PM and one to the project's contact — each carrying the PDF as an attachment using a fixed predefined email template

#### Acceptance Criteria
- A WP-CLI plugin or theme table pasted into the bulk field is parsed into individual rows (name, current version, target version, updated yes/no). A failed parse lands the raw paste as one row so no input is lost.
- Empty report sections (e.g., no license renewals entered) are NOT rendered in the PDF — neither as headers nor as "none" placeholders.
- The PDF uses the configured brand logo and brand colors.
- The recurring plugins list configured on the project pre-populates the plugins repeater when a new report is created.
- After a successful "Send to PM" or "Send to client", the button label switches to "Re-send …" with the previous send's timestamp shown inline; re-sending requires an explicit confirmation.
- The report remains editable after sending; sending does not lock it.
- A failed email send surfaces an error in-app; the report and PDF are not affected and the send record is not written.

## Functional Requirements

### Authentication
- FR-001: User can sign in using a shared login credential pair (login + password). The credential pair is provisioned at deploy time by the deploy operator and is not editable from within the app; rotation requires a redeploy with new values. Priority: must-have
  > Socratic: Counter-argument considered — "shared creds always leak (departing staff, screenshots in chat, identical password for everyone)." Resolution: accepted for MVP as an explicit time-bounded trade. Mitigations: (a) rotation by redeploy on staff changes / quarterly; (b) operational practice that the agency stores the shared credentials in a password manager and does not distribute them through team communication channels. Per-user accounts are post-MVP. Logged in Open Questions as a known accepted risk.

### Settings (global)
- FR-002: User can view and edit brand settings — upload/replace a logo and set brand colors. Priority: must-have
  > Socratic: Counter-argument considered — "agencies routinely white-label; per-client branding would be more valuable." Resolution: one agency brand only for MVP; this tool is for the agency's own reports. Per-project brand override is post-MVP.
- FR-003: User can manage the global predefined plugins catalog — add / edit / remove entries (plugin name; optional notes). The catalog is the canonical source of plugin names, used in two places: as the dropdown source when adding individual plugin rows to a report, AND as the pick-list when composing a project's recurring plugins (FR-009). Additionally, when the user enters a free-text plugin name on a report row that does not yet exist in the catalog, the system automatically promotes that name into the catalog so future reports can reference it from the dropdown. Priority: must-have
  > Socratic: Counter-argument considered — "a free-text plugin name field on each row would be simpler than a catalog." Resolution: the catalog exists so plugin names stay consistent across reports and so project recurring lists can reference a stable source. Manual free-text entry is still allowed on report rows, and any new name entered this way is auto-promoted into the catalog so the next report can pick it from the dropdown.
- FR-004: User can manage the PM contact list (add / edit / remove entries, each with name + email) used as the "Send to PM" recipient picker. Priority: must-have
  > Socratic: Counter-argument considered — "PMs could be hardcoded alongside the shared-login credentials." Resolution: PM list churns more than agency credentials do (clients reassigned between PMs, new hires). Editable in-app is cheap.

### Projects
- FR-005: User can create a project with name, slug, URL, contact (company, name, email), and internal notes. Priority: must-have
  > Socratic: Counter-argument considered — "fewer required fields would speed setup." Resolution: this is the minimum needed to identify the project, route the client email (contact), and brief whoever picks up the next report (internal notes). Internal notes can be left empty.
- FR-006: User can view a list of all projects. Priority: must-have
  > Socratic: Counter-argument considered — "list could be replaced by a recent-reports feed." Resolution: list is the primary nav surface for retainer work; non-recent projects must still be reachable without browsing reports.
- FR-007: User can edit any field on an existing project. Priority: must-have
  > Socratic: Counter-argument considered — "edits are rare; could defer." Resolution: client contact emails change, agency notes evolve, URLs migrate. Editable from day one.
- FR-008: User can delete a project (hard delete; archive is post-MVP). Priority: must-have
  > Socratic: Counter-argument considered — "hard delete destroys report history." Resolution: rare action; soft-delete is explicitly post-MVP per seed notes; accepted risk. If a project is deleted by mistake, recovery is via an operator-side data restore.
- FR-009: User can compose a project's recurring plugins list by (a) picking entries from the global plugins catalog (FR-003) and (b) optionally adding free-text entries not yet in the catalog. When a new report is created for that project, every entry in the project's recurring list is auto-seeded as a row in the plugins repeater on the new report. Priority: must-have
  > Socratic: Counter-argument considered — "global preset only (copied to every new project at creation) is simpler than a per-project recurring list." Resolution: per-project lists allow client-specific stack tracking (some clients run extra plugins). The global catalog is reused as the pick-source, which gets most of the convenience anyway.

### Reports
- FR-010: User can create a new report on a project. Priority: must-have
  > Socratic: Counter-argument considered — "could merge create and edit into one flow." Resolution: separate creation step lets the system seed recurring plugins (FR-009) and the current month/date at the right moment; cleaner than reusing the edit view.
- FR-011: User can view a list of reports for a project, scoped within that project's detail page. Priority: must-have
  > Socratic: Counter-argument considered — "a global cross-project reports feed might be more useful." Resolution: cross-project view is post-MVP; per-project listing is the smallest unit users actually navigate to. A global feed adds nav surface without changing the primary flow.
- FR-012: User can edit any field on an existing report (before or after PDF generation and sending). Priority: must-have
  > Socratic: Counter-argument considered — "post-send edits create divergence between the sent PDF and the stored data." Resolution: accepted; the sent PDF is the artifact of record, the stored data feeds the next report's context (recurring plugin list, etc.). Logged in Open Questions for future revisit.
- FR-013: User can delete a report. Priority: must-have
  > Socratic: Counter-argument considered — "deleting reports loses history." Resolution: audit-grade history is a multi-user post-MVP concern; for MVP, accept that anyone with the login can delete.
- FR-014: User can fill a fixed set of report sections — month (auto from date created), WP core (version + updated yes/no), PHP (updated yes/no + from/to versions), plugins repeater (name + updated yes/no + from/to versions), themes repeater (name + updated yes/no + from/to versions), integrity checks (status passed / issues found + list of issues), fixes applied, license renewals (name + status expired/expiring + optional expiry date + notes), notes to client (free-text). Priority: must-have
  > Socratic: Counter-argument considered — "clients vary; some want extras (uptime, SEO, backups, monitoring), some want fewer sections." Resolution: section list is locked for MVP; empty-section hiding (FR-017) handles the over-spec case; new section types are revisited only when a client actually asks. Custom freeform sections deferred to post-MVP.
- FR-015: User can bulk-paste a WP-CLI table (plugin or theme update output) into the plugins / themes repeater. The system parses a documented expected format into individual repeater rows; on parse failure, the entire paste lands as the body of a single row so the user sees that something happened and can clean it up manually. The UI shows the expected paste format inline. Priority: must-have
  > Socratic: Counter-argument considered — "WP-CLI output format varies by version; the parser will be fragile." Resolution: pin one documented format (the recent `wp plugin update --all` table output) and accept the fragility; the single-row fallback ensures no data is lost on failure. Multi-format auto-detection is out of scope.
- FR-016: User can add, edit, or remove rows individually in the plugins, themes, and license-renewals repeaters. Priority: must-have
  > Socratic: Counter-argument considered — "row-level UI is the main frontend complexity; could simplify to a single textarea per section." Resolution: row-level structure is what enables the PDF to render rows consistently and the bulk-paste parser to produce structured output. Stands.
- FR-017: On every Save, the system produces an updated branded PDF of the report using the current brand settings before the save completes; empty sections are hidden in the PDF (no headers, no "none" placeholders). Priority: must-have
  > Socratic: Counter-argument considered — "PDF gen on every Save wastes work during draft authoring and slows saves." Resolution: matches the user's literal seed-note wording; simplest mental model — Save always produces a current PDF. Latency cost is real but bounded; revisited if it becomes a UX problem.
- FR-018: User can download the generated PDF via a link visible on the report page after save. Priority: must-have
  > Socratic: Counter-argument considered — "download link is implied by FR-017 and does not deserve its own FR." Resolution: the FR captures the explicit UX requirement (the link must be visible on the report page, not hidden behind a menu) — without it, users would have no in-app path to the PDF.

### Sending
- FR-019: User can click "Send to PM" on a saved report, pick a PM from the contact list (FR-004), and the system emails that PM the branded PDF using a fixed predefined email template. The system records the send (PM name + email + timestamp). If the report has already been sent to a PM, the button reads "Re-send to PM" and requires an explicit confirmation dialog before re-sending. Priority: must-have
  > Socratic: Counter-argument considered — "double-clicks send the same PDF twice; clients have noticed." Resolution: per-send timestamp tracking + re-send confirm dialog removes the easy footgun while still allowing re-sends for typos or delivery failures.
- FR-020: User can click "Send to client" on a saved report; the system emails the project's contact email the branded PDF using a fixed predefined email template. The system records the send (recipient email + timestamp). If the report has already been sent to the client, the button reads "Re-send to client" and requires an explicit confirmation dialog. Priority: must-have
  > Socratic: Counter-argument considered — same as FR-019. Resolution: same as FR-019.
- FR-021: User can see the per-report send history on the report page — for each recipient (PM list entries and client contact), the most recent send timestamp is shown inline beside the relevant Send button. Priority: must-have
  > Socratic: Counter-argument considered — "a per-report log is overkill for MVP; could omit and let users guess." Resolution: rendering 'Sent to <addr> on <date>' beside each button is one extra line per row in the UI and is the lightest possible defense against accidental double-sends.

## Non-Functional Requirements

- Saving a report and receiving its generated PDF download link completes in under 5 seconds at the 95th percentile for reports containing up to 30 plugin rows and 5 theme rows.
- The login flow resists automated credential-stuffing at scale, while a legitimate user mistyping the shared password three times in a row is not locked out.
- The client-facing PDF contains no project internal notes and no project contact email unless the user has explicitly transcribed them into the "notes to client" free-text field — those fields are agency-internal and must not leak into the artifact sent to clients.
- Within 3 seconds at the 95th percentile of clicking "Send to PM" or "Send to client", the email has been dispatched and the user sees acknowledgement that the send completed. (Delivery into the recipient's inbox is bounded by external mail infrastructure and is not part of this commitment.)
- The product is usable on the latest two major versions of the four mainstream desktop browsers (Chrome, Firefox, Safari, Edge). Mobile and accessibility (WCAG-AA) commitments are explicitly out of MVP scope — see Non-Goals.

## Business Logic

**Each new maintenance report is seeded from its project's recurring plugin list and rendered through a single agency-branded PDF template that hides any section the user did not fill — so format consistency and reduced re-entry follow from the system's structure, not from reviewer discipline.**

What the rule consumes (as user-facing inputs):

- The project's **recurring plugin list** — composed once per project by picking from the agency-wide plugin catalog (FR-003) and optionally adding free-text entries (FR-009). This is the per-cycle context that should not be re-typed.
- The **current cycle's delta** — the dev's authoring of this report's specific values: WP core / PHP / per-plugin version-from/to / themes / integrity checks / fixes / licenses / notes to client.
- The agency's **brand settings** — logo and brand colors (FR-002), consumed at PDF render time.

What the rule produces:

- A **report record** that combines the seeded recurring rows with the cycle delta. Editable at any time before or after rendering.
- A **branded PDF artifact** rendered through one fixed template. Sections appear in the PDF only when the user has filled their underlying fields; empty sections do not render as headers or "none" placeholders.
- Two **outbound emails** (PM, client) when the user explicitly triggers them, each carrying the rendered PDF as an attachment.

Where the user encounters the rule:

- On creating a new report, the plugins repeater is pre-populated by the project's recurring list — the user sees existing rows on the empty form and edits or extends them, rather than starting from a blank slate.
- On every Save, a fresh PDF is generated using the current brand settings. The user sees a download link with the latest rendered artifact.
- When clicking Send, the user does not pick a layout, colors, or a template — the artifact is deterministic from the input and the agency brand.

The rule is not a recommendation or a scoring engine — the app does not infer urgency, suggest update orders, or prioritize plugins. The decisions the app makes are: *which rows to seed*, *which sections to render*, and *which brand to apply*.

## Access Control

**Single shared login for MVP.** No user accounts, no per-user identity, no roles, no invitations, no activation flow. The agency operates one credential pair (login + password) that everyone on the team uses. The credential pair is provisioned at deploy time by the deploy operator, is not editable from within the app, and is rotated by redeploying with new values.

There is no public sign-up. The login page accepts the provisioned credentials and nothing else; any visitor without credentials gets a generic auth failure.

**PMs are NOT user accounts.** PMs appear in the MVP as a settings-maintained contact list (each entry: name + email). When the user clicks "Send to PM" on a report, they pick a PM from this list and the system emails the branded PDF to that address. PMs never log in.

**Settings is global**, not per-user. Anyone with the shared login can edit brand settings (logo, brand colors), the PM contact list, and the predefined plugins catalog. There is no audit trail of who changed what — that is a multi-user concern and is post-MVP.

**Post-MVP access-control roadmap** (captured here so it is not forgotten; NOT part of the MVP):

- Per-user accounts (admin + team member roles).
- Allowed-users list maintained by admin (email invitations).
- Activation flow (invite email → activation page → password set).
- Suspend / remove / role-change controls.
- Per-project member assignment and project visibility scoping.
- Audit trail of who created / sent each report.

## Non-Goals

Functional scope avoids (capabilities the MVP will not build):

- **User accounts and roles** — single shared login only; admin / team-member distinction is post-MVP. *Rationale: cuts roughly one week of auth + invitation + activation work; aligns with the 3-week budget.*
- **Invitations / allowed-users list / activation flow** — no email-invite-then-set-password onboarding. *Rationale: implies user accounts.*
- **Per-user identity / audit trail** — the system does not record who created or sent a given record. *Rationale: implies user accounts.*
- **Multi-tenancy** — the system is built for one agency; other agencies cannot run their own branded instance from the same deployment. *Rationale: explicit single-tenant lock; preserves system simplicity. Multi-tenant is a v2 path with non-trivial migration cost (logged as Open Question).*
- **Per-project / per-client brand override** — every PDF carries the single agency brand. *Rationale: one logo + one color palette for MVP; per-project brand is post-MVP per FR-002 Socratic.*
- **Custom freeform report sections** — the report's section list is fixed (FR-014). *Rationale: clients may want extras, but adding section-type management blows the budget; empty-section hiding handles the over-spec case.*
- **PDF Preview** — no in-app preview of the PDF before save. *Rationale: explicit per seed notes; users download to view.*
- **Editable email body templates** — both Send buttons use a fixed predefined email template. *Rationale: explicit per seed notes; template management is post-MVP.*
- **Inbound email / reply tracking** — the system does not parse client replies or attach them to reports as comments. *Rationale: clarification of the seed-notes "Email integration" post-MVP item.*
- **Schedules / notifications / reminders per project** — no scheduled "report due" emails or in-app reminders. *Rationale: explicit per seed notes.*
- **Annual summary PDF report** — no aggregate yearly report rendered from a project's report history. *Rationale: explicit per seed notes.*
- **Soft delete / archive** — project deletion is hard delete only. *Rationale: explicit per seed notes; soft delete is post-MVP.*
- **Client portal** — clients receive the PDF by email; they never log in to view their own reports. *Rationale: explicit lock to prevent scope drift toward a client-facing surface.*
- **WP-CLI / WP REST API auto-pull integration** — the system does not connect to client WordPress sites; the dev pastes update data manually. *Rationale: explicit lock; auto-detection is post-MVP and overlaps with the value of existing maintenance dashboards.*
- **AI-assisted notes / report drafting** — no LLM summarization of fixes, integrity checks, or notes-to-client. *Rationale: explicit lock; the dev writes; no AI add-on in MVP.*
- **Cross-project reports feed** — reports are listed per-project only (FR-011). *Rationale: cross-project view is post-MVP per FR-011 Socratic.*

Non-functional scope avoids:

- **WCAG-AA accessibility commitment** — the MVP commits only to keyboard-navigable primary forms; full WCAG-AA conformance is out of scope. *Rationale: full a11y audit + remediation does not fit the 3-week budget.*
- **Mobile applications** — web-only for MVP. *Rationale: explicit per seed notes.*
- **Mobile-responsive layout** — the read-only report view is not committed to working on phones. *Rationale: explicitly declined; web desktop only for MVP.*

## Open Questions

1. **Shared-credentials inherent leak risk.** The MVP uses a single login/password pair for the entire agency (FR-001), provisioned at deploy time by an operator. When staff change, or a screenshot is shared, the credential pair is effectively public. Accepted as a time-bounded trade for MVP. Mitigations: (a) rotation by redeploy on staff changes or quarterly; (b) operational practice that the agency stores the shared credentials in a password manager and does not distribute them through team communication channels. Resolved when: per-user accounts ship post-MVP. Owner: user.
2. **Editing reports after sending creates divergence between the sent PDF and the stored data** (FR-012). The sent PDF is the artifact of record, but the stored data (used as the seed for future reports' recurring plugins, etc.) can drift from it. Accepted for MVP; revisit when: a real client dispute makes the divergence painful, or when audit history ships with multi-user. Owner: user.
3. **Multi-tenant data model decision.** The MVP is single-tenant; agency scoping is not modeled in the data layout. If/when multi-tenancy ships post-MVP, deciding whether to retrofit row-level tenancy onto existing data versus a clean rewrite is a non-trivial call. Owner: user; resolution deferred until multi-tenancy is actually planned.
