import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LicenseRow } from "@/lib/reports/schema";
import { licenseFieldName } from "@/lib/reports/form";

interface Props {
  rows: LicenseRow[];
  onChange: (rows: LicenseRow[]) => void;
}

const inputClass =
  "rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white placeholder-white/30 focus:ring-2 focus:ring-purple-400 focus:outline-none";

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
        <p className="text-sm text-blue-100/40">No rows yet.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row, i) => (
            <li key={i} className="rounded-lg border border-white/10 bg-white/5 p-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto_1fr_auto] sm:items-center">
                <input
                  name={licenseFieldName(i, "name")}
                  value={row.name}
                  onChange={(e) => {
                    patch(i, { name: e.target.value });
                  }}
                  placeholder="License name"
                  className={inputClass}
                />
                <select
                  name={licenseFieldName(i, "status")}
                  value={row.status}
                  onChange={(e) => {
                    patch(i, { status: e.target.value as LicenseRow["status"] });
                  }}
                  className={inputClass}
                >
                  <option value="expiring" className="bg-slate-800">
                    Expiring
                  </option>
                  <option value="expired" className="bg-slate-800">
                    Expired
                  </option>
                </select>
                <input
                  type="date"
                  name={licenseFieldName(i, "expiry_date")}
                  value={row.expiry_date ?? ""}
                  onChange={(e) => {
                    patch(i, { expiry_date: e.target.value });
                  }}
                  className={inputClass}
                />
                <input
                  name={licenseFieldName(i, "notes")}
                  value={row.notes ?? ""}
                  onChange={(e) => {
                    patch(i, { notes: e.target.value });
                  }}
                  placeholder="Notes"
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
