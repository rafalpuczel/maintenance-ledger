# F-02 Verdict — FormePDF on Cloudflare Workers (workerd)

**Date:** 2026-05-28
**Worker:** `maintenance-ledger` @ version `74bc10c3` (live, Workers Paid)
**Endpoint measured:** `GET /api/spike-pdf` (throwaway, auth-gated) — removed in Phase 5
**Payload:** full FR-014 branded report, ~30 plugin rows + 5 theme rows, embedded Inter (TrueType), one empty section (licenses) to exercise hiding.

---

## Verdict: **PASS-paid**

FormePDF (`@formepdf/core` + `@formepdf/react` v0.10.2) **renders the full agency-branded maintenance report correctly on the deployed Cloudflare Workers runtime** and holds wall-clock p95 far under the 5 s NFR — **but it cannot run on the Workers free tier**, on two independent grounds (bundle size AND CPU). It runs comfortably on **Workers Paid ($5/mo)** with large headroom on every limit.

This is the pre-decided R3 action in `infrastructure.md` ("plan as Paid from day one if FormePDF is the path"). The free tier is not a near-miss to optimize toward — it is structurally impossible (see Size below). **S-08 should build against the paid tier as a settled assumption.**

---

## Evidence

### Wall-clock (NFR: save→PDF link < 5 s p95, ≤30 plugin/5 theme rows)

| Source | min | p50 | p95 | max | mean | n |
|---|---|---|---|---|---|---|
| Client round-trip (PL → WAW edge) | 133 | 158 | **197** | 612¹ | 169 | 50 |
| Server wallTime (`wrangler tail`) | 109 | 140 | **174** | 339 | 143 | 50 |

¹ max 612 ms = cold first request (engine warmup); steady-state is ~133–197 ms.

**Wall-clock NFR: PASS** — p95 197 ms is ~25× under the 5 s budget. And this is the *bare render*; the real S-08 save path adds DB + brand fetch, which still leaves multiple seconds of headroom.

### CPU (free-tier limit 10 ms; paid-tier limit 30,000 ms)

| Metric | min | p50 | p95 | max | mean | n |
|---|---|---|---|---|---|---|
| `cpuTime` (`wrangler tail`) | 109 | 139 | **172** | 335 | 141 | 50 |

- **vs 10 ms free cap: FAIL** — p95 172 ms is ~17× over. A WASM render of a 30-row table + font subsetting is inherently tens-to-hundreds of ms of CPU.
- **vs 30 s paid cap: PASS** — 172 ms is ~174× under. Enormous headroom.

### Bundle size (free-tier Worker limit 3 MiB; paid-tier 10 MiB, *uncompressed* script size)

| Component | Size |
|---|---|
| `forme_bg.wasm` (FormePDF engine) | **6.45 MiB** |
| Total Worker (uncompressed) | **7.75 MiB** (3.29 MiB gzipped) |

- **vs 3 MiB free cap: FAIL** — the wasm engine *alone* (6.45 MiB) is over 2× the free limit. `wrangler deploy` is rejected at validation (`code: 10027`). This is the dominant, non-negotiable constraint: free tier is impossible regardless of CPU.
- **vs 10 MiB paid cap: PASS** — 7.75 MiB fits with ~2.25 MiB to spare.

> The 6.45 MiB is the **rendering engine** shipped in the Worker once at deploy time — NOT per-request and NOT the output. Generated PDFs are ~27 KB.

### Correctness (the R1 question)

- Renders a valid 2-page PDF (`%PDF-1.7`), **byte-identical** local-workerd vs deployed-edge (26,786 bytes).
- **Custom TrueType font embeds on workerd** (`/FontFile2` + `/Subtype /Type0`) — the pre-mortem's typography killer (Helvetica-only `pdf-lib`) is retired. Inter woff2 registered via `Document.fonts`; the Rust core decompresses woff2 — no raw `.ttf` needed.
- **Empty-section hiding works** — `licenses: []` → no License Renewals header/placeholder.
- Branded header (logo + agency), footer page numbers, plugins/themes as Tables with header rows repeating across the page break.

---

## Reproduction

1. Deploy: `wrangler deploy` (Workers Paid account; free tier rejects on size).
2. Cookie: `curl -s -c jar -X POST <BASE>/api/auth/login -H "Origin: <BASE>" --data-urlencode user=$SHARED_USERNAME --data-urlencode password=<pw>` → take `ml_session`.
3. In terminal A: `wrangler tail --format json > tail.jsonl` (pretty-printed multi-line JSON, NOT JSONL — parse object-by-object; `cpuTime`/`wallTime` per event).
4. In terminal B: `SPIKE_COOKIE="ml_session=..." node scripts/spike-bench.mjs --url <BASE>/api/spike-pdf --n 50`.
5. Aggregate `cpuTime` from `tail.jsonl` for `url` containing `/api/spike-pdf`.

---

## Consequence for S-08 (branded-pdf-on-save)

1. **Build against Workers Paid.** Already upgraded (2026-05-28). Free tier is off the table — do not design for it.
2. **Synchronous PDF-on-save is fine on latency** — ~150–200 ms render leaves the 5 s NFR comfortable even after adding DB + brand fetch + email. No need for async/queue.
3. **CPU has 174× headroom on paid** — a bigger report (more rows/sections) won't approach the 30 s limit. R3 "watch p95, upgrade at first timeout" is moot: paid from day one, no timeout risk in sight.
4. **Reuse the workerd recipe** (see plan.md "Key Discoveries" — Phases 1–3): `customConditions:["worker"]`, `import wasm from '@formepdf/core/pkg-web/forme_bg.wasm'` + `await init(wasm)`, `*.wasm` ambient type, `Document.fonts` for custom fonts, sections as direct Page children (no keep-together wrapper Views), `.ts` route + `createElement` factory.
5. **Cost guardrail (user action):** set Cloudflare usage-based-billing notifications; for this traffic profile the expected cost is the flat $5/mo (10M req + 30M CPU-ms included; tiny agency volume won't reach overage).

---

## What would have flipped this to FAIL

- Wall-clock p95 ≥ 5 s even on paid (it's 25× under — not close).
- Failure to render on workerd at all (it renders perfectly; init/bundle/font all work).

Neither occurred. The only "failure" is free-tier viability, which is the expected, pre-decided cost of a WASM PDF engine — captured here as **PASS-paid**, not FAIL.
