import { supabase } from "@/integrations/supabase/client";

import type {
  Character,
  CharacterInput,
  CharacterReference,
  CharacterRelationship,
} from "./character.types";

async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("You must be signed in.");
  return data.user.id;
}

export async function listCharacters(projectId: string): Promise<Character[]> {
  const { data, error } = await supabase
    .from("characters")
    .select("*")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createCharacter(
  projectId: string,
  input: CharacterInput,
): Promise<Character> {
  const ownerId = await requireUserId();
  const existing = await listCharacters(projectId);
  const { data, error } = await supabase
    .from("characters")
    .insert({
      project_id: projectId,
      owner_id: ownerId,
      sort_order: existing.length,
      name: input.name.trim(),
      role: input.role?.trim() || null,
      age_range: input.age_range?.trim() || null,
      description: input.description?.trim() || null,
      personality: input.personality?.trim() || null,
      motivation: input.motivation?.trim() || null,
      backstory: input.backstory?.trim() || null,
      arc: input.arc?.trim() || null,
      appearance_prompt: input.appearance_prompt?.trim() || null,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateCharacter(
  character: Character,
  patch: Partial<Character>,
): Promise<Character> {
  const ownerId = await requireUserId();
  await supabase.from("content_revisions").insert({
    project_id: character.project_id,
    owner_id: ownerId,
    entity_type: "character",
    entity_id: character.id,
    content: character as never,
    note: "Manual edit",
  });
  const { data, error } = await supabase
    .from("characters")
    .update(patch)
    .eq("id", character.id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteCharacter(id: string): Promise<void> {
  const { error } = await supabase.from("characters").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function listReferences(projectId: string): Promise<CharacterReference[]> {
  const { data, error } = await supabase
    .from("character_references")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function deleteReference(id: string): Promise<void> {
  const { error } = await supabase.from("character_references").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Locks a character's visual identity: the chosen reference becomes approved
 * and the character points at it. Previously approved references of the same
 * character are demoted to draft, never deleted.
 */
export async function approveReference(reference: CharacterReference): Promise<void> {
  const { error: demoteError } = await supabase
    .from("character_references")
    .update({ status: "draft" })
    .eq("character_id", reference.character_id)
    .eq("status", "approved");
  if (demoteError) throw new Error(demoteError.message);

  const { error } = await supabase
    .from("character_references")
    .update({ status: "approved" })
    .eq("id", reference.id);
  if (error) throw new Error(error.message);

  const { error: charError } = await supabase
    .from("characters")
    .update({ approved_reference_id: reference.id, status: "approved" })
    .eq("id", reference.character_id);
  if (charError) throw new Error(charError.message);
}

export async function listRelationships(projectId: string): Promise<CharacterRelationship[]> {
  const { data, error } = await supabase
    .from("character_relationships")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createRelationship(
  projectId: string,
  fromId: string,
  toId: string,
  relationship: string,
  description?: string,
): Promise<CharacterRelationship> {
  const ownerId = await requireUserId();
  const { data, error } = await supabase
    .from("character_relationships")
    .insert({
      project_id: projectId,
      owner_id: ownerId,
      from_character_id: fromId,
      to_character_id: toId,
      relationship: relationship.trim(),
      description: description?.trim() || null,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteRelationship(id: string): Promise<void> {
  const { error } = await supabase.from("character_relationships").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
