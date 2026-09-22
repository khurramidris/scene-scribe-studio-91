import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { UPLOAD_BUCKET } from "./storyboard.functions";
import { MAX_ACTIVE_VIDEO_JOBS } from "./video.functions";

type Ctx = { supabase: any; userId: string };

const ACTIVE_STATES = ["queued", "submitting", "processing", "downloading"] as const;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return binary.length ? btoa(binary) : "";
}

/* ------------------------------------------------------------------ */
/* User-uploaded images (shared by both workflows)                     */
/* ------------------------------------------------------------------ */

const RegisterInput = z.object({
  storagePath: z.string().min(3).max(400),
  mimeType: z.string().min(3).max(80),
  fileSizeBytes: z.number().int().nonnegative().optional(),
  originalName: z.string().max(200).optional(),
  role: z.enum(["start", "end", "reference"]),
  projectId: z.string().uuid().nullable().optional(),
  shotId: z.string().uuid().nullable().optional(),
});

/**
 * Records an image the browser uploaded straight into the private bucket under
 * its own user folder. The path prefix and the object's existence are both
 * re-checked here, so a forged path cannot be attached to anything.
 */
export const registerUserImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RegisterInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    if (!data.storagePath.startsWith(`${userId}/`)) {
      throw new Error("That upload does not belong to you.");
    }
    if (!/^image\/(png|jpeg|jpg|webp)$/.test(data.mimeType)) {
      throw new Error("Upload a PNG, JPEG or WebP image.");
    }

    let projectId = data.projectId ?? null;
    if (data.shotId) {
      const { data: shot, error } = await supabase
        .from("shots")
        .select("id, project_id")
        .eq("id", data.shotId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!shot) throw new Error("Shot not found.");
      projectId = shot.project_id;
    }

    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { error: missing } = await db.storage
      .from(UPLOAD_BUCKET)
      .createSignedUrl(data.storagePath, 60);
    if (missing) throw new Error("The uploaded image could not be found in storage.");

    const { data: row, error: insertError } = await db
      .from("user_images")
      .insert({
        owner_id: userId,
        project_id: projectId,
        shot_id: data.shotId ?? null,
        role: data.role,
        storage_path: data.storagePath,
        mime_type: data.mimeType,
        file_size_bytes: data.fileSizeBytes ?? null,
        original_name: data.originalName ?? null,
      })
      .select("*")
      .single();
    if (insertError) throw new Error(insertError.message);
    return row;
  });

const ListImagesInput = z.object({ shotId: z.string().uuid().nullable().optional() });

export const listUserImages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ListImagesInput.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    let query = supabase.from("user_images").select("*").order("created_at", { ascending: false });
    if (data.shotId) query = query.eq("shot_id", data.shotId);
    else query = query.is("shot_id", null);
    const { data: rows, error } = await query.limit(60);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const DeleteImageInput = z.object({ imageId: z.string().uuid() });

export const deleteUserImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DeleteImageInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const { data: image, error } = await supabase
      .from("user_images")
      .select("id, storage_path")
      .eq("id", data.imageId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!image) throw new Error("Image not found.");

    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    await db.storage.from(UPLOAD_BUCKET).remove([image.storage_path]);
    const { error: deleteError } = await db.from("user_images").delete().eq("id", image.id);
    if (deleteError) throw new Error(deleteError.message);
    return { ok: true };
  });

/**
 * Loads the caller's own uploads as inline base64 with an explicit frame role.
 * Shared by the single-video page and the storyboard studio.
 */
export async function loadUploadedFrames(
  supabase: any,
  entries: { id: string | null | undefined; role: "first_frame" | "last_frame" }[],
) {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const images: { base64: string; mimeType: string; role: "first_frame" | "last_frame" }[] = [];
  for (const entry of entries) {
    if (!entry.id) continue;
    const { data: image, error } = await supabase
      .from("user_images")
      .select("id, storage_path, mime_type")
      .eq("id", entry.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!image) throw new Error("That uploaded image was not found.");
    const { data: blob, error: dlError } = await db.storage
      .from(UPLOAD_BUCKET)
      .download(image.storage_path);
    if (dlError || !blob) throw new Error("The uploaded image could not be read.");
    images.push({
      base64: toBase64(new Uint8Array(await blob.arrayBuffer())),
      mimeType: image.mime_type ?? "image/png",
      role: entry.role,
    });
  }
  return images;
}

/** Maps the supplied inputs to the generation mode the provider must run. */
export function modeForInputs(hasStart: boolean, hasEnd: boolean) {
  if (hasEnd && !hasStart) {
    throw new Error("An ending image needs a starting image. Upload a starting image as well.");
  }
  if (hasStart && hasEnd) return "first_last_frame" as const;
  if (hasStart) return "image_to_video" as const;
  return "text_to_video" as const;
}

/* ------------------------------------------------------------------ */
/* Single clip generation                                              */
/* ------------------------------------------------------------------ */

const SubmitSingleInput = z.object({
  prompt: z.string().min(3).max(4000),
  aspect: z.enum(["9:16", "16:9"]),
  resolution: z.string().min(2).max(10),
  durationSeconds: z.number().min(1).max(60),
  startImageId: z.string().uuid().nullable().optional(),
  endImageId: z.string().uuid().nullable().optional(),
  idempotencyKey: z.string().min(8).max(120),
});

export const submitSingleVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SubmitSingleInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;

    const { count: active } = await supabase
      .from("production_jobs")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", userId)
      .in("job_type", ["shot_video", "single_video"])
      .in("state", ACTIVE_STATES as unknown as string[]);
    if ((active ?? 0) >= MAX_ACTIVE_VIDEO_JOBS) {
      throw new Error(
        `You already have ${active} renders running. Wait for one to finish before starting another.`,
      );
    }

    const mode = modeForInputs(Boolean(data.startImageId), Boolean(data.endImageId));

    const { resolveVideoProvider } = await import("@/services/video/video.registry.server");
    const provider = resolveVideoProvider();
    const caps = provider.capabilities;
    if (!caps.modes.includes(mode)) {
      throw new Error(
        `The configured renderer (${provider.name}) does not support ${mode.replace(/_/g, " ")}.`,
      );
    }
    if (!caps.aspects.includes(data.aspect)) {
      throw new Error(`The configured renderer does not support ${data.aspect} video.`);
    }
    if (!caps.resolutions.includes(data.resolution)) {
      throw new Error(`Supported resolutions: ${caps.resolutions.join(", ")}.`);
    }

    const images = await loadUploadedFrames(supabase, [
      { id: data.startImageId, role: "first_frame" },
      { id: data.endImageId, role: "last_frame" },
    ]);

    const durationSeconds = Math.min(
      Math.max(data.durationSeconds, caps.minDurationSeconds),
      caps.maxDurationSeconds,
    );

    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: job, error: jobError } = await db
      .from("production_jobs")
      .insert({
        project_id: null,
        owner_id: userId,
        job_type: "single_video",
        state: "submitting",
        provider: provider.name,
        model: provider.model,
        request: {
          mode,
          prompt: data.prompt,
          resolution: data.resolution,
          durationSeconds,
          aspect: data.aspect,
          startImageId: data.startImageId ?? null,
          endImageId: data.endImageId ?? null,
          providerKind: caps.isMock ? "mock" : provider.name,
        },
        is_mock: caps.isMock,
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
      const handle = await provider.submit({
        mode,
        prompt: data.prompt,
        aspect: data.aspect,
        resolution: data.resolution,
        durationSeconds,
        images,
      });
      await db
        .from("production_jobs")
        .update({
          state: "processing",
          provider_job_id: handle.providerJobId,
          attempts: (job.attempts ?? 0) + 1,
        })
        .eq("id", job.id);
      return { jobId: job.id as string, isMock: caps.isMock, mode };
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

export const listSingleVideos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as Ctx;
    const [videos, jobs] = await Promise.all([
      supabase.from("single_videos").select("*").order("created_at", { ascending: false }).limit(50),
      supabase
        .from("production_jobs")
        .select("*")
        .eq("job_type", "single_video")
        .order("created_at", { ascending: false })
        .limit(30),
    ]);
    if (videos.error) throw new Error(videos.error.message);
    if (jobs.error) throw new Error(jobs.error.message);
    return { videos: videos.data ?? [], jobs: jobs.data ?? [] };
  });
