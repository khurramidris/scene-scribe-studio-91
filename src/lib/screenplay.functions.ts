import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  clampShotDuration,
  screenplayJsonSchema,
  screenplaySchema,
  shotSchema,
  shotsJsonSchema,
  shotsSchema,
  singleSceneJsonSchema,
  singleSceneSchema,
} from "@/modules/screenplay/screenplay.schemas";

const SYSTEM = `You are a professional screenwriter and first assistant director for short-form serialised drama.
You write producible, performable material with concrete visual action.
Respect every piece of approved material you are given: never contradict it, build on it.
Return ONLY data that matches the requested schema.`;

/** Shared production brief used by every generation entry point below. */
async function buildBrief(
  supabase: any,
  projectId: string,
  episodeId: string | null,
): Promise<{ lines: string[]; project: any; episode: any; characters: any[] }> {
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .maybeSingle();
  if (projectError) throw new Error(projectError.message);
  if (!project) throw new Error("Production not found.");

  const [{ data: bible }, { data: characters }, { data: relationships }, { data: outlines }] =
    await Promise.all([
      supabase.from("story_bibles").select("*").eq("project_id", projectId).maybeSingle(),
      supabase
        .from("characters")
        .select(
          "id, name, role, description, personality, motivation, arc, appearance_prompt, status",
        )
        .eq("project_id", projectId),
      supabase
        .from("character_relationships")
        .select("from_character_id, to_character_id, relationship, description")
        .eq("project_id", projectId),
      supabase.from("story_outlines").select("*").eq("project_id", projectId),
    ]);

  let episode: any = null;
  if (episodeId) {
    const { data } = await supabase.from("episodes").select("*").eq("id", episodeId).maybeSingle();
    episode = data;
    if (!episode) throw new Error("Episode not found.");
  }

  const nameById = new Map<string, string>(
    (characters ?? []).map((c: any) => [c.id as string, c.name as string]),
  );

  // Continuity: what already happened in earlier episodes of the production.
  let previousEvents: string[] = [];
  if (episode) {
    const { data: earlier } = await supabase
      .from("scenes")
      .select("heading, objective, episode_id, sort_order, episodes!inner(number)")
      .eq("project_id", projectId)
      .lt("episodes.number", episode.number)
      .order("sort_order", { ascending: true })
      .limit(40);
    previousEvents = (earlier ?? []).map((s: any) =>
      `- ${s.heading}: ${s.objective ?? ""}`.slice(0, 220),
    );
  }

  const episodeOutline = episodeId
    ? ((outlines ?? []).find((o: any) => o.episode_id === episodeId && o.status === "approved") ??
      (outlines ?? []).find((o: any) => o.episode_id === episodeId))
    : null;
  const seasonOutline = (outlines ?? []).find(
    (o: any) => o.scope === "season" && o.status === "approved",
  );

  const lines = [
    `Title: ${project.title}`,
    project.premise ? `Premise: ${project.premise}` : null,
    project.logline ? `Logline: ${project.logline}` : null,
    project.genre ? `Genre: ${project.genre}` : null,
    project.tone ? `Tone: ${project.tone}` : null,
    project.target_audience ? `Target audience: ${project.target_audience}` : null,
    `Format: ${project.format === "vertical_9_16" ? "vertical 9:16 microdrama — fast hooks, tight framing, 60-120s episodes" : "horizontal 16:9 television drama"}`,
    bible?.world ? `Approved world: ${bible.world}` : null,
    bible?.central_conflict ? `Central conflict: ${bible.central_conflict}` : null,
    Array.isArray(bible?.themes) && bible.themes.length
      ? `Themes: ${JSON.stringify(bible.themes)}`
      : null,
    Array.isArray(bible?.narrative_rules) && bible.narrative_rules.length
      ? `Narrative rules (must be respected): ${JSON.stringify(bible.narrative_rules)}`
      : null,
    bible?.tone_guidelines ? `Tone guidelines: ${bible.tone_guidelines}` : null,
    seasonOutline?.summary ? `Season outline: ${seasonOutline.summary}` : null,
    episode ? `Episode ${episode.number}: ${episode.title}` : null,
    episode?.logline ? `Episode logline: ${episode.logline}` : null,
    episode?.synopsis ? `Episode synopsis: ${episode.synopsis}` : null,
    episodeOutline
      ? `Episode outline beats: ${JSON.stringify(episodeOutline.beats).slice(0, 2500)}`
      : null,
    characters?.length
      ? `Cast (use these exact names):\n${characters
          .map((c: any) =>
            `- ${c.name} (${c.role ?? "role tbd"}): ${c.personality ?? ""} Motivation: ${c.motivation ?? ""} Arc: ${c.arc ?? ""}`.slice(
              0,
              320,
            ),
          )
          .join("\n")}`
      : null,
    relationships?.length
      ? `Relationships: ${relationships
          .map(
            (r: any) =>
              `${nameById.get(r.from_character_id) ?? "?"} → ${nameById.get(r.to_character_id) ?? "?"}: ${r.relationship}`,
          )
          .join("; ")}`
      : null,
    previousEvents.length ? `Previous episode events:\n${previousEvents.join("\n")}` : null,
  ].filter(Boolean) as string[];

  return { lines, project, episode, characters: characters ?? [] };
}

/** Finds or creates the reusable location row for a scene's location name. */
async function resolveLocation(
  supabase: any,
  projectId: string,
  ownerId: string,
  name: string,
  setting: "interior" | "exterior" | "other",
): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const { data: existing } = await supabase
    .from("locations")
    .select("id")
    .eq("project_id", projectId)
    .ilike("name", trimmed)
    .maybeSingle();
  if (existing?.id) return existing.id as string;
  const { data: created, error } = await supabase
    .from("locations")
    .insert({ project_id: projectId, owner_id: ownerId, name: trimmed, setting })
    .select("id")
    .single();
  if (error) return null;
  return created.id as string;
}

async function linkCharactersByName(
  supabase: any,
  table: "scene_characters" | "shot_characters",
  parentKey: "scene_id" | "shot_id",
  parentId: string,
  projectId: string,
  ownerId: string,
  names: string[],
  cast: any[],
): Promise<void> {
  const rows = names
    .map((name) => cast.find((c) => String(c.name).toLowerCase() === name.trim().toLowerCase()))
    .filter(Boolean)
    .map((c: any) => ({
      project_id: projectId,
      owner_id: ownerId,
      character_id: c.id,
      [parentKey]: parentId,
    }));
  if (!rows.length) return;
  await supabase.from(table).upsert(rows, { onConflict: `${parentKey},character_id` });
}

/* ------------------------------------------------------------------ */
/* Screenplay generation                                               */
/* ------------------------------------------------------------------ */

const GenerateScreenplayInput = z.object({
  projectId: z.string().uuid(),
  episodeId: z.string().uuid(),
  language: z.string().min(2).max(12),
  targetDurationSeconds: z.number().int().min(20).max(3600),
  instructions: z.string().max(2000).optional(),
});

export const generateScreenplay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => GenerateScreenplayInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { lines, project, characters } = await buildBrief(
      supabase,
      data.projectId,
      data.episodeId,
    );

    const sceneTarget = project.format === "vertical_9_16" ? "4-8" : "8-16";
    const prompt = [
      `Write the complete screenplay for this episode as ${sceneTarget} structured scenes.`,
      `The whole episode must play in roughly ${data.targetDurationSeconds} seconds of screen time; set estimated_duration_seconds per scene so the total matches.`,
      `Every scene needs a slugline-style heading, the interior/exterior setting, the location name, time of day, the dramatic objective, concrete visual action, atmosphere and lighting notes, props, wardrobe, the participating character names, and performable dialogue.`,
      `Use only the cast names given below when a listed character appears.`,
      data.instructions ? `Producer direction: ${data.instructions}` : null,
      ``,
      `Production brief:`,
      ...lines,
    ]
      .filter((l) => l !== null)
      .join("\n");

    const { resolveTextProvider } = await import("@/services/ai/text.registry.server");
    const provider = resolveTextProvider();
    const result = await provider.generateStructured({
      schemaName: "episode_screenplay",
      schema: screenplayJsonSchema,
      system: SYSTEM,
      prompt,
      language: data.language,
    });

    const parsed = screenplaySchema.safeParse(result.data);
    if (!parsed.success) {
      throw new Error("The AI returned data that did not match the expected structure. Try again.");
    }

    const meta = {
      provider: result.provider,
      model: result.model,
      task: "screenplay",
      generated_at: new Date().toISOString(),
    };

    // Append-only versioning: a new draft version, never an overwrite.
    const { data: versions } = await supabase
      .from("screenplays")
      .select("version")
      .eq("episode_id", data.episodeId)
      .order("version", { ascending: false })
      .limit(1);
    const nextVersion = (versions?.[0]?.version ?? 0) + 1;

    const { data: screenplay, error: screenplayError } = await supabase
      .from("screenplays")
      .insert({
        project_id: data.projectId,
        episode_id: data.episodeId,
        owner_id: userId,
        version: nextVersion,
        title: parsed.data.title,
        logline: parsed.data.logline,
        language: data.language,
        instructions: data.instructions ?? null,
        target_duration_seconds: data.targetDurationSeconds,
        is_ai_generated: true,
        is_mock: result.isMock,
        generation_metadata: meta,
      })
      .select("*")
      .single();
    if (screenplayError) throw new Error(screenplayError.message);

    const scenes = parsed.data.scenes;
    for (let index = 0; index < scenes.length; index += 1) {
      const scene = scenes[index]!;
      const locationId = await resolveLocation(
        supabase,
        data.projectId,
        userId,
        scene.location_name,
        scene.setting,
      );
      const { data: sceneRow, error: sceneError } = await supabase
        .from("scenes")
        .insert({
          project_id: data.projectId,
          screenplay_id: screenplay.id,
          episode_id: data.episodeId,
          owner_id: userId,
          scene_number: index + 1,
          sort_order: index,
          heading: scene.heading,
          setting: scene.setting,
          location_id: locationId,
          location_name: scene.location_name,
          time_of_day: scene.time_of_day,
          objective: scene.objective,
          action: scene.action,
          dialogue: scene.dialogue,
          props: scene.props,
          wardrobe: scene.wardrobe,
          atmosphere: scene.atmosphere,
          lighting: scene.lighting,
          estimated_duration_seconds: Math.max(1, Math.round(scene.estimated_duration_seconds)),
          is_ai_generated: true,
          is_mock: result.isMock,
          generation_metadata: meta,
        })
        .select("*")
        .single();
      if (sceneError) throw new Error(sceneError.message);
      await linkCharactersByName(
        supabase,
        "scene_characters",
        "scene_id",
        sceneRow.id,
        data.projectId,
        userId,
        scene.characters,
        characters,
      );
    }

    return {
      screenplayId: screenplay.id as string,
      sceneCount: scenes.length,
      isMock: result.isMock,
    };
  });

/* ------------------------------------------------------------------ */
/* Single-scene regeneration                                           */
/* ------------------------------------------------------------------ */

const RegenerateSceneInput = z.object({
  sceneId: z.string().uuid(),
  instructions: z.string().max(2000).optional(),
});

export const regenerateScene = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RegenerateSceneInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: scene, error } = await supabase
      .from("scenes")
      .select("*")
      .eq("id", data.sceneId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!scene) throw new Error("Scene not found.");
    if (scene.status === "approved") {
      throw new Error("This scene is approved. Unlock it before regenerating.");
    }

    const { lines, characters } = await buildBrief(supabase, scene.project_id, scene.episode_id);
    const { data: screenplayRow } = await supabase
      .from("screenplays")
      .select("language")
      .eq("id", scene.screenplay_id)
      .maybeSingle();
    const sceneLanguage = screenplayRow?.language ?? "en";
    const { data: siblings } = await supabase
      .from("scenes")
      .select("scene_number, heading, objective")
      .eq("screenplay_id", scene.screenplay_id)
      .order("sort_order", { ascending: true });

    const prompt = [
      `Rewrite scene ${scene.scene_number} only. Keep it consistent with the surrounding scenes; do not rewrite them.`,
      `Current heading: ${scene.heading}`,
      `Current objective: ${scene.objective ?? ""}`,
      data.instructions ? `Producer direction: ${data.instructions}` : null,
      `Scene order in this episode:\n${(siblings ?? [])
        .map((s: any) => `${s.scene_number}. ${s.heading} — ${s.objective ?? ""}`)
        .join("\n")}`,
      ``,
      `Production brief:`,
      ...lines,
    ]
      .filter((l) => l !== null)
      .join("\n");

    const { resolveTextProvider } = await import("@/services/ai/text.registry.server");
    const provider = resolveTextProvider();
    const result = await provider.generateStructured({
      schemaName: "single_scene",
      schema: singleSceneJsonSchema,
      system: SYSTEM,
      prompt,
      language: sceneLanguage,
    });

    const parsed = singleSceneSchema.safeParse(result.data);
    if (!parsed.success) {
      throw new Error("The AI returned data that did not match the expected structure. Try again.");
    }

    // Archive the current version first; abort if that write fails.
    const { error: revisionError } = await supabase.from("content_revisions").insert({
      project_id: scene.project_id,
      owner_id: userId,
      entity_type: "scene",
      entity_id: scene.id,
      content: scene as never,
      note: "Superseded by AI regeneration",
    });
    if (revisionError) {
      throw new Error("The previous scene could not be archived, so nothing was changed.");
    }

    const next = parsed.data.scene;
    const locationId = await resolveLocation(
      supabase,
      scene.project_id,
      userId,
      next.location_name,
      next.setting,
    );
    const { data: updated, error: updateError } = await supabase
      .from("scenes")
      .update({
        heading: next.heading,
        setting: next.setting,
        location_id: locationId,
        location_name: next.location_name,
        time_of_day: next.time_of_day,
        objective: next.objective,
        action: next.action,
        dialogue: next.dialogue as never,
        props: next.props as never,
        wardrobe: next.wardrobe as never,
        atmosphere: next.atmosphere,
        lighting: next.lighting,
        estimated_duration_seconds: Math.max(1, Math.round(next.estimated_duration_seconds)),
        is_ai_generated: true,
        is_mock: result.isMock,
        generation_metadata: {
          provider: result.provider,
          model: result.model,
          task: "scene_regeneration",
          generated_at: new Date().toISOString(),
        },
      })
      .eq("id", scene.id)
      .select("*")
      .single();
    if (updateError) throw new Error(updateError.message);

    await linkCharactersByName(
      supabase,
      "scene_characters",
      "scene_id",
      scene.id,
      scene.project_id,
      userId,
      next.characters,
      characters,
    );

    return { scene: updated, isMock: result.isMock };
  });

/* ------------------------------------------------------------------ */
/* Shot planning                                                       */
/* ------------------------------------------------------------------ */

const GenerateShotsInput = z.object({
  sceneId: z.string().uuid(),
  maxShotSeconds: z.number().min(1).max(20).default(5),
  instructions: z.string().max(2000).optional(),
});

export const generateShots = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => GenerateShotsInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: scene, error } = await supabase
      .from("scenes")
      .select("*")
      .eq("id", data.sceneId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!scene) throw new Error("Scene not found.");

    const { lines, characters } = await buildBrief(supabase, scene.project_id, scene.episode_id);

    // Approved shots are kept exactly as they are; only drafts are replaced.
    const { data: existingShots } = await supabase
      .from("shots")
      .select("*")
      .eq("scene_id", scene.id)
      .order("sort_order", { ascending: true });
    const approvedShots = (existingShots ?? []).filter((s: any) => s.status === "approved");

    // Character appearance continuity comes from approved reference images.
    const { data: approvedRefs } = await supabase
      .from("character_references")
      .select("id, character_id, kind, prompt, status")
      .eq("project_id", scene.project_id)
      .eq("status", "approved");

    const appearanceById = new Map<string, string>();
    for (const ref of approvedRefs ?? []) {
      if (ref.prompt) appearanceById.set(ref.character_id as string, ref.prompt as string);
    }

    const prompt = [
      `Break this single scene into a cinematic shot list for AI image-to-video production.`,
      `No shot may be longer than ${data.maxShotSeconds} seconds; split coverage accordingly.`,
      `Scene heading: ${scene.heading}`,
      `Setting: ${scene.setting} — ${scene.location_name ?? ""} — ${scene.time_of_day ?? ""}`,
      `Objective: ${scene.objective ?? ""}`,
      `Action: ${scene.action ?? ""}`,
      `Dialogue: ${JSON.stringify(scene.dialogue).slice(0, 3000)}`,
      `Atmosphere: ${scene.atmosphere ?? ""} Lighting: ${scene.lighting ?? ""}`,
      `Props: ${JSON.stringify(scene.props)} Wardrobe: ${JSON.stringify(scene.wardrobe)}`,
      approvedShots.length
        ? `These shots are already approved and must not be duplicated:\n${approvedShots
            .map((s: any) => `- ${s.shot_number}. ${s.description ?? ""}`)
            .join("\n")}`
        : null,
      characters.length
        ? `Locked character appearances (reuse verbatim inside image_prompt):\n${characters
            .map((c: any) =>
              `- ${c.name}: ${appearanceById.get(c.id) ?? c.appearance_prompt ?? "appearance not locked"}`.slice(
                0,
                400,
              ),
            )
            .join("\n")}`
        : null,
      `image_prompt must be a self-contained visual description in English for a still frame generator, including the locked character appearance, wardrobe, location, time of day and lighting.`,
      `video_prompt must describe the motion from that still frame: character action, camera movement and pacing.`,
      `continuity must carry character positions, how the previous shot ended, camera direction and the intended start state of the next shot.`,
      data.instructions ? `Producer direction: ${data.instructions}` : null,
      ``,
      `Production brief:`,
      ...lines,
    ]
      .filter((l) => l !== null)
      .join("\n");

    const { resolveTextProvider } = await import("@/services/ai/text.registry.server");
    const provider = resolveTextProvider();
    const result = await provider.generateStructured({
      schemaName: "scene_shot_list",
      schema: shotsJsonSchema,
      system: SYSTEM,
      prompt,
      language: "en",
    });

    const parsed = shotsSchema.safeParse(result.data);
    if (!parsed.success) {
      throw new Error("The AI returned data that did not match the expected structure. Try again.");
    }

    // One atomic database call: archive drafts, delete them, keep every
    // approved shot at its original sequence position with its identifier, and
    // insert the new drafts around them. Any failure rolls the whole thing back,
    // so the existing shot list is never left half-replaced.
    const meta = {
      provider: result.provider,
      model: result.model,
      task: "shot_breakdown",
      generated_at: new Date().toISOString(),
      is_mock: result.isMock,
    };

    const payload = parsed.data.shots.map((shot) => ({
      ...shot,
      duration_seconds: clampShotDuration(shot.duration_seconds),
    }));

    const { data: shots, error: rpcError } = await supabase.rpc("regenerate_scene_shots", {
      p_scene_id: scene.id,
      p_shots: payload as never,
      p_meta: meta as never,
    });
    if (rpcError) {
      throw new Error(`The shot list could not be rebuilt, so nothing changed: ${rpcError.message}`);
    }

    return {
      created: payload.length,
      keptApproved: approvedShots.length,
      total: (shots ?? []).length,
      isMock: result.isMock,
    };
  });

