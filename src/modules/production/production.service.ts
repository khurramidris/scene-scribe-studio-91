import { supabase } from "@/integrations/supabase/client";

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

export async function rejectFrame(frameId: string): Promise<void> {
  const { error } = await supabase
    .from("storyboard_frames")
    .update({ status: "rejected", is_selected: false })
    .eq("id", frameId);
  if (error) throw new Error(error.message);
}

export async function rejectTake(takeId: string): Promise<void> {
  const { error } = await supabase
    .from("video_takes")
    .update({ status: "rejected", is_selected: false })
    .eq("id", takeId);
  if (error) throw new Error(error.message);
}
