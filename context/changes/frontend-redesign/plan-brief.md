# Frontend Redesign (S-10) — Plan Brief

> Full plan: `context/changes/frontend-redesign/plan.md`
> PRD: `context/foundation/prd-v2.md` (post-MVP, brownfield) · Roadmap: `context/foundation/roadmap.md` (S-10)

## What & Why

Redesign the Maintenance Ledger UI from its dark "cosmic" starter look into a light, professional B2B tool. The MVP is feature-complete and in production but presents like an unstyled starter — no real homepage, no shared navigation, cramped narrow cards on a dark background, and broken inline warning text on the report page. This slice makes the proven product *look* like a product, and reopens two MVP scope cuts (mobile-responsive layout, WCAG-AA accessibility) now that the core is validated.

## Starting Point

A 10-page Astro 5 + React 19 + Tailwind v4 app. Auth is centralized in `src/middleware.ts` (all routes gated by default). `Layout.astro` is a bare HTML shell with no header. Critically, `global.css` **already** holds a complete shadcn-style *light* `oklch` token system — the dark look comes from a per-page `bg-cosmic` gradient + inline glass classes, not the tokens. UI primitives are sparse (only a `Button`); there's no Tooltip/Dialog/Card. Forms are native `POST→redirect` with `?ok=`/`?error=` query banners.

## Desired End State

Every authenticated page renders one shared header (Dashboard, Projects, Settings dropdown, Sign out) that collapses to a mobile menu. `/` is a work dashboard (recent projects, recent reports, quick actions, settings links, empty state). The whole app reads as a cohesive light B2B product, is usable from ~360px up, and passes a WCAG-AA checklist. The disabled Send buttons explain themselves via accessible tooltips. No domain logic, PDF, send, or async behavior changes.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Scope of this change | S-10 only (shell + dashboard + retheme + responsive + a11y) | S-11/S-12/S-13 are separate change folders; S-12 already shipped | Roadmap |
| Split S-10 into folders? | No — one change, 5 phases | The pieces are tightly coupled (can't responsive-test un-rethemed pages) | Plan |
| Visual direction | `frontend-design` skill drives the palette (Phase 1) | Matches the locked "use frontend-design" decision; avoids guessing hex in a plan | Memory + Plan |
| Theme mechanism | Re-value existing tokens + delete `bg-cosmic`/glass overrides | Tokens are already light shadcn pairs — retheme, don't rebuild | Plan (research) |
| Primitive scope | Full Radix-backed set (Tooltip, Dialog, Card, Input, EmptyState, Skeleton) | Tooltips are a hard US-04 requirement; Dialog unifies 3 hand-rolled modals; S-11 reuses them | Plan |
| Toasts/banners | Restyle `?ok=`/`?error=` banners in place (accessible); no Toast wiring | Keeps S-10 presentation-only; toasts + async are S-11 | Plan |
| Nav model | Top bar with grouped Settings dropdown + mobile menu | Standard B2B pattern; scales the page count; one `<nav>` landmark | Plan |
| Home route | Work dashboard at `/`; delete splash; `/dashboard` redirects to `/` | Exactly the US-02 acceptance list; one landing, no dead splash | Plan |
| Recent reports source | One new read-only cross-project query (limit ~5) | Delivers US-02 "recent reports with links" without reopening the parked feed | Plan |
| A11y verification | Manual WCAG-AA checklist + existing `eslint-plugin-jsx-a11y` | No new test tooling; jsx-a11y already installed as a cheap assist | Plan |
| Responsive | Mobile-first all pages; repeater tables special-cased | ≥360px NFR; the report repeaters are the only genuinely hard case | Plan |
| Report-page guardrail | Presentation-only + explicit no-leak / empty-section re-check | A markup rewrite could accidentally surface a hidden field | Plan |
| Header placement | New `AppShell.astro` (not `Layout.astro`) | Login uses `Layout` and must not show the app header | Plan (research) |

## Scope

**In scope:** shared header/nav + `AppShell` layout; work dashboard at `/` + recent-reports query; light token retheme (via `frontend-design`); Radix primitives (Tooltip/Dialog/Card/Input/EmptyState/Skeleton) + accessible banner; restyle all 10 pages; disabled-Send tooltip fix (US-04); unify 3 confirm modals onto Dialog; full responsive (≥360px); WCAG-AA manual pass; delete dead starter `Welcome.astro`/`Topbar.astro`.

**Out of scope:** async/optimistic UI + spinners + toasts (S-11); PDF-in-browser (S-12, done); email templates (S-13); dark-mode toggle; new automated a11y tooling; any domain-logic/schema/API/PDF/send change; new pages or features beyond the dashboard.

## Architecture / Approach

Foundations → surface. **Phase 1** re-values `global.css` tokens (driven by a `frontend-design` pass) and removes `bg-cosmic` so the app flips to a light baseline. **Phase 2** builds the Radix primitives + a new `AppShell.astro`/`Header.astro` shell and migrates the 3 hand-rolled modals to `Dialog`. **Phase 3** builds the dashboard at `/`, adds the recent-reports query, and deletes the dead splash. **Phase 4** restyles every remaining page onto the shell + tokens + primitives and fixes the disabled-Send tooltips. **Phase 5** is the responsive + WCAG-AA hardening pass across the now-stable surface, special-casing the report repeater tables.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Theme foundation | Light token palette; `bg-cosmic` removed | App looks "unstyled light" until P3–4 polish (expected); missed `bg-cosmic` ref breaks a page |
| 2. Primitives + shell | Tooltip/Dialog/Card/Input/EmptyState/Skeleton + shared header; modals unified | Tooltip/Dialog/mobile-menu a11y correctness; new deps need approval |
| 3. Dashboard | Work dashboard at `/`; recent-reports query; dead files deleted | Cross-project read must stay read-only (not reopen the parked feed) |
| 4. Page restyle | All pages on the shell + light theme; US-04 tooltip fix | Accidentally changing which report fields render (no-leak) |
| 5. Responsive + a11y | ≥360px everywhere; WCAG-AA checklist signed off | Repeater tables on phones; a11y bolted-on-last (mitigated: primitives built accessible in P2) |

**Prerequisites:** S-09 shipped (it is). Install `@radix-ui/react-tooltip` + `@radix-ui/react-dialog` (needs approval). A `frontend-design` pass at the start of Phase 1.
**Estimated effort:** ~4–6 sessions across 5 phases (after-hours); the largest surface in either round.

## Open Risks & Assumptions

- **A11y is verified manually**, not by an automated gate — relies on a disciplined checklist + `eslint-plugin-jsx-a11y`. Acceptable per the user's choice; the risk is silent regression later.
- **Disabled-button tooltips**: a disabled `<button>` isn't focusable, so the tooltip trigger needs a focusable wrapper/affordance to stay keyboard-reachable (US-04).
- **Token re-value, not rename**: every page must shed its inline cosmic/glass overrides or the light tokens won't show through; grep-clean of `bg-cosmic` is the Phase-1 gate.
- Assumes the `frontend-design` palette maps cleanly onto the existing token names (no new token names introduced).

## Success Criteria (Summary)

- The full flow (sign in → dashboard → project → report → save → view PDF → send) works through a redesigned, light-themed, consistently-navigated interface with no broken layouts.
- `/` is a usable work dashboard; disabled actions explain themselves in tooltips; lists have empty states.
- The app is usable at phone/tablet/desktop widths and passes a WCAG-AA manual checklist — with no regression to the no-leak rule, empty-section PDF hiding, the shared-login gate, or the re-send safeguards.
