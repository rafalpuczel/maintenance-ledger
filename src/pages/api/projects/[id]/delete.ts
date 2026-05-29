import type { APIRoute } from "astro";
import { createSupabaseClient } from "@/lib/supabase";
import { deleteProject } from "@/lib/projects/queries";

export const POST: APIRoute = async (context) => {
  const id = context.params.id ?? "";
  const form = await context.request.formData();
  const returnSlug = (form.get("_return_slug") as string | null) ?? "";

  try {
    await deleteProject(createSupabaseClient(), id);
    return context.redirect("/projects?ok=deleted");
  } catch {
    const back = returnSlug ? `/projects/${returnSlug}` : "/projects";
    return context.redirect(`${back}?error=${encodeURIComponent("Could not delete the project")}`);
  }
};
