import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const STORYBOARD_BUCKET = "storyboard-frames";
export const VIDEO_BUCKET = "shot-videos";

/** Hard ceiling on how many frames one batch request may produce. */
export const MAX_BATCH_FRAMES = 24;

type Ctx = { supabase: any; userId: string };

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return binary.length ? btoa(binary) : "";
}

/** Builds the storyboard prompt from approved shot, character and location material. */
async function buildFramePlan(supabase: any, shotId: string) {
  const { data: shot, error } = await supabase
    .from("shots")
    .select("*")
    .eq("id", shotId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!shot) throw new Error("Shot not found.");

  const [{ data: project }, { data: scene }, { data: links }] = await Promise.all([
    supabase.from("projects").select("format, tone, genre").eq("id", shot.project_id).maybeSingle(),
    supabase.from("scenes").select("*").eq("id", shot.scene_id).maybeSingle(),
    supabase.from("shot_characters").select("character_id").eq("shot_id", shot.id),
  ]);

  const characterIds = (links ?? []).map((l: any) => l.character_id);
  const { data: characters } = characterIds.length
    ? await supabase
        .from("characters")
        .select("id, name, appearance_prompt, description")
        .in("id", characterIds)
    : { data: [] as any[] };

  const { data: refs } = characterIds.length
    ? await supabase
        .from("character_references")
        .select("id, character_id, prompt, storage_path, status, kind")
        .in("character_id", characterIds)
        .eq("status", "approved")
    : { data: [] as any[] };

  const { data: location } = shot.location_id
    ? await supabase
        .from("locations")
        .select("name, description, atmosphere, reference_prompt, reference_storage_path")
        .eq("id", shot.location_id)
        .maybeSingle()
    : { data: null };

  const refByCharacter = new Map<string, any>();
  for (const ref of refs ?? []) if (!refByCharacter.has(ref.character_id)) refByCharacter.set(ref.character_id, ref);

  const castLines = (characters ?? []).map((c: any) => {
    const locked = refByCharacter.get(c.id);
    return `${c.name}: ${locked?.prompt ?? c.appearance_prompt ?? c.description ?? "appearance not locked"}`;
  });

  const continuity =
    shot.continuity && typeof shot.continuity === "object" ? JSON.stringify(shot.continuity) : "";

  const prompt = [
    shot.image_prompt || shot.description || "Cinematic still frame.",
    shot.framing ? `Framing: ${shot.framing}.` : "",
    shot.shot_type ? `Shot type: ${shot.shot_type}.` : "",
    shot.camera_angle ? `Camera angle: ${shot.camera_angle}.` : "",
    castLines.length ? `Characters (keep these identities exactly): ${castLines.join(" | ")}.` : "",
    location
      ? `Location: ${location.name}. ${location.reference_prompt ?? location.description ?? ""} ${location.atmosphere ?? ""}`
      : scene?.location_name
        ? `Location: ${scene.location_name}.`
        : "",
    scene?.time_of_day ? `Time of day: ${scene.time_of_day}.` : "",
    shot.lighting ? `Lighting: ${shot.lighting}.` : "",
    shot.emotional_tone ? `Mood: ${shot.emotional_tone}.` : "",
    continuity ? `Continuity: ${continuity}.` : "",
    "Single cinematic storyboard frame, film still, no text, no watermark, no split panels.",
  ]
    .filter(Boolean)
    .join(" ");

  const aspect: "portrait" | "landscape" =
    project?.format === "horizontal_16_9" ? "landscape" : "portrait";

  const referencePaths = (refs ?? [])
    .map((r: any) => r.storage_path)
    .filter((p: any): p is string => typeof p === "string")
    .slice(0, 3);

  return { shot, prompt, aspect, referencePaths, refIds: (refs ?? []).map((r: any) => r.id) };
}

async function loadReferenceImages(paths: string[]) {
  if (!paths.length) return [];
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const loaded: { base64: string; mimeType: string; label: string }[] = [];
  for (const path of paths) {
    const { data, error } = await supabaseAdmin.storage.from("character-references").download(path);
    if (error || !data) continue;
    const bytes = new Uint8Array(await data.arrayBuffer());
    const mimeType = data.type && data.type !== "application/octet-stream" ? data.type : "image/png";
    if (mimeType === "image/svg+xml") continue; // mock placeholder, never condition on it
    loaded.push({ base64: toBase64(bytes), mimeType, label: path });
  }
  return loaded;
}

/** Generates one storyboard alternative for a shot and records it as a job. */
async function renderFrame(ctx: Ctx, shotId: string, extraPrompt?: string, useReferences = true) {
  const { supabase, userId } = ctx;
  const plan = await buildFramePlan(supabase, shotId);
  const shot = plan.shot;

  const { resolveImageProvider } = await import("@/services/ai/image.registry.server");
  const provider = resolveImageProvider();

  const references =
    useReferences && provider.supportsReferenceImages
      ? await loadReferenceImages(plan.referencePaths)
      : [];

  const fullPrompt = [plan.prompt, extraPrompt].filter(Boolean).join(" ");

  const { data: job, error: jobError } = await supabase
    .from("production_jobs")
    .insert({
      project_id: shot.project_id,
      owner_id: userId,
      episode_id: shot.episode_id,
      scene_id: shot.scene_id,
      shot_id: shot.id,
      job_type: "storyboard_image",
      state: "submitting",
      provider: provider.name,
      model: "image",
      request: { prompt: fullPrompt, aspect: plan.aspect, references: references.length },
      is_mock: provider.isMock,
      idempotency_key: `frame:${shot.id}:${crypto.randomUUID()}`,
      submitted_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (jobError) throw new Error(jobError.message);

  try {
    const image = await provider.generate({
      prompt: fullPrompt,
      aspect: plan.aspect,
      references,
    });
    const bytes = Uint8Array.from(atob(image.base64), (c) => c.charCodeAt(0));
    const ext = image.contentType === "image/svg+xml" ? "svg" : "png";
    const path = `${userId}/${shot.project_id}/${shot.id}/${crypto.randomUUID()}.${ext}`;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: uploadError } = await supabaseAdmin.storage
      .from(STORYBOARD_BUCKET)
      .upload(path, bytes, { contentType: image.contentType, upsert: false });
    if (uploadError) throw new Error(`Could not store the frame: ${uploadError.message}`);

    const { count } = await supabase
      .from("storyboard_frames")
      .select("id", { count: "exact", head: true })
      .eq("shot_id", shot.id);

    const { data: frame, error: frameError } = await supabase
      .from("storyboard_frames")
      .insert({
        project_id: shot.project_id,
        episode_id: shot.episode_id,
        scene_id: shot.scene_id,
        shot_id: shot.id,
        owner_id: userId,
        version: (count ?? 0) + 1,
        prompt: fullPrompt,
        provider: image.provider,
        model: image.model,
        generation_params: { aspect: plan.aspect, contentType: image.contentType },
        reference_inputs: plan.refIds,
        used_reference_conditioning: image.usedReferenceConditioning,
        storage_path: path,
        mime_type: image.contentType,
        file_size_bytes: bytes.byteLength,
        aspect: plan.aspect,
        is_mock: image.isMock,
        job_id: job.id,
      })
      .select("*")
      .single();
    if (frameError) throw new Error(frameError.message);

    await supabase
      .from("production_jobs")
      .update({
        state: "completed",
        progress: 100,
        result_kind: "storyboard_frame",
        result_asset_id: frame.id,
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    return frame;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Frame generation failed.";
    await supabase
      .from("production_jobs")
      .update({
        state: "failed",
        error: { message },
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    throw new Error(message);
  }
}

const ShotFrameInput = z.object({
  shotId: z.string().uuid(),
  count: z.number().int().min(1).max(4).default(1),
  extraPrompt: z.string().max(1000).optional(),
  useReferences: z.boolean().default(true),
});

export const generateStoryboardFrames = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ShotFrameInput.parse(input))
  .handler(async ({ data, context }) => {
    const frames = [];
    for (let i = 0; i < data.count; i += 1) {
      frames.push(
        await renderFrame(context as Ctx, data.shotId, data.extraPrompt, data.useReferences),
      );
    }
    return { frames, isMock: frames.some((f: any) => f.is_mock) };
  });

const BatchInput = z.object({
  scope: z.enum(["scene", "episode"]),
  id: z.string().uuid(),
  limit: z.number().int().min(1).max(MAX_BATCH_FRAMES).default(8),
});

/**
 * Generates frames for shots that have none yet, one at a time, capped.
 * Batches run sequentially on the server — never as dozens of parallel
 * browser requests.
 */
export const generateMissingStoryboards = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => BatchInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const column = data.scope === "scene" ? "scene_id" : "episode_id";

    const { data: shots, error } = await supabase
      .from("shots")
      .select("id")
      .eq(column, data.id)
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);

    const { data: existing } = await supabase
      .from("storyboard_frames")
      .select("shot_id")
      .eq(column, data.id);
    const done = new Set((existing ?? []).map((f: any) => f.shot_id));

    const pending = (shots ?? []).filter((s: any) => !done.has(s.id)).slice(0, data.limit);

    let created = 0;
    const failures: { shotId: string; message: string }[] = [];
    for (const shot of pending) {
      try {
        await renderFrame(context as Ctx, shot.id);
        created += 1;
      } catch (cause) {
        failures.push({
          shotId: shot.id,
          message: cause instanceof Error ? cause.message : "Generation failed.",
        });
      }
    }
    return { created, remaining: Math.max(0, (shots ?? []).length - done.size - created), failures };
  });

const SelectInput = z.object({ frameId: z.string().uuid() });

/** Approves one frame as the shot's selected storyboard; alternatives are kept. */
export const selectStoryboardFrame = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SelectInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const { data: frame, error } = await supabase
      .from("storyboard_frames")
      .select("*")
      .eq("id", data.frameId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!frame) throw new Error("Frame not found.");

    // Previous approvals are demoted to draft, never deleted.
    const { error: demoteError } = await supabase
      .from("storyboard_frames")
      .update({ is_selected: false, status: "draft" })
      .eq("shot_id", frame.shot_id)
      .neq("id", frame.id);
    if (demoteError) throw new Error(demoteError.message);

    const { data: updated, error: promoteError } = await supabase
      .from("storyboard_frames")
      .update({ is_selected: true, status: "approved" })
      .eq("id", frame.id)
      .select("*")
      .single();
    if (promoteError) throw new Error(promoteError.message);

    await supabase
      .from("shots")
      .update({ storyboard_storage_path: frame.storage_path })
      .eq("id", frame.shot_id);

    return updated;
  });

const SignInput = z.object({
  bucket: z.enum([STORYBOARD_BUCKET, VIDEO_BUCKET]),
  paths: z.array(z.string().min(1)).max(80),
});

/** Short-lived signed URLs for the caller's own media. Ownership re-checked under RLS. */
export const signStudioUrls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SignInput.parse(input))
  .handler(async ({ data, context }) => {
    if (!data.paths.length) return { urls: {} as Record<string, string> };
    const table = data.bucket === STORYBOARD_BUCKET ? "storyboard_frames" : "video_takes";
    const { data: owned, error } = await (context as Ctx).supabase
      .from(table)
      .select("storage_path")
      .in("storage_path", data.paths);
    if (error) throw new Error(error.message);

    const allowed = (owned ?? [])
      .map((row: any) => row.storage_path)
      .filter((p: any): p is string => typeof p === "string");
    if (!allowed.length) return { urls: {} as Record<string, string> };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error: signError } = await supabaseAdmin.storage
      .from(data.bucket)
      .createSignedUrls(allowed, 60 * 60);
    if (signError) throw new Error(signError.message);

    const urls: Record<string, string> = {};
    for (const entry of signed ?? []) {
      if (entry.path && entry.signedUrl) urls[entry.path] = entry.signedUrl;
    }
    return { urls };
  });
