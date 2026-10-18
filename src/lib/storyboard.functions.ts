import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const STORYBOARD_BUCKET = "storyboard-frames";
export const VIDEO_BUCKET = "shot-videos";

/** Hard ceiling on how many frames one batch request may produce. */
export const MAX_BATCH_FRAMES = 24;

type Ctx = { supabase: SupabaseClient<Database>; userId: string };

/** Generates one storyboard alternative for a shot and records it as a job. */
async function renderFrame(ctx: Ctx, shotId: string, extraPrompt?: string, useReferences = true) {
  const { supabase, userId } = ctx;
  const { buildFramePlan } = await import("./storyboard-plan.server");
  const { loadReferenceImages } = await import("./reference-images.server");
  const plan = await buildFramePlan(supabase, shotId);
  const shot = plan.shot;

  const { resolveImageProvider } = await import("@/services/ai/image.registry.server");
  const provider = resolveImageProvider();
  if (
    useReferences &&
    plan.referenceAssets.length &&
    !provider.supportsReferenceImages &&
    !provider.isMock
  ) {
    throw new Error(
      "The image renderer must support reference images to use your selected character and set images.",
    );
  }
  // Generated-media rows are written with the privileged client only after the
  // RLS-scoped read above proved the shot belongs to the caller.
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");

  const references =
    useReferences && provider.supportsReferenceImages
      ? await loadReferenceImages(supabase, plan.referenceAssets)
      : [];

  const fullPrompt = [plan.prompt, extraPrompt].filter(Boolean).join(" ");

  const { data: job, error: jobError } = await db
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

    const { error: uploadError } = await db.storage
      .from(STORYBOARD_BUCKET)
      .upload(path, bytes, { contentType: image.contentType, upsert: false });
    if (uploadError) throw new Error(`Could not store the frame: ${uploadError.message}`);

    const { count } = await supabase
      .from("storyboard_frames")
      .select("id", { count: "exact", head: true })
      .eq("shot_id", shot.id);

    const { data: frame, error: frameError } = await db
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
        generation_params: {
          aspect: plan.aspect,
          contentType: image.contentType,
          reference_assets: references.length ? plan.referenceAssets : [],
        },
        reference_inputs: references.length ? plan.referenceAssets.map((asset) => asset.id) : [],
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

    await db
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
    await db
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
    return { frames, isMock: frames.some((f) => f.is_mock) };
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
    const done = new Set((existing ?? []).map((f) => f.shot_id));

    const pending = (shots ?? []).filter((s) => !done.has(s.id)).slice(0, data.limit);

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
    return {
      created,
      remaining: Math.max(0, (shots ?? []).length - done.size - created),
      failures,
    };
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

    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    // Previous approvals are demoted to draft, never deleted.
    const { error: demoteError } = await db
      .from("storyboard_frames")
      .update({ is_selected: false, status: "draft" })
      .eq("shot_id", frame.shot_id)
      .neq("id", frame.id);
    if (demoteError) throw new Error(demoteError.message);

    const { data: updated, error: promoteError } = await db
      .from("storyboard_frames")
      .update({ is_selected: true, status: "approved" })
      .eq("id", frame.id)
      .select("*")
      .single();
    if (promoteError) throw new Error(promoteError.message);

    const { error: shotError } = await supabase
      .from("shots")
      .update({ storyboard_storage_path: frame.storage_path })
      .eq("id", frame.shot_id);
    if (shotError) throw new Error(shotError.message);

    return updated;
  });

export const UPLOAD_BUCKET = "user-images";

const SignInput = z.object({
  bucket: z.enum([STORYBOARD_BUCKET, VIDEO_BUCKET, UPLOAD_BUCKET]),
  paths: z.array(z.string().min(1)).max(80),
});

/** Short-lived signed URLs for the caller's own media. Ownership re-checked under RLS. */
export const signStudioUrls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SignInput.parse(input))
  .handler(async ({ data, context }) => {
    if (!data.paths.length) return { urls: {} as Record<string, string> };
    const tables: ("storyboard_frames" | "user_images" | "video_takes" | "single_videos")[] =
      data.bucket === STORYBOARD_BUCKET
        ? ["storyboard_frames"]
        : data.bucket === UPLOAD_BUCKET
          ? ["user_images"]
          : ["video_takes", "single_videos"];

    const allowed: string[] = [];
    for (const table of tables) {
      const { data: owned, error } = await (context as Ctx).supabase
        .from(table)
        .select("storage_path")
        .in("storage_path", data.paths);
      if (error) throw new Error(error.message);
      for (const row of owned ?? []) {
        if (typeof row.storage_path === "string") allowed.push(row.storage_path);
      }
    }
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

const RejectFrameInput = z.object({ frameId: z.string().uuid() });

/** Rejects a frame. Writes go through the privileged client after an RLS-scoped ownership read. */
export const rejectStoryboardFrame = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RejectFrameInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const { data: frame, error } = await supabase
      .from("storyboard_frames")
      .select("id")
      .eq("id", data.frameId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!frame) throw new Error("Frame not found.");

    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { error: updateError } = await db
      .from("storyboard_frames")
      .update({ status: "rejected", is_selected: false })
      .eq("id", frame.id);
    if (updateError) throw new Error(updateError.message);
    return { ok: true };
  });

const RejectTakeInput = z.object({ takeId: z.string().uuid() });

export const rejectVideoTake = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RejectTakeInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const { data: take, error } = await supabase
      .from("video_takes")
      .select("id")
      .eq("id", data.takeId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!take) throw new Error("Take not found.");

    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { error: updateError } = await db
      .from("video_takes")
      .update({ status: "rejected", is_selected: false })
      .eq("id", take.id);
    if (updateError) throw new Error(updateError.message);
    return { ok: true };
  });
