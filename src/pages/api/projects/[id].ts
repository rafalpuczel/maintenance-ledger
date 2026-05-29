import type { APIRoute } from "astro";
import { createSupabaseClient } from "@/lib/supabase";
import { updateProject, SlugTakenError } from "@/lib/projects/queries";
import { parseProjectForm } from "@/lib/projects/form";

export const POST: APIRoute = async (context) => {
  const id = context.params.id ?? "";
  const form = await context.request.formData();
  // The detail page sends its current slug so error-redirects land back on the
  // right detail URL even though the submitted slug may differ.
  const returnSlug = (form.get("_return_slug") as string | null) ?? "";
  const detailUrl = `/projects/${returnSlug}`;

  const parsed = parseProjectForm(form);
  if (!parsed.ok) {
    return context.redirect(`${detailUrl}?error=${encodeURIComponent(parsed.message)}`);
  }

  try {
    const project = await updateProject(createSupabaseClient(), id, parsed.data);
    return context.redirect(`/projects/${project.slug}?ok=updated`);
  } catch (err) {
    const message = err instanceof SlugTakenError ? err.message : "Could not update the project";
    return context.redirect(`${detailUrl}?error=${encodeURIComponent(message)}`);
  }
};
