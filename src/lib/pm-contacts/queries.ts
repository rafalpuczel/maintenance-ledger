import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { PmContactInput } from "@/lib/pm-contacts/schema";

export type PmContact = Database["public"]["Tables"]["pm_contacts"]["Row"];

type Client = SupabaseClient<Database>;

// Postgres unique_violation. Surfaced distinctly so callers can map an email
// collision to a friendly message instead of a 500.
const UNIQUE_VIOLATION = "23505";

export class EmailTakenError extends Error {
  constructor() {
    super("That email is already in the contact list");
    this.name = "EmailTakenError";
  }
}

export async function listContacts(client: Client): Promise<PmContact[]> {
  const { data, error } = await client.from("pm_contacts").select("*").order("name", { ascending: true });
  if (error) {
    throw new Error(error.message);
  }
  return data;
}

export async function createContact(client: Client, input: PmContactInput): Promise<PmContact> {
  const { data, error } = await client.from("pm_contacts").insert(input).select("*").single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      throw new EmailTakenError();
    }
    throw new Error(error.message);
  }
  return data;
}

export async function updateContact(client: Client, id: string, input: PmContactInput): Promise<PmContact> {
  const { data, error } = await client.from("pm_contacts").update(input).eq("id", id).select("*").single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      throw new EmailTakenError();
    }
    throw new Error(error.message);
  }
  return data;
}

export async function deleteContact(client: Client, id: string): Promise<void> {
  const { error } = await client.from("pm_contacts").delete().eq("id", id);
  if (error) {
    throw new Error(error.message);
  }
}
