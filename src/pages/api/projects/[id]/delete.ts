import type { APIRoute } from "astro";
import { createSupabaseClient } from "@/lib/supabase";
import { deleteProject } from "@/lib/projects/queries";
import { actionOk, actionError } from "@/lib/ui/response";

export const POST: APIRoute = async (context) => {
  const id = context.params.id ?? "";

  try {
    await deleteProject(createSupabaseClient(), id);
    return actionOk({ message: "Project deleted.", data: { id }, redirectTo: "/projects" });
  } catch {
    return actionError({ error: "Could not delete the project" }, 500);
  }
};
