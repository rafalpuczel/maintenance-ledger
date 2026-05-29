import type { APIRoute } from "astro";
import { createSupabaseClient } from "@/lib/supabase";
import { deleteContact } from "@/lib/pm-contacts/queries";

export const POST: APIRoute = async (context) => {
  const id = context.params.id ?? "";

  try {
    await deleteContact(createSupabaseClient(), id);
    return context.redirect("/pm-contacts?ok=deleted");
  } catch {
    return context.redirect(`/pm-contacts?error=${encodeURIComponent("Could not delete the contact")}`);
  }
};
