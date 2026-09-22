import { supabase } from "@/integrations/supabase/client";
import { rejectStoryboardFrame, rejectVideoTake } from "@/lib/storyboard.functions";

import type { ProductionJob, StoryboardFrame, VideoTake } from "./production.types";

export async function listEpisodeFrames(episodeId: string): Promise<StoryboardFrame[]> {
  const { data, error } = await supabase
    .from("storyboard_frames")
    .select("*")
    .eq("episode_id", episodeId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listEpisodeTakes(episodeId: string): Promise<VideoTake[]> {
  const { data, error } = await supabase
    .from("video_takes")
    .select("*")
    .eq("episode_id", episodeId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listJobs(projectId?: string): Promise<ProductionJob[]> {
  let query = supabase
    .from("production_jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  if (projectId) query = query.eq("project_id", projectId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Frames are never silently removed: an approved frame must be unlocked first. */
export async function deleteFrame(frame: StoryboardFrame): Promise<void> {
  if (frame.status === "approved") {
    throw new Error("This frame is approved. Select another frame before deleting it.");
  }
  const { error } = await supabase.from("storyboard_frames").delete().eq("id", frame.id);
  if (error) throw new Error(error.message);
}

/**
 * Generated-media rows are written server side only: the browser may read and
 * delete its own rows, but status changes go through a server function that
 * re-checks ownership with the privileged client.
 */
export async function rejectFrame(frameId: string): Promise<void> {
  await rejectStoryboardFrame({ data: { frameId } });
}

export async function rejectTake(takeId: string): Promise<void> {
  await rejectVideoTake({ data: { takeId } });
}
