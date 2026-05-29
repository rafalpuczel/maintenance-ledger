import type { APIRoute } from "astro";
import { createSupabaseClient } from "@/lib/supabase";
import { updateContact, EmailTakenError } from "@/lib/pm-contacts/queries";
import { parsePmContactForm } from "@/lib/pm-contacts/form";

export const POST: APIRoute = async (context) => {
  const id = context.params.id ?? "";
  const form = await context.request.formData();
  const parsed = parsePmContactForm(form);
  if (!parsed.ok) {
    return context.redirect(`/pm-contacts?error=${encodeURIComponent(parsed.message)}`);
  }

  try {
    await updateContact(createSupabaseClient(), id, parsed.data);
    return context.redirect("/pm-contacts?ok=updated");
  } catch (err) {
    const message = err instanceof EmailTakenError ? err.message : "Could not update the contact";
    return context.redirect(`/pm-contacts?error=${encodeURIComponent(message)}`);
  }
};
