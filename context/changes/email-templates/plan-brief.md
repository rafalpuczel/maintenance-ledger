# Editable Per-Recipient Email Templates (Slice D) — Plan Brief

> Full plan: `context/changes/email-templates/plan.md`

## What & Why

The outbound report email's subject and body are frozen in code (`send-report.ts`), identical for PMs and clients. This slice makes them editable as two independent templates (PM + client), each a plain-text subject + a **rich-text (WYSIWYG) HTML body** (bold/italic, links, lists, headers), with a vetted placeholder set filled at send time — so the agency can give PMs and clients appropriately different, formatted wording. It's Slice D of the post-MVP round.

## Starting Point

The send path (`src/lib/email/send-report.ts:47-52`) builds one hardcoded subject + `<p>`-HTML body from `project.name`, `report.month`, `brand.agency_name`. The send route (`api/reports/[id]/send.ts`) already resolves the recipient type and loads `report`/`project`/`brand` in a `Promise.all`. The codebase has a proven singleton-settings pattern (`brand_settings`: boolean-PK table → queries → zod → form → JSON route → AppShell page → React island) this slice clones. The runtime is Cloudflare workerd, which has bitten prior dependencies on bundling — so a server-side HTML sanitizer is the one real unknown.

## Desired End State

A new **Email templates** settings page lets the user edit PM and client subject + rich body in a WYSIWYG editor, see available tokens, and preview the rendered email live. Report sends use the saved template for the recipient type, with placeholders filled, the body **server-sanitized** to an allowlist, and placeholder *values* HTML-escaped. Any empty field — or no saved template — falls back per-field to the current copy. A client email can never surface internal fields: only vetted tokens exist (unknown ones rejected at save) and the body is sanitized server-side (no `<script>`, handlers, styles, or non-http/mailto links).

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Token set | `{{project}}`, `{{month}}`, `{{month_label}}`, `{{agency}}`, `{{client_name}}` | Covers greeting + identity; all from non-leak fields loaded at send time | Plan |
| Unknown token | Reject on save (error names it) | Catches typos before any client sees a raw `{{…}}` | Plan |
| **Body format** | **Rich text (WYSIWYG): bold/italic, links, lists, headers** | User chose formatted emails over plain text — **reverses PRD Non-Goal "no WYSIWYG editor"** | Plan (user) |
| Sanitization | Server-side allowlist on save **and** send | Client editors are bypassable; no-leak is a server guarantee | Plan |
| Editor + sanitizer lib | Decided in a Phase-1 workerd-bundling spike | Project has prior edge-bundling landmines; bundling is the deciding gate | Plan (user) |
| Storage | One singleton row, 4 columns (bodies = sanitized HTML) | Identical to proven `brand_settings`; set fixed at two recipients | Plan |
| Fallback | Per-field | A user who clears just the body still gets a sane email | Plan |
| Settings UX | Token reference + live preview (sample data) | Shows the sanitized/rendered result before saving | Plan |
| No-leak guard | `project.internal_notes` + `project.contact_email` are not tokens; body sanitized | Vetted list = allowlist for save-validation + render; sanitizer blocks injection | PRD-v2 |

## Scope

**In scope:** singleton `email_templates` table; `email-templates` lib domain (tokens+defaults, HTML sanitizer, schema, queries, render core); settings page + island with WYSIWYG editor + token reference + live preview; wire `sendReportEmail` to render per-recipient with per-field fallback + sanitization; nav link; unit tests for sanitizer/render/validation; Phase-1 editor+sanitizer bundling spike.

**Out of scope:** arbitrary/user-defined tokens; new recipient types; image/media in the body; changes to dispatch or PDF attachment; new secrets; per-project/per-user templates; client-trusted sanitization; seed data.

## Architecture / Approach

Bottom-up. Two pure cores: a **sanitizer** (`sanitize.ts`, fixed tag/attr/scheme allowlist, run server-side on save and send) and a **render engine** (`render.ts`: per-field default fallback → token resolution with **escaped values** → body sanitize), the latter reused by the form's live preview. A shared `tokens.ts` holds the vetted token list (the no-leak allowlist) and the default copy — imported by the schema (validation), render (resolution/fallback), and the island (reference). The data layer, route, page, and island mirror `brand_settings`; the body field swaps the textarea for a WYSIWYG editor whose HTML output is mirrored into a hidden input for the existing FormData submit path.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Data + sanitizer + render core (+ spike) | Editor/sanitizer spike, migration, DB types, tokens/defaults, sanitizer, schema, queries, render + unit tests | **Sanitizer must bundle/run on workerd** — gated by the spike; documented plain-text fallback if it can't |
| 2. Settings page + WYSIWYG island | Parser (sanitizes body), JSON route, AppShell page, WYSIWYG form + token reference + live preview, nav link | Editor UX + ensuring preview uses the real sanitized render output |
| 3. Wire send path | `sendReportEmail` takes recipient type + templates, renders w/ fallback + sanitize; route passes them | Preserve record-on-success-only + no-leak; defaults must match today's copy |

**Prerequisites:** user approval to install the editor + sanitizer deps (Phase 1). Otherwise additive; local Supabase + `db:types` workflow as usual.
**Estimated effort:** ~2-3 sessions across 3 phases (the spike + WYSIWYG editor add work beyond a plain settings clone).

## Open Risks & Assumptions

- **Sanitizer bundling on workerd is unproven** — the deciding risk; Phase 1 spikes it first. Fallback: plain-text body (escape + auto-paragraph), recorded as a reversal. Never ship an unsanitized rich body.
- Reverses the PRD Non-Goal "rich (WYSIWYG/HTML-design) email editor" by explicit user choice — recorded; the no-leak guardrail holds via server sanitization, not by forbidding HTML.
- The brand-settings singleton + S-11 JSON/island patterns transfer cleanly (verified against the actual files).
- `project.contact_name` may be empty → `{{client_name}}` renders blank by design (tested), not an error.
- Demoting the current hardcoded copy to `EMAIL_DEFAULTS` must reproduce today's output so the no-template path is a true no-op.

## Success Criteria (Summary)

- Distinct PM/client templates produce two differently-worded, formatted emails with placeholders filled; clearing a field falls back per-field; no saved templates = today's copy unchanged.
- A client email never contains internal notes or the internal contact email; pasted `<script>`/handlers/non-http links are stripped; unknown tokens are rejected at save.
- Failed sends still error and record nothing; the 5s p95 send budget is unaffected.
