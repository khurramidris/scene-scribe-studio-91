import type { Database } from "@/integrations/supabase/types";

export type StoryboardFrame = Database["public"]["Tables"]["storyboard_frames"]["Row"];
export type VideoTake = Database["public"]["Tables"]["video_takes"]["Row"];
export type ProductionJob = Database["public"]["Tables"]["production_jobs"]["Row"];
export type JobState = Database["public"]["Enums"]["production_job_state"];

export const JOB_STATE_LABELS: Record<JobState, string> = {
  queued: "Queued",
  submitting: "Submitting",
  processing: "Rendering",
  downloading: "Saving",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

export const ACTIVE_JOB_STATES: JobState[] = ["queued", "submitting", "processing", "downloading"];

export function isActive(job: ProductionJob): boolean {
  return ACTIVE_JOB_STATES.includes(job.state);
}

export function elapsedLabel(job: ProductionJob): string {
  const start = new Date(job.submitted_at ?? job.created_at).getTime();
  const end = job.completed_at ? new Date(job.completed_at).getTime() : Date.now();
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

/* ------------------------------------------------------------------ */
/* Episode editor contracts (next phase — data shapes only)            */
/* ------------------------------------------------------------------ */

/** One approved take placed on the episode timeline. */
export type TimelineClip = {
  shotId: string;
  sceneId: string;
  takeId: string;
  order: number;
  /** Seconds from the start of the episode. */
  startAt: number;
  durationSeconds: number;
  trimInSeconds?: number;
  trimOutSeconds?: number;
  transitionIn?: "cut" | "dissolve" | "fade";
};

export type TimelineAudioTrack = {
  kind: "dialogue" | "music" | "ambience" | "sfx";
  assetPath: string;
  startAt: number;
  durationSeconds: number;
  gainDb?: number;
};

export type TimelineSubtitle = {
  startAt: number;
  endAt: number;
  language: string;
  text: string;
};

export type EpisodeTimeline = {
  episodeId: string;
  aspect: "9:16" | "16:9";
  clips: TimelineClip[];
  audio: TimelineAudioTrack[];
  subtitles: TimelineSubtitle[];
};

export type EpisodeExportRequest = {
  episodeId: string;
  timeline: EpisodeTimeline;
  resolution: string;
  container: "mp4" | "mov";
  burnSubtitles: boolean;
};
