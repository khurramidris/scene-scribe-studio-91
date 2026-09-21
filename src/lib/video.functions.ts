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
 * browser does not need to stay open. Duplicate submissions are rejected by the
 * (owner_id, idempotency_key) unique constraint.
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
    if (!provider.capabilities.modes.includes(data.mode)) {
      throw new Error(
        `The configured renderer (${provider.name}) does not support ${data.mode.replace(/_/g, " ")}.`,
      );
    }

    const images: { base64: string; mimeType: string; role: "first_frame" | "last_frame" }[] = [];
    const frameIds = [
      { id: data.frameId, role: "first_frame" as const },
      { id: data.mode === "first_last_frame" ? data.endFrameId : null, role: "last_frame" as const },
    ];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    for (const entry of frameIds) {
      if (!entry.id) continue;
      const { data: frame } = await supabase
        .from("storyboard_frames")
        .select("storage_path, mime_type, is_mock")
        .eq("id", entry.id)
        .maybeSingle();
      if (!frame) throw new Error("Storyboard frame not found.");
      if (frame.is_mock) {
        throw new Error("This storyboard frame is a development placeholder and cannot be rendered.");
      }
      const { data: blob, error: dlError } = await supabaseAdmin.storage
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

    const { data: job, error: jobError } = await supabase
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
        },
        is_mock: provider.capabilities.isMock,
        idempotency_key: data.idempotencyKey,
        submitted_at: new Date().toISOString(),
      })
      .select("*")
      .single();
    if (jobError) {
      if (String(jobError.message).includes("duplicate key")) {
        throw new Error("This render was already submitted.");
      }
      throw new Error(jobError.message);
    }

    try {
      const handle = await provider.submit(request);
      await supabase
        .from("production_jobs")
        .update({
          state: "processing",
          provider_job_id: handle.providerJobId,
          attempts: (job.attempts ?? 0) + 1,
        })
        .eq("id", job.id);
      await supabase.from("shots").update({ production_status: "rendering" }).eq("id", shot.id);
      return { jobId: job.id as string, isMock: provider.capabilities.isMock };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Submission failed.";
      await supabase
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
 */
export const advanceVideoJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => JobInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const { data: job, error } = await supabase
      .from("production_jobs")
      .select("*")
      .eq("id", data.jobId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!job) throw new Error("Job not found.");
    if (!["processing", "submitting", "downloading"].includes(job.state)) return job;
    if (!job.provider_job_id) return job;

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
      const { data: kept } = await supabase
        .from("production_jobs")
        .update({ error: { message }, attempts: (job.attempts ?? 0) + 1 })
        .eq("id", job.id)
        .select("*")
        .single();
      return kept;
    }

    if (status.state === "processing") {
      const { data: updated } = await supabase
        .from("production_jobs")
        .update({ progress: status.progress ?? job.progress, error: null })
        .eq("id", job.id)
        .select("*")
        .single();
      return updated;
    }

    if (status.state !== "completed") {
      await supabase.from("shots").update({ production_status: "failed" }).eq("id", job.shot_id);
      const { data: failed } = await supabase
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

    await supabase.from("production_jobs").update({ state: "downloading" }).eq("id", job.id);

    try {
      const result = await provider.fetchResult(handle);
      const ext = result.mimeType.includes("mp4") ? "mp4" : "bin";
      const path = `${userId}/${job.project_id}/${job.shot_id}/${crypto.randomUUID()}.${ext}`;

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error: uploadError } = await supabaseAdmin.storage
        .from(VIDEO_BUCKET)
        .upload(path, result.bytes, { contentType: result.mimeType, upsert: false });
      if (uploadError) throw new Error(`Storing the clip failed: ${uploadError.message}`);

      const { count } = await supabase
        .from("video_takes")
        .select("id", { count: "exact", head: true })
        .eq("shot_id", job.shot_id);

      const request = (job.request ?? {}) as Record<string, any>;
      const { data: take, error: takeError } = await supabase
        .from("video_takes")
        .insert({
          project_id: job.project_id,
          episode_id: job.episode_id,
          scene_id: job.scene_id,
          shot_id: job.shot_id,
          owner_id: userId,
          version: (count ?? 0) + 1,
          mode: request['mode'] ?? "image_to_video",
          prompt: request['prompt'] ?? "",
          negative_prompt: request['negativePrompt'] ?? null,
          provider: job.provider,
          model: job.model,
          settings: request,
          seed: request['seed'] ?? null,
          source_frame_id: request['frameId'] ?? null,
          storage_path: path,
          mime_type: result.mimeType,
          file_size_bytes: result.bytes.byteLength,
          duration_seconds: result.durationSeconds ?? request['durationSeconds'] ?? null,
          width: result.width ?? null,
          height: result.height ?? null,
          aspect: request['aspect'] ?? "9:16",
          is_mock: job.is_mock,
          job_id: job.id,
          usage: result.usage ?? {},
        })
        .select("*")
        .single();
      if (takeError) throw new Error(takeError.message);

      await supabase.from("shots").update({ production_status: "rendered" }).eq("id", job.shot_id);

      const { data: completed } = await supabase
        .from("production_jobs")
        .update({
          state: "completed",
          progress: 100,
          result_kind: "video_take",
          result_asset_id: take.id,
          usage: result.usage ?? {},
          completed_at: new Date().toISOString(),
          error: null,
        })
        .eq("id", job.id)
        .select("*")
        .single();
      return completed;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Download failed.";
      await supabase.from("shots").update({ production_status: "failed" }).eq("id", job.shot_id);
      const { data: failed } = await supabase
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
    const { data: cancelled } = await supabase
      .from("production_jobs")
      .update({
        state: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancel_reason: "Cancelled by the user",
      })
      .eq("id", job.id)
      .select("*")
      .single();
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

    const { error: demoteError } = await supabase
      .from("video_takes")
      .update({ is_selected: false, status: "draft" })
      .eq("shot_id", take.shot_id)
      .neq("id", take.id);
    if (demoteError) throw new Error(demoteError.message);

    const { data: approved, error: promoteError } = await supabase
      .from("video_takes")
      .update({ is_selected: true, status: "approved" })
      .eq("id", take.id)
      .select("*")
      .single();
    if (promoteError) throw new Error(promoteError.message);

    await supabase
      .from("shots")
      .update({ video_storage_path: take.storage_path, production_status: "rendered" })
      .eq("id", take.shot_id);

    return approved;
  });
