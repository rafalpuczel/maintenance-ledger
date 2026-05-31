import type { APIRoute } from "astro";
import { createSupabaseClient } from "@/lib/supabase";
import { updateProject, SlugTakenError } from "@/lib/projects/queries";
import { parseProjectForm } from "@/lib/projects/form";
import { actionOk, actionError } from "@/lib/ui/response";

export const POST: APIRoute = async (context) => {
  const id = context.params.id ?? "";
  const form = await context.request.formData();

  const parsed = parseProjectForm(form);
  if (!parsed.ok) {
    return actionError({ error: parsed.message, field: parsed.field });
  }

  try {
    const project = await updateProject(createSupabaseClient(), id, parsed.data);
    // The slug may have changed; the client navigates to the canonical detail URL.
    return actionOk({ message: "Changes saved.", data: project, redirectTo: `/projects/${project.slug}` });
  } catch (err) {
    if (err instanceof SlugTakenError) {
      return actionError({ error: err.message, field: "slug" });
    }
    return actionError({ error: "Could not update the project" }, 500);
  }
};
