import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { LicenseRow, PluginRow, ReportInput, ThemeRow } from "./schema";
import { listRecurringPlugins } from "@/lib/project-recurring-plugins/queries";
import { promoteToCatalog } from "@/lib/plugins-catalog/queries";

type Client = SupabaseClient<Database>;
type ReportRow = Database["public"]["Tables"]["reports"]["Row"];

// The reports row with its jsonb columns narrowed from `Json` to the zod row
// shapes the app actually stores. The DB types these three as `Json`; we own
// the row shape via schema.ts, so we assert it on read.
export type Report = Omit<ReportRow, "plugins" | "themes" | "licenses"> & {
  plugins: PluginRow[];
  themes: ThemeRow[];
  licenses: LicenseRow[];
};

// Lightweight shape for the per-project list (FR-011).
export interface ReportSummary {
  id: string;
  month: string;
  created_at: string;
}

function toReport(row: ReportRow): Report {
  return {
    ...row,
    plugins: (row.plugins as PluginRow[] | null) ?? [],
    themes: (row.themes as ThemeRow[] | null) ?? [],
    licenses: (row.licenses as LicenseRow[] | null) ?? [],
  };
}

// Frozen cycle label (e.g. "2026-05") derived server-side from the creation
// date. FR-014: month is auto from the date the report is created, never typed.
function currentMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

// Create a new report on a project. The plugins repeater is seeded at create-time
// from the project's recurring-plugins list (FR-009 consumption) — each recurring
// entry becomes an editable plugin row with version fields blank. Themes/licenses
// start empty; scalars null/false. This is a one-time copy; later edits to the
// project's recurring list do not retro-fill existing reports.
export async function createReport(client: Client, projectId: string): Promise<Report> {
  const recurring = await listRecurringPlugins(client, projectId);
  const seededPlugins: PluginRow[] = recurring.map((r) => ({
    name: r.name,
    updated: false,
    from_version: null,
    to_version: null,
  }));

  const { data, error } = await client
    .from("reports")
    .insert({ project_id: projectId, month: currentMonth(), plugins: seededPlugins })
    .select("*")
    .single();
  if (error) {
    throw new Error(error.message);
  }
  return toReport(data);
}

export async function getReport(client: Client, id: string): Promise<Report | null> {
  const { data, error } = await client.from("reports").select("*").eq("id", id).maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return data ? toReport(data) : null;
}

export async function listReportsByProject(client: Client, projectId: string): Promise<ReportSummary[]> {
  const { data, error } = await client
    .from("reports")
    .select("id, month, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) {
    throw new Error(error.message);
  }
  return data;
}

// Replace-all save: overwrite every editable scalar column and all three jsonb
// repeater arrays in one update. Every plugin-row name is promoted into the
// catalog (FR-003) — promoteToCatalog is an idempotent upsert, so existing names
// no-op and blank names are skipped. `month` is immutable after creation and is
// not touched here.
export async function updateReport(client: Client, id: string, input: ReportInput): Promise<void> {
  const { error } = await client
    .from("reports")
    .update({
      wp_core_version: input.wp_core_version,
      wp_core_updated: input.wp_core_updated,
      php_updated: input.php_updated,
      php_from_version: input.php_from_version,
      php_to_version: input.php_to_version,
      integrity_status: input.integrity_status,
      integrity_issues: input.integrity_issues,
      fixes_applied: input.fixes_applied,
      notes_to_client: input.notes_to_client,
      plugins: input.plugins,
      themes: input.themes,
      licenses: input.licenses,
    })
    .eq("id", id);
  if (error) {
    throw new Error(error.message);
  }

  for (const row of input.plugins) {
    await promoteToCatalog(client, row.name);
  }
}

export async function deleteReport(client: Client, id: string): Promise<void> {
  const { error } = await client.from("reports").delete().eq("id", id);
  if (error) {
    throw new Error(error.message);
  }
}
