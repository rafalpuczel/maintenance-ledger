import type { APIRoute } from "astro";
import { createSupabaseClient } from "@/lib/supabase";
import { deleteReport } from "@/lib/reports/queries";
import { actionOk, actionError } from "@/lib/ui/response";

export const POST: APIRoute = async (context) => {
  const id = context.params.id ?? "";
  const form = await context.request.formData();
  const slug = (form.get("slug") as string | null) ?? "";

  try {
    await deleteReport(createSupabaseClient(), id);
    return actionOk({ message: "Report deleted.", data: { id }, redirectTo: `/projects/${slug}` });
  } catch {
    return actionError({ error: "Could not delete the report" }, 500);
  }
};
