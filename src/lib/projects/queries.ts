import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { ProjectInput } from "@/lib/projects/schema";

export type Project = Database["public"]["Tables"]["projects"]["Row"];

type Client = SupabaseClient<Database>;

// Postgres unique_violation. Surfaced distinctly so callers can map a slug
// collision to a friendly message instead of a 500.
const UNIQUE_VIOLATION = "23505";

export class SlugTakenError extends Error {
  constructor() {
    super("A project with that slug already exists");
    this.name = "SlugTakenError";
  }
}

export async function listProjects(client: Client): Promise<Project[]> {
  const { data, error } = await client.from("projects").select("*").order("created_at", { ascending: false });
  if (error) {
    throw new Error(error.message);
  }
  return data;
}

export async function getProjectBySlug(client: Client, slug: string): Promise<Project | null> {
  const { data, error } = await client.from("projects").select("*").eq("slug", slug).maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return data;
}

export async function createProject(client: Client, input: ProjectInput): Promise<Project> {
  const { data, error } = await client.from("projects").insert(input).select("*").single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      throw new SlugTakenError();
    }
    throw new Error(error.message);
  }
  return data;
}

export async function updateProject(client: Client, id: string, input: ProjectInput): Promise<Project> {
  const { data, error } = await client.from("projects").update(input).eq("id", id).select("*").single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      throw new SlugTakenError();
    }
    throw new Error(error.message);
  }
  return data;
}

export async function deleteProject(client: Client, id: string): Promise<void> {
  const { error } = await client.from("projects").delete().eq("id", id);
  if (error) {
    throw new Error(error.message);
  }
}
