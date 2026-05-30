// Pure parser for WP-CLI plugin/theme update output. Turns the post-update
// results table from `wp plugin update --all` / `wp theme update --all` into
// repeater rows, with a single-row fallback so an unrecognizable paste is never
// lost. No DOM/network — runs headless under vitest.
//
// The row shape is declared locally (rather than imported via `@/lib/reports/schema`)
// so this module stays resolvable under vitest, which has no `@/` alias. It is
// structurally identical to PluginRow/ThemeRow.
export interface ParsedRow {
  name: string;
  updated: boolean;
  from_version: string | null;
  to_version: string | null;
}

// The pinned format's results-table columns, in order: name | old_version |
// new_version | status. status is "Updated" (success) or "Error" (failure).
const HEADER_CELLS = ["name", "old_version", "new_version", "status"];

// A border rule line: only +, -, and whitespace (e.g. `+----+----+`).
const BORDER_RE = /^[\s+-]+$/;

// Normalize an empty/whitespace cell to null (mirrors the reports schema's
// optionalText), else the trimmed value.
function cell(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

// Split a `| a | b | c |` grid row into its trimmed inner cells, dropping the
// empty fragments produced by the leading/trailing pipes.
function gridCells(line: string): string[] {
  const parts = line.split("|");
  // A well-formed grid row has empty first and last fragments (outer pipes).
  if (parts.length >= 2 && parts[0].trim() === "" && parts[parts.length - 1].trim() === "") {
    return parts.slice(1, -1).map((c) => c.trim());
  }
  return parts.map((c) => c.trim());
}

function isHeaderRow(cells: string[]): boolean {
  return cells.length === HEADER_CELLS.length && cells.every((c, i) => c.toLowerCase() === HEADER_CELLS[i]);
}

/**
 * Parse a pasted WP-CLI results table into rows.
 *
 * - Skips border rules, the header row, and any trailing `Success:`/`Error:`
 *   summary line that is not a `|`-delimited grid row.
 * - Each grid data row maps to { name: cell0, from_version: cell1,
 *   to_version: cell2, updated: cell3 === "Updated" }. A row with no usable
 *   name is dropped; missing version cells become null.
 * - If no data rows are produced and the paste is non-empty, returns a single
 *   fallback row holding the raw trimmed paste in `name` (nothing is lost).
 * - An empty/whitespace-only paste returns [].
 */
export function parseWpCliTable(raw: string): ParsedRow[] {
  const rows: ParsedRow[] = [];

  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "") continue;
    if (BORDER_RE.test(line)) continue;
    // A summary line (`Success: ...` / `Error: ...`) that isn't a grid row.
    if (!line.includes("|")) continue;

    const cells = gridCells(line);
    if (isHeaderRow(cells)) continue;

    const name = cell(cells[0]);
    if (name === null) continue; // no usable name → drop

    rows.push({
      name,
      from_version: cell(cells[1]),
      to_version: cell(cells[2]),
      updated: (cells[3] ?? "") === "Updated",
    });
  }

  if (rows.length === 0) {
    const trimmed = raw.trim();
    if (trimmed === "") return [];
    return [{ name: trimmed, updated: false, from_version: null, to_version: null }];
  }

  return rows;
}

/**
 * Merge parsed rows into existing rows by name (case-insensitive, trimmed).
 *
 * A parsed row matching an existing row overwrites that row's
 * updated/from_version/to_version in place (keeping the existing name's
 * spelling); a non-matching parsed row is appended in paste order. Existing
 * rows keep their positions. Inputs are not mutated.
 */
export function mergeRowsByName(existing: ParsedRow[], parsed: ParsedRow[]): ParsedRow[] {
  const result = existing.map((row) => ({ ...row }));
  const indexByName = new Map<string, number>();
  result.forEach((row, i) => {
    indexByName.set(row.name.trim().toLowerCase(), i);
  });

  for (const row of parsed) {
    const key = row.name.trim().toLowerCase();
    const existingIndex = indexByName.get(key);
    if (existingIndex !== undefined) {
      // Keep the existing row's name spelling; take versions/updated from the paste.
      result[existingIndex] = { ...result[existingIndex], ...row, name: result[existingIndex].name };
    } else {
      indexByName.set(key, result.length);
      result.push({ ...row });
    }
  }

  return result;
}
