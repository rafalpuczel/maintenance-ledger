# WP-CLI Bulk-Paste — Plan Brief

> Full plan: `context/changes/wp-cli-bulk-paste/plan.md`

## What & Why

Devs running a maintenance round already have a `wp plugin update --all` / `wp theme update --all` results table in their terminal. This slice (S-07, FR-015) lets them paste that table straight into the report's plugins/themes repeaters instead of retyping each row, so authoring matches the real workflow. On a paste the parser can't read, the whole text is salvaged into one row — nothing is silently lost.

## Starting Point

S-06 (report-authoring) is shipped. `RowsRepeater` (`src/components/reports/RowsRepeater.tsx`) renders both the plugins and themes repeaters, owning rows via `rows: VersionRow[]` + `onChange`. Rows are JSON columns on the `reports` table (`{ name, updated, from_version, to_version }`), validated by `src/lib/reports/schema.ts`. There is no bulk/paste affordance anywhere yet.

## Desired End State

Each of the Plugins and Themes sections gains a collapsible "Paste from WP-CLI" block: a textarea, an inline format hint, and a "Parse & add rows" button. Clicking it parses the pasted results table and append-merges the rows by name into whatever is already there (e.g. recurring-seeded rows get filled, not duplicated). Garbage paste → one salvage row. The parser is a pure, fully unit-tested module.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Accepted format | Results table only (`name \| old_version \| new_version \| status`) | Matches FR-015's "pin one documented format"; smallest, most testable parser; the fallback catches the rest. | Plan |
| Existing-rows behavior | Append, merging by name (case-insensitive) | Respects the recurring-plugins seed (FR-009) — pasted versions fill seeded rows instead of duplicating. | Plan |
| Total-failure fallback | Raw paste → `name`, others null/false (one row) | Literal read of FR-015 ("entire paste lands as one row"); zero data loss; user edits it down. | Plan |
| Per-row oddities | Keep `Error` rows (`updated=false`); skip borders/header/summary; salvage partials with a name | Failed updates are report-relevant; robust to terminal noise. | Plan |
| Empty paste | Returns `[]` (no fallback row) | The fallback is for non-empty unparseable input, not an empty textarea. | Plan |
| UI placement / trigger | Collapsible block inside `RowsRepeater`, explicit "Parse & add rows" button | Co-located with the rows it fills; one component change serves both repeaters; explicit click = predictable + testable. | Plan |
| Test scope | Happy path + all decided edge cases (~10–12 cases) | Locks every decision as an executable spec; delivers the "testable in isolation" rationale for the slice. | Plan |

## Scope

**In scope:**
- Pure parser `parseWpCliTable(raw) → VersionRow[]` + `mergeRowsByName(existing, parsed)` in a new `src/lib/wp-cli-paste/` module.
- Collocated vitest suite covering the full decided matrix.
- Collapsible "Paste from WP-CLI" block inside `RowsRepeater`, wired to the parser and existing `onChange`, for both plugins and themes.

**Out of scope:**
- Dry-run / "available updates" table, CSV/TSV/JSON/spreadsheet parsing (all fall through to the fallback).
- Replace-all mode; parse-on-paste (magic mutation).
- Any data-layer, schema, query, API, or migration change; any change to `ReportForm.tsx`.
- PDF (S-08) and send (S-09) work.

## Architecture / Approach

Two layers. A **pure logic core** (`src/lib/wp-cli-paste/parser.ts`) does all the parsing and merging with no DOM/network, so it runs headless under vitest — this is where every behavioral decision is pinned by tests. A **thin UI layer** adds local `useState` (open/closed + textarea text) to `RowsRepeater`; the "Parse & add rows" button calls `onChange(mergeRowsByName(rows, parseWpCliTable(text)))` and clears the textarea. The component imports the parser via `@/` (cross-module); the parser imports any sibling relatively (vitest has no `@/` alias).

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Parser module + tests | `parseWpCliTable` + `mergeRowsByName` + full vitest matrix; headless, no UI | Parser is fragile by design — edge cases (Error rows, partials, fallback) must be pinned by tests |
| 2. Bulk-paste UI in RowsRepeater | Collapsible textarea + hint + button for both repeaters, wired to parser + `onChange` | Keeping it purely additive (no `ReportForm` change, no regression to existing row controls / catalog datalist) |

**Prerequisites:** S-06 complete (it is). No new deps, no secrets, no DB.
**Estimated effort:** ~1 session, 2 phases.

## Open Risks & Assumptions

- The pinned format is the current `wp-cli/extension-command` results table (`name/old_version/new_version/status`, status `Updated`/`Error`), verified against source. WP-CLI has kept this stable across 2.x; if a future version renames columns, parsing degrades gracefully to the single-row fallback (no crash, no data loss).
- A multi-line raw paste sitting in a single-line `name` input looks messy — accepted; it's a salvage state, and the user edits it down.

## Success Criteria (Summary)

- A dev can paste a real `wp plugin/theme update --all` table and get correct rows (versions + `Updated`/`Error` → checkbox), with no retyping.
- An unparseable paste is never lost — it becomes one editable row.
- Pasting over recurring-seeded rows fills them by name rather than duplicating; `npm test` proves the parser behavior end-to-end.
