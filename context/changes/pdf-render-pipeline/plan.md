# PDF Render Pipeline (FormePDF-on-workerd Go/No-Go Spike) Implementation Plan

## Overview

This is the **F-02 foundation spike** from the roadmap: prove that **FormePDF** (`@formepdf/react` + `@formepdf/core`, v0.10.2) can render the fixed agency-branded maintenance-report template to a `Uint8Array` on the **deployed Cloudflare Workers runtime (workerd)**, with one embedded custom font and empty-section hiding, and measure it against the 5 s wall-clock NFR and the 10 ms free-tier CPU budget.

It is **risk-insurance, not user-visible work.** It exists to retire Risk **R1** (the infrastructure pre-mortem's project-killer: `@react-pdf/renderer` blocked on workerd, `@pdf-lib/fontkit` won't bundle, free-tier CPU tight) and to inform Risk **R3** (free-tier vs. Workers Paid). The code is throwaway; the durable output is the **verdict** + the **workerd render recipe** that S-08 (`branded-pdf-on-save`) will consume.

## Current State Analysis

What exists today (auto-researched 2026-05-28, grounded in the actual installed package source):

- **FormePDF is already a dependency** — `@formepdf/core@^0.10.2` + `@formepdf/react@^0.10.2` in `package.json`. Never imported anywhere in `src/` yet (blank slate, no PDF code to conflict with).
- **The project already runs on Workers** — live at `maintenance-ledger.rpuczel.workers.dev`. `wrangler.jsonc` has `compatibility_flags: ["nodejs_compat"]`, `assets` binding `ASSETS` → `./dist`, `observability.enabled: true`, and a `SESSION` KV namespace. `astro.config.mjs`: `output: "server"`, `@astrojs/cloudflare` v13.5 adapter, `@astrojs/react` v5 wired, React 19, Tailwind v4 via Vite plugin. `tsconfig.json`: `jsx: "react-jsx"`, `jsxImportSource: "react"`, `@/*` → `./src/*`.
- **The FormePDF Workers contract is non-obvious and documented** in `node_modules/@formepdf/core/dist/worker.d.ts`. The `@formepdf/core` package exposes a `worker` / `edge-light` export condition that resolves to `./dist/worker.js`. Under that condition the WASM **does not auto-init at module load** (Wrangler's WASM-as-ESM contract returns `{ default: WebAssembly.Module }`, so the bundler glue's top-level start would throw). The caller must import the wasm module themselves and call `init()` once before any render. This is the single most likely failure point of the spike, and it's exactly what the pre-mortem warned about.
- **The pre-mortem's typography killer is solved by the library itself.** `@formepdf/react` exposes `Font.register({ family, src, fontWeight, fontStyle })` (`dist/font.d.ts`) and the Rust core handles TrueType embedding + subsetting natively. `Image` supports PNG/JPEG/WebP via data URI or path. `Table`/`Row`/`Cell` do automatic header repetition across page breaks; `Fixed position="header|footer"` supports `{{pageNumber}}`/`{{totalPages}}`. So branded typography + logo + paginated tables are first-class — no Helvetica-only compromise (pdf-lib) and no +1.5 s overhead (Browser Rendering).
- **FormePDF is itself tested on workerd** — its own `package.json` lists `@cloudflare/vitest-pool-workers` as a devDependency and a `test:workers` script. Strong upstream signal the worker path is real, not aspirational.
- **No domain data layer exists** — no schema, migrations, generated types, or `Report`/`Brand` interfaces. The spike defines a throwaway inline shape and a hardcoded representative payload. It does **not** touch Supabase.
- **Established server-module pattern**: `src/lib/auth/*` (Web Crypto, workerd-safe), API routes use `export const POST/GET: APIRoute = async (context) => …`, KV accessed via `import { env } from 'cloudflare:workers'`. All routes are behind session middleware (`src/middleware.ts`) except the login page (FR-001 guardrail).
- **No fonts in the repo** — `public/` has only `favicon.png`, `template.png`, `.assetsignore`. The spike must add exactly one TrueType/WOFF font file for the custom-font proof.

## Desired End State

A recorded, defensible **go/no-go verdict** on FormePDF-on-workerd, backed by a p95 measurement taken against the **live Worker** rendering the **full FR-014 section set** with an **embedded custom font** and **empty-section hiding**. The spike endpoint and template are removed afterward; the verdict + the reproducible workerd init/bundle recipe + the p95 numbers survive in the change folder and in a CLAUDE.md/lessons note that S-08 reads.

Verifiable by: a written verdict file naming one of three outcomes (PASS-free / PASS-paid / FAIL), with p50/p95 wall-clock and observed CPU per render; a clean `src/` tree (no `_spike` route remaining); and a confirmed clean `wrangler deploy` of the post-cleanup state.

### Key Discoveries:

- **Workerd init recipe** (`node_modules/@formepdf/core/dist/worker.d.ts:1-39`): `import { init, renderDocument } from '@formepdf/core'` (resolves to the `worker` condition) + `import wasm from '@formepdf/core/pkg-web/forme_bg.wasm'`, then `await init(wasm)` once per request before `renderDocument(<Doc/>)`. `init()` is idempotent.
- **Empty-section hiding is trivial in JSX** — conditionally render each section (`{rows.length > 0 && <Section/>}`), so an unfilled section emits no node at all; satisfies the FR-017 guardrail "no headers, no 'none' placeholders" by construction.
- **`renderDocument(element, options?)` → `Promise<Uint8Array>`** (`dist/index.d.ts:96`). Return it directly as a `Response` body with `content-type: application/pdf`.
- **Custom font API** (`dist/font.d.ts`): `Font.register({ family: 'Brand', src: <Uint8Array | string>, fontWeight, fontStyle })`. `src` accepts raw bytes — bundle the font and pass its bytes.
- **CPU ≠ wall-clock.** The 10 ms free-tier limit is *CPU time*; the 5 s NFR is *wall-clock*. They are measured separately. A WASM render of a 30-row table realistically exceeds 10 ms CPU while staying far under 5 s wall-clock — hence the two-tier verdict.

### Phase 1 discoveries (empirical — feed these to S-08):

- **`tsconfig` needs `customConditions: ["worker"]`.** Without it, `tsc`/`astro check` resolves `@formepdf/core` against the default export condition (`dist/index.d.ts`, no `init`) and errors `has no exported member 'init'`. Adding `customConditions: ["worker"]` makes type resolution match the runtime (`worker`) condition. (`tsconfig.json`)
- **`.wasm` imports need an ambient module declaration** — `src/wasm.d.ts`: `declare module "*.wasm" { const mod: WebAssembly.Module; export default mod; }`. Otherwise `ts(2307) Cannot find module '…forme_bg.wasm'`.
- **`@astrojs/cloudflare` v13 INLINES the wasm into the JS bundle**, not as a separate `.wasm` asset. The adapter-generated `dist/server/wrangler.json` has `no_bundle: true` and only an `ESModule` rule (no `CompiledWasm` rule); the worker chunk instantiates via `WebAssembly.compile`/`instantiate` from inlined bytes. Net: no `CompiledWasm` binding config is needed — the documented `import wasm from '@formepdf/core/pkg-web/forme_bg.wasm'` "just works" through Vite. The FormePDF worker chunk lands ~810 KB raw.
- **`renderDocument` returns `Uint8Array<ArrayBufferLike>`** which TS won't accept directly as a `Response` BodyInit under the strict lib types — pass `pdf.buffer as ArrayBuffer`.
- **Astro excludes `_`-prefixed `pages/` paths from routing** — the original `/api/_spike/pdf` 404'd. Route renamed to `/api/spike-pdf`. (Relevant only to the spike's naming, not to S-08's real route.)
- **Astro's CSRF check rejects cross-site POSTs** — programmatic login (curl/bench) must send a matching `Origin` header or the login POST returns `403 Cross-site POST form submissions are forbidden`. The Phase 4 bench script must set `Origin`.
- **Local smoke result (2026-05-28):** `GET /api/spike-pdf` on `astro dev` (real workerd) → HTTP 200, `application/pdf`, valid 1-page PDF (`%PDF-1.7`, `%%EOF`). `init(wasm)` + `renderDocument` succeed on workerd. **The R1 "does FormePDF run on workerd at all" question is answered YES at the smoke level.**

### Phase 2 discoveries (empirical — feed these to S-08):

- **`Page` has NO `style` prop.** `PageProps` (size, margin, backgroundImage, …) does not include `style` — page-level defaults (fontFamily, fontSize, color, lineHeight) go on `Document.style`. Putting `style` on `<Page>` errors `Property 'style' does not exist on type 'PageProps'`. (`node_modules/@formepdf/react/dist/types.d.ts:214`)
- **woff2 embeds fine as TrueType.** Registering an Inter **woff2** via `Document.fonts={[{ family, src: <Uint8Array> }]}` produced an embedded `/FontFile2` + `/Subtype /Type0` (composite TrueType) in the output PDF — FormePDF's Rust core decompresses woff/woff2, no need for a raw `.ttf`. Custom-font branding on workerd is **proven**.
- **Astro disallows `.tsx` API routes in `src/pages/`** ("Unsupported file type … Only Astro files can be used as pages"). The route must be `.ts`; build the document element via a non-JSX factory (`createElement`) exported from a `.tsx` module under `src/lib/`. (Spike uses `spikeReportElement()` in `spike-template.tsx`.)
- **Font bytes inline cleanly via base64 + `atob`** — a generated `.ts` exporting `Uint8Array` (decoded with workerd-safe `atob`) avoids any font-asset-loading mechanism on the edge. The latin Inter subset is ~17 KB (~23 KB base64).
- **Empty-section hiding works by construction** — `{rows.length > 0 ? <Section/> : null}` with `licenses: []` omits the License Renewals section entirely. (Both `&&`-with-`false` and ternary-with-`null` type-check against `ReactNode`; the earlier suspicion that `false` children were the blocker was wrong — it was the `Page` `style` prop.)
- **Do NOT wrap each section in a `<View>`.** A `View` is a keep-together flex block: when a long table flows onto page 2, a trailing section wrapped in its own `<View>` can't be split and gets pushed wholesale to the next page, leaving a large gap (cost a real page in testing — 3 pages instead of 2). Let sections flow as **direct Page children** (bare `<Text>`/`<View style={kv}>` + fragments `<>…</>` for title+table groups). Reserve wrapper `<View>`s for content that genuinely must stay together.
- **Full-template result (2026-05-28):** 30 plugin rows → **2-page PDF, 26.8 KB**, header logo + footer page numbers, paginated plugins table with repeating header row, embedded Inter, empty License section omitted. Renders on local workerd. **R1 typography killer retired.**

## What We're NOT Doing

- **No real data layer / Supabase** — the payload is hardcoded. (That's S-06.)
- **No real brand storage** — the logo is a bundled/inline sample asset, not from Cloudflare Images or Supabase. (That's S-02; logo source is still an open roadmap question.)
- **No "PDF on save" wiring, no download UX, no report form** — the spike is a single render endpoint, nothing else. (That's S-08.)
- **No keeping the template/endpoint** — explicitly throwaway per the go/no-go decision; S-08 re-implements the production template.
- **No library bake-off** — FormePDF was already chosen (CLAUDE.md, infra R1, 2026-05-23). This spike *tests* that choice; it does not re-open `pdf-lib` / Browser Rendering unless the spike returns FAIL.
- **No multi-weight font matrix, no charts/QR/barcode/forms** — one font weight; only the components the real report needs (Text, View, Image, Table/Row/Cell, Fixed).
- **No CI gating of PDF rendering** — testing strategy / quality gates are a Module 3 / later concern.

## Implementation Approach

Sequence is ordered by risk-retired-per-unit-effort: prove the riskiest, cheapest-to-test unknown first (does the WASM even bundle + init on workerd?), then invest in the template, then move to the edge, then measure, then clean up. Each phase gates the next — if Phase 1 can't get a trivial PDF out of local workerd, the later phases are moot and the verdict is an early FAIL (which is itself a valuable, cheap result under a fixed deadline).

Measurement happens against the **deployed** Worker, not `astro dev` — the infra doc explicitly warns the failure mode is "timeouts that don't reproduce in `astro dev`," so an edge measurement is the only credible basis for the verdict.

## Critical Implementation Details

- **WASM-as-ESM init ordering** — `init(wasm)` MUST complete before the first `renderDocument`/`renderPdf` call, and the `wasm` value must be the imported `WebAssembly.Module` from `@formepdf/core/pkg-web/forme_bg.wasm` (Wrangler/esbuild hand you the module object, which is exactly what `init` accepts). Calling `renderDocument` without a prior `await init(wasm)` throws. `init` is idempotent, so calling it at the top of every request handler is correct and cheap.
- **Vite/adapter WASM bundling is the unknown to verify first** — `@astrojs/cloudflare` v13 is expected to treat a `.wasm` import as a `WebAssembly.Module` (the same contract `worker.d.ts` is written against), but this must be confirmed empirically in Phase 1, not assumed. If the default import doesn't yield a module, the fallback is the documented alternate (`@formepdf/core/pkg/forme_bg.wasm`) or a Vite `assetsInclude` / adapter wasm-binding adjustment — confirm before building the template.
- **Bundle-size budget** — free-tier Workers cap at 3 MB gzipped; current bundle is ~391 KB gzipped. The FormePDF WASM + one font will grow this; confirm the deployed bundle stays under 3 MB gzipped (it will, but verify in Phase 3 since a bundle-limit failure is a different failure class than a CPU failure).
- **CPU measurement method** — wall-clock is measured client-side around the HTTP request; CPU is read from `wrangler tail` (per-request CPU time line) and/or the observability dashboard. The two numbers answer two different gates (5 s wall-clock NFR vs. 10 ms free-tier CPU), so both must be captured per run.

## Phase 1: WASM-on-workerd Smoke Proof

### Overview

Prove the single riskiest unknown cheaply: that the documented FormePDF worker-condition init contract works and that `@astrojs/cloudflare`/Vite bundles the `.wasm` import as a usable `WebAssembly.Module`. Goal is *any* valid PDF out of local workerd — no branding, no real template.

### Changes Required:

#### 1. Minimal render helper

**File**: `src/lib/pdf/render-spike.ts` (new, throwaway)

**Intent**: Encapsulate the workerd init contract in one place so the endpoint just calls a single function. Import `init` + `renderDocument` from `@formepdf/core` (worker condition) and the wasm module from `@formepdf/core/pkg-web/forme_bg.wasm`; export an async function that calls `await init(wasm)` then `renderDocument(element)` and returns the `Uint8Array`.

**Contract**: `renderSpikePdf(element: ReactElement): Promise<Uint8Array>`. The init-before-render ordering and the exact wasm import specifier are the load-bearing part — they follow `node_modules/@formepdf/core/dist/worker.d.ts:1-39` verbatim. Snippet, because the import specifier + init ordering is the precise thing being de-risked:

```ts
import { init, renderDocument } from "@formepdf/core";
import wasm from "@formepdf/core/pkg-web/forme_bg.wasm";

export async function renderSpikePdf(element: import("react").ReactElement): Promise<Uint8Array> {
  await init(wasm); // idempotent; must precede renderDocument under the worker condition
  return renderDocument(element);
}
```

#### 2. Throwaway smoke endpoint

**File**: `src/pages/api/spike-pdf.ts` (new, throwaway)

**Intent**: A GET route that renders a one-line `<Document><Page><Text>` doc via the helper and returns it as `application/pdf`. This is the smoke target for local workerd; it grows into the full-template endpoint in Phase 3.

**Contract**: `export const GET: APIRoute` returning `new Response(pdfBytes, { headers: { "content-type": "application/pdf" } })`. Follows the existing `APIRoute` pattern in `src/pages/api/auth/*`.

#### 3. TypeScript ambient declaration for `.wasm` imports (only if needed)

**File**: `src/env.d.ts` (edit) — or a new `src/wasm.d.ts`

**Intent**: If `tsc`/editor flags the `.wasm` import as untyped, add a module declaration so `import wasm from '*.wasm'` types as `WebAssembly.Module`. Skip entirely if the adapter already provides the type.

**Contract**: `declare module "*.wasm" { const mod: WebAssembly.Module; export default mod; }`

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check` (or `npm run build`'s type step)
- Build succeeds with the wasm import bundled: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification:

- `npm run dev` (real workerd via Vite) serves `GET /api/spike-pdf` and returns a non-empty `application/pdf` body that opens as a valid one-page PDF in a viewer
- No "init"/"WebAssembly" runtime error in the dev console; confirms the bundle delivers a usable `WebAssembly.Module` and `init(wasm)` succeeds

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation that the smoke PDF renders on local workerd before building the full template. If the wasm import does NOT bundle as a module, resolve the bundling approach (alternate specifier / adapter config) before proceeding — do not build the template against a broken import.

---

## Phase 2: Branded Full-Section Template + Embedded Font

### Overview

Build the full FR-014 section template with one embedded custom font and demonstrate empty-section hiding, fed by a hardcoded representative payload (~30 plugin rows, 5 theme rows). This is what makes the eventual perf number trustworthy — it stresses tables, font embedding, image, and page breaks together.

### Changes Required:

#### 1. Throwaway report/brand shape + sample payload

**File**: `src/lib/pdf/spike-fixtures.ts` (new, throwaway)

**Intent**: Define a minimal inline `Report` + `Brand` type matching FR-014's fixed sections, and export a representative sample: ~30 plugin rows, 5 theme rows, WP core + PHP values, integrity checks, fixes, license renewals, notes-to-client, plus brand colors. Include at least one section left empty (e.g. license renewals = `[]`) to exercise empty-section hiding.

**Contract**: `export interface Brand { name: string; logoSrc: string; primary: string; … }`, `export interface Report { … per FR-014 sections … }`, `export const SAMPLE_REPORT: Report`, `export const SAMPLE_BRAND: Brand`. No persistence, no Supabase — plain literals.

#### 2. Bundled custom font

**File**: `src/assets/fonts/brand.ttf` (new) + reference in the template

**Intent**: Add exactly one TrueType/WOFF font file (e.g. a single Inter weight) to serve as the brand typeface, imported as bytes and registered via `Font.register()`. Proves custom-font embedding on workerd — the exact thing the pre-mortem said would kill pdf-lib.

**Contract**: Font file imported as a `Uint8Array`/`ArrayBuffer` and passed to `Font.register({ family: "Brand", src: <bytes> })` once before render (alongside `init`). Sourced from an OFL/permissively-licensed family.

#### 3. Branded report template

**File**: `src/lib/pdf/spike-template.tsx` (new, throwaway)

**Intent**: A function component taking `(report, brand)` and returning the full FormePDF JSX tree — `Document` (metadata + default style using the registered font), a `Fixed` branded header with the logo `Image` + a `Fixed` footer with page numbers, then each FR-014 section conditionally rendered (empty → omitted). Plugins and themes render as `Table` with a header `Row` (auto-repeating across pages). Use brand colors from `brand`.

**Contract**: `export function SpikeReportDoc({ report, brand }: { report: Report; brand: Brand }): ReactElement`. Each section guarded by a truthiness/length check so empty sections emit nothing. Uses only Text/View/Image/Table/Row/Cell/Fixed. No snippet — this is straightforward JSX composition following the component docs in `node_modules/@formepdf/react/dist/components.d.ts`.

#### 4. Register font in the render helper

**File**: `src/lib/pdf/render-spike.ts` (edit from Phase 1)

**Intent**: Call `Font.register(...)` with the bundled font bytes once, guarded so it only registers on first call (mirror the idempotent `init` pattern), before `renderDocument`.

**Contract**: Font registration precedes `renderDocument`; registering the same family twice is avoided with a module-level `let registered = false` guard.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Build succeeds (font asset + template bundled): `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification:

- `GET /api/spike-pdf` (now rendering the full template) on `npm run dev` returns a multi-section branded PDF: logo visible in the header, page numbers in the footer, plugins/themes as tables, the custom font visibly applied (not a fallback serif)
- The intentionally-empty section (e.g. license renewals) does NOT appear — no header, no "none" placeholder
- A 30-row plugins table paginates across pages with the header row repeated on the continuation page
- Custom-font glyphs render correctly (spot-check a distinctive glyph), confirming TrueType embedding on workerd

**Implementation Note**: Pause for manual confirmation that the branded full-section PDF renders correctly on local workerd — including the custom font and empty-section hiding — before deploying to the edge.

---

## Phase 3: Auth-Gated Spike Endpoint + Deploy

### Overview

Confirm the full template renders on the **deployed** Worker (not just local workerd), behind the existing session middleware, and that the bundle stays under the free-tier size limit. This is the prerequisite for a credible edge measurement.

### Changes Required:

#### 1. Confirm endpoint sits behind auth middleware

**File**: `src/middleware.ts` (verify, likely no edit) + `src/pages/api/spike-pdf.ts` (verify)

**Intent**: Ensure `/api/spike-pdf` is covered by the existing all-routes-authed gate (FR-001 guardrail) — i.e. an unauthenticated request redirects/401s, an authenticated one renders. The `spike-` prefix marks it throwaway. (Confirmed in Phase 1: `src/middleware.ts` gates by an explicit `PUBLIC_PATHS`/`PUBLIC_PREFIXES` allowlist; `spike-pdf` is not listed, so it is gated by default — verified locally: unauth → 302 `/login`, authed → 200.)

**Contract**: Unauthenticated `GET /api/spike-pdf` → redirect to `/login` (or 401); authenticated → 200 `application/pdf`. No new auth code — reuses `verifySession` path already in middleware.

#### 2. Deploy to the live Worker

**File**: — (operational; `wrangler deploy` or push-to-`master` Workers Builds)

**Intent**: Get the spike onto `maintenance-ledger.rpuczel.workers.dev` so the measurement reflects real edge CPU. Prefer a manual `wrangler deploy` for tight iteration over waiting on Workers Builds.

**Contract**: A successful deploy whose version is live; `GET /api/spike-pdf` with a valid session cookie returns the branded PDF from the edge.

### Success Criteria:

#### Automated Verification:

- Production build succeeds: `npm run build`
- Deployed bundle is under the 3 MB gzipped free-tier limit (check `wrangler deploy` output / `wrangler deployments` size line)
- Deploy completes: `wrangler deploy` exits 0 and reports a live version

#### Manual Verification:

- Authenticated `GET /api/spike-pdf` against the live `*.workers.dev` URL returns the same branded multi-section PDF seen locally
- Unauthenticated request to the same URL is rejected by middleware (redirect/401) — confirms the FR-001 guardrail holds for the spike route
- `wrangler tail` shows the request and emits a per-request CPU-time line (confirms the measurement instrument works before the formal run)

**Implementation Note**: This phase deploys to the live Worker. Per the deploy policy, a manual `wrangler deploy` to this MVP-stage Worker is acceptable for the spike; confirm with the human before deploying if there is any concurrent production concern. Pause for confirmation that the edge render matches local before running the formal measurement.

---

## Phase 4: p95 Measurement + Two-Tier Verdict

### Overview

Take the defensible measurement: ~30–50 authenticated renders against the deployed endpoint, capture p50/p95 wall-clock and observed CPU, and classify the result with the agreed two-tier verdict.

### Changes Required:

#### 1. Benchmark script

**File**: `scripts/spike-bench.mjs` (new, throwaway) — local Node, not deployed

**Intent**: Fire N sequential (and optionally a small concurrent burst) authenticated GETs at the live endpoint, timing each round-trip, and print p50/p95/min/max wall-clock. Reads a session cookie + target URL from env/args so no credentials are hardcoded.

**Contract**: `node scripts/spike-bench.mjs --url <endpoint> --n 50` with `SPIKE_COOKIE` in env → prints latency distribution. Pairs with `wrangler tail` running in another terminal to capture the CPU-time lines for the same window.

#### 2. Verdict record

**File**: `context/changes/pdf-render-pipeline/verdict.md` (new — durable output)

**Intent**: Record the two-tier verdict and the evidence. Three outcomes: **PASS-free** (renders correctly AND CPU ≤ 10 ms AND wall-clock p95 < 5 s), **PASS-paid** (renders correctly AND wall-clock p95 < 5 s but CPU > 10 ms → needs Workers Paid $5/mo), **FAIL** (cannot hold wall-clock p95 < 5 s even on Paid, OR does not render correctly on workerd). The measured numbers decide which line — no judgment call.

**Contract**: A short doc with: verdict line; p50/p95/min/max wall-clock over N runs; observed per-request CPU (range/typical); bundle size; and the concrete R3 consequence (stay free / upgrade to Paid / pivot library). Include the exact N and method for reproducibility.

### Success Criteria:

#### Automated Verification:

- Benchmark script runs and emits a latency distribution over N≥30 runs: `node scripts/spike-bench.mjs --url <endpoint> --n 50`
- `verdict.md` exists and names exactly one of {PASS-free, PASS-paid, FAIL} with the supporting numbers filled in (no placeholders)

#### Manual Verification:

- `wrangler tail` CPU-time lines were captured for the measured window and the typical/worst CPU is recorded in `verdict.md`
- p95 wall-clock is compared against the 5 s NFR and CPU against the 10 ms free-tier line, and the verdict line follows the recorded numbers (cross-checked, not asserted)
- The verdict's R3 consequence is explicit and actionable for S-08

**Implementation Note**: Pause for human review of the verdict and numbers — this is the decision the whole spike exists to produce, and it gates the cost/plan choice S-08 inherits.

---

## Phase 5: Cleanup + Findings Capture

### Overview

Leave the live Worker clean (no dead authenticated route) and make the durable findings discoverable for S-08: the verdict, the p95 numbers, and the reproducible workerd init/bundle recipe.

### Changes Required:

#### 1. Remove the spike code

**Files**: delete `src/pages/api/spike-pdf.ts`, `src/lib/pdf/render-spike.ts`, `src/lib/pdf/spike-template.tsx`, `src/lib/pdf/spike-fixtures.ts`, `scripts/spike-bench.mjs`, and `src/assets/fonts/brand.ttf` (and `src/wasm.d.ts` if added and unused elsewhere)

**Intent**: Honor the throwaway decision — the template JSX is discarded; S-08 re-implements the production template. Remove the authenticated `spike-pdf` route from prod, plus the `customConditions`/`wasm.d.ts` tsconfig additions if S-08 will re-add them on its own terms.

**Contract**: `src/` contains no `spike-pdf` route and no `pdf/spike-*` files after this phase; `git status` shows only deletions + the durable docs. (Note: the `customConditions: ["worker"]` tsconfig change and `src/wasm.d.ts` are load-bearing for ANY FormePDF-on-workerd code — decide in Phase 5 whether to keep them for S-08 or revert; see Phase 1 discoveries.)

#### 2. Capture the workerd recipe for S-08

**File**: `CLAUDE.md` (edit — append to the existing FormePDF rule) and/or `context/foundation/lessons.md` (new, via `/10x-lesson` if the finding is a recurring rule)

**Intent**: Record the load-bearing init/bundle recipe so S-08 doesn't rediscover it: the `worker`-condition import, the `pkg-web/forme_bg.wasm` specifier, `await init(wasm)` before render, `Font.register()` for custom fonts, and the measured CPU/plan consequence. Keep it tight.

**Contract**: One concise addition to the CLAUDE.md FormePDF block naming the init sequence + wasm specifier + the verdict's plan consequence. A full recurring-rule writeup goes to `lessons.md` only if it rises to that bar (triage decision, not automatic).

#### 3. Redeploy the clean state

**File**: — (operational; `wrangler deploy` or push-to-`master`)

**Intent**: Ensure the live Worker no longer serves the spike route.

**Contract**: Post-cleanup `wrangler deploy` succeeds; `GET /api/spike-pdf` on the live URL now 404s.

#### 4. Close the change

**File**: `context/changes/pdf-render-pipeline/change.md` (edit)

**Intent**: Set `status` to reflect completion and bump `updated`. (Archiving via `/10x-archive` is a separate explicit step, not done here.)

**Contract**: Frontmatter `status` advanced, `updated: <today>`.

### Success Criteria:

#### Automated Verification:

- No spike files remain: `git status` shows the `spike-pdf` route, `src/lib/pdf/spike-*`, the bench script, and the font asset deleted
- Build still succeeds after removal: `npm run build`
- Lint passes: `npm run lint`
- Clean redeploy succeeds: `wrangler deploy` exits 0

#### Manual Verification:

- `GET /api/spike-pdf` on the live `*.workers.dev` URL returns 404 (route gone from prod)
- `verdict.md` + the CLAUDE.md/lessons note capture the verdict, p95 numbers, and the workerd recipe such that S-08 can act on them without re-running the spike
- `change.md` status reflects the spike is complete

---

## Testing Strategy

This is a throwaway spike, so "testing" is verification of the spike's claims, not a durable test suite.

### Unit Tests:

- None added. (FormePDF is upstream-tested; the spike's value is the edge measurement, not unit coverage. Durable PDF tests belong to S-08 under the Module 3 testing strategy.)

### Integration Tests:

- The deployed `GET /api/spike-pdf` IS the integration test: it exercises the real request path on real workerd (middleware → init → font register → renderDocument → Response).

### Manual Testing Steps:

1. `npm run dev` → open `GET /api/spike-pdf` → confirm a valid, branded, multi-section PDF with custom font, logo header, footer page numbers, paginated tables, and the empty section omitted.
2. Deploy → repeat against the live URL with a session cookie → confirm parity with local.
3. Hit the live URL unauthenticated → confirm middleware rejects it.
4. Run `scripts/spike-bench.mjs --n 50` with `wrangler tail` open → capture wall-clock distribution + CPU lines.
5. Cross-check the numbers against 5 s wall-clock + 10 ms CPU → write the verdict line.

## Performance Considerations

The entire point of Phase 4. Two independent budgets:

- **Wall-clock**: NFR is save→PDF-link < 5 s p95 (for ≤30 plugin / 5 theme rows). The spike measures pure render+transport p95; the real save path (S-08) adds DB + brand fetch, so the spike's wall-clock must leave generous headroom under 5 s.
- **CPU**: free-tier is 10 ms CPU/request. A WASM render of a 30-row table + font subsetting will very likely exceed this. That outcome is **PASS-paid**, not FAIL — Workers Paid is $5/mo for 30 s CPU, and `infrastructure.md` already advises planning for Paid if FormePDF is the path. The two-tier verdict exists precisely so a CPU overage doesn't get misread as a library failure.

## Migration Notes

None — no schema, no data, no persisted state. The spike adds and then removes code; the only durable artifacts are markdown findings and (if warranted) a CLAUDE.md/lessons line.

## References

- Roadmap F-02: `context/foundation/roadmap.md` (lines 81-92)
- PRD FR-017 + NFRs: `context/foundation/prd.md` (lines 107-108, 122)
- Infra Risk R1/R3 + pre-mortem: `context/foundation/infrastructure.md` (lines 60-90)
- FormePDF Workers contract: `node_modules/@formepdf/core/dist/worker.d.ts:1-39`
- FormePDF API: `node_modules/@formepdf/core/dist/index.d.ts:96`, `node_modules/@formepdf/react/dist/components.d.ts`, `node_modules/@formepdf/react/dist/font.d.ts`
- Existing API-route pattern: `src/pages/api/auth/login.ts`
- Deploy mechanics: `context/deployment/deploy-plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: WASM-on-workerd Smoke Proof

#### Automated

- [x] 1.1 Type checking passes: `npx astro check` — 0e46c10
- [x] 1.2 Build succeeds with the wasm import bundled: `npm run build` — 0e46c10
- [x] 1.3 Lint passes: `npm run lint` — 0e46c10

#### Manual

- [x] 1.4 `npm run dev` serves `GET /api/spike-pdf` returning a valid one-page PDF — 0e46c10
- [x] 1.5 No init/WebAssembly runtime error; bundle delivers a usable `WebAssembly.Module` — 0e46c10

### Phase 2: Branded Full-Section Template + Embedded Font

#### Automated

- [x] 2.1 Type checking passes: `npx astro check`
- [x] 2.2 Build succeeds (font asset + template bundled): `npm run build`
- [x] 2.3 Lint passes: `npm run lint`

#### Manual

- [x] 2.4 Full branded multi-section PDF renders (logo header, footer page numbers, tables)
- [x] 2.5 Intentionally-empty section is omitted (no header, no "none")
- [x] 2.6 30-row plugins table paginates with header row repeated
- [x] 2.7 Custom font glyphs render correctly (TrueType embedding confirmed on workerd)

### Phase 3: Auth-Gated Spike Endpoint + Deploy

#### Automated

- [ ] 3.1 Production build succeeds: `npm run build`
- [ ] 3.2 Deployed bundle under 3 MB gzipped free-tier limit
- [ ] 3.3 `wrangler deploy` exits 0 and reports a live version

#### Manual

- [ ] 3.4 Authenticated live `GET /api/spike-pdf` matches the local branded PDF
- [ ] 3.5 Unauthenticated live request is rejected by middleware (FR-001 guardrail holds)
- [ ] 3.6 `wrangler tail` emits a per-request CPU-time line (instrument confirmed)

### Phase 4: p95 Measurement + Two-Tier Verdict

#### Automated

- [ ] 4.1 Benchmark emits a latency distribution over N≥30 runs
- [ ] 4.2 `verdict.md` names exactly one of {PASS-free, PASS-paid, FAIL} with numbers filled in

#### Manual

- [ ] 4.3 `wrangler tail` CPU lines captured and typical/worst CPU recorded
- [ ] 4.4 p95 wall-clock vs 5 s and CPU vs 10 ms cross-checked against the verdict line
- [ ] 4.5 Verdict's R3 consequence is explicit and actionable for S-08

### Phase 5: Cleanup + Findings Capture

#### Automated

- [ ] 5.1 `git status` shows all spike files deleted
- [ ] 5.2 Build still succeeds after removal: `npm run build`
- [ ] 5.3 Lint passes: `npm run lint`
- [ ] 5.4 Clean redeploy succeeds: `wrangler deploy` exits 0

#### Manual

- [ ] 5.5 Live `GET /api/spike-pdf` returns 404 (route gone from prod)
- [ ] 5.6 `verdict.md` + CLAUDE.md/lessons note capture verdict, p95, and workerd recipe for S-08
- [ ] 5.7 `change.md` status reflects spike completion
