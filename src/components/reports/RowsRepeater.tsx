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
  "rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white placeholder-white/30 focus:ring-2 focus:ring-purple-400 focus:outline-none";

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

      <div className="rounded-lg border border-white/10 bg-white/5">
        <button
          type="button"
          onClick={() => {
            setPasteOpen((o) => !o);
          }}
          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-blue-100/80 hover:text-white"
        >
          {pasteOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          <Clipboard className="size-4" />
          Paste from WP-CLI
        </button>
        {pasteOpen && (
          <div className="space-y-2 border-t border-white/10 p-3">
            <p className="text-xs text-blue-100/50">
              Paste the <code className="text-blue-100/80">{command}</code> results table — columns: name, old_version,
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
            <Button
              type="button"
              size="sm"
              onClick={parseAndAdd}
              className="border border-white/20 bg-white/10 hover:bg-white/20"
            >
              <Plus className="size-4" />
              Parse &amp; add rows
            </Button>
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-blue-100/40">No rows yet.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row, i) => (
            // Rows are keyed by index: the replace-all save overwrites the whole
            // array, so a stable per-row id would carry no weight.
            <li key={i} className="rounded-lg border border-white/10 bg-white/5 p-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_1fr_1fr_auto] sm:items-center">
                <input
                  name={fieldName(i, "name")}
                  value={row.name}
                  onChange={(e) => {
                    patch(i, { name: e.target.value });
                  }}
                  placeholder={namePlaceholder}
                  list={kind === "plugins" ? DATALIST_ID : undefined}
                  className={inputClass}
                />
                <label className="flex items-center gap-1 text-sm text-blue-100/80">
                  <input
                    type="checkbox"
                    name={fieldName(i, "updated")}
                    checked={row.updated}
                    onChange={(e) => {
                      patch(i, { updated: e.target.checked });
                    }}
                    className="size-4 accent-purple-500"
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
                  className={inputClass}
                />
                <input
                  name={fieldName(i, "to_version")}
                  value={row.to_version ?? ""}
                  onChange={(e) => {
                    patch(i, { to_version: e.target.value });
                  }}
                  placeholder="to (e.g. 5.2)"
                  className={inputClass}
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    removeRow(i);
                  }}
                  className="border border-red-500/40 bg-red-900/20 text-red-200 hover:bg-red-900/40"
                >
                  <Trash2 className="size-3" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Button type="button" size="sm" onClick={addRow} className="border border-white/20 bg-white/10 hover:bg-white/20">
        <Plus className="size-4" />
        Add row
      </Button>
    </div>
  );
}
