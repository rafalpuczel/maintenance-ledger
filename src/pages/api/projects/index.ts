import type { APIRoute } from "astro";
import { createSupabaseClient } from "@/lib/supabase";
import { createProject, SlugTakenError } from "@/lib/projects/queries";
import { parseProjectForm } from "@/lib/projects/form";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const parsed = parseProjectForm(form);
  if (!parsed.ok) {
    return context.redirect(`/projects/new?error=${encodeURIComponent(parsed.message)}`);
  }

  try {
    const project = await createProject(createSupabaseClient(), parsed.data);
    return context.redirect(`/projects/${project.slug}?ok=created`);
  } catch (err) {
    const message = err instanceof SlugTakenError ? err.message : "Could not create the project";
    return context.redirect(`/projects/new?error=${encodeURIComponent(message)}`);
  }
};
