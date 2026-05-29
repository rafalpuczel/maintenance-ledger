import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_SECRET_KEY } from "astro:env/server";
import type { Database } from "@/types/database.types";

// Per-request factory, never a module-level singleton: on workerd a shared
// client can leak state across requests. The Worker talks to Supabase only over
// HTTP/PostgREST with the sb_secret_ key (bypasses RLS); this app runs its own
// HMAC session, so Supabase Auth session persistence is turned off.
export function createSupabaseClient(): SupabaseClient<Database> {
  return createClient<Database>(SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: { persistSession: false },
  });
}
