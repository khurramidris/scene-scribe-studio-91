import { supabase } from "@/integrations/supabase/client";

import type { Scene, Screenplay, ProductionLocation } from "./screenplay.types";

async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("You must be signed in.");
  return data.user.id;
}

/**
 * Writes a recovery snapshot BEFORE the row is changed. If the snapshot cannot
 * be written the caller aborts, so an approved version is never lost because a
 * revision write failed.
 */
async function snapshot(
  projectId: string,
  entityType: string,
  entityId: string,
  content: unknown,
  note: string,
): Promise<void> {
  const ownerId = await requireUserId();
  const { error } = await supabase.from("content_revisions").insert({
    project_id: projectId,
    owner_id: ownerId,
    entity_type: entityType,
    entity_id: entityId,
    content: content as never,
    note,
  });
  if (error) {
    throw new Error(
      `The previous version could not be archived, so the change was cancelled: ${error.message}`,
    );
  }
}

export async function listScreenplays(projectId: string): Promise<Screenplay[]> {
  const { data, error } = await supabase
    .from("screenplays")
    .select("*")
    .eq("project_id", projectId)
    .order("version", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listScenes(screenplayId: string): Promise<Scene[]> {
  const { data, error } = await supabase
    .from("scenes")
    .select("*")
    .eq("screenplay_id", screenplayId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listProjectScenes(projectId: string): Promise<Scene[]> {
  const { data, error } = await supabase
    .from("scenes")
    .select("*")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function setScreenplayStatus(
  screenplay: Screenplay,
  status: Screenplay["status"],
): Promise<Screenplay> {
  const { data, error } = await supabase
    .from("screenplays")
    .update({ status })
    .eq("id", screenplay.id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateScreenplay(
  screenplay: Screenplay,
  patch: Partial<
    Pick<Screenplay, "title" | "logline" | "instructions" | "target_duration_seconds">
  >,
): Promise<Screenplay> {
  await snapshot(screenplay.project_id, "screenplay", screenplay.id, screenplay, "Manual edit");
  const { data, error } = await supabase
    .from("screenplays")
    .update(patch)
    .eq("id", screenplay.id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteScreenplay(screenplay: Screenplay): Promise<void> {
  if (screenplay.status === "approved") {
    throw new Error("Approved screenplays cannot be deleted. Unlock it first.");
  }
  const { error } = await supabase.from("screenplays").delete().eq("id", screenplay.id);
  if (error) throw new Error(error.message);
}

export type ScenePatch = Partial<
  Pick<
    Scene,
    | "heading"
    | "setting"
    | "location_id"
    | "location_name"
    | "time_of_day"
    | "objective"
    | "action"
    | "atmosphere"
    | "lighting"
    | "estimated_duration_seconds"
    | "scene_number"
    | "sort_order"
    | "status"
  >
> & { dialogue?: unknown; props?: unknown; wardrobe?: unknown };

export async function updateScene(scene: Scene, patch: ScenePatch): Promise<Scene> {
  await snapshot(scene.project_id, "scene", scene.id, scene, "Manual edit");
  const { data, error } = await supabase
    .from("scenes")
    .update(patch as never)
    .eq("id", scene.id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function setSceneStatus(id: string, status: Scene["status"]): Promise<Scene> {
  const { data, error } = await supabase
    .from("scenes")
    .update({ status })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteScene(scene: Scene): Promise<void> {
  if (scene.status === "approved") {
    throw new Error("Approved scenes cannot be deleted. Unlock the scene first.");
  }
  const { error } = await supabase.from("scenes").delete().eq("id", scene.id);
  if (error) throw new Error(error.message);
}

export async function createScene(screenplay: Screenplay, afterSortOrder: number): Promise<Scene> {
  const ownerId = await requireUserId();
  const { data, error } = await supabase
    .from("scenes")
    .insert({
      project_id: screenplay.project_id,
      screenplay_id: screenplay.id,
      episode_id: screenplay.episode_id,
      owner_id: ownerId,
      heading: "INT. NEW LOCATION - DAY",
      sort_order: afterSortOrder + 1,
      scene_number: afterSortOrder + 2,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function duplicateScene(scene: Scene): Promise<Scene> {
  const ownerId = await requireUserId();
  const { data, error } = await supabase
    .from("scenes")
    .insert({
      project_id: scene.project_id,
      screenplay_id: scene.screenplay_id,
      episode_id: scene.episode_id,
      owner_id: ownerId,
      heading: `${scene.heading} (copy)`,
      setting: scene.setting,
      location_id: scene.location_id,
      location_name: scene.location_name,
      time_of_day: scene.time_of_day,
      objective: scene.objective,
      action: scene.action,
      dialogue: scene.dialogue as never,
      props: scene.props as never,
      wardrobe: scene.wardrobe as never,
      atmosphere: scene.atmosphere,
      lighting: scene.lighting,
      estimated_duration_seconds: scene.estimated_duration_seconds,
      sort_order: scene.sort_order + 1,
      scene_number: scene.scene_number,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Pure helper (unit tested): produces the new ordering after moving one scene.
 */
export function reorderList<T extends { id: string }>(items: T[], id: string, delta: number): T[] {
  const index = items.findIndex((item) => item.id === id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= items.length) return items;
  const next = [...items];
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved!);
  return next;
}

/** Two-phase renumber so the (screenplay, sort_order) sequence never collides. */
export async function persistSceneOrder(scenes: Scene[]): Promise<void> {
  for (let i = 0; i < scenes.length; i += 1) {
    const { error } = await supabase
      .from("scenes")
      .update({ sort_order: 1000 + i })
      .eq("id", scenes[i]!.id);
    if (error) throw new Error(error.message);
  }
  for (let i = 0; i < scenes.length; i += 1) {
    const { error } = await supabase
      .from("scenes")
      .update({ sort_order: i, scene_number: i + 1 })
      .eq("id", scenes[i]!.id);
    if (error) throw new Error(error.message);
  }
}

export async function listSceneCharacters(projectId: string) {
  const { data, error } = await supabase
    .from("scene_characters")
    .select("*")
    .eq("project_id", projectId);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function addSceneCharacter(scene: Scene, characterId: string) {
  const ownerId = await requireUserId();
  const { error } = await supabase.from("scene_characters").insert({
    project_id: scene.project_id,
    scene_id: scene.id,
    character_id: characterId,
    owner_id: ownerId,
  });
  if (error) throw new Error(error.message);
}

export async function removeSceneCharacter(sceneId: string, characterId: string) {
  const { error } = await supabase
    .from("scene_characters")
    .delete()
    .eq("scene_id", sceneId)
    .eq("character_id", characterId);
  if (error) throw new Error(error.message);
}

export async function listLocations(projectId: string): Promise<ProductionLocation[]> {
  const { data, error } = await supabase
    .from("locations")
    .select("*")
    .eq("project_id", projectId)
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createLocation(
  projectId: string,
  name: string,
  setting: ProductionLocation["setting"] = "interior",
): Promise<ProductionLocation> {
  const ownerId = await requireUserId();
  const { data, error } = await supabase
    .from("locations")
    .insert({ project_id: projectId, owner_id: ownerId, name, setting })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateLocation(
  id: string,
  patch: Partial<
    Pick<
      ProductionLocation,
      "name" | "setting" | "description" | "atmosphere" | "reference_prompt" | "status"
    >
  >,
): Promise<ProductionLocation> {
  const { data, error } = await supabase
    .from("locations")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteLocation(id: string): Promise<void> {
  const { error } = await supabase.from("locations").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
