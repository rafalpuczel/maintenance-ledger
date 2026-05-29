import type { APIRoute } from "astro";
import { createSupabaseClient } from "@/lib/supabase";
import { createContact, EmailTakenError } from "@/lib/pm-contacts/queries";
import { parsePmContactForm } from "@/lib/pm-contacts/form";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const parsed = parsePmContactForm(form);
  if (!parsed.ok) {
    return context.redirect(`/pm-contacts?error=${encodeURIComponent(parsed.message)}`);
  }

  try {
    await createContact(createSupabaseClient(), parsed.data);
    return context.redirect("/pm-contacts?ok=created");
  } catch (err) {
    const message = err instanceof EmailTakenError ? err.message : "Could not add the contact";
    return context.redirect(`/pm-contacts?error=${encodeURIComponent(message)}`);
  }
};
