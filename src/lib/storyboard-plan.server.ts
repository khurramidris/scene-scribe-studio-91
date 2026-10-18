import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { ReferenceAsset } from "./reference-images.server";

function checked<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

/** Resolve explicit shot choices, then inherit the scene's set when no override exists. */
export async function buildFramePlan(supabase: SupabaseClient<Database>, shotId: string) {
  const shot = checked(await supabase.from("shots").select("*").eq("id", shotId).maybeSingle());
  if (!shot) throw new Error("Shot not found.");

  const [projectResult, sceneResult, linkResult] = await Promise.all([
    supabase.from("projects").select("format, tone, genre").eq("id", shot.project_id).maybeSingle(),
    supabase
      .from("scenes")
      .select("*")
      .eq("id", shot.scene_id)
      .eq("project_id", shot.project_id)
      .maybeSingle(),
    supabase
      .from("shot_characters")
      .select("character_id, character_reference_id")
      .eq("shot_id", shot.id)
      .eq("project_id", shot.project_id),
  ]);
  const project = checked(projectResult);
  const scene = checked(sceneResult);
  const links = checked(linkResult) ?? [];
  const characterIds = links.map((link) => link.character_id);
  const characters = characterIds.length
    ? (checked(
        await supabase
          .from("characters")
          .select("id, name, appearance_prompt, description, approved_reference_id")
          .in("id", characterIds)
          .eq("project_id", shot.project_id),
      ) ?? [])
    : [];
  const refs = characterIds.length
    ? (checked(
        await supabase
          .from("character_references")
          .select("id, character_id, prompt, storage_path, is_mock")
          .in("character_id", characterIds)
          .eq("project_id", shot.project_id)
          .eq("status", "approved"),
      ) ?? [])
    : [];

  const referenceAssets: ReferenceAsset[] = [];
  const castLines = characters.map((character) => {
    const link = links.find((item) => item.character_id === character.id);
    const referenceId = link?.character_reference_id ?? character.approved_reference_id;
    const locked = refs.find((ref) => ref.character_id === character.id && ref.id === referenceId);
    if (referenceId && !locked) {
      throw new Error(
        `The selected image for ${character.name} is no longer approved. Lock in a reference before generating this shot.`,
      );
    }
    if (locked?.storage_path && !locked.is_mock) {
      referenceAssets.push({
        id: locked.id,
        type: "character",
        storagePath: locked.storage_path,
        label: `Character identity: ${character.name}. Preserve this person's face and appearance.`,
      });
    }
    return `${character.name}: ${character.appearance_prompt || locked?.prompt || character.description || "appearance not locked"}`;
  });

  const locationId = shot.location_id ?? scene?.location_id;
  const location = locationId
    ? checked(
        await supabase
          .from("locations")
          .select(
            "id, name, description, atmosphere, reference_prompt, reference_storage_path, status",
          )
          .eq("id", locationId)
          .eq("project_id", shot.project_id)
          .maybeSingle(),
      )
    : null;
  if (locationId && !location)
    throw new Error("The selected set was not found in this production.");
  if (location?.status === "approved" && location.reference_storage_path) {
    referenceAssets.push({
      id: location.id,
      type: "location",
      storagePath: location.reference_storage_path,
      label: `Set / location: ${location.name}. Preserve its architecture, layout and furnishings; adapt the camera angle to this shot.`,
    });
  }

  const prompt = [
    shot.image_prompt || shot.description || "Cinematic still frame.",
    shot.framing ? `Framing: ${shot.framing}.` : "",
    shot.shot_type ? `Shot type: ${shot.shot_type}.` : "",
    shot.camera_angle ? `Camera angle: ${shot.camera_angle}.` : "",
    castLines.length ? `Characters (keep these identities exactly): ${castLines.join(" | ")}.` : "",
    location
      ? `Location: ${location.name}. ${location.description ?? ""} ${location.reference_prompt ?? ""} ${location.atmosphere ?? ""}`
      : scene?.location_name
        ? `Location: ${scene.location_name}.`
        : "",
    scene?.time_of_day ? `Time of day: ${scene.time_of_day}.` : "",
    shot.lighting ? `Lighting: ${shot.lighting}.` : "",
    shot.emotional_tone ? `Mood: ${shot.emotional_tone}.` : "",
    shot.continuity ? `Continuity: ${JSON.stringify(shot.continuity)}.` : "",
    "Single cinematic storyboard frame, film still, no text, no watermark, no split panels.",
  ]
    .filter(Boolean)
    .join(" ");
  const aspect: "portrait" | "landscape" =
    project?.format === "horizontal_16_9" ? "landscape" : "portrait";
  return { shot, prompt, aspect, referenceAssets };
}
