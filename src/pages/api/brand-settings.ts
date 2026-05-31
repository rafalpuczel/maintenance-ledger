import type { APIRoute } from "astro";
import { createSupabaseClient } from "@/lib/supabase";
import { upsertBrand } from "@/lib/brand-settings/queries";
import { parseBrandForm } from "@/lib/brand-settings/form";
import { actionOk, actionError } from "@/lib/ui/response";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const parsed = await parseBrandForm(form);
  if (!parsed.ok) {
    return actionError({ error: parsed.message });
  }

  try {
    const brand = await upsertBrand(createSupabaseClient(), parsed.data);
    return actionOk({ message: "Brand settings saved.", data: brand });
  } catch {
    return actionError({ error: "Could not save brand settings" }, 500);
  }
};
