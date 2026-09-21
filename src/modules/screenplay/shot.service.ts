import { supabase } from "@/integrations/supabase/client";

import type { Scene, Shot } from "./screenplay.types";

async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("You must be signed in.");
  return data.user.id;
}

async function snapshot(shot: Shot, note: string): Promise<void> {
  const ownerId = await requireUserId();
  const { error } = await supabase.from("content_revisions").insert({
    project_id: shot.project_id,
    owner_id: ownerId,
    entity_type: "shot",
    entity_id: shot.id,
    content: shot as never,
    note,
  });
  if (error) {
    throw new Error(
      `The previous shot version could not be archived, so the change was cancelled: ${error.message}`,
    );
  }
}

export async function listShots(sceneId: string): Promise<Shot[]> {
  const { data, error } = await supabase
    .from("shots")
    .select("*")
    .eq("scene_id", sceneId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listEpisodeShots(episodeId: string): Promise<Shot[]> {
  const { data, error } = await supabase
    .from("shots")
    .select("*")
    .eq("episode_id", episodeId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export type ShotPatch = Partial<
  Pick<
    Shot,
    | "shot_type"
    | "framing"
    | "camera_angle"
    | "camera_movement"
    | "duration_seconds"
    | "description"
    | "action"
    | "dialogue"
    | "emotional_tone"
    | "lighting"
    | "sound_design"
    | "image_prompt"
    | "video_prompt"
    | "location_id"
    | "status"
    | "production_status"
    | "shot_number"
    | "sort_order"
  >
> & { continuity?: unknown; props?: unknown; wardrobe?: unknown };

export async function updateShot(shot: Shot, patch: ShotPatch): Promise<Shot> {
  await snapshot(shot, "Manual edit");
  const { data, error } = await supabase
    .from("shots")
    .update(patch as never)
    .eq("id", shot.id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function setShotStatus(id: string, status: Shot["status"]): Promise<Shot> {
  const { data, error } = await supabase
    .from("shots")
    .update({ status })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteShot(shot: Shot): Promise<void> {
  if (shot.status === "approved") {
    throw new Error("Approved shots cannot be deleted. Unlock the shot first.");
  }
  const { error } = await supabase.from("shots").delete().eq("id", shot.id);
  if (error) throw new Error(error.message);
}

export async function createShot(scene: Scene, afterSortOrder: number): Promise<Shot> {
  const ownerId = await requireUserId();
  const { data, error } = await supabase
    .from("shots")
    .insert({
      project_id: scene.project_id,
      episode_id: scene.episode_id,
      screenplay_id: scene.screenplay_id,
      scene_id: scene.id,
      owner_id: ownerId,
      location_id: scene.location_id,
      shot_type: "Medium",
      camera_angle: "Eye level",
      camera_movement: "Static",
      duration_seconds: 5,
      sort_order: afterSortOrder + 1,
      shot_number: afterSortOrder + 2,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function duplicateShot(shot: Shot): Promise<Shot> {
  const ownerId = await requireUserId();
  const { data, error } = await supabase
    .from("shots")
    .insert({
      project_id: shot.project_id,
      episode_id: shot.episode_id,
      screenplay_id: shot.screenplay_id,
      scene_id: shot.scene_id,
      owner_id: ownerId,
      location_id: shot.location_id,
      shot_type: shot.shot_type,
      framing: shot.framing,
      camera_angle: shot.camera_angle,
      camera_movement: shot.camera_movement,
      duration_seconds: shot.duration_seconds,
      description: shot.description,
      action: shot.action,
      dialogue: shot.dialogue,
      emotional_tone: shot.emotional_tone,
      lighting: shot.lighting,
      sound_design: shot.sound_design,
      image_prompt: shot.image_prompt,
      video_prompt: shot.video_prompt,
      props: shot.props as never,
      wardrobe: shot.wardrobe as never,
      continuity: shot.continuity as never,
      sort_order: shot.sort_order + 1,
      shot_number: shot.shot_number,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/** Two-phase renumber so the ordering never collides mid-update. */
export async function persistShotOrder(shots: Shot[]): Promise<void> {
  for (let i = 0; i < shots.length; i += 1) {
    const { error } = await supabase
      .from("shots")
      .update({ sort_order: 1000 + i })
      .eq("id", shots[i]!.id);
    if (error) throw new Error(error.message);
  }
  for (let i = 0; i < shots.length; i += 1) {
    const { error } = await supabase
      .from("shots")
      .update({ sort_order: i, shot_number: i + 1 })
      .eq("id", shots[i]!.id);
    if (error) throw new Error(error.message);
  }
}

export async function listShotCharacters(projectId: string) {
  const { data, error } = await supabase
    .from("shot_characters")
    .select("*")
    .eq("project_id", projectId);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function addShotCharacter(
  shot: Shot,
  characterId: string,
  referenceId?: string | null,
) {
  const ownerId = await requireUserId();
  const { error } = await supabase.from("shot_characters").insert({
    project_id: shot.project_id,
    shot_id: shot.id,
    character_id: characterId,
    character_reference_id: referenceId ?? null,
    owner_id: ownerId,
  });
  if (error) throw new Error(error.message);
}

export async function removeShotCharacter(shotId: string, characterId: string) {
  const { error } = await supabase
    .from("shot_characters")
    .delete()
    .eq("shot_id", shotId)
    .eq("character_id", characterId);
  if (error) throw new Error(error.message);
}
