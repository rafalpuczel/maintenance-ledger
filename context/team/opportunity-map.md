# Opportunity Map

## Context

- **Project / context**: 10xdev-project (Maintenance Ledger). M5-L1 lens — treat this repo's solo-builder-as-team workflow as the "team"; frictions drawn from its own artifacts (lessons register, test-plan rollout state, archive cadence, AI-rules surface), not invented.
- **Data constraint**: Mock / local / read-only / non-sensitive. First version stays light — no access-control or auditing thinking up front.
- **Date**: 2026-06-15

## Map

One row per signal, terse cells; longer reasoning is in the sections below.

| # | Signal | Existing / default response | Thin complement | First useful version | Data risk | Direction if valuable |
|---|--------|-----------------------------|-----------------|----------------------|-----------|-----------------------|
| 1 | Rollout status drifts across 3 sources (test-plan §3 table / `change.md` / git log); each archive is a hand-edit in ≥2 places | Hand-edit the table after each archive; git log as informal status | Derive true status from disk (folder location + `change.md` + git), flag table↔reality mismatches | Local script → static Markdown/HTML status board | local / read-only / non-sensitive | Internal tool → Review / CI gate |
| 2 | Lessons (`lessons.md` + `CLAUDE.md`) aren't enforced against diffs — prose a human must remember | Human memory; 10x review skills re-read them | Turn each lesson into a concrete grep/assert run on the diff | Script: `lessons.md` → per-lesson "did this diff touch the risky pattern?" report | local / read-only / non-sensitive | Internal tool → Review / CI gate (M5 path A) |
| 3 | AI-rules files drift from code (`AGENTS.md:11` assumes RLS protects tables; service key bypasses RLS — flagged "contradiction to verify") | Caught by accident during research | Staleness linter: each rule line carries a checkable anchor (file/line); flag rules whose anchor moved | Script: rule → anchor-moved flag | local / read-only / non-sensitive | Review gate / existing `/10x-rule-review` |
| 4 | Plan-vs-code reconciliation is manual each phase (plans drift; risk #3 found JSON not redirects) | `/10x-research` re-derives ground truth; `/10x-impl-review` by hand | (already the thin layer — the 10x skills) | n/a | local / read-only / non-sensitive | **Wait — already solved** |
| 5 | Skills/rules are repo-local copy-paste, not versioned-distributed | Files live only in this repo; copy by hand | Package skills/rules as a versioned artifact + installer (M5 L4) | Single source-of-truth folder + manifest | local / non-sensitive | Shared artifact registry (M5 path B) — needs ≥2 repos |
| 6 | No single "where is everything" view — answering "what's left / blocked / just shipped" means cross-checking 4 sources | Read table + `archive/` + git log + open `changes/` by hand | (= Signal 1) | Folded into Signal 1 | local / read-only / non-sensitive | Subsumed by Signal 1 |

## Recommended First Candidate

```text
Candidate:
Rollout Status Board (read-only "where is everything" digest)

Reads:
- context/foundation/test-plan.md  (the §3 phase table — claimed status)
- context/changes/*/change.md and context/archive/*/change.md  (per-change actual status + location)
- git log --oneline (the chore(archive): close … cadence) and folder location (changes/ vs archive/)

Returns:
A static Markdown/HTML board: one row per rollout phase / change, showing
claimed status (from the table) vs derived status (from folder + change.md +
git), with a ⚠ on every mismatch, plus a "recently shipped" and "open / blocked"
split — each row linking back to its artifact.

Does not do:
- Does not edit the table or any change.md (read-only; humans/skills stay the system of record)
- No CI wiring, no scheduling, no auth, no packaging
- Does not become the status store — it derives and links, never owns

Data risk:
local / read-only / non-sensitive — runs on this repo's own files. No access-control
thinking needed for the first version.

Direction if it proves valuable:
Internal tool → Review / CI gate: once the derived-vs-claimed diff is trustworthy,
promote it to a PR check that fails when the test-plan table claims a status the
artifacts contradict (closes the "archived by hand, table forgotten" gap for good).
```

## Why This Candidate

It wins on every ranking criterion:

1. **Repeats regularly** — fires on every archive and every phase transition; the four most recent commits are all `chore(archive): close …`.
2. **Joins ≥3 sources** — its whole value is *joining* the test-plan table, the `change.md` files, and the git log/archive folder; this is the classic "thin complement that links two systems" the lens prizes.
3. **Clear manual pain today** — the smoking gun is the §3 cell that reads "implementing… **archived 2026-06-11**", a mid-state corrected by hand.
4. **Testable read-only on local non-sensitive data** — a script over files already on disk; no access-control thinking needed.
5. **Does not replace a platform** — it links back to the artifacts as the system of record; it never becomes the status store.
6. **Clear later direction** — promotes cleanly into a CI gate.

Not the others:
- **Signal 4** is already solved by the existing `/10x-research` → `/10x-impl-review` chain — building here would reinvent it.
- **Signals 2 & 3** are strong but heavier and partly already-tooled (Signal 2 *is* the M5 path-A review agent; Signal 3 overlaps the existing `/10x-rule-review` skill). Good second candidates, not the cheapest first one.
- **Signal 5** (the registry, M5 path B) can't earn its keep in a single repo — it needs a second consumer repo before the distribution machinery pays off. Premature here.

## Next Direction If Valuable

Internal tool → **Review / CI gate**. The first version is a local, read-only, throwaway digest. Once the derived-vs-claimed diff proves trustworthy, the natural growth is a PR check that fails when the test-plan table claims a status the artifacts contradict — closing the "archived by hand, table forgotten" gap permanently. It stays a complement throughout: the `change.md` files, the table, and git remain the systems of record; the board only derives and links.

## Decision (2026-06-15)

Next move: **Nothing for now** — map saved; revisit when more signals accumulate (or when a second consumer repo appears, which would re-rank Signal 5). The cheapest first step when picking this up is still a short conversation with whoever lives with the friction about *why* the status drift happens before writing any code.
