import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { PluginCatalogInput } from "@/lib/plugins-catalog/schema";

export type PluginCatalogEntry = Database["public"]["Tables"]["plugin_catalog"]["Row"];

type Client = SupabaseClient<Database>;

// Postgres unique_violation. Surfaced distinctly so callers can map a name
// collision to a friendly message instead of a 500.
const UNIQUE_VIOLATION = "23505";

export class NameTakenError extends Error {
  constructor() {
    super("That plugin is already in the catalog");
    this.name = "NameTakenError";
  }
}

export async function listCatalog(client: Client): Promise<PluginCatalogEntry[]> {
  const { data, error } = await client.from("plugin_catalog").select("*").order("name", { ascending: true });
  if (error) {
    throw new Error(error.message);
  }
  return data;
}

export async function createCatalogEntry(client: Client, input: PluginCatalogInput): Promise<PluginCatalogEntry> {
  const { data, error } = await client.from("plugin_catalog").insert(input).select("*").single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      throw new NameTakenError();
    }
    throw new Error(error.message);
  }
  return data;
}

export async function updateCatalogEntry(
  client: Client,
  id: string,
  input: PluginCatalogInput,
): Promise<PluginCatalogEntry> {
  const { data, error } = await client.from("plugin_catalog").update(input).eq("id", id).select("*").single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      throw new NameTakenError();
    }
    throw new Error(error.message);
  }
  return data;
}

export async function deleteCatalogEntry(client: Client, id: string): Promise<void> {
  const { error } = await client.from("plugin_catalog").delete().eq("id", id);
  if (error) {
    throw new Error(error.message);
  }
}

// Thin idempotent write S-06 calls per free-text report row: insert the plugin
// name if it is not already in the catalog, otherwise do nothing. Never
// overwrites an existing entry's notes. Safe to call blindly and concurrently —
// the name_key unique constraint + ignoreDuplicates closes the race. A
// blank/whitespace name is skipped.
export async function promoteToCatalog(client: Client, name: string): Promise<void> {
  if (name.trim() === "") {
    return;
  }
  const { error } = await client
    .from("plugin_catalog")
    .upsert({ name }, { onConflict: "name_key", ignoreDuplicates: true });
  if (error) {
    throw new Error(error.message);
  }
}
