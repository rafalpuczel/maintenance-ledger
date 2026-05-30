# WP-CLI Bulk-Paste Implementation Plan

## Overview

Add a bulk-paste affordance to the plugins and themes repeaters in the report authoring form (S-07, FR-015). The user pastes the output of `wp plugin update --all` / `wp theme update --all` into a textarea; a pure parser converts that ASCII results table into individual repeater rows (`name`, `updated`, `from_version`, `to_version`). On total parse failure the entire paste lands as a single row so no input is lost. The expected format is shown inline.

This is an additive, mostly client-side slice. The plugins/themes rows are already JSON columns on the `reports` table, fully owned by S-06's zod schema and `RowsRepeater` — so there are **no data-layer, query, API, or migration changes**. The work is a new pure-logic module (unit-tested in isolation) plus a thin UI block wired into the existing repeater's `onChange`.

## Current State Analysis

S-06 (report-authoring) is complete and shipped. The relevant surface:

- **`src/components/reports/RowsRepeater.tsx`** — a generic repeater used for both plugins and themes, selected by a `kind: "plugins" | "themes"` prop. It owns rows via `rows: VersionRow[]` + `onChange: (rows: VersionRow[]) => void`. Rows are added/edited/removed by rebuilding the array and calling `onChange`. It already branches on `kind` (field-name helper, name placeholder, plugin-only catalog datalist), so a `kind`-aware bulk-paste block slots in naturally.
- **`src/components/reports/ReportForm.tsx`** — holds `plugins`/`themes` in `useState<VersionRow[]>` and renders `<RowsRepeater kind="plugins" … />` / `<RowsRepeater kind="themes" … />`. **No change needed here** — the bulk-paste lives entirely inside `RowsRepeater`.
- **`src/lib/reports/schema.ts`** — `pluginRowSchema` and `themeRowSchema` are identical: `{ name: string(min 1), updated: boolean, from_version: optionalText, to_version: optionalText }`. `optionalText` trims and maps empty/omitted → `null`. `VersionRow = PluginRow | ThemeRow` is exported from `RowsRepeater.tsx`.

The parser's output must therefore be exactly `{ name, updated, from_version, to_version }` per row, with versions as `string | null`.

### WP-CLI results-table format (the pinned format)

The post-update results table from `wp plugin update --all` and `wp theme update --all` is an identical 4-column ASCII grid (verified against `wp-cli/extension-command` source):

```
+------------------------+-------------+-------------+---------+
| name                   | old_version | new_version | status  |
+------------------------+-------------+-------------+---------+
| akismet                | 3.1.3       | 3.1.11      | Updated |
| broken-plugin          | 1.0.0       | 1.2.0       | Error   |
+------------------------+-------------+-------------+---------+
Success: Updated 1 of 2 plugins.
```

- Columns, in order: **`name`, `old_version`, `new_version`, `status`**.
- `status` is a binary literal: **`Updated`** (success) or **`Error`** (failed/`WP_Error`). There is no "up to date" value — already-current items are filtered out by WP-CLI and never appear.
- Border rules (`+---+`), the header row, and the trailing `Success:` / `Error:` summary line are noise the parser must skip.

### Key Discoveries:

- **No persistence work.** `plugins`/`themes` are `Json` columns on `reports` (`src/types/database.types.ts`); S-06 reads/writes them as validated arrays. Bulk-paste only produces in-memory `VersionRow[]` and calls the existing `onChange`. (`src/lib/reports/queries.ts`)
- **Mapping is direct:** `old_version → from_version`, `new_version → to_version`, `updated = (status === "Updated")`. Empty version cells → `null` (mirrors `optionalText`).
- **Vitest has no `@/` alias** (recorded lesson) — the parser module must import any sibling (e.g. its own types) **relatively**, never via `@/`. Test runner is `npm test` → `vitest run`, `*.test.ts` collocated. (`vitest.config.ts`, `src/lib/plugins-catalog/form.test.ts` as the template.)
- **Zod v4** is in force with `@typescript-eslint/no-deprecated` as an error — use top-level validators if any schema is touched. The parser itself needs no new zod schema (it reuses the row shape), but if it constructs rows it must satisfy `pluginRowSchema`/`themeRowSchema`.
- **Event-handler lesson:** React 19 here types submit handlers as `React.SubmitEvent<HTMLFormElement>`, not the deprecated `React.FormEvent`. The bulk-paste button is a plain `onClick` (not a form submit), so this is mostly a non-issue, but keep to the codebase idiom.

## Desired End State

In the report form, each of the Plugins and Themes sections has a collapsible **"Paste from WP-CLI"** block. The user opens it, pastes a `wp … update --all` results table, clicks **"Parse & add rows"**, and the parsed rows appear in the repeater — merged by name into any existing (e.g. recurring-seeded) rows, appended otherwise. A paste that isn't a recognizable results table produces one row holding the raw text, so nothing is silently dropped. The textarea clears after a successful parse. An inline hint shows the expected format.

Verification: `npm test` passes the parser suite (all decided edge cases); the report form lets a user paste a real `wp plugin update --all` table and see correct rows; pasting garbage yields a single salvage row; pasting into a seeded repeater fills the seeded rows instead of duplicating them.

## What We're NOT Doing

- **No dry-run / "available updates" table support** (`name | status | version | update_version`). It falls through to the single-row fallback. (Decided: results table only.)
- **No CSV / TSV / JSON / spreadsheet parsing.** Out of scope per FR-015 ("multi-format auto-detection is out of scope"); these hit the fallback.
- **No replace-all mode and no parse-on-paste.** Parsing is an explicit button click; parsed rows append-merge, never wipe existing rows.
- **No data-layer, schema, query, API, or migration changes.** The row shape and persistence are unchanged from S-06.
- **No changes to `ReportForm.tsx`** beyond what naturally falls out (expected: none — the block is internal to `RowsRepeater`).
- **No PDF or send work** — those are S-08 / S-09.

## Implementation Approach

Two phases. Phase 1 builds the pure core — a parser `string → VersionRow[]` plus a merge-by-name helper — and locks every behavioral decision as a vitest spec, with zero UI. Phase 2 adds the collapsible textarea block inside `RowsRepeater`, calling the Phase-1 functions and feeding the existing `onChange`. The split keeps the fragile-by-design parser testable in isolation (the explicit rationale for carving S-07 out of S-06) and makes Phase 2 a thin, mostly-presentational wiring layer.

The parser is the load-bearing piece, so its contract is specified precisely below; the UI is routine React state + Tailwind matching existing patterns.

## Critical Implementation Details

**Parser disambiguation & row salvage.** The parser keys off structure, not column position alone. It must (a) drop border lines (a line that, after trimming, is only `+`, `-`, and spaces), (b) drop the header line (the data row whose cells are exactly `name`/`old_version`/`new_version`/`status`), (c) drop the trailing summary (a line starting with `Success:` or `Error:` that is **not** a `|`-delimited grid row), and (d) for each remaining `|`-delimited row, split on `|`, trim cells, and require a non-empty first cell (`name`) to keep the row — a row with no usable name is dropped. The `status` cell maps `Updated → updated:true`, anything else (including `Error`) → `false`. Missing/empty version cells → `null`. This "at least a name" rule and the Error→false mapping are the two spots most worth explicit tests.

**Total-failure detection.** "Recognizable results table" = at least one kept data row was produced by the grid path above. If zero rows are produced, return the single fallback row `{ name: <full trimmed paste>, updated: false, from_version: null, to_version: null }`. An empty/whitespace-only paste produces **no** rows at all (return `[]`) — the fallback is for non-empty unparseable input, not for an empty textarea.

## Phase 1: Parser module + tests

### Overview

Create a new domain module `src/lib/wp-cli-paste/` holding a pure parser and a merge-by-name helper, with a collocated vitest suite covering the full decided behavior matrix. No UI, no imports from React. Fully verifiable headless.

### Changes Required:

#### 1. Parser module

**File**: `src/lib/wp-cli-paste/parser.ts`

**Intent**: Provide the pure functions the Phase-2 UI will call: parse a pasted WP-CLI results table into rows, and merge parsed rows into existing rows by name. No side effects, no DOM, no network — so it runs under vitest unmodified.

**Contract**: Two exported functions over the existing row shape (import `VersionRow`/`PluginRow` relatively or re-declare the minimal `{ name; updated; from_version; to_version }` row type locally — do **not** import via `@/` per the vitest-alias lesson):

- `parseWpCliTable(raw: string): VersionRow[]`
  - Splits `raw` into lines; ignores border lines (`^[\s+\-]+$`), the header line (cells `name|old_version|new_version|status`), and any `Success:`/`Error:` summary line that is not a `|`-delimited grid row.
  - For each `|`-delimited data line: split on `|`, drop the empty leading/trailing fragments produced by the outer pipes, trim each cell. Keep the row only if cell 0 (`name`) is non-empty. Map `{ name: cell0, from_version: cell1 || null, to_version: cell2 || null, updated: cell3 === "Updated" }`.
  - If **no** data rows were kept AND `raw.trim()` is non-empty → return `[{ name: raw.trim(), updated: false, from_version: null, to_version: null }]` (single-row fallback).
  - If `raw.trim()` is empty → return `[]`.
- `mergeRowsByName(existing: VersionRow[], parsed: VersionRow[]): VersionRow[]`
  - For each parsed row: if an existing row has the same `name` compared case-insensitively after trim, overwrite that existing row's `updated`/`from_version`/`to_version` with the parsed values (keep the existing row's original `name` spelling); otherwise append the parsed row. Returns a new array; never mutates inputs. Order: existing rows keep their positions; genuinely new parsed rows append in paste order.

No code snippet needed — the cell-mapping and the case-insensitive match are the whole contract; the implementer writes it from the field names above.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Linting passes by exit code: `npm run lint`
- Parser unit tests pass: `npm test`

#### Manual Verification:

- (none — Phase 1 is headless; behavior is proven by the test suite)

#### 2. Parser test suite

**File**: `src/lib/wp-cli-paste/parser.test.ts`

**Intent**: Lock every decision from planning as an executable spec. This is the primary deliverable of the slice's "testable in isolation" rationale.

**Contract**: A vitest suite (`describe`/`it`/`expect`, importing the parser **relatively** as `./parser`, matching `src/lib/plugins-catalog/form.test.ts`) covering at least:

1. Clean multi-row results table → correct rows, versions mapped from→old / to→new.
2. `status` mapping: an `Updated` row → `updated:true`; an `Error` row → `updated:false` (versions still captured).
3. Noise stripping: border rules (`+---+`), the `name|old_version|new_version|status` header, and the trailing `Success: …` / `Error: …` summary line produce no rows.
4. Missing version cells (blank `old_version`/`new_version`) → `null`.
5. Partial/short line salvage: a `|`-row with a name but missing trailing cells is kept (missing → null); a `|`-row with an empty name cell is dropped.
6. Total-failure fallback: a non-table paste (e.g. arbitrary prose, or a dry-run `name|status|version|update_version` table) → exactly one row with `name` = the raw trimmed paste, others null/false.
7. Empty / whitespace-only paste → `[]` (no fallback row).
8. `mergeRowsByName`: parsed row whose name matches an existing seeded row (case-insensitive, e.g. `"akismet"` vs `"Akismet"`) updates that row in place (no duplicate); a non-matching parsed row appends; inputs are not mutated.

### Success Criteria:

#### Automated Verification:

- All parser tests pass: `npm test`
- Lint passes by exit code: `npm run lint`

#### Manual Verification:

- (none)

**Implementation Note**: Phase 1 has no manual step — proceed to Phase 2 once `npm test`, `npm run lint`, and `npx astro check` are green.

---

## Phase 2: Bulk-paste UI in RowsRepeater

### Overview

Add a collapsible "Paste from WP-CLI" block to `RowsRepeater` (rendered for both plugins and themes), wired to the Phase-1 parser and merge helper and the existing `onChange`. Purely presentational + local state; no new props required from `ReportForm`.

### Changes Required:

#### 1. Bulk-paste block in the repeater

**File**: `src/components/reports/RowsRepeater.tsx`

**Intent**: Let the user paste a WP-CLI results table and append-merge the parsed rows into this repeater, with an inline format hint and an explicit parse action. Reused for both `kind`s with no behavioral difference (the parser is format-only; plugins vs themes share the row shape).

**Contract**:
- Add local state: an open/closed boolean (default closed) and the textarea string.
- A toggle control ("Paste from WP-CLI") at the top of the repeater (above the rows / "Add row") that shows/hides the block. Match the existing `Button` outline style (`border border-white/20 bg-white/10 hover:bg-white/20`, `size="sm"`); an icon is optional (e.g. `ClipboardPaste` from `lucide-react`, consistent with the existing `Plus`/`Trash2` usage).
- When open: a `<textarea>` using the same `inputClass`/`textInput` pattern already in the file (full-width, `rows={6}`), a short inline hint line showing the expected header (e.g. "Paste the `wp plugin update --all` results table — columns: name, old_version, new_version, status"), and a "Parse & add rows" `Button`.
- On "Parse & add rows" click: call `onChange(mergeRowsByName(rows, parseWpCliTable(textarea)))`, then clear the textarea. If `parseWpCliTable` returns `[]` (empty paste), do nothing (no-op) — optionally leave the block open. Import the parser via the `@/` alias (`@/lib/wp-cli-paste/parser`) — this is a cross-module import in a component the tests don't pull, so the alias is correct here (the relative-import rule is only for intra-`src/lib` siblings under vitest).
- The themes repeater gets the identical block (the toggle/textarea/hint/button render regardless of `kind`; only the hint's command word can vary — "plugin" vs "theme" — keyed off `kind`).

No snippet needed; this is standard `useState` + the file's existing Tailwind/`Button` idiom.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Linting passes by exit code: `npm run lint`
- Existing tests still pass: `npm test`
- Production build succeeds: `npm run build`

#### Manual Verification:

- In the report form, the Plugins and Themes sections each show a "Paste from WP-CLI" toggle that opens a textarea + format hint + "Parse & add rows" button.
- Pasting a real `wp plugin update --all` results table and clicking the button produces correct rows (names, from/to versions, `Updated` rows checked, `Error` rows unchecked); the textarea clears.
- Pasting non-table text produces a single row containing the raw paste (nothing lost).
- Pasting into a repeater pre-seeded with recurring plugins fills the matching seeded rows (case-insensitive name match) instead of creating duplicates; non-matching pasted rows append.
- An empty paste + click is a no-op (no junk row).
- The themes block behaves identically; the plugin catalog datalist and all existing add/edit/remove row controls still work.

**Implementation Note**: After Phase 2's automated verification passes, pause for manual confirmation in the running app (`npm run dev`) before considering the slice done.

---

## Testing Strategy

### Unit Tests:

- The full Phase-1 parser matrix above (`src/lib/wp-cli-paste/parser.test.ts`) — happy path, status mapping, noise stripping, null versions, partial salvage, total-failure fallback, empty paste, and merge-by-name. This is the bulk of the testing value and the reason the slice is separate.

### Integration Tests:

- None automated for the UI (the project has no component-test harness; `vitest` is node-environment, unit-only). UI correctness is covered by the Phase-2 manual steps.

### Manual Testing Steps:

1. `npm run dev`, sign in, open a project, create or edit a report.
2. In Plugins, open "Paste from WP-CLI", paste a real results table (include one `Error`-status row), click "Parse & add rows" — verify rows, versions, and the `Updated`/`Error` → checkbox mapping; verify the textarea cleared.
3. Paste arbitrary prose, parse — verify exactly one row holds the raw text.
4. On a freshly created report (recurring plugins auto-seeded), paste a table whose names match seeded rows in different case — verify the seeded rows are filled, not duplicated.
5. Click "Parse & add rows" with an empty textarea — verify nothing is added.
6. Repeat step 2 in the Themes section with a `wp theme update --all` table.

## Performance Considerations

Negligible. Parsing is a one-shot string split over a paste of at most a few dozen lines, on an explicit click. No render-loop or persistence cost; the existing replace-all save already serializes the full arrays.

## Migration Notes

None. No schema, data, or stored-shape changes — parsed rows use the exact existing `plugins`/`themes` JSON row shape.

## References

- Roadmap slice: `context/foundation/roadmap.md` → S-07 (wp-cli-bulk-paste)
- PRD: FR-015 (bulk-paste + single-row fallback + inline format hint), US-01
- Integration target: `src/components/reports/RowsRepeater.tsx` (rows/onChange contract), `src/components/reports/ReportForm.tsx:168-174`
- Row shape: `src/lib/reports/schema.ts:16-28` (`pluginRowSchema` / `themeRowSchema`)
- Test template: `src/lib/plugins-catalog/form.test.ts`; runner `vitest.config.ts`
- Lessons applied: vitest has no `@/` alias (relative sibling imports); zod v4 top-level validators; judge lint/build by exit code (`context/foundation/lessons.md`)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Parser module + tests

#### Automated

- [x] 1.1 Type checking passes: `npx astro check`
- [x] 1.2 Linting passes by exit code: `npm run lint`
- [x] 1.3 Parser unit tests pass: `npm test`

### Phase 2: Bulk-paste UI in RowsRepeater

#### Automated

- [ ] 2.1 Type checking passes: `npx astro check`
- [ ] 2.2 Linting passes by exit code: `npm run lint`
- [ ] 2.3 Existing tests still pass: `npm test`
- [ ] 2.4 Production build succeeds: `npm run build`

#### Manual

- [ ] 2.5 Plugins and Themes sections each show a "Paste from WP-CLI" toggle → textarea + hint + "Parse & add rows" button
- [ ] 2.6 Pasting a real results table produces correct rows (versions + Updated/Error→checkbox); textarea clears
- [ ] 2.7 Pasting non-table text produces a single row with the raw paste (nothing lost)
- [ ] 2.8 Pasting into a recurring-seeded repeater merges by name (case-insensitive), no duplicates; non-matching rows append
- [ ] 2.9 Empty paste + click is a no-op (no junk row)
- [ ] 2.10 Themes block behaves identically; catalog datalist and existing row controls still work
