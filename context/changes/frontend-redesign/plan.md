# Frontend Redesign (S-10) — Implementation Plan

## Overview

Redesign the Maintenance Ledger UI from its dark "cosmic" starter look into a light, professional B2B tool (Linear/Stripe-style). This slice (S-10) delivers: a shared application header/navigation on every authenticated page, a real work dashboard at the home route, a rethemed light token palette, a Radix-backed primitive set (Tooltip, Dialog, Card, Input, EmptyState, Skeleton), full responsive layout (usable down to ~360px), and a WCAG-AA accessibility pass.

This is a **presentation-only** slice. It changes how the user encounters existing rules — not the rules. No domain logic, no PDF render logic, no send logic, and no async/optimistic conversion (the async work is the separate S-11 `async-ux` slice). The only data-layer addition is one read-only cross-project "recent reports" query for the dashboard.

## Current State Analysis

The MVP (S-01–S-09) is feature-complete and in production but wears the unstyled starter theme. Concretely, from codebase research:

- **`src/layouts/Layout.astro`** is a bare HTML shell — `<head>` + `<body><slot/></body>`, a `title` prop, and `import "../styles/global.css"`. It renders **no** header or nav. The login page and every authenticated page both use it directly.
- **`src/styles/global.css`** already defines a complete shadcn-style **light** token system in `oklch` (`--background: oklch(1 0 0)` white, `--foreground`, `--card`, `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`, sidebar + chart tokens), a `.dark` override block, and a Tailwind v4 `@theme` block mapping them to `--color-*`. The base layer applies `body { @apply bg-background text-foreground; }`. **The dark look does not come from the tokens** — it comes from a hardcoded `@utility bg-cosmic` gradient plus per-page inline classes (`bg-cosmic min-h-screen p-6 text-white`, glass cards `rounded-2xl border border-white/10 bg-white/10 backdrop-blur-xl`, gradient headings, `bg-purple-600` buttons). Re-theming is therefore: re-value the existing tokens to a branded light palette, delete `bg-cosmic`, and strip the per-page cosmic/glass overrides so pages fall back to the token-driven defaults.
- **`src/components/Topbar.astro`** exists but is imported only by the starter `src/components/Welcome.astro` (the root splash). It is unused by the real app (the dashboard hand-rolls its own nav). Both are dead weight after the redesign.
- **Tailwind v4** is wired via `@tailwindcss/vite` in `astro.config.mjs` (no `tailwind.config.js`); all config lives in `global.css`.
- **10 user-facing pages** (`src/pages/**/*.astro`), all following `bg-cosmic min-h-screen p-6 text-white` → `mx-auto max-w-{xl|2xl|3xl}`, each hand-rolling its own back-link + sign-out:
  - `/` → `index.astro` → `<Welcome/>` (starter splash, no auth logic)
  - `/dashboard` → `dashboard.astro` (thin glass card, hand-rolled links to Projects + 3 settings + sign-out)
  - `/login` → `login.astro` (`LoginForm`)
  - `/projects` → `projects/index.astro` (list)
  - `/projects/new` → `projects/new.astro` (`ProjectForm`)
  - `/projects/[slug]` → `projects/[slug].astro` (`ProjectForm`, `DeleteProjectButton`, `RecurringPlugins`)
  - `/projects/[slug]/reports/[id]` → `.../reports/[id].astro` (`ReportForm`, `SendToPmButton`, `SendToClientButton`, `DeleteReportButton`) — **the broken inline button row**
  - `/brand-settings`, `/plugins-catalog`, `/pm-contacts` (settings; identical `max-w-2xl` + "← Home" pattern)
- **`src/middleware.ts`** centralizes auth: every route is gated except an explicit `PUBLIC_PATHS` allowlist (`/login`, `/api/auth/login`, `/api/auth/logout`) + `_astro`/`favicon` prefixes. So `/` and any new route are already session-protected — no per-page guard needed.
- **UI primitives are sparse**: only `src/components/ui/button.tsx` (CVA + `@radix-ui/react-slot`, variants default/destructive/outline/secondary/ghost/link) and an Astro `ui/LibBadge.astro`. **No Tooltip, Dialog, Card, Input, Toast, EmptyState, or Skeleton.** `src/components/auth/FormField.tsx` is the de-facto input wrapper (label + icon + error + hint), already reused by ProjectForm, PmContacts, BrandSettingsForm, PluginCatalog, RecurringPlugins, LoginForm.
- **The broken disabled-Send warnings**: `src/components/reports/SendToClientButton.tsx:44-46` renders "No client email — add one on the project" as an amber `<a>` link stacked under a disabled button in a `flex flex-col items-end`; `src/components/reports/SendToPmButton.tsx:55-57` does the same with "No PM contacts — add one in Settings". These are US-04's target.
- **The three confirm modals** (`DeleteReportButton.tsx`, `DeleteProjectButton.tsx`, and the re-send confirms inside the Send buttons) are hand-rolled `useState`-driven `fixed inset-0` overlays with hardcoded cosmic colors (`bg-[#0f1529]`, `border-white/10`). They are functionally identical and ripe for a shared `Dialog`.
- **Forms** are native `<form method="POST" action=...>` → full-page redirect with `?ok=`/`?error=` query banners; islands use `useFormStatus()` for a pending button label (e.g. `auth/SubmitButton.tsx` with an inline spinner). Icons via `lucide-react`. This native-POST mechanism is **retained** in S-10; S-11 converts it to async.
- **Dependencies**: `@radix-ui/react-slot` is installed; `@radix-ui/react-tooltip` and `@radix-ui/react-dialog` are **not** (new deps for this slice). `class-variance-authority`, `clsx`, `tailwind-merge`, `tw-animate-css`, `lucide-react` are present. `eslint-plugin-jsx-a11y` (6.10.2) is **already** a devDependency — an automated a11y lint signal exists even though AA sign-off is manual.

## Desired End State

A signed-in user can complete the full existing flow (sign in → dashboard → project → author report → save → view PDF → send) through a redesigned, light-themed, consistently-navigated, wider interface that works on phone/tablet/desktop and meets WCAG-AA. Specifically:

- Every authenticated page renders one shared header (logo/home, Dashboard, Projects, a Settings dropdown, Sign out) that collapses to a mobile menu; no page hand-rolls its own nav.
- `/` is a work dashboard: recent projects, recent reports (with links), quick actions (New project / New report), settings links, and a friendly empty state when there's no data. The starter splash and the thin `/dashboard` card are gone.
- The app reads as a cohesive light B2B product — token-driven surfaces, no cosmic gradient, no glass cards, consistent Card/Input/Button styling.
- The disabled Send-to-PM / Send-to-client controls explain themselves via an accessible tooltip; the report action row is no longer broken by inline text.
- Lists show polished empty states and loading skeletons instead of bare text.
- All pages are laid out mobile-first and usable at ≥360px; the report repeater tables degrade gracefully on narrow screens.
- A manual WCAG-AA checklist passes (keyboard operability, visible focus, AA contrast, semantic landmarks, ARIA on tooltip/dialog/mobile-menu, accessible outcome banners).

**Verification of the end state:** `npm run build`, `npx astro check`, `npm run lint` (judged by exit code), and `npm test` all green; a manual walkthrough of every page on desktop + a ~375px viewport; the WCAG-AA checklist (Phase 5) signed off; and an explicit re-confirmation that the report-page restyle did not change which fields render (no-leak) or the empty-section PDF behavior.

### Key Discoveries:

- Tokens are already light shadcn `oklch` — retheme = re-value tokens + strip per-page overrides, not build-from-scratch (`src/styles/global.css`).
- Auth is centralized in `src/middleware.ts:6-23` — `/` and new routes are protected by default; the dashboard needs no guard.
- The header must NOT go in `Layout.astro` (login uses it too) — introduce a separate authenticated `AppShell.astro` layout that composes `Layout` + `Header` (see Critical Implementation Details).
- Only `@radix-ui/react-slot` is installed; Tooltip + Dialog need new Radix packages, consistent with the Button's existing Radix approach.
- The three confirm modals are duplicate hand-rolled overlays (`DeleteReportButton.tsx:37-64` is the template) — unify into one `Dialog`.
- `eslint-plugin-jsx-a11y` is already installed — enable/rely on it as a cheap automated a11y assist alongside the manual checklist.
- Lessons that bite this slice: judge lint/build by **exit code** not grep; keep `@typescript-eslint/no-misused-promises` off for `**/*.astro`; type form handlers as `React.SubmitEvent<HTMLFormElement>` (not deprecated `FormEvent`); `z.*` top-level format validators (n/a unless schema added); within `src/lib/<domain>/` import siblings relatively (applies to the new dashboard query); `npm run build` green ≠ `npm test` green.

## What We're NOT Doing

- **No async / optimistic UI / spinners-everywhere / toast wiring** — that is S-11 (`async-ux`). Forms stay native `POST→redirect`; the `?ok=`/`?error=` banners are kept but restyled in place (accessible `role=status`/`role=alert`). No Toast primitive is built here.
- **No PDF-in-browser change** — that is S-12 (`pdf-inline-view`), already shipped (`76a32e0`).
- **No email-template / email-config work** — that is S-13 (`email-templates`).
- **No domain-logic, schema (beyond one read query), API-route, PDF-render, or send-logic changes.** No new tables, no migrations.
- **No dark mode toggle** — the `.dark` token block may stay in `global.css` untouched, but no theme switcher is built; the app ships light-only.
- **No new automated a11y test tooling** (axe/Playwright) — AA is verified by a manual checklist plus the already-present `eslint-plugin-jsx-a11y`.
- **No new pages or features** beyond the dashboard (no cross-project reports *feed*, scheduling, etc. — the dashboard's recent-reports list is a bounded read, not a feed surface).
- **No deletion of the `.dark` tokens or the shadcn token names** — we re-value, not rename, to avoid churning every utility class.

## Implementation Approach

Foundations first, then surface. Phase 1 re-values the design tokens (driven by a `frontend-design` pass) and removes the cosmic utility so the whole app shifts to the light token baseline in one move. Phase 2 builds the reusable primitives and the shared shell/header so later page work composes instead of duplicating, and unifies the three hand-rolled modals onto the new Dialog. Phase 3 builds the dashboard at `/` (the round's headline surface) and removes the dead starter files. Phase 4 restyles every remaining page onto the shell + tokens + primitives and fixes the disabled-Send tooltips. Phase 5 does the responsive and WCAG-AA hardening across the now-stable surface, special-casing the report repeater tables.

Each phase is independently buildable and verifiable. Pages can't be meaningfully restyled before tokens and primitives exist, and responsive/a11y is best validated once the markup is stable — hence the ordering.

## Critical Implementation Details

- **Header placement — use a new authenticated sub-layout, not `Layout.astro`.** `Layout.astro` is shared with `/login`, which must NOT show the app header/nav. Introduce `src/layouts/AppShell.astro` that renders `<Layout title={title}><Header/><main>…<slot/></main></Layout>` (one `<header>`/`<nav>` landmark + one `<main>` landmark), and switch every authenticated page from `Layout` to `AppShell`. `login.astro` stays on bare `Layout`. This keeps the single-landmark-per-page a11y structure clean and avoids a conditional-header hack.
- **Token re-value, not rename.** Change the *values* of the existing `--background`/`--foreground`/`--primary`/etc. tokens in `:root`; do not rename them or the `@theme` `--color-*` mappings. Utility classes across the app (`bg-background`, `text-foreground`, `bg-primary`) then re-theme for free. Deleting `@utility bg-cosmic` will break any page still referencing it — every `bg-cosmic` occurrence must be removed in the same pass (Phase 1 strips the page wrappers; Phases 3–4 own the per-page card/heading/button overrides).
- **The mobile menu, tooltip, and dialog are the a11y-load-bearing pieces.** They must be keyboard-operable with visible focus and correct ARIA. Radix Tooltip/Dialog provide focus trap, `Esc`-to-close, and roles out of the box — prefer them over hand-rolling. The disabled-Send tooltip must be reachable by keyboard (a disabled `<button>` is not focusable — wrap the trigger so the tooltip is still reachable, e.g. an info affordance or a focusable wrapper, per US-04 "reachable by keyboard and pointer").
- **Presentation-only guardrail on the report page.** When restyling `reports/[id].astro` and its islands, do not add, remove, or re-source any rendered field. The set of fields shown must be identical before/after; the no-leak rule and empty-section PDF hiding live in render/query logic that this slice must not touch. Re-verify explicitly (Phase 4 success criterion).
- **`React.SubmitEvent<HTMLFormElement>`** for any form handler you touch (not the deprecated `FormEvent`), and keep `@typescript-eslint/no-misused-promises` off for `**/*.astro` — both are prior CI-failing lessons.

---

## Phase 1: Theme foundation (light B2B tokens)

### Overview

Establish the concrete light palette and type scale via a `frontend-design` pass, re-value the `global.css` tokens accordingly, and remove the `bg-cosmic` utility and the page-level cosmic wrappers so the app renders on the light token baseline. After this phase the app will look "unstyled light" (correct colors, not-yet-polished layout) — that is expected; polish lands in Phases 3–4.

### Changes Required:

#### 1. Concrete visual direction

**File**: (design artifact — no source file yet)

**Intent**: Produce the concrete light B2B palette, neutral surface ramp, one brand accent hue, and a type/spacing scale before touching tokens, so token values aren't guessed. Use the `frontend-design` skill.

**Contract**: A short design note (colors as `oklch`, AA-contrast foreground/background pairs for text, primary/secondary/muted/accent/destructive, border/ring) that maps 1:1 onto the existing token names in `global.css`. No new token *names* — only values for the existing set.

#### 2. Re-value design tokens

**File**: `src/styles/global.css`

**Intent**: Replace the `:root` token values with the Phase-1 light B2B palette; keep all token names and the `@theme` `--color-*` mappings unchanged so existing utilities re-theme automatically.

**Contract**: `:root` `--background`/`--foreground`/`--card`/`--popover`/`--primary`/`--secondary`/`--muted`/`--accent`/`--destructive`/`--border`/`--input`/`--ring` (+ sidebar/chart if used) re-valued. The `.dark` block and `@theme` block are left structurally intact. Confirm `body { @apply bg-background text-foreground; }` still holds.

#### 3. Remove the cosmic utility and page wrappers

**File**: `src/styles/global.css` + every `*.astro` page under `src/pages/`

**Intent**: Delete the `@utility bg-cosmic` gradient and strip `bg-cosmic min-h-screen p-6 text-white` (and the now-wrong `text-white`) from page wrappers so pages inherit the light token baseline. Per-page card/heading/button polish is deferred to Phases 3–4; this step only removes the dark scaffolding.

**Contract**: Zero remaining references to `bg-cosmic` in the repo (grep clean). Pages still render and are navigable (unstyled-light is acceptable at this phase). Glass-card inner markup may remain temporarily but must not depend on the dark background for legibility.

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Type check passes: `npx astro check`
- Lint passes (by exit code): `npm run lint`
- No `bg-cosmic` references remain: `grep -r "bg-cosmic" src` returns nothing

#### Manual Verification:

- Every page loads on a light background with legible text (no white-on-white, no dark-theme remnants making text unreadable)
- The `frontend-design` palette is applied (token values reflect the agreed light B2B direction)
- No page is broken/blank after the cosmic wrapper removal

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding.

---

## Phase 2: Primitives + shared shell

### Overview

Add the Radix-backed primitive set and the shared application shell/header, and migrate the three hand-rolled confirm modals to the new Dialog. After this phase the navigation shell exists and reusable building blocks are available for the page restyle.

### Changes Required:

#### 1. New dependencies

**File**: `package.json`

**Intent**: Add the Radix primitives needed for accessible Tooltip and Dialog, consistent with the Button's existing `@radix-ui/react-slot` usage.

**Contract**: Add `@radix-ui/react-tooltip` and `@radix-ui/react-dialog` to dependencies. Install requires user approval (deps install). No other deps needed (CVA/clsx/tailwind-merge/lucide-react/tw-animate-css already present).

#### 2. Primitive components

**File**: `src/components/ui/tooltip.tsx`, `dialog.tsx`, `card.tsx`, `input.tsx` (+ `label.tsx`), `empty-state.tsx`, `skeleton.tsx`

**Intent**: Build the token-styled primitive set. Tooltip + Dialog wrap their Radix counterparts; Card/Input/Label/EmptyState/Skeleton are token-styled markup. Match the Button's CVA + `cn()` conventions.

**Contract**: Each exports a typed React component styled with the design tokens (`bg-card`, `text-foreground`, `border-border`, `ring-ring`, etc.). Tooltip and Dialog expose keyboard operability + visible focus + correct roles via Radix. `EmptyState` takes an icon + title + description + optional action; `Skeleton` is an animated placeholder (may use `tw-animate-css`). No business logic.

#### 3. Accessible outcome banner

**File**: `src/components/ui/Banner.astro` (or `.tsx` if a page needs it client-side)

**Intent**: Replace the ad-hoc inline `?ok=`/`?error=` banner markup with one styled, accessible banner component driven by the existing query-string params. Mechanism unchanged (still query-string post-redirect); only presentation + a11y improve. Toasts and async are S-11.

**Contract**: Renders success/error variants with `role="status"` (ok) / `role="alert"` (error), token-styled, dismissible-optional. Reads the same `?ok=`/`?error=` params the pages already pass. Used by pages that currently show inline banners.

#### 4. Shared header + authenticated shell

**File**: `src/components/Header.astro` and `src/layouts/AppShell.astro`

**Intent**: Build the top-bar header (logo/home → Dashboard, Projects, a Settings dropdown for Brand/Plugins/PM contacts, Sign out at right) that collapses to a mobile menu, and an authenticated layout that composes `Layout` + `Header` + a `<main>` wrapper. Sign-out reuses the existing `POST /api/auth/logout` form.

**Contract**: `AppShell.astro` accepts `title` (forwarded to `Layout`) and renders one `<header><nav>` landmark + one `<main>` landmark around `<slot/>`. `Header.astro` marks the current section as `aria-current="page"`. The Settings dropdown and mobile menu are keyboard-operable with visible focus (the dropdown/menu may be a small island if it needs JS; otherwise a CSS/`<details>` disclosure). The mobile menu uses a Radix Dialog/sheet or an accessible disclosure. No page uses this yet (wired in Phases 3–4).

#### 5. Migrate confirm modals to Dialog

**File**: `src/components/reports/DeleteReportButton.tsx`, `src/components/reports/DeleteProjectButton.tsx`, and the re-send confirmation blocks in `SendToPmButton.tsx` / `SendToClientButton.tsx`

**Intent**: Replace the duplicated hand-rolled `fixed inset-0` overlay markup with the new `Dialog` primitive, preserving exact behavior (same confirm copy, same native-POST forms inside, same re-send confirmation requirement). Visual/structural only.

**Contract**: Each confirm flow renders via `Dialog` (focus trap, `Esc` close, `role=dialog`, labelled title). The inner `<form method="POST" action=…>` and hidden inputs are unchanged. The re-send confirmation guard (FR-019) still fires. No change to what's submitted.

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Type check passes: `npx astro check`
- Lint passes (by exit code), including `eslint-plugin-jsx-a11y`: `npm run lint`
- Tests pass: `npm test`

#### Manual Verification:

- Tooltip opens on hover AND keyboard focus, closes on `Esc`/blur, with visible focus
- Dialog traps focus, closes on `Esc` and on Cancel, returns focus to the trigger
- Delete-report, delete-project, and re-send confirmations still work and still require explicit confirmation
- Header renders with working Dashboard/Projects/Settings-dropdown/Sign-out; sign-out logs out; mobile menu opens/closes by keyboard and pointer at a narrow width
- Outcome banner renders ok/error variants and is announced by a screen reader

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding.

---

## Phase 3: Work dashboard at `/`

### Overview

Build the work dashboard at the home route, add the one read-only cross-project recent-reports query it needs, wire pages' home/landing to it, and delete the dead starter splash + unused Topbar.

### Changes Required:

#### 1. Recent-reports query

**File**: `src/lib/reports/queries.ts` (existing reports data module)

**Intent**: Add a single read-only query returning the latest N reports across all projects, joined to project name + slug so the dashboard can link to each. Read-only; no new table; not a general feed.

**Contract**: A new exported function (e.g. `listRecentReports(limit)`) following the established client-factory + query-module pattern, returning report id + month/title + project name + slug, ordered most-recent first, limited (default 5). Import any sibling modules **relatively** (vitest-alias lesson) if a sibling is referenced.

#### 2. Dashboard page

**File**: `src/pages/index.astro` (replace the `<Welcome/>` splash)

**Intent**: Render the work dashboard using `AppShell`: recent projects (existing query), recent reports (new query), quick actions (New project → `/projects/new`, New report → start-a-report path), and links into the three settings pages. Show an `EmptyState` when there are no projects/reports.

**Contract**: `index.astro` uses `AppShell`, fetches recent projects + recent reports in frontmatter, and lays them out in `Card`s with links to detail pages. Quick actions are prominent. Empty system → `EmptyState` (not bare text), per US-02 acceptance. "New report" links to a project-pick or new-report entry consistent with how reports are created today (no new report-creation flow invented).

#### 3. Resolve `/dashboard`

**File**: `src/pages/dashboard.astro`

**Intent**: The thin hand-rolled dashboard card is superseded by `/`. Redirect `/dashboard` → `/` (frontmatter redirect) so any existing link/bookmark still works, rather than maintaining two landings.

**Contract**: `dashboard.astro` frontmatter returns `Astro.redirect("/")`. (Keep `@typescript-eslint/no-misused-promises` off for `.astro` — prior lesson; a frontmatter redirect returns a `Response` synchronously.)

#### 4. Delete dead starter files

**File**: `src/components/Welcome.astro`, `src/components/Topbar.astro`

**Intent**: Remove the starter splash and the unused Topbar now that `/` is the dashboard and `Header.astro` is the nav source of truth. Confirmed unused outside the splash.

**Contract**: Both files deleted; no remaining imports (grep clean for `Welcome` and `Topbar`).

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Type check passes: `npx astro check`
- Lint passes (by exit code): `npm run lint`
- Tests pass: `npm test`
- No references to deleted components remain: `grep -r "Welcome\|Topbar" src` returns nothing

#### Manual Verification:

- `/` shows recent projects, recent reports (with working links), quick actions, and settings links inside the shared shell
- An empty system shows an `EmptyState`, not bare text
- `/dashboard` redirects to `/`
- "New project" and "New report" quick actions reach the correct create flows

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding.

---

## Phase 4: Restyle remaining pages + tooltip fix

### Overview

Migrate every remaining page onto `AppShell` + tokens + the new primitives (Card/Input via the existing FormField, Button), remove the per-page cosmic/glass/gradient leftovers, fix the disabled-Send buttons to use Tooltip (US-04), and restyle the in-place banners. Includes the explicit presentation-only no-leak re-check on the report page.

### Changes Required:

#### 1. Projects pages

**File**: `src/pages/projects/index.astro`, `projects/new.astro`, `projects/[slug].astro`

**Intent**: Switch to `AppShell`, replace glass cards with `Card`, widen content appropriately, restyle the list/forms with token-driven primitives, and drop the hand-rolled back-links (the shell provides nav). The project list gets an `EmptyState` when empty.

**Contract**: Each page uses `AppShell`; no `bg-cosmic`/`bg-white/10`/`text-white`/gradient-heading classes remain; forms use `Card` + existing `FormField`/`Button`; list rows link to detail. Form handlers, if touched, typed as `React.SubmitEvent<HTMLFormElement>`. Native POST behavior unchanged.

#### 2. Settings pages

**File**: `src/pages/brand-settings.astro`, `plugins-catalog.astro`, `pm-contacts.astro`

**Intent**: Apply the same `AppShell` + `Card` treatment to the three settings pages so they share one consistent settings look; remove the "← Home" hand-rolled links and gradient headings. Catalog/contacts lists get `EmptyState`s.

**Contract**: Each uses `AppShell`; consistent page header (title within the shell, not a per-page gradient `<h1>`); list islands (`PluginCatalog`, `PmContacts`, `BrandSettingsForm`) restyled to tokens; native POST + `useFormStatus` pending labels retained.

#### 3. Report page + disabled-Send tooltips

**File**: `src/pages/projects/[slug]/reports/[id].astro`, `src/components/reports/SendToPmButton.tsx`, `src/components/reports/SendToClientButton.tsx`

**Intent**: Restyle the report page onto `AppShell` + `Card`, lay the action controls out cleanly (no broken row), and replace the amber inline warning `<a>` links with a `Tooltip` on the disabled control explaining the reason + fix (US-04). The tooltip must be keyboard- and pointer-reachable (disabled buttons aren't focusable — use a focusable wrapper/affordance).

**Contract**: `SendToClientButton.tsx:44-46` and `SendToPmButton.tsx:55-57` inline `<a>` warnings are removed; the disabled state shows the same message ("No client email — add one on the project" / "No PM contacts — add one in Settings") via `Tooltip`, reachable by keyboard and pointer. The report action area no longer overflows. Disabled logic (`!clientEmail` / `contacts.length === 0`) unchanged. The link to the fix (project / pm-contacts) is preserved inside or alongside the tooltip.

#### 4. Restyle banners in place

**File**: pages currently rendering `?ok=`/`?error=` inline banners

**Intent**: Swap ad-hoc inline banner markup for the `Banner` component from Phase 2. Mechanism unchanged.

**Contract**: Each such page renders `Banner` for the query-string outcome; `role=status`/`role=alert` present; no behavior change.

#### 5. Presentation-only no-leak re-check

**File**: (verification step on `reports/[id].astro` + the report islands)

**Intent**: Confirm the restyle changed only presentation — the exact set of fields rendered on the report page (and thus the data reaching any client-facing artifact) is identical before/after, and empty-section PDF hiding is untouched (no PDF render code modified).

**Contract**: No edits to PDF render logic, send logic, or which fields are output. Diff review confirms only class/markup/structure changes on data display; internal notes + internal contact email still appear only where they did before.

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Type check passes: `npx astro check`
- Lint passes (by exit code), including `jsx-a11y`: `npm run lint`
- Tests pass: `npm test`
- No cosmic/glass leftovers: `grep -rn "bg-cosmic\|bg-white/10\|from-blue-200\|text-white" src/pages` is empty (or only intentional exceptions, reviewed)

#### Manual Verification:

- Every page renders in the light theme within the shared shell; no page hand-rolls nav or back-links
- Disabled Send-to-PM / Send-to-client show their reason in a tooltip reachable by keyboard and pointer; the action row is not broken
- The report page shows exactly the same fields as before the restyle (no-leak re-check); empty sections still hidden in the generated PDF
- Project/catalog/contacts lists show polished empty states when empty
- Outcome banners render correctly after a save/send/delete

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding.

---

## Phase 5: Responsive + WCAG-AA hardening

### Overview

Make the now-stable surface fully responsive (mobile-first, ≥360px) with special care for the report repeater tables, then run a manual WCAG-AA pass across the app and fix what it surfaces.

### Changes Required:

#### 1. Responsive layout pass

**File**: `src/layouts/AppShell.astro`, `src/components/Header.astro`, and all `src/pages/**/*.astro`

**Intent**: Apply mobile-first Tailwind breakpoints so every page is usable from ~360px up — fluid content widths, stacking columns, the header collapsing to its mobile menu, touch-friendly targets.

**Contract**: At 360–414px, no horizontal page scroll, no clipped content, header mobile menu works; at tablet/desktop breakpoints the layout expands appropriately. Content max-widths are sensible per page type (forms narrower, lists/dashboard wider).

#### 2. Report repeater tables on narrow screens

**File**: `src/components/reports/RowsRepeater.tsx`, `src/components/reports/LicensesRepeater.tsx`

**Intent**: Give the plugin/theme/license repeater tables an explicit narrow-screen treatment (stacked card-rows or contained horizontal scroll) so the densest surface stays usable on phones — the one genuinely hard responsive case.

**Contract**: At ≤414px the repeaters present each row without breaking layout (stacked fields or a scroll container with visible affordance); add/remove-row and the WP-CLI bulk-paste field remain operable. No change to parsing or submit logic.

#### 3. WCAG-AA manual pass + fixes

**File**: across components/pages as needed (focus styles, ARIA, contrast, landmarks)

**Intent**: Walk the manual AA checklist and fix gaps: keyboard operability of every interactive element (nav, dropdown, mobile menu, tooltip, dialog, forms), visible focus everywhere, AA color contrast on the new palette, semantic landmarks (one `<header>`/`<nav>`/`<main>` per page), labelled controls, and accessible outcome announcements. Lean on `eslint-plugin-jsx-a11y` for the cheap automated catches.

**Contract**: The checklist below passes. Tooltip/Dialog/menu expose correct roles + keyboard behavior. Color contrast meets AA (≥4.5:1 text, ≥3:1 large text/UI). Every form control has an associated label. `jsx-a11y` lint is clean.

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Type check passes: `npx astro check`
- Lint passes (by exit code), `eslint-plugin-jsx-a11y` clean: `npm run lint`
- Tests pass: `npm test`

#### Manual Verification:

- Every page is usable with no horizontal overflow at 360px and at 375/414px; tablet + desktop layouts expand correctly
- The report repeater tables are usable on a phone width (rows readable, add/remove + bulk-paste operable)
- Full keyboard-only walkthrough of the primary flow (sign in → dashboard → project → report → save → view PDF → send) works with visible focus throughout
- WCAG-AA checklist passes: landmarks present and unique, all interactive elements keyboard-operable, tooltip/dialog/mobile-menu have correct ARIA + focus management, AA contrast verified on key text/UI, all inputs labelled, outcome banners announced
- Screen-reader spot-check of the header nav, a form, a dialog, and a tooltip behaves sensibly

**Implementation Note**: This is the final phase. After automated + manual verification, pause for manual confirmation that the WCAG-AA checklist is signed off before closing the change.

---

## Testing Strategy

### Unit Tests:

- No new domain logic to unit-test in this slice. If the new `listRecentReports` query warrants a thin test, place it under `src/lib/reports/` and import siblings **relatively** (vitest has no `@/` alias — prior lesson).
- Existing tests must stay green throughout (regression guard).

### Integration / Build Tests:

- `npm run build` + `npx astro check` + `npm run lint` + `npm test` after every phase, judged by **exit code** (prior lesson — never grep stdout for "error").

### Manual Testing Steps:

1. Full primary flow on desktop: sign in → dashboard → open a project → author/save a report → view PDF → send to PM and client. Confirm light theme, shared header on every page, working nav + sign-out.
2. Repeat the flow keyboard-only: tab order sensible, visible focus everywhere, dialogs trap focus and `Esc`-close, tooltips reachable.
3. Disabled-Send tooltips: open a report with no client email and no PM contacts; confirm both reasons show in tooltips (keyboard + pointer) and the action row isn't broken.
4. Narrow viewport (~375px): every page usable, header mobile menu works, repeater tables usable.
5. No-leak re-check: confirm the report page and generated PDF show the same fields as before the redesign; empty sections still hidden.
6. Empty-state check: with no projects/reports, the dashboard and list pages show empty states, not bare text.

## Performance Considerations

Presentation-only; no new request-path work. The dashboard adds two reads (recent projects — existing; recent reports — one new bounded query, limit ~5) in page frontmatter; negligible at this scale (small users/low qps per PRD). PDF save→link stays within the existing 5 s p95 budget (untouched). Keep islands at their current `client:load` footprint; do not add heavy client JS (the redesign is mostly Astro markup + CSS tokens + a few small Radix islands).

## Migration Notes

No data migration. No schema change (the recent-reports query is read-only over existing tables). The only dependency change is adding `@radix-ui/react-tooltip` + `@radix-ui/react-dialog` (requires user approval to install). Deleting `Welcome.astro`/`Topbar.astro` and redirecting `/dashboard` are non-destructive (no data, bookmarks redirect). Deploy via `wrangler deploy` (Workers Static Assets) as always — never `wrangler pages deploy`.

## References

- PRD (post-MVP, brownfield): `context/foundation/prd-v2.md` (US-01, US-02, US-04; Success Criteria; NFRs; Slice A scope)
- Roadmap: `context/foundation/roadmap.md` (S-10, Open Roadmap Question 6 — scope split; resolved here as one change, 5 phases)
- Locked decisions: `memory/post-mvp-improvements-decisions.md`
- Lessons: `context/foundation/lessons.md` (lint-by-exit-code; Astro `no-misused-promises`; zod v4; vitest `@/` alias)
- Layout shell: `src/layouts/Layout.astro`; tokens: `src/styles/global.css`; auth gate: `src/middleware.ts:6-23`
- Broken inline warnings: `src/components/reports/SendToClientButton.tsx:44-46`, `src/components/reports/SendToPmButton.tsx:55-57`
- Confirm-modal template to unify: `src/components/reports/DeleteReportButton.tsx:37-64`
- Sibling slices (out of scope, for context): S-11 `async-ux`, S-12 `pdf-inline-view` (done, `76a32e0`), S-13 `email-templates`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Theme foundation (light B2B tokens)

#### Automated

- [x] 1.1 Build passes: `npm run build` — 074ef9b
- [x] 1.2 Type check passes: `npx astro check` — 074ef9b
- [x] 1.3 Lint passes (by exit code): `npm run lint` — 074ef9b
- [x] 1.4 No `bg-cosmic` references remain: `grep -r "bg-cosmic" src` returns nothing — 074ef9b

#### Manual

- [x] 1.5 Every page loads on a light background with legible text — 074ef9b
- [x] 1.6 The `frontend-design` palette is applied (tokens reflect the agreed direction) — 074ef9b
- [x] 1.7 No page is broken/blank after cosmic wrapper removal — 074ef9b

### Phase 2: Primitives + shared shell

#### Automated

- [x] 2.1 Build passes: `npm run build` — b50a076
- [x] 2.2 Type check passes: `npx astro check` — b50a076
- [x] 2.3 Lint passes (by exit code), including `jsx-a11y`: `npm run lint` — b50a076
- [x] 2.4 Tests pass: `npm test` — b50a076

#### Manual

- [x] 2.5 Tooltip opens on hover and keyboard focus, `Esc`/blur closes, visible focus — b50a076
- [x] 2.6 Dialog traps focus, closes on `Esc`/Cancel, returns focus to trigger — b50a076
- [x] 2.7 Delete-report, delete-project, and re-send confirmations still work and still require confirmation — b50a076
- [x] 2.8 Header renders with working Dashboard/Projects/Settings-dropdown/Sign-out; mobile menu opens/closes by keyboard and pointer — b50a076
- [x] 2.9 Outcome banner renders ok/error variants and is announced by a screen reader — b50a076

### Phase 3: Work dashboard at `/`

#### Automated

- [x] 3.1 Build passes: `npm run build` — 5d749ec
- [x] 3.2 Type check passes: `npx astro check` — 5d749ec
- [x] 3.3 Lint passes (by exit code): `npm run lint` — 5d749ec
- [x] 3.4 Tests pass: `npm test` — 5d749ec
- [x] 3.5 No references to deleted components remain: `grep -r "Welcome\|Topbar" src` returns nothing — 5d749ec

#### Manual

- [x] 3.6 `/` shows recent projects, recent reports (with working links), quick actions, and settings links in the shared shell — 5d749ec
- [x] 3.7 An empty system shows an `EmptyState`, not bare text — 5d749ec
- [x] 3.8 `/dashboard` redirects to `/` — 5d749ec
- [x] 3.9 "New project" and "New report" quick actions reach the correct create flows — 5d749ec

### Phase 4: Restyle remaining pages + tooltip fix

#### Automated

- [x] 4.1 Build passes: `npm run build` — ff4350f
- [x] 4.2 Type check passes: `npx astro check` — ff4350f
- [x] 4.3 Lint passes (by exit code), including `jsx-a11y`: `npm run lint` — ff4350f
- [x] 4.4 Tests pass: `npm test` — ff4350f
- [x] 4.5 No cosmic/glass leftovers in `src/pages` (grep reviewed) — ff4350f

#### Manual

- [x] 4.6 Every page renders in the light theme within the shared shell; no hand-rolled nav/back-links — ff4350f
- [x] 4.7 Disabled Send buttons show their reason via tooltip (keyboard + pointer); action row not broken — ff4350f, 6279db7
- [x] 4.8 Report page shows the same fields as before (no-leak re-check); empty sections still hidden in the PDF — ff4350f
- [x] 4.9 Project/catalog/contacts lists show polished empty states when empty — ff4350f
- [x] 4.10 Outcome banners render correctly after save/send/delete — ff4350f

### Phase 5: Responsive + WCAG-AA hardening

#### Automated

- [x] 5.1 Build passes: `npm run build` — 48e6fba
- [x] 5.2 Type check passes: `npx astro check` — 48e6fba
- [x] 5.3 Lint passes (by exit code), `jsx-a11y` clean: `npm run lint` — 48e6fba
- [x] 5.4 Tests pass: `npm test` — 48e6fba

#### Manual

- [x] 5.5 Every page usable with no horizontal overflow at 360/375/414px; tablet + desktop expand correctly — 48e6fba, 6279db7
- [x] 5.6 Report repeater tables usable on a phone width (rows readable, add/remove + bulk-paste operable) — 48e6fba, 6279db7
- [x] 5.7 Full keyboard-only primary-flow walkthrough works with visible focus throughout — 48e6fba
- [x] 5.8 WCAG-AA checklist passes: unique landmarks, all interactive elements keyboard-operable, tooltip/dialog/menu ARIA + focus management, AA contrast verified, all inputs labelled, banners announced — 48e6fba
- [x] 5.9 Screen-reader spot-check of header nav, a form, a dialog, and a tooltip behaves sensibly — 48e6fba
