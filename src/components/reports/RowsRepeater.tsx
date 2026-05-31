import { useState } from "react";
import { ChevronDown, ChevronRight, Clipboard, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PluginRow, ThemeRow } from "@/lib/reports/schema";
import { pluginFieldName, themeFieldName } from "@/lib/reports/form";
import { mergeRowsByName, parseWpCliTable } from "@/lib/wp-cli-paste/parser";

// Plugin and theme rows share the same shape and UI; `kind` picks the field-name
// helper (so FormData names match what the parser expects) and whether a catalog
// datalist combobox is offered (plugins only).
export type VersionRow = PluginRow | ThemeRow;

interface Props {
  kind: "plugins" | "themes";
  rows: VersionRow[];
  onChange: (rows: VersionRow[]) => void;
  // catalog names for the plugin-name datalist combobox; ignored for themes
  catalogNames?: string[];
}

const DATALIST_ID = "plugin-catalog-names";
const inputClass =
  "min-w-0 rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground shadow-xs focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none";

function emptyRow(): VersionRow {
  return { name: "", updated: false, from_version: null, to_version: null };
}

export default function RowsRepeater({ kind, rows, onChange, catalogNames }: Props) {
  const fieldName = kind === "plugins" ? pluginFieldName : themeFieldName;
  const namePlaceholder = kind === "plugins" ? "Akismet Anti-Spam" : "Twenty Twenty-Four";
  const command = kind === "plugins" ? "wp plugin update --all" : "wp theme update --all";

  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");

  function patch(i: number, change: Partial<VersionRow>) {
    onChange(rows.map((row, idx) => (idx === i ? { ...row, ...change } : row)));
  }

  function addRow() {
    onChange([...rows, emptyRow()]);
  }

  function removeRow(i: number) {
    onChange(rows.filter((_, idx) => idx !== i));
  }

  function parseAndAdd() {
    // Append-merge by name: pasted versions fill recurring-seeded rows instead
    // of duplicating them. An empty paste yields [] and is a no-op.
    const parsed = parseWpCliTable(pasteText);
    if (parsed.length > 0) onChange(mergeRowsByName(rows, parsed));
    setPasteText("");
  }

  return (
    <div className="space-y-3">
      {kind === "plugins" && catalogNames && catalogNames.length > 0 && (
        <datalist id={DATALIST_ID}>
          {catalogNames.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      )}

      <div className="border-border bg-card rounded-lg border">
        <button
          type="button"
          onClick={() => {
            setPasteOpen((o) => !o);
          }}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm focus-visible:ring-[3px] focus-visible:outline-none"
        >
          {pasteOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          <Clipboard className="size-4" />
          Paste from WP-CLI
        </button>
        {pasteOpen && (
          <div className="border-border space-y-2 border-t p-3">
            <p className="text-muted-foreground text-xs">
              Paste the <code className="text-foreground">{command}</code> results table — columns: name, old_version,
              new_version, status. Unrecognized text lands as a single row.
            </p>
            <textarea
              value={pasteText}
              onChange={(e) => {
                setPasteText(e.target.value);
              }}
              placeholder={`+------+-------------+-------------+---------+\n| name | old_version | new_version | status  |\n...`}
              rows={6}
              className={`${inputClass} w-full font-mono text-xs`}
            />
            <Button type="button" size="sm" variant="secondary" onClick={parseAndAdd}>
              <Plus className="size-4" />
              Parse &amp; add rows
            </Button>
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">No rows yet.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row, i) => (
            // Rows are keyed by index: the replace-all save overwrites the whole
            // array, so a stable per-row id would carry no weight.
            <li key={i} className="border-border bg-card rounded-lg border p-3">
              <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_1fr_1fr_auto] sm:items-center">
                <input
                  name={fieldName(i, "name")}
                  value={row.name}
                  onChange={(e) => {
                    patch(i, { name: e.target.value });
                  }}
                  placeholder={namePlaceholder}
                  aria-label={`${kind === "plugins" ? "Plugin" : "Theme"} name, row ${i + 1}`}
                  list={kind === "plugins" ? DATALIST_ID : undefined}
                  className={inputClass}
                />
                <label className="text-foreground flex items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    name={fieldName(i, "updated")}
                    checked={row.updated}
                    onChange={(e) => {
                      patch(i, { updated: e.target.checked });
                    }}
                    className="accent-primary size-4"
                  />
                  Updated
                </label>
                <input
                  name={fieldName(i, "from_version")}
                  value={row.from_version ?? ""}
                  onChange={(e) => {
                    patch(i, { from_version: e.target.value });
                  }}
                  placeholder="from (e.g. 5.1)"
                  aria-label={`From version, row ${i + 1}`}
                  className={inputClass}
                />
                <input
                  name={fieldName(i, "to_version")}
                  value={row.to_version ?? ""}
                  onChange={(e) => {
                    patch(i, { to_version: e.target.value });
                  }}
                  placeholder="to (e.g. 5.2)"
                  aria-label={`To version, row ${i + 1}`}
                  className={inputClass}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  aria-label="Remove row"
                  onClick={() => {
                    removeRow(i);
                  }}
                >
                  <Trash2 className="size-3" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Button type="button" size="sm" variant="secondary" onClick={addRow}>
        <Plus className="size-4" />
        Add row
      </Button>
    </div>
  );
}
