import type { APIRoute } from "astro";
import { createSupabaseClient } from "@/lib/supabase";
import { createProject, SlugTakenError } from "@/lib/projects/queries";
import { parseProjectForm } from "@/lib/projects/form";
import { actionOk, actionError } from "@/lib/ui/response";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const parsed = parseProjectForm(form);
  if (!parsed.ok) {
    return actionError({ error: parsed.message, field: parsed.field });
  }

  try {
    const project = await createProject(createSupabaseClient(), parsed.data);
    return actionOk({ message: "Project created.", data: project, redirectTo: `/projects/${project.slug}` });
  } catch (err) {
    if (err instanceof SlugTakenError) {
      return actionError({ error: err.message, field: "slug" });
    }
    return actionError({ error: "Could not create the project" }, 500);
  }
};
