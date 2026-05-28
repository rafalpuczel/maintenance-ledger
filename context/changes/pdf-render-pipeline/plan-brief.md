# PDF Render Pipeline (FormePDF-on-workerd Spike) — Plan Brief

> Full plan: `context/changes/pdf-render-pipeline/plan.md`

## What & Why

A throwaway **go/no-go spike** proving FormePDF (`@formepdf/core` + `@formepdf/react` v0.10.2) can render the fixed agency-branded maintenance-report PDF on the **deployed Cloudflare Workers runtime**, with an embedded custom font and empty-section hiding. This is the roadmap's **F-02 foundation** — risk-insurance that retires R1 (the pre-mortem's project-killer: no PDF library works on workerd) and informs R3 (free-tier vs. Workers Paid). It is not user-visible work; the durable output is a **verdict** + a reusable **workerd render recipe** for S-08.

## Starting Point

FormePDF is already a dependency but never imported; the app already runs on Workers (`maintenance-ledger.rpuczel.workers.dev`, `nodejs_compat`, observability on, Astro 5 `server` mode, React 19). No PDF code, no domain types, no data layer yet. Reading the installed package source revealed FormePDF ships an explicit `worker` export condition with a **documented, non-obvious WASM-init contract** — the exact thing the spike must validate.

## Desired End State

A recorded, defensible verdict — **PASS-free / PASS-paid / FAIL** — backed by a p95 measurement taken against the live Worker rendering the full FR-014 section set. The spike route + template are removed afterward; the verdict, the p95 numbers, and the reproducible init/bundle recipe survive in the change folder and a CLAUDE.md/lessons note that S-08 consumes.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Spike goal | Narrowest go/no-go, throwaway code | F-02 is risk-insurance; smallest scope to a trustworthy answer | Plan |
| Template fidelity | Full FR-014 section set | A real-shaped report (30 plugins/5 themes) makes the perf number trustworthy | Plan |
| Font strategy | One embedded custom TrueType font | Directly retires R1's typography fear (pdf-lib's Helvetica-only killer) | Plan |
| Perf rigor | p95 over N≥30 runs on the live Worker | NFR is stated in p95; edge CPU ≠ local CPU per infra.md | Plan |
| Endpoint | Auth-gated `_spike`-namespaced route | Respects the FR-001 all-routes-authed guardrail; marked throwaway | Plan |
| Cleanup | Remove route, keep findings | Leave prod clean; the decision + recipe is the durable output | Plan |
| Verdict for "works but CPU > 10 ms" | **Two-tier** (PASS-free / PASS-paid / FAIL) | Separates "does it work" (R1) from "which plan" (R3); a CPU overage ≠ library failure | Plan |

## Scope

**In scope:** workerd WASM init + bundle proof; full branded template (logo header, footer page numbers, paginated plugin/theme tables, all FR-014 sections); one embedded custom font; empty-section hiding; deploy to live Worker behind auth; p95 wall-clock + CPU measurement; two-tier verdict; cleanup + findings capture.

**Out of scope:** Supabase / real data; real brand/logo storage (S-02); "PDF on save" + download UX + report form (S-08); keeping the template; re-opening the library choice unless FAIL; charts/QR/barcode/forms; multi-weight fonts; CI test gating.

## Architecture / Approach

One throwaway render helper (`src/lib/pdf/render-spike.ts`) encapsulates the load-bearing workerd contract: `import wasm from '@formepdf/core/pkg-web/forme_bg.wasm'` → `await init(wasm)` → `Font.register(brandFontBytes)` → `renderDocument(<SpikeReportDoc/>)` → `Uint8Array`. A throwaway auth-gated GET route (`src/pages/api/_spike/pdf.ts`) returns it as `application/pdf`. A local Node bench script fires N authed requests at the deployed endpoint while `wrangler tail` captures per-request CPU. Verdict is written from the measured numbers.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. WASM smoke proof | Any valid PDF out of local workerd via the init contract | `.wasm` import doesn't bundle as a `WebAssembly.Module` |
| 2. Branded template + font | Full FR-014 PDF, custom font, empty-section hiding (local) | Custom-font embedding fails on edge / template gaps |
| 3. Auth-gated endpoint + deploy | Same PDF on the live Worker, behind middleware | Edge runtime diverges from local; bundle > 3 MB gzipped |
| 4. p95 + two-tier verdict | Latency distribution + CPU + recorded verdict | CPU measurement unreliable / inconclusive |
| 5. Cleanup + findings | Clean prod tree; verdict + recipe for S-08 | Dead authenticated route left on prod |

**Prerequisites:** None — runs against the live Worker with a hardcoded payload, needs no domain data (parallel with F-01 and the S-0x slices). Requires a valid session cookie to benchmark and one permissively-licensed font file.
**Estimated effort:** ~1–2 after-hours sessions across 5 phases; Phase 1 is the make-or-break gate.

## Open Risks & Assumptions

- **Most likely result is PASS-paid, not PASS-free** — a 30-row WASM render + font subsetting will probably exceed the 10 ms free-tier CPU while staying well under 5 s wall-clock. The two-tier verdict is designed for exactly this; the $5/mo Paid tier is the pre-decided R3 action, not a failure.
- **Assumes `@astrojs/cloudflare` v13 bundles a `.wasm` import as a `WebAssembly.Module`** (the contract `worker.d.ts` is written against). Verified empirically in Phase 1; fallback is the alternate `pkg/forme_bg.wasm` specifier or an adapter/Vite wasm-binding tweak.
- **A FAIL** (can't hold 5 s even on Paid, or won't render on workerd) reopens the R1 fallbacks — `pdf-lib` (ugly) or Cloudflare Browser Rendering (+overhead). Discovering that now, in week-1 effort, is the whole point.

## Success Criteria (Summary)

- The branded full-section PDF renders faithfully on the **live** Worker (logo, custom font, paginated tables, empty sections omitted) — answers R1.
- A p95 wall-clock + CPU measurement over N≥30 edge runs is recorded, and `verdict.md` names exactly one of PASS-free / PASS-paid / FAIL with the numbers that justify it — answers R3 for S-08.
- The live Worker is left clean (spike route 404s) and the workerd recipe is captured where S-08 will find it.
