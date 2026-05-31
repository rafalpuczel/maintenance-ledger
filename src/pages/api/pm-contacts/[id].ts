import type { APIRoute } from "astro";
import { createSupabaseClient } from "@/lib/supabase";
import { updateContact, EmailTakenError } from "@/lib/pm-contacts/queries";
import { parsePmContactForm } from "@/lib/pm-contacts/form";
import { actionOk, actionError } from "@/lib/ui/response";

export const POST: APIRoute = async (context) => {
  const id = context.params.id ?? "";
  const form = await context.request.formData();
  const parsed = parsePmContactForm(form);
  if (!parsed.ok) {
    return actionError({ error: parsed.message, field: parsed.field });
  }

  try {
    const contact = await updateContact(createSupabaseClient(), id, parsed.data);
    return actionOk({ message: "Changes saved.", data: contact });
  } catch (err) {
    if (err instanceof EmailTakenError) {
      return actionError({ error: err.message, field: "email" });
    }
    return actionError({ error: "Could not update the contact" }, 500);
  }
};
