import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { promoteToCatalog } from "@/lib/plugins-catalog/queries";

type Client = SupabaseClient<Database>;

// A project's recurring-plugins row, flattened with its catalog plugin for the
// UI. `id` is the junction row's id (the delete target); the rest is the joined
// plugin_catalog entry. This is the read S-06 (report-authoring) will reuse to
// seed a new report's plugin repeater.
export interface RecurringPlugin {
  id: string;
  pluginId: string;
  name: string;
  notes: string | null;
}

// Postgres unique_violation on (project_id, plugin_id). Surfaced distinctly so
// the route maps a re-add to a friendly message instead of a 500.
const UNIQUE_VIOLATION = "23505";

export class AlreadyOnListError extends Error {
  constructor() {
    super("That plugin is already on this project's list");
    this.name = "AlreadyOnListError";
  }
}

// Shape of the nested PostgREST select below: the junction id plus the embedded
// catalog row. supabase-js types the embedded relation as an array by default,
// so we read plugin[0] defensively even though the FK is to-one.
interface JoinedRow {
  id: string;
  plugin:
    | { id: string; name: string; notes: string | null }
    | { id: string; name: string; notes: string | null }[]
    | null;
}

function flatten(row: JoinedRow): RecurringPlugin | null {
  const plugin = Array.isArray(row.plugin) ? row.plugin[0] : row.plugin;
  if (!plugin) {
    return null;
  }
  return { id: row.id, pluginId: plugin.id, name: plugin.name, notes: plugin.notes };
}

export async function listRecurringPlugins(client: Client, projectId: string): Promise<RecurringPlugin[]> {
  const { data, error } = await client
    .from("project_recurring_plugins")
    .select("id, plugin:plugin_catalog(id, name, notes)")
    .eq("project_id", projectId)
    .order("name", { referencedTable: "plugin_catalog", ascending: true });
  if (error) {
    throw new Error(error.message);
  }
  return (data as JoinedRow[]).map(flatten).filter((r): r is RecurringPlugin => r !== null);
}

export async function addRecurringPluginById(client: Client, projectId: string, pluginId: string): Promise<void> {
  const { error } = await client
    .from("project_recurring_plugins")
    .insert({ project_id: projectId, plugin_id: pluginId });
  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      throw new AlreadyOnListError();
    }
    throw new Error(error.message);
  }
}

// Free-text add: promote the name into the catalog (idempotent — an existing
// name resolves to its row), look the id back up by the normalized name_key,
// then link it. Reuses the catalog's promote hook so every recurring entry ends
// up catalog-backed.
export async function addRecurringPluginByName(client: Client, projectId: string, name: string): Promise<void> {
  await promoteToCatalog(client, name);
  const { data, error } = await client
    .from("plugin_catalog")
    .select("id")
    .eq("name_key", name.trim().toLowerCase())
    .single();
  if (error) {
    throw new Error(error.message);
  }
  await addRecurringPluginById(client, projectId, data.id);
}

export async function removeRecurringPlugin(client: Client, id: string): Promise<void> {
  const { error } = await client.from("project_recurring_plugins").delete().eq("id", id);
  if (error) {
    throw new Error(error.message);
  }
}
