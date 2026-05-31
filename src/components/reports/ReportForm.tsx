import { useState } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ServerError } from "@/components/auth/ServerError";
import RowsRepeater, { type VersionRow } from "@/components/reports/RowsRepeater";
import LicensesRepeater from "@/components/reports/LicensesRepeater";
import type { LicenseRow, PluginRow, ThemeRow } from "@/lib/reports/schema";
import { reportInputSchema } from "@/lib/reports/schema";
import { useSubmit } from "@/lib/ui/useSubmit";
import { toastSuccess, toastError, toastWarning } from "@/lib/ui/toast";

export interface ReportFormInitial {
  wp_core_version: string | null;
  wp_core_updated: boolean;
  php_updated: boolean;
  php_from_version: string | null;
  php_to_version: string | null;
  integrity_status: string | null;
  integrity_issues: string | null;
  fixes_applied: string | null;
  notes_to_client: string | null;
  plugins: PluginRow[];
  themes: ThemeRow[];
  licenses: LicenseRow[];
}

interface Props {
  action: string;
  // project slug, posted as a hidden field (carried in the report payload)
  slug: string;
  month: string;
  initial: ReportFormInitial;
  catalogNames: string[];
}

const textInput =
  "w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground shadow-xs focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-border bg-card rounded-xl border p-5 shadow-sm">
      <h2 className="mb-3 text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Check({
  name,
  label,
  checked,
  onChange,
}: {
  name: string;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="text-foreground flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        name={name}
        checked={checked}
        onChange={(e) => {
          onChange(e.target.checked);
        }}
        className="accent-primary size-4"
      />
      {label}
    </label>
  );
}

export default function ReportForm({ action, slug, month, initial, catalogNames }: Props) {
  const [wpCoreVersion, setWpCoreVersion] = useState(initial.wp_core_version ?? "");
  const [wpCoreUpdated, setWpCoreUpdated] = useState(initial.wp_core_updated);
  const [phpUpdated, setPhpUpdated] = useState(initial.php_updated);
  const [phpFrom, setPhpFrom] = useState(initial.php_from_version ?? "");
  const [phpTo, setPhpTo] = useState(initial.php_to_version ?? "");
  const [integrityStatus, setIntegrityStatus] = useState(initial.integrity_status ?? "");
  const [integrityIssues, setIntegrityIssues] = useState(initial.integrity_issues ?? "");
  const [fixesApplied, setFixesApplied] = useState(initial.fixes_applied ?? "");
  const [notesToClient, setNotesToClient] = useState(initial.notes_to_client ?? "");
  const [plugins, setPlugins] = useState<VersionRow[]>(initial.plugins);
  const [themes, setThemes] = useState<VersionRow[]>(initial.themes);
  const [licenses, setLicenses] = useState<LicenseRow[]>(initial.licenses);
  const [clientError, setClientError] = useState<string | undefined>();
  const { submit, pending } = useSubmit();

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    // Light client validation mirroring the server parser's schema. Empty
    // version/notes fields are fine; a repeater row with a blank name is the
    // common mistake worth catching before the round-trip.
    const result = reportInputSchema.safeParse({
      wp_core_version: wpCoreVersion,
      wp_core_updated: wpCoreUpdated,
      php_updated: phpUpdated,
      php_from_version: phpFrom,
      php_to_version: phpTo,
      integrity_status: integrityStatus,
      integrity_issues: integrityIssues,
      fixes_applied: fixesApplied,
      notes_to_client: notesToClient,
      plugins,
      themes,
      licenses,
    });
    if (!result.success) {
      setClientError(result.error.issues[0]?.message ?? "Please check the form");
      return;
    }
    setClientError(undefined);

    // Serialize straight from the form element so the repeater fields
    // (plugins[i].name, checkboxes, etc.) match the server parser's contract
    // exactly — no manual re-mapping.
    const fd = new FormData(e.currentTarget);
    const res = await submit(action, fd);
    if (res.ok) {
      // Save persisted. The PDF-render-failed case comes back as a warning
      // (still saved), everything else as a plain success.
      if (res.warning) toastWarning(res.message);
      else toastSuccess(res.message);
    } else {
      // A server-side validation error has no field mapping here (the report
      // form is one big payload); surface it in the form's error area.
      setClientError(res.error);
      toastError(res.error);
    }
  }

  return (
    <form className="space-y-5" onSubmit={(e) => void handleSubmit(e)} noValidate>
      <input type="hidden" name="slug" value={slug} />

      <Section title="Month">
        <p className="text-foreground text-sm">{month}</p>
        <p className="text-muted-foreground mt-1 text-xs">Set automatically from the report&apos;s creation date.</p>
      </Section>

      <Section title="WordPress core">
        <div className="space-y-3">
          <input
            name="wp_core_version"
            value={wpCoreVersion}
            onChange={(e) => {
              setWpCoreVersion(e.target.value);
            }}
            placeholder="Core version (e.g. 6.5.2)"
            aria-label="WordPress core version"
            className={textInput}
          />
          <Check
            name="wp_core_updated"
            label="Updated this cycle"
            checked={wpCoreUpdated}
            onChange={setWpCoreUpdated}
          />
        </div>
      </Section>

      <Section title="PHP">
        <div className="space-y-3">
          <Check name="php_updated" label="Updated this cycle" checked={phpUpdated} onChange={setPhpUpdated} />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              name="php_from_version"
              value={phpFrom}
              onChange={(e) => {
                setPhpFrom(e.target.value);
              }}
              placeholder="from (e.g. 8.1)"
              aria-label="PHP from version"
              className={textInput}
            />
            <input
              name="php_to_version"
              value={phpTo}
              onChange={(e) => {
                setPhpTo(e.target.value);
              }}
              placeholder="to (e.g. 8.2)"
              aria-label="PHP to version"
              className={textInput}
            />
          </div>
        </div>
      </Section>

      <Section title="Plugins">
        <RowsRepeater kind="plugins" rows={plugins} onChange={setPlugins} catalogNames={catalogNames} />
      </Section>

      <Section title="Themes">
        <RowsRepeater kind="themes" rows={themes} onChange={setThemes} />
      </Section>

      <Section title="Integrity checks">
        <div className="space-y-3">
          <input
            name="integrity_status"
            value={integrityStatus}
            onChange={(e) => {
              setIntegrityStatus(e.target.value);
            }}
            placeholder="Status (e.g. Passed / Issues found)"
            aria-label="Integrity status"
            className={textInput}
          />
          <textarea
            name="integrity_issues"
            value={integrityIssues}
            onChange={(e) => {
              setIntegrityIssues(e.target.value);
            }}
            placeholder="Issues found (leave empty if none)"
            aria-label="Integrity issues"
            rows={3}
            className={textInput}
          />
        </div>
      </Section>

      <Section title="Fixes applied">
        <textarea
          name="fixes_applied"
          value={fixesApplied}
          onChange={(e) => {
            setFixesApplied(e.target.value);
          }}
          placeholder="What was fixed this cycle"
          aria-label="Fixes applied"
          rows={3}
          className={textInput}
        />
      </Section>

      <Section title="License renewals">
        <LicensesRepeater rows={licenses} onChange={setLicenses} />
      </Section>

      <Section title="Notes to client">
        <textarea
          name="notes_to_client"
          value={notesToClient}
          onChange={(e) => {
            setNotesToClient(e.target.value);
          }}
          placeholder="Client-facing notes — the only field shown to the client"
          aria-label="Notes to client"
          rows={4}
          className={textInput}
        />
      </Section>

      <ServerError message={clientError} />

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? (
          <span className="flex items-center gap-2">
            <span className="border-primary-foreground/30 border-t-primary-foreground size-4 animate-spin rounded-full border-2" />
            Saving...
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <Save className="size-4" />
            Save report
          </span>
        )}
      </Button>
    </form>
  );
}
