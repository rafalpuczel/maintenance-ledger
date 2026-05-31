import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LicenseRow } from "@/lib/reports/schema";
import { licenseFieldName } from "@/lib/reports/form";

interface Props {
  rows: LicenseRow[];
  onChange: (rows: LicenseRow[]) => void;
}

const inputClass =
  "rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground shadow-xs focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none";

function emptyRow(): LicenseRow {
  return { name: "", status: "expiring", expiry_date: null, notes: null };
}

export default function LicensesRepeater({ rows, onChange }: Props) {
  function patch(i: number, change: Partial<LicenseRow>) {
    onChange(rows.map((row, idx) => (idx === i ? { ...row, ...change } : row)));
  }

  function addRow() {
    onChange([...rows, emptyRow()]);
  }

  function removeRow(i: number) {
    onChange(rows.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">No rows yet.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row, i) => (
            <li key={i} className="border-border bg-card rounded-lg border p-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto_1fr_auto] sm:items-center">
                <input
                  name={licenseFieldName(i, "name")}
                  value={row.name}
                  onChange={(e) => {
                    patch(i, { name: e.target.value });
                  }}
                  placeholder="License name"
                  aria-label={`License name, row ${i + 1}`}
                  className={inputClass}
                />
                <select
                  name={licenseFieldName(i, "status")}
                  value={row.status}
                  onChange={(e) => {
                    patch(i, { status: e.target.value as LicenseRow["status"] });
                  }}
                  aria-label={`License status, row ${i + 1}`}
                  className={inputClass}
                >
                  <option value="expiring">Expiring</option>
                  <option value="expired">Expired</option>
                </select>
                <input
                  type="date"
                  name={licenseFieldName(i, "expiry_date")}
                  value={row.expiry_date ?? ""}
                  onChange={(e) => {
                    patch(i, { expiry_date: e.target.value });
                  }}
                  aria-label={`Expiry date, row ${i + 1}`}
                  className={inputClass}
                />
                <input
                  name={licenseFieldName(i, "notes")}
                  value={row.notes ?? ""}
                  onChange={(e) => {
                    patch(i, { notes: e.target.value });
                  }}
                  placeholder="Notes"
                  aria-label={`License notes, row ${i + 1}`}
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
