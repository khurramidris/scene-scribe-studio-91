import { supabase } from "@/integrations/supabase/client";

import type {
  CreateProjectInput,
  Episode,
  Project,
  UpdateProjectInput,
} from "./project.types";

/**
 * Data-access layer for projects. All reads/writes are scoped by RLS to the
 * signed-in owner; the service never trusts a client-supplied owner id beyond
 * the current session.
 */

async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("You must be signed in.");
  return data.user.id;
}

export async function listProjects(): Promise<Project[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getProject(id: string): Promise<Project | null> {
  const { data, error } = await supabase.from("projects").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function createProject(input: CreateProjectInput): Promise<Project> {
  const ownerId = await requireUserId();
  const { data, error } = await supabase
    .from("projects")
    .insert({
      owner_id: ownerId,
      title: input.title.trim(),
      logline: input.logline?.trim() || null,
      genre: input.genre?.trim() || null,
      tone: input.tone?.trim() || null,
      format: input.format,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateProject(id: string, patch: UpdateProjectInput): Promise<Project> {
  const { data, error } = await supabase
    .from("projects")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteProject(id: string): Promise<void> {
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function listEpisodes(projectId: string): Promise<Episode[]> {
  const { data, error } = await supabase
    .from("episodes")
    .select("*")
    .eq("project_id", projectId)
    .order("number", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createEpisode(projectId: string, title: string): Promise<Episode> {
  const ownerId = await requireUserId();
  const existing = await listEpisodes(projectId);
  const nextNumber = existing.reduce((max, ep) => Math.max(max, ep.number), 0) + 1;

  const { data, error } = await supabase
    .from("episodes")
    .insert({
      project_id: projectId,
      owner_id: ownerId,
      title: title.trim(),
      number: nextNumber,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteEpisode(id: string): Promise<void> {
  const { error } = await supabase.from("episodes").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
