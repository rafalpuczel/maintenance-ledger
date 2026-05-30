import { useState } from "react";
import { Save } from "lucide-react";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import RowsRepeater, { type VersionRow } from "@/components/reports/RowsRepeater";
import LicensesRepeater from "@/components/reports/LicensesRepeater";
import type { LicenseRow, PluginRow, ThemeRow } from "@/lib/reports/schema";
import { reportInputSchema } from "@/lib/reports/schema";

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
  // project slug, posted as a hidden field so the server redirects back here
  slug: string;
  month: string;
  initial: ReportFormInitial;
  catalogNames: string[];
  serverError?: string | null;
}

const textInput =
  "w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white placeholder-white/30 focus:ring-2 focus:ring-purple-400 focus:outline-none";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
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
    <label className="flex items-center gap-2 text-sm text-blue-100/80">
      <input
        type="checkbox"
        name={name}
        checked={checked}
        onChange={(e) => {
          onChange(e.target.checked);
        }}
        className="size-4 accent-purple-500"
      />
      {label}
    </label>
  );
}

export default function ReportForm({ action, slug, month, initial, catalogNames, serverError }: Props) {
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

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
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
      e.preventDefault();
      setClientError(result.error.issues[0]?.message ?? "Please check the form");
    }
  }

  return (
    <form method="POST" action={action} className="space-y-5" onSubmit={handleSubmit} noValidate>
      <input type="hidden" name="slug" value={slug} />

      <Section title="Month">
        <p className="text-sm text-blue-100/70">{month}</p>
        <p className="mt-1 text-xs text-blue-100/40">Set automatically from the report&apos;s creation date.</p>
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
              className={textInput}
            />
            <input
              name="php_to_version"
              value={phpTo}
              onChange={(e) => {
                setPhpTo(e.target.value);
              }}
              placeholder="to (e.g. 8.2)"
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
            className={textInput}
          />
          <textarea
            name="integrity_issues"
            value={integrityIssues}
            onChange={(e) => {
              setIntegrityIssues(e.target.value);
            }}
            placeholder="Issues found (leave empty if none)"
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
          rows={4}
          className={textInput}
        />
      </Section>

      <ServerError message={clientError ?? serverError} />

      <SubmitButton pendingText="Saving..." icon={<Save className="size-4" />}>
        Save report
      </SubmitButton>
    </form>
  );
}
