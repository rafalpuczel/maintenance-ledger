import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database.types";
import type { EmailTemplatesInput } from "./schema";

export type EmailTemplates = Database["public"]["Tables"]["email_templates"]["Row"];

type Client = SupabaseClient<Database>;

// Single-row sentinel: every row uses the same primary key, so there is only
// ever one email_templates row and upsert always targets it (mirrors
// brand-settings/queries.ts).
const SINGLETON_ID = true;

export async function getEmailTemplates(client: Client): Promise<EmailTemplates | null> {
  const { data, error } = await client.from("email_templates").select("*").maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return data;
}

// Callers pass already-sanitized body HTML (the form/route layer sanitizes
// before persist). Upsert always hits the singleton row.
export async function upsertEmailTemplates(client: Client, input: EmailTemplatesInput): Promise<EmailTemplates> {
  const { data, error } = await client
    .from("email_templates")
    .upsert({ id: SINGLETON_ID, ...input }, { onConflict: "id" })
    .select("*")
    .single();
  if (error) {
    throw new Error(error.message);
  }
  return data;
}
