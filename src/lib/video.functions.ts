import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { VIDEO_BUCKET } from "./storyboard.functions";

/** Guard against runaway spending: concurrent renders per user. */
export const MAX_ACTIVE_VIDEO_JOBS = 3;

const ACTIVE_STATES = ["queued", "submitting", "processing", "downloading"] as const;

type Ctx = { supabase: any; userId: string };

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return binary.length ? btoa(binary) : "";
}

/** Capability descriptor so the UI only offers supported settings. */
export const getVideoCapabilities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { describeVideoProvider } = await import("@/services/video/video.registry.server");
    return describeVideoProvider();
  });

const SubmitInput = z.object({
  shotId: z.string().uuid(),
  frameId: z.string().uuid().nullable().optional(),
  endFrameId: z.string().uuid().nullable().optional(),
  /** Images the user uploaded from their device for this shot. */
  startImageId: z.string().uuid().nullable().optional(),
  endImageId: z.string().uuid().nullable().optional(),
  mode: z.enum(["text_to_video", "image_to_video", "first_last_frame"]),
  resolution: z.string().min(2).max(10),
  durationSeconds: z.number().min(1).max(60),
  negativePrompt: z.string().max(1000).optional(),
  seed: z.number().int().optional(),
  extraPrompt: z.string().max(1000).optional(),
  idempotencyKey: z.string().min(8).max(120),
});

/**
 * Submits one shot render. The job row is the single source of truth; the
 * browser does not need to stay open. Duplicate submissions are rejected by
 * the (owner_id, idempotency_key) unique constraint and by the partial unique
 * index that allows only one active video job per shot.
 */
export const submitShotVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SubmitInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;

    const { count: active } = await supabase
      .from("production_jobs")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", userId)
      .eq("job_type", "shot_video")
      .in("state", ACTIVE_STATES as unknown as string[]);
    if ((active ?? 0) >= MAX_ACTIVE_VIDEO_JOBS) {
      throw new Error(
        `You already have ${active} renders running. Wait for one to finish before starting another.`,
      );
    }

    // RLS-scoped read: a shot from someone else's production simply is not found.
    const { data: shot, error } = await supabase
      .from("shots")
      .select("*")
      .eq("id", data.shotId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!shot) throw new Error("Shot not found.");

    const { data: project } = await supabase
      .from("projects")
      .select("format")
      .eq("id", shot.project_id)
      .maybeSingle();
    const aspect = project?.format === "horizontal_16_9" ? "16:9" : "9:16";

    const { resolveVideoProvider } = await import("@/services/video/video.registry.server");
    const provider = resolveVideoProvider();

    if (data.mode !== "text_to_video" && !data.frameId) {
      throw new Error("Select an approved storyboard frame before rendering from an image.");
    }
    if (data.mode === "first_last_frame" && !data.endFrameId) {
      throw new Error("Select an approved ending frame for first/last frame rendering.");
    }
    if (!provider.capabilities.modes.includes(data.mode)) {
      throw new Error(
        `The configured renderer (${provider.name}) does not support ${data.mode.replace(/_/g, " ")}.`,
      );
    }

    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");

    const images: { base64: string; mimeType: string; role: "first_frame" | "last_frame" }[] = [];
    const frameIds = [
      { id: data.frameId, role: "first_frame" as const },
      { id: data.mode === "first_last_frame" ? data.endFrameId : null, role: "last_frame" as const },
    ];
    for (const entry of frameIds) {
      if (!entry.id) continue;
      const { data: frame } = await supabase
        .from("storyboard_frames")
        .select("id, shot_id, project_id, status, is_selected, is_mock, storage_path, mime_type")
        .eq("id", entry.id)
        .maybeSingle();
      if (!frame) throw new Error("Storyboard frame not found.");
      // The frame must belong to this exact shot and production, be the
      // approved selection, and hold a real stored image.
      if (frame.shot_id !== shot.id || frame.project_id !== shot.project_id) {
        throw new Error("That storyboard frame does not belong to this shot.");
      }
      if (frame.status !== "approved" || !frame.is_selected) {
        throw new Error("Approve and select the storyboard frame before rendering it.");
      }
      if (frame.is_mock) {
        throw new Error("This storyboard frame is a development placeholder and cannot be rendered.");
      }
      if (!frame.storage_path) throw new Error("That storyboard frame has no stored image.");
      const { data: blob, error: dlError } = await db.storage
        .from("storyboard-frames")
        .download(frame.storage_path);
      if (dlError || !blob) throw new Error("The storyboard frame could not be read.");
      images.push({
        base64: toBase64(new Uint8Array(await blob.arrayBuffer())),
        mimeType: frame.mime_type ?? "image/png",
        role: entry.role,
      });
    }

    const prompt = [
      shot.video_prompt || shot.description || "Cinematic shot.",
      shot.action ? `Action: ${shot.action}.` : "",
      shot.camera_movement ? `Camera: ${shot.camera_movement}.` : "",
      shot.emotional_tone ? `Mood: ${shot.emotional_tone}.` : "",
      shot.sound_design ? `Audio: ${shot.sound_design}.` : "",
      shot.continuity ? `Continuity: ${JSON.stringify(shot.continuity).slice(0, 600)}` : "",
      data.extraPrompt ?? "",
    ]
      .filter(Boolean)
      .join(" ");

    const request = {
      mode: data.mode,
      prompt,
      negativePrompt: provider.capabilities.supportsNegativePrompt
        ? data.negativePrompt
        : undefined,
      aspect: aspect as "9:16" | "16:9",
      resolution: data.resolution,
      durationSeconds: data.durationSeconds,
      seed: provider.capabilities.supportsSeed ? data.seed : undefined,
      images,
    };

    const { data: job, error: jobError } = await db
      .from("production_jobs")
      .insert({
        project_id: shot.project_id,
        owner_id: userId,
        episode_id: shot.episode_id,
        scene_id: shot.scene_id,
        shot_id: shot.id,
        job_type: "shot_video",
        state: "submitting",
        provider: provider.name,
        model: provider.model,
        request: {
          mode: data.mode,
          prompt,
          resolution: data.resolution,
          durationSeconds: data.durationSeconds,
          aspect,
          frameId: data.frameId ?? null,
          endFrameId: data.endFrameId ?? null,
          negativePrompt: request.negativePrompt ?? null,
          seed: request.seed ?? null,
          // Kept so a later poll finishes the job with the same configuration.
          providerKind: provider.capabilities.isMock ? "mock" : provider.name,
        },
        is_mock: provider.capabilities.isMock,
        idempotency_key: data.idempotencyKey,
        submitted_at: new Date().toISOString(),
      })
      .select("*")
      .single();
    if (jobError) {
      const message = String(jobError.message);
      if (message.includes("production_jobs_one_active_video_per_shot")) {
        throw new Error("This shot is already rendering. Wait for that render to finish.");
      }
      if (message.includes("duplicate key")) {
        throw new Error("This render was already submitted.");
      }
      throw new Error(message);
    }

    try {
      const handle = await provider.submit(request);
      await db
        .from("production_jobs")
        .update({
          state: "processing",
          provider_job_id: handle.providerJobId,
          attempts: (job.attempts ?? 0) + 1,
        })
        .eq("id", job.id);
      await db.from("shots").update({ production_status: "rendering" }).eq("id", shot.id);
      return { jobId: job.id as string, isMock: provider.capabilities.isMock };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Submission failed.";
      await db
        .from("production_jobs")
        .update({
          state: "failed",
          error: { message },
          attempts: (job.attempts ?? 0) + 1,
          completed_at: new Date().toISOString(),
        })
        .eq("id", job.id);
      throw new Error(message);
    }
  });

const JobInput = z.object({ jobId: z.string().uuid() });

/**
 * Advances one job: polls the provider and, on completion, downloads the clip
 * into our own storage before the shot is ever marked rendered. A failed
 * download leaves the job failed, never completed.
 *
 * Shared by the browser and the scheduled worker. Safe to call concurrently:
 * the finalising step is claimed with a conditional state transition, and the
 * take is keyed on the job id so a provider job can only ever yield one take.
 */
export async function advanceJobRecord(job: any) {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  if (!["processing", "submitting", "downloading"].includes(job.state)) return job;
  if (!job.provider_job_id) return job;

  /** Standalone single clips carry no shot, scene or episode. */
  const isSingle = job.job_type === "single_video";
  const assetTable = isSingle ? "single_videos" : "video_takes";

  const { resolveVideoProvider } = await import("@/services/video/video.registry.server");
  const provider = resolveVideoProvider(job.provider === "mock" ? "mock" : undefined);
  const handle = {
    providerJobId: job.provider_job_id,
    provider: job.provider,
    model: job.model,
  };

  let status;
  try {
    status = await provider.status(handle);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Status check failed.";
    const { data: kept } = await db
      .from("production_jobs")
      .update({ error: { message }, attempts: (job.attempts ?? 0) + 1 })
      .eq("id", job.id)
      .select("*")
      .single();
    return kept;
  }

  if (status.state === "processing") {
    const { data: updated } = await db
      .from("production_jobs")
      .update({ progress: status.progress ?? job.progress, error: null })
      .eq("id", job.id)
      .select("*")
      .single();
    return updated;
  }

  if (status.state !== "completed") {
    if (!isSingle) {
      await db.from("shots").update({ production_status: "failed" }).eq("id", job.shot_id);
    }
    const { data: failed } = await db
      .from("production_jobs")
      .update({
        state: status.state === "cancelled" ? "cancelled" : "failed",
        error: status.error ?? { message: "The renderer reported a failure." },
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .select("*")
      .single();
    return failed;
  }

  // Atomic claim: only the caller that flips processing/submitting -> downloading
  // may finalise this render. A second tab or worker tick gets no row back.
  const { data: claimed } = await db
    .from("production_jobs")
    .update({ state: "downloading" })
    .eq("id", job.id)
    .in("state", ["processing", "submitting"])
    .select("*")
    .maybeSingle();
  if (!claimed) {
    const { data: current } = await db
      .from("production_jobs")
      .select("*")
      .eq("id", job.id)
      .maybeSingle();
    return current ?? job;
  }

  // Idempotency: if a previous attempt already stored the asset, just finish.
  const { data: existingAsset } = await db
    .from(assetTable)
    .select("*")
    .eq("job_id", job.id)
    .maybeSingle();
  if (existingAsset) {
    const { data: done } = await db
      .from("production_jobs")
      .update({
        state: "completed",
        progress: 100,
        result_kind: isSingle ? "single_video" : "video_take",
        result_asset_id: existingAsset.id,
        completed_at: new Date().toISOString(),
        error: null,
      })
      .eq("id", job.id)
      .select("*")
      .single();
    return done;
  }

  try {
    const result = await provider.fetchResult(handle);
    const ext = result.mimeType.includes("mp4") ? "mp4" : "bin";
    const path = isSingle
      ? `${job.owner_id}/single/${crypto.randomUUID()}.${ext}`
      : `${job.owner_id}/${job.project_id}/${job.shot_id}/${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await db.storage
      .from(VIDEO_BUCKET)
      .upload(path, result.bytes, { contentType: result.mimeType, upsert: false });
    if (uploadError) throw new Error(`Storing the clip failed: ${uploadError.message}`);

    const request = (job.request ?? {}) as Record<string, any>;

    let assetId: string;
    if (isSingle) {
      const { data: video, error: videoError } = await db
        .from("single_videos")
        .insert({
          owner_id: job.owner_id,
          prompt: request["prompt"] ?? "",
          mode: request["mode"] ?? "text_to_video",
          aspect: request["aspect"] ?? "9:16",
          resolution: request["resolution"] ?? "720p",
          requested_duration_seconds: request["durationSeconds"] ?? 5,
          start_image_id: request["startImageId"] ?? null,
          end_image_id: request["endImageId"] ?? null,
          provider: job.provider,
          model: job.model,
          storage_path: path,
          mime_type: result.mimeType,
          file_size_bytes: result.bytes.byteLength,
          duration_seconds: result.durationSeconds ?? request["durationSeconds"] ?? null,
          width: result.width ?? null,
          height: result.height ?? null,
          is_mock: job.is_mock,
          job_id: job.id,
        })
        .select("*")
        .single();
      if (videoError) throw new Error(videoError.message);
      assetId = video.id;
      await db.from("production_jobs").update({ single_video_id: video.id }).eq("id", job.id);
    } else {
      const { count } = await db
        .from("video_takes")
        .select("id", { count: "exact", head: true })
        .eq("shot_id", job.shot_id);

      const { data: take, error: takeError } = await db
        .from("video_takes")
        .insert({
          project_id: job.project_id,
          episode_id: job.episode_id,
          scene_id: job.scene_id,
          shot_id: job.shot_id,
          owner_id: job.owner_id,
          version: (count ?? 0) + 1,
          mode: request["mode"] ?? "image_to_video",
          prompt: request["prompt"] ?? "",
          negative_prompt: request["negativePrompt"] ?? null,
          provider: job.provider,
          model: job.model,
          settings: request as unknown as never,
          seed: request["seed"] ?? null,
          source_frame_id: request["frameId"] ?? null,
          storage_path: path,
          mime_type: result.mimeType,
          file_size_bytes: result.bytes.byteLength,
          duration_seconds: result.durationSeconds ?? request["durationSeconds"] ?? null,
          width: result.width ?? null,
          height: result.height ?? null,
          aspect: request["aspect"] ?? "9:16",
          is_mock: job.is_mock,
          job_id: job.id,
          usage: (result.usage ?? {}) as unknown as never,
        })
        .select("*")
        .single();
      if (takeError) throw new Error(takeError.message);
      assetId = take.id;
      await db.from("shots").update({ production_status: "rendered" }).eq("id", job.shot_id);
    }

    const { data: completed } = await db
      .from("production_jobs")
      .update({
        state: "completed",
        progress: 100,
        result_kind: isSingle ? "single_video" : "video_take",
        result_asset_id: assetId,
        usage: (result.usage ?? {}) as unknown as never,
        completed_at: new Date().toISOString(),
        error: null,
      })
      .eq("id", job.id)
      .select("*")
      .single();
    return completed;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Download failed.";
    if (!isSingle) {
      await db.from("shots").update({ production_status: "failed" }).eq("id", job.shot_id);
    }
    const { data: failed } = await db
      .from("production_jobs")
      .update({
        state: "failed",
        error: { message, stage: "download" },
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .select("*")
      .single();
    return failed;
  }
}

export const advanceVideoJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => JobInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const { data: job, error } = await supabase
      .from("production_jobs")
      .select("*")
      .eq("id", data.jobId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!job) throw new Error("Job not found.");
    return advanceJobRecord(job);
  });

export const cancelVideoJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => JobInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const { data: job, error } = await supabase
      .from("production_jobs")
      .select("*")
      .eq("id", data.jobId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!job) throw new Error("Job not found.");

    const { resolveVideoProvider } = await import("@/services/video/video.registry.server");
    const provider = resolveVideoProvider(job.provider === "mock" ? "mock" : undefined);
    if (!provider.capabilities.supportsCancel || !provider.cancel) {
      throw new Error(`${provider.name} does not support cancelling a render in progress.`);
    }
    if (job.provider_job_id) {
      await provider.cancel({
        providerJobId: job.provider_job_id,
        provider: job.provider,
        model: job.model,
      });
    }
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: cancelled, error: cancelError } = await db
      .from("production_jobs")
      .update({
        state: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancel_reason: "Cancelled by the user",
      })
      .eq("id", job.id)
      .select("*")
      .single();
    if (cancelError) throw new Error(cancelError.message);
    return cancelled;
  });

const ApproveInput = z.object({ takeId: z.string().uuid() });

/** Approves one take. A new render never replaces the approved take by itself. */
export const approveVideoTake = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ApproveInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const { data: take, error } = await supabase
      .from("video_takes")
      .select("*")
      .eq("id", data.takeId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!take) throw new Error("Take not found.");
    if (take.is_mock) {
      throw new Error("A development placeholder cannot be approved as a real take.");
    }
    if (!take.storage_path) throw new Error("That take has no stored video.");

    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");

    // Promote first: if this write fails the previous approved take is untouched.
    const { data: approved, error: promoteError } = await db
      .from("video_takes")
      .update({ is_selected: true, status: "approved" })
      .eq("id", take.id)
      .select("*")
      .single();
    if (promoteError) throw new Error(promoteError.message);

    const { error: demoteError } = await db
      .from("video_takes")
      .update({ is_selected: false, status: "draft" })
      .eq("shot_id", take.shot_id)
      .neq("id", take.id);
    if (demoteError) throw new Error(demoteError.message);

    const { error: shotError } = await db
      .from("shots")
      .update({ video_storage_path: take.storage_path, production_status: "rendered" })
      .eq("id", take.shot_id);
    if (shotError) throw new Error(shotError.message);

    return approved;
  });
