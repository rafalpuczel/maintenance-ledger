import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { BrandSettingsInput } from "@/lib/brand-settings/schema";

export type Brand = Database["public"]["Tables"]["brand_settings"]["Row"];

type Client = SupabaseClient<Database>;

// Single-row sentinel: every row uses the same primary key, so there is only
// ever one brand_settings row and upsert always targets it.
const SINGLETON_ID = true;

// The logo is resolved by the form parser into one of three intents: set it to
// a new data-URI, clear it, or leave it untouched. "Untouched" is the absence
// of the `logo` key so the upsert's ON CONFLICT UPDATE never writes the column.
export type LogoUpdate = { logo: string } | { logo: null } | { logo?: never };

export type BrandUpsert = BrandSettingsInput & LogoUpdate;

export async function getBrand(client: Client): Promise<Brand | null> {
  const { data, error } = await client.from("brand_settings").select("*").maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return data;
}

export async function upsertBrand(client: Client, input: BrandUpsert): Promise<Brand> {
  const { data, error } = await client
    .from("brand_settings")
    .upsert({ id: SINGLETON_ID, ...input }, { onConflict: "id" })
    .select("*")
    .single();
  if (error) {
    throw new Error(error.message);
  }
  return data;
}
