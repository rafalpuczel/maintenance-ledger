import type { APIRoute } from "astro";
import { createSupabaseClient } from "@/lib/supabase";
import { upsertBrand } from "@/lib/brand-settings/queries";
import { parseBrandForm } from "@/lib/brand-settings/form";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const parsed = await parseBrandForm(form);
  if (!parsed.ok) {
    return context.redirect(`/brand-settings?error=${encodeURIComponent(parsed.message)}`);
  }

  try {
    await upsertBrand(createSupabaseClient(), parsed.data);
    return context.redirect("/brand-settings?ok=saved");
  } catch {
    return context.redirect("/brand-settings?error=Could%20not%20save%20brand%20settings");
  }
};
