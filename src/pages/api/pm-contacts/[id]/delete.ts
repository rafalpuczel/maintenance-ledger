import type { APIRoute } from "astro";
import { createSupabaseClient } from "@/lib/supabase";
import { deleteContact } from "@/lib/pm-contacts/queries";
import { actionOk, actionError } from "@/lib/ui/response";

export const POST: APIRoute = async (context) => {
  const id = context.params.id ?? "";

  try {
    await deleteContact(createSupabaseClient(), id);
    return actionOk({ message: "Contact removed.", data: { id } });
  } catch {
    return actionError({ error: "Could not delete the contact" }, 500);
  }
};
