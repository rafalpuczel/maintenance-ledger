import type { APIRoute } from "astro";
import { createSupabaseClient } from "@/lib/supabase";
import { upsertEmailTemplates } from "@/lib/email-templates/queries";
import { parseEmailTemplatesForm } from "@/lib/email-templates/form";
import { actionOk, actionError } from "@/lib/ui/response";

// POST /api/email-templates — persist the two outbound-email templates (PM +
// client). Mirrors /api/brand-settings: parse + sanitize + validate, then upsert
// the singleton row. Inherits the session gate from middleware (path not in
// PUBLIC_PATHS).
export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const parsed = parseEmailTemplatesForm(form);
  if (!parsed.ok) {
    return actionError({ error: parsed.message });
  }

  try {
    const templates = await upsertEmailTemplates(createSupabaseClient(), parsed.data);
    return actionOk({ message: "Email templates saved.", data: templates });
  } catch {
    return actionError({ error: "Could not save email templates" }, 500);
  }
};
