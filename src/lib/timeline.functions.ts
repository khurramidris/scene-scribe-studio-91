import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const EXPORT_BUCKET = "episode-exports";

type Ctx = { supabase: any; userId: string };

export const EXPORT_PRESETS = {
  "9:16": { preset: "vertical_1080x1920", width: 1080, height: 1920, fps: 30 },
  "16:9": { preset: "horizontal_1920x1080", width: 1920, height: 1080, fps: 30 },
} as const;

const ClipSchema = z.object({
  shotId: z.string().uuid(),
  sceneId: z.string().uuid(),
  takeId: z.string().uuid(),
  order: z.number().int().min(0),
  startAt: z.number().min(0).default(0),
  durationSeconds: z.number().min(0),
  trimInSeconds: z.number().min(0).default(0),
  trimOutSeconds: z.number().min(0).default(0),
  muted: z.boolean().default(false),
  transitionIn: z.enum(["cut", "dissolve", "fade"]).default("cut"),
});

const TitleCardSchema = z.object({
  enabled: z.boolean().default(false),
  position: z.enum(["start", "end"]).default("start"),
  text: z.string().max(120).default(""),
  subtitle: z.string().max(200).default(""),
  durationSeconds: z.number().min(1).max(15).default(3),
});

const TimelineSchema = z.object({
  clips: z.array(ClipSchema).max(400),
  titleCard: TitleCardSchema.default({
    enabled: false,
    position: "start",
    text: "",
    subtitle: "",
    durationSeconds: 3,
  }),
  subtitlesSrt: z.string().max(400000).nullable().default(null),
  burnSubtitles: z.boolean().default(false),
});

export type TimelineDocument = z.infer<typeof TimelineSchema>;

function clipDuration(clip: z.infer<typeof ClipSchema>): number {
  return Math.max(
    0,
    clip.durationSeconds - (clip.trimInSeconds ?? 0) - (clip.trimOutSeconds ?? 0),
  );
}

const EpisodeInput = z.object({ episodeId: z.string().uuid() });

/**
 * Returns the saved timeline for an episode, or an initial one built from the
 * episode's shots in narrative order using their approved takes.
 */
export const getEpisodeTimeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => EpisodeInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;

    const { data: episode, error } = await supabase
      .from("episodes")
      .select("id, project_id, title, number")
      .eq("id", data.episodeId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!episode) throw new Error("Episode not found.");

    const [{ data: project }, { data: scenes }, { data: shots }, { data: takes }, { data: saved }] =
      await Promise.all([
        supabase.from("projects").select("format").eq("id", episode.project_id).maybeSingle(),
        supabase
          .from("scenes")
          .select("id, scene_number, sort_order, heading")
          .eq("episode_id", episode.id)
          .order("sort_order", { ascending: true }),
        supabase
          .from("shots")
          .select("id, scene_id, shot_number, sort_order, description, duration_seconds")
          .eq("episode_id", episode.id)
          .order("sort_order", { ascending: true }),
        supabase
          .from("video_takes")
          .select("*")
          .eq("episode_id", episode.id)
          .order("created_at", { ascending: true }),
        supabase
          .from("episode_timelines")
          .select("*")
          .eq("episode_id", episode.id)
          .maybeSingle(),
      ]);

    const aspect: "9:16" | "16:9" = project?.format === "horizontal_16_9" ? "16:9" : "9:16";
    const sceneRank = new Map<string, number>();
    (scenes ?? []).forEach((s: any, i: number) => sceneRank.set(s.id, i));
    const ordered = [...(shots ?? [])].sort((a: any, b: any) => {
      const sa = sceneRank.get(a.scene_id) ?? 999;
      const sb = sceneRank.get(b.scene_id) ?? 999;
      return sa === sb ? a.sort_order - b.sort_order : sa - sb;
    });

    const approvedByShot = new Map<string, any>();
    for (const take of takes ?? []) {
      if (take.status === "approved" && take.is_selected) approvedByShot.set(take.shot_id, take);
    }

    let timeline: TimelineDocument;
    if (saved?.clips && Array.isArray(saved.clips) && saved.clips.length) {
      timeline = TimelineSchema.parse({
        clips: saved.clips,
        titleCard: saved.title_card && Object.keys(saved.title_card).length ? saved.title_card : undefined,
        subtitlesSrt: (saved.subtitles as any)?.srt ?? null,
        burnSubtitles: Boolean((saved.subtitles as any)?.burn),
      });
    } else {
      const clips = ordered
        .filter((shot: any) => approvedByShot.has(shot.id))
        .map((shot: any, index: number) => {
          const take = approvedByShot.get(shot.id);
          return {
            shotId: shot.id,
            sceneId: shot.scene_id,
            takeId: take.id,
            order: index,
            startAt: 0,
            durationSeconds: Number(take.duration_seconds ?? shot.duration_seconds ?? 5),
            trimInSeconds: 0,
            trimOutSeconds: 0,
            muted: false,
            transitionIn: "cut" as const,
          };
        });
      timeline = TimelineSchema.parse({ clips, subtitlesSrt: null, burnSubtitles: false });
    }

    const totalDuration = timeline.clips.reduce((sum, clip) => sum + clipDuration(clip), 0);

    return {
      episode,
      aspect,
      preset: EXPORT_PRESETS[aspect],
      timeline,
      totalDuration,
      shots: ordered,
      scenes: scenes ?? [],
      takes: takes ?? [],
      missingShotIds: ordered
        .filter((s: any) => !timeline.clips.some((c) => c.shotId === s.id))
        .map((s: any) => s.id),
      saved: Boolean(saved),
    };
  });

const SaveInput = z.object({
  episodeId: z.string().uuid(),
  timeline: TimelineSchema,
});

export const saveEpisodeTimeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SaveInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;

    const { data: episode, error } = await supabase
      .from("episodes")
      .select("id, project_id")
      .eq("id", data.episodeId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!episode) throw new Error("Episode not found.");

    // Every referenced take must belong to this episode and to the caller.
    const takeIds = data.timeline.clips.map((c) => c.takeId);
    if (takeIds.length) {
      const { data: takes, error: takeError } = await supabase
        .from("video_takes")
        .select("id, shot_id, episode_id")
        .in("id", takeIds);
      if (takeError) throw new Error(takeError.message);
      const byId = new Map((takes ?? []).map((t: any) => [t.id, t]));
      for (const clip of data.timeline.clips) {
        const take = byId.get(clip.takeId) as any;
        if (!take) throw new Error("A clip refers to a video take you do not have access to.");
        if (take.episode_id !== episode.id || take.shot_id !== clip.shotId) {
          throw new Error("A clip refers to a take from a different shot or episode.");
        }
      }
    }

    const { data: project } = await supabase
      .from("projects")
      .select("format")
      .eq("id", episode.project_id)
      .maybeSingle();
    const aspect = project?.format === "horizontal_16_9" ? "16:9" : "9:16";

    const payload = {
      project_id: episode.project_id,
      episode_id: episode.id,
      owner_id: userId,
      aspect,
      clips: data.timeline.clips as unknown as never,
      audio: [] as unknown as never,
      subtitles: {
        srt: data.timeline.subtitlesSrt,
        burn: data.timeline.burnSubtitles,
      } as unknown as never,
      title_card: data.timeline.titleCard as unknown as never,
    };

    const { data: saved, error: saveError } = await supabase
      .from("episode_timelines")
      .upsert(payload, { onConflict: "episode_id" })
      .select("*")
      .single();
    if (saveError) throw new Error(`The timeline could not be saved: ${saveError.message}`);
    return saved;
  });

/** Queues an episode export. The render itself is performed by the export worker. */
export const requestEpisodeExport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => EpisodeInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;

    const { data: episode, error } = await supabase
      .from("episodes")
      .select("id, project_id, title, number")
      .eq("id", data.episodeId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!episode) throw new Error("Episode not found.");

    const { data: saved } = await supabase
      .from("episode_timelines")
      .select("*")
      .eq("episode_id", episode.id)
      .maybeSingle();
    if (!saved) throw new Error("Save the timeline before exporting.");

    const timeline = TimelineSchema.parse({
      clips: saved.clips,
      titleCard:
        saved.title_card && Object.keys(saved.title_card).length ? saved.title_card : undefined,
      subtitlesSrt: (saved.subtitles as any)?.srt ?? null,
      burnSubtitles: Boolean((saved.subtitles as any)?.burn),
    });
    if (!timeline.clips.length) throw new Error("Add at least one clip before exporting.");

    // Resolve the permanent stored asset for every clip, under RLS.
    const { data: takes, error: takeError } = await supabase
      .from("video_takes")
      .select("id, shot_id, episode_id, storage_path, mime_type, is_mock, duration_seconds")
      .in(
        "id",
        timeline.clips.map((c) => c.takeId),
      );
    if (takeError) throw new Error(takeError.message);
    const byId = new Map((takes ?? []).map((t: any) => [t.id, t]));

    const resolved = timeline.clips
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((clip) => {
        const take = byId.get(clip.takeId) as any;
        if (!take) throw new Error("A clip refers to a take you do not have access to.");
        if (take.episode_id !== episode.id || take.shot_id !== clip.shotId) {
          throw new Error("A clip refers to a take from a different shot or episode.");
        }
        if (!take.storage_path) throw new Error("A clip has no stored video asset.");
        if (take.is_mock) {
          throw new Error("A development placeholder clip cannot be exported as a real episode.");
        }
        return {
          ...clip,
          storagePath: take.storage_path as string,
          mimeType: take.mime_type as string,
        };
      });

    const { count: totalShots } = await supabase
      .from("shots")
      .select("id", { count: "exact", head: true })
      .eq("episode_id", episode.id);

    const { data: project } = await supabase
      .from("projects")
      .select("format, title")
      .eq("id", episode.project_id)
      .maybeSingle();
    const aspect: "9:16" | "16:9" = project?.format === "horizontal_16_9" ? "16:9" : "9:16";
    const preset = EXPORT_PRESETS[aspect];

    const duration =
      resolved.reduce((sum, clip) => sum + clipDuration(clip), 0) +
      (timeline.titleCard.enabled ? timeline.titleCard.durationSeconds : 0);

    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: record, error: insertError } = await db
      .from("episode_exports")
      .insert({
        project_id: episode.project_id,
        episode_id: episode.id,
        owner_id: userId,
        state: "queued",
        preset: preset.preset,
        aspect,
        width: preset.width,
        height: preset.height,
        fps: preset.fps,
        timeline: {
          bucket: "shot-videos",
          clips: resolved,
          titleCard: timeline.titleCard,
          subtitlesSrt: timeline.subtitlesSrt,
          burnSubtitles: timeline.burnSubtitles,
          episodeTitle: episode.title,
          projectTitle: project?.title ?? "",
        } as unknown as never,
        clip_count: resolved.length,
        missing_shot_count: Math.max(0, (totalShots ?? 0) - resolved.length),
        is_partial: (totalShots ?? 0) > resolved.length,
        burn_subtitles: timeline.burnSubtitles && Boolean(timeline.subtitlesSrt),
        duration_seconds: duration,
      })
      .select("*")
      .single();
    if (insertError) throw new Error(insertError.message);
    return record;
  });

const SignExportInput = z.object({ exportId: z.string().uuid() });

export const signExportUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SignExportInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const { data: record, error } = await supabase
      .from("episode_exports")
      .select("id, storage_path, state")
      .eq("id", data.exportId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!record?.storage_path) throw new Error("This export has no file yet.");

    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: signed, error: signError } = await db.storage
      .from(EXPORT_BUCKET)
      .createSignedUrl(record.storage_path, 3600);
    if (signError || !signed) throw new Error("A download link could not be created.");
    return { url: signed.signedUrl };
  });
