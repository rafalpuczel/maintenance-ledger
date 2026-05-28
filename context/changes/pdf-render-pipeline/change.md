---
change_id: pdf-render-pipeline
title: PDF render pipeline
status: implemented
created: 2026-05-28
updated: 2026-05-28
archived_at: null
---

## Notes

F-02 risk spike — throwaway code, durable verdict. **Outcome: PASS-paid** (see `verdict.md`). FormePDF renders the branded report on workerd correctly with ~25× wall-clock headroom under the 5 s NFR, but the free tier is impossible on two counts (6.45 MiB wasm > 3 MiB size cap; ~172 ms CPU p95 > 10 ms CPU cap) — both fit Workers Paid with large headroom. Account upgraded to Workers Paid 2026-05-28. Workerd init recipe captured in CLAUDE.md for S-08 (branded-pdf-on-save). Spike code removed; live Worker back to pre-spike shape.
