import { supabase } from "@/integrations/supabase/client";

import type { ApprovalStatus, StoryArtifact, StoryBible, StoryOutline } from "./story.types";

async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("You must be signed in.");
  return data.user.id;
}

export async function listArtifacts(projectId: string): Promise<StoryArtifact[]> {
  const { data, error } = await supabase
    .from("story_artifacts")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getBible(projectId: string): Promise<StoryBible | null> {
  const { data, error } = await supabase
    .from("story_bibles")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function listOutlines(projectId: string): Promise<StoryOutline[]> {
  const { data, error } = await supabase
    .from("story_outlines")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Records the previous state before an edit so revisions are recoverable. */
async function snapshot(
  projectId: string,
  entityType: string,
  entityId: string,
  content: unknown,
  note: string,
): Promise<void> {
  const ownerId = await requireUserId();
  await supabase.from("content_revisions").insert({
    project_id: projectId,
    owner_id: ownerId,
    entity_type: entityType,
    entity_id: entityId,
    content: content as never,
    note,
  });
}

export async function listRevisions(entityType: string, entityId: string) {
  const { data, error } = await supabase
    .from("content_revisions")
    .select("*")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function updateArtifact(
  artifact: StoryArtifact,
  patch: { title?: string | null; content?: string },
): Promise<StoryArtifact> {
  await snapshot(artifact.project_id, "story_artifact", artifact.id, artifact, "Manual edit");
  const { data, error } = await supabase
    .from("story_artifacts")
    .update(patch)
    .eq("id", artifact.id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function setArtifactStatus(
  id: string,
  status: ApprovalStatus,
): Promise<StoryArtifact> {
  const { data, error } = await supabase
    .from("story_artifacts")
    .update({ status })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteArtifact(id: string): Promise<void> {
  const { error } = await supabase.from("story_artifacts").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function createArtifact(
  projectId: string,
  kind: StoryArtifact["kind"],
  title: string,
  content: string,
  language: string,
): Promise<StoryArtifact> {
  const ownerId = await requireUserId();
  const { data, error } = await supabase
    .from("story_artifacts")
    .insert({ project_id: projectId, owner_id: ownerId, kind, title, content, language })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function saveBible(
  projectId: string,
  patch: Partial<Pick<StoryBible, "world" | "central_conflict" | "themes" | "narrative_rules" | "tone_guidelines" | "status" | "language">>,
  previous?: StoryBible | null,
): Promise<StoryBible> {
  const ownerId = await requireUserId();
  if (previous) {
    await snapshot(projectId, "story_bible", previous.id, previous, "Manual edit");
  }
  const { data, error } = await supabase
    .from("story_bibles")
    .upsert({ project_id: projectId, owner_id: ownerId, ...patch }, { onConflict: "project_id" })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function setOutlineStatus(id: string, status: ApprovalStatus): Promise<StoryOutline> {
  const { data, error } = await supabase
    .from("story_outlines")
    .update({ status })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateOutline(
  outline: StoryOutline,
  patch: { summary?: string | null; beats?: unknown },
): Promise<StoryOutline> {
  await snapshot(outline.project_id, "story_outline", outline.id, outline, "Manual edit");
  const { data, error } = await supabase
    .from("story_outlines")
    .update(patch as never)
    .eq("id", outline.id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteOutline(id: string): Promise<void> {
  const { error } = await supabase.from("story_outlines").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
