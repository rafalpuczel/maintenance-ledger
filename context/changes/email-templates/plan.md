# Editable Per-Recipient Email Templates (Slice D) Implementation Plan

## Overview

Replace the single hardcoded outbound-email subject/body in `src/lib/email/send-report.ts` with two editable, stored templates — one for **PM** sends, one for **client** sends — each a plain-text subject + a **rich-text (HTML) body** edited in a WYSIWYG editor that supports bold/italic, links, bulleted/numbered lists, and headers/paragraphs. Placeholders from a vetted token set resolve from the report, project, and brand at send time. The body is stored as **server-sanitized HTML** (allowlisted tags only); placeholder *values* are HTML-escaped even inside the rich body. When a template field is empty (or no template has been saved), that field falls back per-field to the current built-in copy. A new global settings page (mirroring brand-settings) lets the agency edit both templates, with a token reference and a live preview rendered from the same sanitized output.

This is **Slice D** of the post-MVP round (PRD-v2 §"Scope of Change"). It is the only slice in the round that adds storage, and it **reverses two MVP/PRD-v2 Non-Goals** by explicit user decision (2026-05-31):
1. "Editable email body templates" — reopened (the whole point of the slice).
2. "A rich (WYSIWYG / HTML-design) email editor" (PRD-v2 §Non-Goals line 248) — **reopened**: the user chose a WYSIWYG body over plain text. Recorded here as a conscious scope change; the no-leak guardrail is preserved by server-side sanitization, not by forbidding HTML.

## Current State Analysis

- **The send copy is frozen in code.** `src/lib/email/send-report.ts:47-52` builds `subject` and `html` inline from `project.name`, `report.month`, and `brand.agency_name`. Both recipient types get identical copy. `sendReportEmail(args)` takes `{ report, brand, project, to }` — no recipient-type awareness inside the function.
- **The send route already knows the recipient type.** `src/pages/api/reports/[id]/send.ts:20-24` validates `recipient_type` ("pm"/"client") via `recipientTypeSchema` and branches on it (lines 39-52) to resolve the address. It calls `sendReportEmail` at line 56 and enforces record-on-success-only. All placeholder data (`report`, `brand`, `project`) is already loaded there in a `Promise.all` (lines 28-34).
- **The singleton-settings pattern is established and repeated.** `brand_settings` is the canonical shape: a boolean-PK singleton table (`supabase/migrations/20260529181950_create_brand_settings.sql`), a `queries.ts` with `getBrand`/`upsertBrand` upserting on `id: true` (`SINGLETON_ID`), a zod `schema.ts`, a `form.ts` parser returning `{ ok, data } | { ok: false, message }`, a `.ts` API route using `actionOk`/`actionError`, a settings `.astro` page in `AppShell`, and a React island (`BrandSettingsForm.tsx`). This slice clones that shape into a new `email-templates` domain.
- **Async/JSON conventions are settled (S-11).** All POST routes return the JSON envelope from `src/lib/ui/response.ts` (`actionOk`/`actionError`); islands submit via `fetch` through `src/lib/ui/useSubmit.ts`, show sonner toasts (`src/lib/ui/toast.ts`), no optimistic UI. The new settings form follows the `BrandSettingsForm` island pattern.
- **Placeholder data sources.** At send time we have: `report.month` (a `YYYY-MM` string per `reports/schema.ts`), `project.name`, `project.contact_name` (the client's own name, optional/nullable per `projects/schema.ts`), and `brand.agency_name` (nullable — `brand` can be `null`). The **leak-risk fields** that MUST NOT become tokens are `project.internal_notes` and `project.contact_email` (PRD-v2 §Non-Goals line 249, no-leak guardrail).
- **The runtime is Cloudflare workerd.** `astro.config.mjs` uses `@astrojs/cloudflare` v13, `output: "server"`. Any new dependency on the send path or in SSR must bundle and run on workerd — the project has prior bundling landmines (FormePDF WASM, `@pdf-lib/fontkit` failing to bundle; see CLAUDE.md). **The HTML sanitizer runs in the Worker** (on save and on send) and therefore must be workerd-compatible. This is the one real unknown in the slice and is gated by a spike in Phase 1.
- **Env config needs no change.** Email secrets are declared in `astro.config.mjs` `env.schema`; this slice adds no new secrets.
- **No rich-text or sanitizer dependency exists yet.** `package.json` has React 19, zod v4, Radix dialog/tooltip, sonner, lucide. A WYSIWYG editor and an HTML sanitizer are **new dependencies** — installation needs user approval at implement time.
- **Migrations run from a local Node process**; apply with `migration up --local` (never `db reset`). DB types via `npm run db:types`, then sanitize the file (CLI banner noise — lessons.md).

## Desired End State

A user on the new **Email templates** settings page can edit a PM subject + rich body and a client subject + rich body in a WYSIWYG editor (bold/italic, links, lists, headers), see the available placeholder tokens and a live rendered preview, and save. Subsequent report sends use the saved template for the recipient type, with placeholders filled, the body sanitized to the allowlist, and placeholder values escaped; any empty field falls back to the current default copy. A client send can never surface internal-only fields, because (a) only vetted tokens exist and saving rejects unknown ones, and (b) the body HTML is server-sanitized to a fixed tag/attribute allowlist with link schemes restricted to http/https/mailto.

**Verification:** Save distinct PM and client templates with formatting → send a report to a PM and to a client → each email carries its own subject and formatted body with placeholders filled. Paste a `<script>`/`onclick`/`style`-bearing snippet → it is stripped on save (and again on send). Clear the body of one template → that send uses the default body but the saved subject. Send with no templates ever saved → both sends match today's copy.

### Key Discoveries:

- Pattern to clone: `src/lib/brand-settings/{schema,queries,form}.ts` + `src/pages/api/brand-settings.ts` + `src/pages/brand-settings.astro` + `src/components/brand-settings/BrandSettingsForm.tsx`.
- Singleton table recipe: `supabase/migrations/20260529181950_create_brand_settings.sql` (boolean PK + `check (id)` + shared `set_updated_at` trigger + RLS-on-no-policies).
- Send-path seam: `sendReportEmail` (`src/lib/email/send-report.ts:40`) and its one caller `src/pages/api/reports/[id]/send.ts:56`.
- Token sources already in scope at the call site: `report`, `project`, `brand` (send.ts:28-34).
- JSON envelope + island plumbing: `src/lib/ui/response.ts`, `src/lib/ui/useSubmit.ts`, `src/lib/ui/toast.ts`.
- Settings nav lives in `src/components/Header.astro` as a Settings disclosure dropdown duplicated for desktop (line 47) + mobile (line 94), with `settingsPaths` (line 10) for active state — add `/email-templates` to all three.
- Layout/container idiom: `AppShell.astro` wraps content in `max-w-6xl`; settings pages use an inner `max-w-xl` card (brand-settings.astro:13).
- Workerd constraint on the sanitizer (CLAUDE.md PDF/bundling notes) — drives the Phase-1 spike.
- Lessons that bite this slice: zod v4 top-level validators (no `.string().uuid()`); import `src/lib/<domain>/` siblings relatively (`./schema`), not via `@/`, so vitest resolves them; judge lint/build/test by exit code; sanitize `database.types.ts` after `db:types`.

## What We're NOT Doing

- **No user-defined / arbitrary tokens** — the token set is fixed and vetted; this is the no-leak guarantee.
- **No new recipient types** — exactly PM and client; storage is a single 4-column row, not an extensible per-type table.
- **No change to the dispatch mechanism or the PDF attachment** — only the source of subject/body changes. Resend call, attachment, and record-on-success-only logic are untouched.
- **No new secrets / env changes.**
- **No per-project or per-user templates** — one global config, like brand settings.
- **No image upload / embedded media in the body** — the allowlist excludes `<img>` and media; bold/italic, links, lists, headers/paragraphs only.
- **No client-trusted sanitization** — the editor's output is re-sanitized server-side on save and again at send; the client editor is a convenience, not the security boundary.
- **No seed data** — an unsaved config is the valid "use defaults" state.

## Implementation Approach

Build bottom-up. **Phase 1** lands the data layer plus the two pure logic cores — the HTML **sanitizer** (allowlist) and the **interpolation/render** engine (token resolution, value-escaping, per-field fallback) — with unit tests, and resolves the one unknown (which editor+sanitizer pair bundles on workerd) via a short spike. **Phase 2** builds the user-facing settings surface (parser, route, page, island with the WYSIWYG editor + token reference + live preview) on top of that data layer. **Phase 3** flips the send path over to consume the stored templates, with the existing hardcoded strings demoted to fallback defaults — done last so the store and the render core exist and are verified before anything depends on them.

The fallback defaults live in **one** place (an `EMAIL_DEFAULTS` export) consumed by the render core (per-field fallback) so PM/client defaults can't drift. The vetted token list lives in **one** place and is the allowlist for both save-time validation and send-time render. The sanitizer allowlist lives in **one** place and is applied identically on save (so storage is already clean) and on send (defense in depth).

## Critical Implementation Details

**The sanitizer is the no-leak/injection chokepoint — it must run server-side.** Client-side editors can be bypassed, so the body HTML is sanitized in the Worker with a fixed allowlist: tags `strong, em, b, i, a, ul, ol, li, h2, h3, p, br` (h1 reserved for app chrome); attributes `href` on `<a>` only; `href` schemes restricted to `http`, `https`, `mailto`; every `<a>` forced to `rel="noopener noreferrer"` and `target="_blank"`. Everything else (`script`, `style`, `on*` handlers, `img`, `iframe`, inline styles, class/id) is stripped. Sanitize on **save** (so stored HTML is already clean) and again on **send** (defense in depth; a row could predate an allowlist change).

**Editor + sanitizer choice is gated by a workerd-bundling spike (Phase 1).** The sanitizer must `import` and run inside the Cloudflare Worker. Candidates: `sanitize-html` (Node-oriented — verify it bundles on workerd) or an isomorphic `DOMPurify` (needs a DOM shim like `linkedom` on workerd — heavier). The editor (client-only, no workerd constraint) is likely Tiptap, but a lighter `contentEditable` editor is acceptable. **Decision rule:** pick the sanitizer that bundles and runs cleanly on workerd with the smallest footprint; if neither bundles, fall back to a plain-text body (escape + auto-paragraph) and note the reversal — do NOT ship an unsanitized rich body. The spike's outcome is recorded in the change folder before Phase 1 proceeds to the real modules.

**Escaping vs. sanitizing — two different operations, correct order.** The body is rich HTML, so it is *sanitized* (allowlist), not escaped. But **placeholder values** injected into the body (e.g. an agency name containing `&` or `<`, a client name with `<`) must be *HTML-escaped* so they render as text and cannot inject markup. Order: resolve tokens into the body with **escaped values**, then sanitize the resulting HTML. The **subject** is plain text in the Resend payload — token-resolved, value-escaped is unnecessary (it's sent as the `subject` string, not HTML), but it must contain no newlines and no HTML.

**No-leak token contract.** The token→value resolver maps only: `{{project}}`→`project.name`, `{{month}}`→`report.month`, `{{month_label}}`→humanized month, `{{agency}}`→`brand?.agency_name ?? "Maintenance Report"` (preserve the existing fallback), `{{client_name}}`→`project.contact_name`. `project.internal_notes` and `project.contact_email` MUST NOT be reachable through any token. The vetted token list is defined once and imported by both save-time validation and render.

**`month_label` formatting.** Build it the same way the report detail page does — from the `YYYY-MM` month via `new Date(\`${report.month}-01\`).toLocaleDateString(undefined, { year: "numeric", month: "long" })` — so the email month label matches what the app shows. Deterministic, locale-default; no date library.

## Phase 1: Data layer + sanitizer + interpolation core (with editor/sanitizer spike)

### Overview

First resolve the editor+sanitizer choice via a short workerd-bundling spike. Then create the singleton `email_templates` table, regenerate DB types, and add the `email-templates` domain: the vetted-token list + defaults, the HTML sanitizer (allowlist), the zod schema (reject unknown tokens), the queries (get/upsert singleton), and the pure render engine (token resolution → value-escape → sanitize body → per-field fallback). Unit-test the sanitizer and render logic.

### Changes Required:

#### 0. Editor + sanitizer bundling spike

**File**: `context/changes/email-templates/spike-sanitizer.md` (notes) + a throwaway import in a scratch route or test to prove bundling

**Intent**: De-risk the one unknown before building on it: confirm the chosen HTML sanitizer imports and runs under `@astrojs/cloudflare` (workerd), and pick the editor.

**Contract**: Try the leading sanitizer (`sanitize-html`) in a Worker context (`npm run build` succeeds AND a `wrangler dev`/preview invocation runs a sample sanitize without a runtime error). If it fails to bundle, try the DOMPurify+`linkedom` shim; if that also fails, fall back to plain-text body (record the reversal). Record the verdict (chosen editor, chosen sanitizer, any shim, bundle-size note) in `spike-sanitizer.md`. **This step gates the rest of Phase 1.** Dependency installation here needs user approval.

#### 1. Migration — singleton email_templates table

**File**: `supabase/migrations/<timestamp>_create_email_templates.sql`

**Intent**: Add a single-row global store for the two templates, following the brand_settings singleton recipe exactly.

**Contract**: Table `public.email_templates` with boolean PK `id default true` + `constraint email_templates_singleton check (id)`; columns `pm_subject text not null default ''`, `pm_body text not null default ''`, `client_subject text not null default ''`, `client_body text not null default ''`, `created_at`/`updated_at timestamptz not null default now()`. The `*_body` columns hold sanitized HTML. Reuse the existing `public.set_updated_at()` trigger (do NOT redefine it). `alter table ... enable row level security` with no policies. Empty-string defaults make "row absent" and "row present but field blank" both mean "use code defaults" downstream.

#### 2. Regenerate database types

**File**: `src/types/database.types.ts`

**Intent**: Surface the new table to the typed Supabase client.

**Contract**: Run `npm run db:types` after the migration applies; sanitize the file (strip CLI connection log / upgrade notice / hint tag — valid content runs from `export type Json =` to the final `} as const`, per lessons.md). `Database["public"]["Tables"]["email_templates"]["Row"]` must exist.

#### 3. Vetted token list + default copy

**File**: `src/lib/email-templates/tokens.ts`

**Intent**: Single source of truth for which tokens exist and the default copy — imported by the schema (allowlist), the render core (resolution + fallback), and the form island (token reference).

**Contract**: Export the ordered token set as a typed const — `project`, `month`, `month_label`, `agency`, `client_name` — each with a one-line human description and its source field. Export `EMAIL_DEFAULTS` with `pmSubject`/`pmBody`/`clientSubject`/`clientBody` holding the current copy from `send-report.ts`, expressed with tokens (subject `"{{project}} — maintenance report {{month}}"`; body the `Hi,` / `Please find attached…` / `— {{agency}}` prose as allowlisted HTML, e.g. `<p>` blocks) so defaults and saved templates render through the same path. No leak-risk field appears here.

#### 4. HTML sanitizer (allowlist)

**File**: `src/lib/email-templates/sanitize.ts`

**Intent**: The server-side chokepoint that reduces any body HTML to the fixed allowlist; used on save and on send.

**Contract**: `sanitizeBody(html: string): string` using the spike-chosen library, configured to the allowlist in Critical Implementation Details (tags `strong,em,b,i,a,ul,ol,li,h2,h3,p,br`; `href` only on `<a>`; schemes `http|https|mailto`; force `rel="noopener noreferrer" target="_blank"`; strip everything else). Deterministic and pure (no I/O). Centralize the allowlist constants here and export them so tests and the schema can reference the tag set.

#### 5. Zod schema with reject-unknown-token validation

**File**: `src/lib/email-templates/schema.ts`

**Intent**: Validate a submitted template set; reject any `{{token}}` not in the vetted list so a typo never ships to a client.

**Contract**: `emailTemplatesSchema` = object of four trimmed string fields (`pm_subject`, `pm_body`, `client_subject`, `client_body`), all allowed empty (empty = fall back). A `superRefine` scans each field for `{{…}}` occurrences and fails with a message naming the offending token(s) when any is not in the vetted set from `./tokens`. (Subject/body length sanity caps optional.) Token-validation runs on the raw text; the body's HTML sanitization is applied in the form/route layer before persist, not in the schema. Import `./tokens` **relatively**. Export `EmailTemplatesInput`. zod v4 top-level forms only.

#### 6. Queries — get/upsert the singleton

**File**: `src/lib/email-templates/queries.ts`

**Intent**: Read and write the single config row, mirroring `brand-settings/queries.ts`.

**Contract**: `export type EmailTemplates = Database["public"]["Tables"]["email_templates"]["Row"]`. `getEmailTemplates(client): Promise<EmailTemplates | null>` via `.maybeSingle()`. `upsertEmailTemplates(client, input: EmailTemplatesInput): Promise<EmailTemplates>` upserting `{ id: true, ...input }` with `{ onConflict: "id" }`, `.select("*").single()`. Same error-throw style as the brand module. (Callers pass already-sanitized body HTML.)

#### 7. Pure render/interpolation core

**File**: `src/lib/email-templates/render.ts`

**Intent**: The send-time engine: given the stored templates (or null), a recipient type, and the data context, produce the final `{ subject, html }` with per-field fallback, token resolution, value-escaping, and body sanitization. Pure so it is unit-testable and reusable by the form preview.

**Contract**: Define `TemplateContext` with resolved token values (`project`, `month`, `month_label`, `agency`, `client_name`). Provide `resolveTokens(text, ctx)` (replace each `{{token}}` with its **HTML-escaped** value; unknown tokens resolve to empty as defensive belt-and-suspenders) and an internal `escapeHtml`. Top-level `renderTemplate({ templates, recipientType, ctx })` returns `{ subject, html }`: pick the recipient's stored `*_subject`/`*_body`, **per field** fall back to `EMAIL_DEFAULTS` when the stored value is empty/whitespace, resolve tokens (escaped values) into both, then **sanitize the body HTML** via `sanitizeBody` and strip any newline/markup from the subject. Build `month_label` from `YYYY-MM` as in the report detail page. Import siblings (`./tokens`, `./sanitize`) relatively.

#### 8. Unit tests for sanitizer, render, and schema

**File**: `src/lib/email-templates/sanitize.test.ts`, `render.test.ts`, `schema.test.ts`

**Intent**: Lock the security-critical and non-mechanical behavior.

**Contract**: Sanitizer — strips `<script>`, `on*` handlers, `style`, `<img>`/`<iframe>`; keeps allowlisted tags; drops a `javascript:` href but keeps `https:`/`mailto:`; forces `rel`/`target` on links. Render — (a) a value with `&`/`<`/`>` is escaped in the body and does not inject tags; (b) empty stored body but filled subject → default body + stored subject (per-field fallback); (c) null templates → defaults equal to today's copy; (d) empty `{{client_name}}` → blank, no crash; (e) `{{month_label}}` formats `2026-05` to the long form; (f) a body whose user typed `<script>` is gone after render. Schema — rejects `{{projct}}` naming it, accepts all five vetted tokens, allows empty fields. Import modules under test **relatively**.

### Success Criteria:

#### Automated Verification:

- Spike: `npm run build` succeeds with the chosen sanitizer imported in a Worker context (exit 0)
- Migration applies cleanly: `npx supabase migration up --local`
- DB types include the new table and the file is clean: `npx astro check` (exit 0)
- Unit tests pass: `npm test`
- Type checking passes: `npx astro check`
- Linting passes (judge by exit code): `npm run lint`

#### Manual Verification:

- The chosen sanitizer runs without a runtime error under `wrangler dev`/preview on a sample input.
- `email_templates` row is absent by default; a manual upsert of `{ id: true, ... }` creates exactly one row (no duplicates possible).
- Rendering with a hand-built context produces the expected sanitized `<p>`-bearing HTML and a clean subject.

**Implementation Note**: After this phase and all automated verification passes, pause for manual confirmation before Phase 2. The spike verdict (step 0) must be recorded before the phase is considered done.

---

## Phase 2: Settings page + WYSIWYG form island

### Overview

Add the user-facing surface: a form parser (which sanitizes body HTML before validation/persist), the JSON API route, the settings page in `AppShell`, and the React island with two subject inputs + two WYSIWYG body editors, a token reference, and a live preview. Add a navigation entry.

### Changes Required:

#### 1. Form parser

**File**: `src/lib/email-templates/form.ts`

**Intent**: Parse the submitted form into a validated, sanitized upsert payload or the first validation message, mirroring `brand-settings/form.ts`.

**Contract**: `parseEmailTemplatesForm(form: FormData): ParseResult` where `ParseResult = { ok: true; data: EmailTemplatesInput } | { ok: false; message: string }`. Read the four text fields; **sanitize the two `*_body` fields** via `sanitizeBody` before validating/persisting (so storage is clean); `safeParse` with `emailTemplatesSchema` (token check runs on the sanitized body too); return `issues[0]?.message` on failure. Import `./schema`, `./sanitize` relatively.

#### 2. API route

**File**: `src/pages/api/email-templates.ts`

**Intent**: Persist the templates, returning the standard JSON envelope.

**Contract**: `POST` handler mirroring `src/pages/api/brand-settings.ts`: parse → `actionError({ error: message })` on invalid → `upsertEmailTemplates(createSupabaseClient(), parsed.data)` → `actionOk({ message: "Email templates saved.", data })`; `actionError({ error: "Could not save email templates" }, 500)` on throw. Inherits the session gate from middleware.

#### 3. Settings page

**File**: `src/pages/email-templates.astro`

**Intent**: Server-render the page in `AppShell`, load current templates, and mount the island.

**Contract**: Mirror `brand-settings.astro`: `getEmailTemplates(createSupabaseClient())`, compute a `Last saved` timestamp, render an `AppShell` with a heading + description and the `EmailTemplatesForm` island (`client:load`) seeded with `action="/api/email-templates"`, the four current values (or undefined), and `updatedAt`. Use a wider inner container than `max-w-xl` (e.g. `max-w-3xl`) to fit the editor + preview; match the app's layout idiom.

#### 4. Form island with WYSIWYG editor + token reference + live preview

**File**: `src/components/email-templates/EmailTemplatesForm.tsx` (+ a small `RichTextEditor.tsx` wrapper around the chosen editor)

**Intent**: Edit both templates — subject input + WYSIWYG body — with inline validation, a visible token reference, and a live preview using sample data; submit via `useSubmit` + toast.

**Contract**: Props `{ action, initial?, updatedAt? }` with `initial` holding the four fields. Two field groups (PM, client), each a subject `<input>` + a `RichTextEditor` for the body (the editor's HTML output is mirrored into a hidden `<input name="pm_body|client_body">` so the existing FormData submit path carries it). A token-reference block lists the five vetted tokens with descriptions (from `@/lib/email-templates/tokens`). A **live preview** per recipient renders `renderTemplate` against fixed **sample** context (`project: "Acme Co"`, `month: "2026-05"`/`month_label: "May 2026"`, `agency` from the real brand name if passed else a sample, `client_name: "Jordan Lee"`) and shows the resolved subject + the sanitized HTML body via `dangerouslySetInnerHTML` (safe — the engine sanitizes). Client-side validation reuses `emailTemplatesSchema.safeParse` for per-field errors (especially unknown-token) before submit. On submit, `useSubmit` → `toast` on result. Type the handler as `React.SubmitEvent<HTMLFormElement>` (lessons.md). The editor is `client:load`-only (no SSR). Editor + preview must be keyboard-operable and labelled (WCAG-AA, round guardrail).

#### 5. Navigation entry

**File**: `src/components/Header.astro`

**Intent**: Make the new settings page reachable from the existing Settings dropdown, like the other settings pages.

**Contract**: The settings links live in a **Settings disclosure dropdown**, duplicated for desktop (`<details>` at line 47) and mobile (line 94), with a `settingsPaths` array (line 10) driving the active state. Make three edits: (1) add `/email-templates` to `settingsPaths`; (2) add an "Email templates" `<a href="/email-templates">` to the desktop dropdown after Brand settings; (3) add the same link to the mobile dropdown. Mirror the existing link markup and the `aria-current={pathname.startsWith("/email-templates") ? "page" : undefined}` pattern.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Linting passes (exit code): `npm run lint`
- Build succeeds (editor + sanitizer bundle): `npm run build`
- Existing tests still pass: `npm test`

#### Manual Verification:

- The Email templates page loads from the shared navigation on every authenticated page.
- The WYSIWYG editor applies bold/italic, links, lists, and headers; pasting disallowed markup (`<script>`, inline styles) does not survive save.
- Editing updates the live preview with sample values; the preview matches what will be sent (same sanitized output).
- Saving shows a success toast with no full-page reload; reloading shows the persisted values/formatting.
- An unknown token (e.g. `{{foo}}`) shows an inline error naming it and blocks save.
- The page is keyboard-operable with visible focus and meets the WCAG-AA bar (editor toolbar reachable/labelled, inputs labelled, preview announced).

**Implementation Note**: After this phase and all automated verification passes, pause for manual confirmation before Phase 3.

---

## Phase 3: Wire the send path

### Overview

Make the send path consume the stored templates: `sendReportEmail` takes the recipient type + loaded templates, renders the matching one via the Phase-1 core (with per-field fallback and body sanitization), and the route passes the recipient type and templates. The hardcoded strings are removed in favor of the shared defaults.

### Changes Required:

#### 1. Extend the send function to use templates

**File**: `src/lib/email/send-report.ts`

**Intent**: Replace the inline subject/html construction with template-driven rendering for the given recipient type, preserving the no-leak and default-fallback behavior.

**Contract**: Extend `SendReportArgs` with `recipientType: RecipientType` (from `@/lib/report-sends/schema`) and `templates: EmailTemplates | null` (passed in by the route so the route's single client owns the I/O and the function stays testable). Build `TemplateContext` from `report`, `project`, `brand`, then `const { subject, html } = renderTemplate({ templates, recipientType, ctx })`. Pass those to the existing Resend call. Delete the inline `subject`/`html`/`agency` construction (lines 47-52); the attachment, `from`, key check, and error throw are unchanged. The `agency` fallback string now lives in the token resolver.

#### 2. Pass recipient type + templates from the route

**File**: `src/pages/api/reports/[id]/send.ts`

**Intent**: Supply the recipient type and the loaded templates to the send function.

**Contract**: Add `getEmailTemplates(client)` to the existing `Promise.all` (line 31) alongside `getBrand`/`getProjectById`. Pass `recipientType` and `templates` into the `sendReportEmail({ … })` call (line 56). No change to record-on-success-only, address resolution, or response shapes.

#### 3. Adjust send tests if present

**File**: `src/lib/email/*.test.ts` (only if one exists)

**Intent**: Keep any existing send coverage green with the new signature.

**Contract**: Update call sites to the new `SendReportArgs`. Render behavior is covered in Phase 1; no new heavy test here.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Linting passes (exit code): `npm run lint`
- All unit tests pass: `npm test`
- Build succeeds: `npm run build`

#### Manual Verification:

- With distinct PM and client templates saved (with formatting), sending to a PM and to a client produces two emails, each with its own subject and formatted body and correctly filled placeholders.
- Clearing one field of a saved template falls back to the default for that field only.
- With no templates ever saved, both sends match the pre-change copy.
- A client send contains no internal notes or internal contact email, and any disallowed markup is stripped (no-leak + injection guardrail holds).
- A failed send still surfaces an error and records no send (US-01 preserved).
- The send stays within the 5s p95 budget (one extra lightweight singleton read + small string sanitize; no new render cost on the PDF path).

**Implementation Note**: After this phase and all automated verification passes, the slice is complete — confirm the full end-to-end flow before marking done.

---

## Testing Strategy

### Unit Tests:

- Sanitizer (`sanitize.test.ts`): strips script/handlers/style/img/iframe; keeps allowlisted tags; drops `javascript:` href, keeps `https`/`mailto`; forces link `rel`/`target`.
- Render core (`render.test.ts`): value-escaping (no tag injection via placeholder), per-field fallback, null-templates-equal-defaults, empty `{{client_name}}`, `{{month_label}}` formatting, body `<script>` removed.
- Schema (`schema.test.ts`): reject unknown token (message names it), accept all five vetted tokens, allow empty fields.

### Integration Tests:

- End-to-end via manual verification (no integration harness in this repo). The seam is the render core + sanitizer (unit-tested) + a one-line route wiring; the singleton query mirrors a tested pattern.

### Manual Testing Steps:

1. Save a PM template with a bold word, a bulleted list, a link, and `Hi {{client_name}},`; save a different client template.
2. Send to a PM → verify formatting + placeholders; send to a client → verify the different copy.
3. Paste a `<script>alert(1)</script>` and an `<a href="javascript:…">` into a body → save → confirm both are stripped/neutralized.
4. Clear the client body, keep its subject → send to client → default body, saved subject.
5. Enter `{{contact_email}}` (a leak field) → save is rejected (token not vetted), proving the leak field is unreachable.
6. Wipe the row (or fresh DB) → both sends match the original hardcoded copy.

## Performance Considerations

One extra singleton `select` on the send path (already inside the route's `Promise.all`, so no added latency vs. existing brand/project reads) plus a small HTML sanitize on a short string — negligible. The PDF render (the cost driver) is unchanged, so the 5s p95 budget is unaffected. New client deps (editor) affect only the settings page bundle, not the send path.

## Migration Notes

Additive only: a new singleton table with empty-string defaults. No changes to existing data, no destructive operations. Apply with `npx supabase migration up --local` (never `db reset`). No backfill — an absent row is the valid "use defaults" state, so existing behavior is preserved until the agency saves a template.

## Dependencies

New dependencies (installation needs user approval at implement time, per workflow rules):
- A WYSIWYG rich-text editor for the body (client-only) — likely Tiptap (`@tiptap/react` + starter-kit + link extension) or a lighter `contentEditable` editor; **final choice from the Phase-1 spike**.
- An HTML sanitizer that runs on workerd (server-side) — `sanitize-html` or `DOMPurify` (+ a DOM shim); **final choice from the Phase-1 spike** (workerd-bundling is the deciding criterion).

If neither sanitizer bundles on workerd, the documented fallback is a plain-text body (escape + auto-paragraph), recorded as a reversal — never ship an unsanitized rich body.

## References

- Pattern to clone: `src/lib/brand-settings/{schema,queries,form}.ts`, `src/pages/api/brand-settings.ts`, `src/pages/brand-settings.astro`, `src/components/brand-settings/BrandSettingsForm.tsx`
- Singleton migration: `supabase/migrations/20260529181950_create_brand_settings.sql`
- Send seam: `src/lib/email/send-report.ts:40`, `src/pages/api/reports/[id]/send.ts:56`
- Nav: `src/components/Header.astro` (`settingsPaths` line 10; desktop dropdown line 47; mobile dropdown line 94)
- JSON envelope / island plumbing: `src/lib/ui/response.ts`, `src/lib/ui/useSubmit.ts`, `src/lib/ui/toast.ts`
- PRD-v2 §"Scope of Change" → Slice D; §Non-Goals (leak guardrail; WYSIWYG reversal); US-06
- Workerd bundling constraints: `CLAUDE.md` (PDF/FormePDF + `@pdf-lib/fontkit` bundling notes)
- Lessons: `context/foundation/lessons.md` (zod v4 validators, relative sibling imports under `src/lib`, judge-by-exit-code, sanitize `db:types`)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data layer + sanitizer + interpolation core

#### Automated

- [x] 1.1 Spike: `npm run build` succeeds with the chosen sanitizer imported in a Worker context (exit 0)
- [x] 1.2 Migration applies cleanly: `npx supabase migration up --local`
- [x] 1.3 DB types include the new table and the file is clean: `npx astro check` (exit 0)
- [x] 1.4 Unit tests pass: `npm test`
- [x] 1.5 Type checking passes: `npx astro check`
- [x] 1.6 Linting passes (judge by exit code): `npm run lint`

#### Manual

- [ ] 1.7 Chosen sanitizer runs without a runtime error under `wrangler dev`/preview on a sample input
- [ ] 1.8 `email_templates` row absent by default; manual upsert creates exactly one row (no duplicates possible)
- [ ] 1.9 Rendering a hand-built context produces expected sanitized HTML and a clean subject
- [x] 1.10 Spike verdict recorded in `spike-sanitizer.md` (chosen editor + sanitizer + any shim)

### Phase 2: Settings page + WYSIWYG form island

#### Automated

- [ ] 2.1 Type checking passes: `npx astro check`
- [ ] 2.2 Linting passes (exit code): `npm run lint`
- [ ] 2.3 Build succeeds (editor + sanitizer bundle): `npm run build`
- [ ] 2.4 Existing tests still pass: `npm test`

#### Manual

- [ ] 2.5 Email templates page loads from shared navigation on every authenticated page
- [ ] 2.6 WYSIWYG editor applies bold/italic, links, lists, headers; disallowed markup does not survive save
- [ ] 2.7 Editing updates the live preview; preview matches what will be sent (same sanitized output)
- [ ] 2.8 Saving shows a success toast with no full-page reload; reload shows persisted values/formatting
- [ ] 2.9 Unknown token shows an inline error naming it and blocks save
- [ ] 2.10 Page is keyboard-operable with visible focus and meets the WCAG-AA bar

### Phase 3: Wire the send path

#### Automated

- [ ] 3.1 Type checking passes: `npx astro check`
- [ ] 3.2 Linting passes (exit code): `npm run lint`
- [ ] 3.3 All unit tests pass: `npm test`
- [ ] 3.4 Build succeeds: `npm run build`

#### Manual

- [ ] 3.5 Distinct saved templates (with formatting) → PM and client emails each carry their own subject/body with placeholders filled
- [ ] 3.6 Clearing one field falls back to the default for that field only
- [ ] 3.7 No templates saved → both sends match the pre-change copy
- [ ] 3.8 Client send contains no internal notes/contact email; disallowed markup stripped (no-leak + injection holds)
- [ ] 3.9 Failed send surfaces an error and records no send (US-01 preserved)
- [ ] 3.10 Send stays within the 5s p95 budget
