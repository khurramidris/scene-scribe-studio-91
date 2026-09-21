import { supabase } from "@/integrations/supabase/client";

import type { Episode, Season } from "./project.types";

async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("You must be signed in.");
  return data.user.id;
}

export async function listSeasons(projectId: string): Promise<Season[]> {
  const { data, error } = await supabase
    .from("seasons")
    .select("*")
    .eq("project_id", projectId)
    .order("number", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createSeason(projectId: string, title: string): Promise<Season> {
  const ownerId = await requireUserId();
  const existing = await listSeasons(projectId);
  const nextNumber = existing.reduce((max, s) => Math.max(max, s.number), 0) + 1;
  const { data, error } = await supabase
    .from("seasons")
    .insert({
      project_id: projectId,
      owner_id: ownerId,
      number: nextNumber,
      title: title.trim() || `Season ${nextNumber}`,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateSeason(
  id: string,
  patch: Partial<Pick<Season, "title" | "summary" | "number">>,
): Promise<Season> {
  const { data, error } = await supabase
    .from("seasons")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteSeason(id: string): Promise<void> {
  const { error } = await supabase.from("seasons").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Swaps a season with its neighbour so the running order stays contiguous. */
export function reorderSeasonList(seasons: Season[], id: string, direction: -1 | 1): Season[] {
  const index = seasons.findIndex((s) => s.id === id);
  const target = index + direction;
  if (index === -1 || target < 0 || target >= seasons.length) return seasons;
  const next = [...seasons];
  const a = next[index]!;
  const b = next[target]!;
  next[index] = b;
  next[target] = a;
  return next.map((season, position) => ({ ...season, number: position + 1 }));
}

export async function moveSeason(
  seasons: Season[],
  id: string,
  direction: -1 | 1,
): Promise<void> {
  const reordered = reorderSeasonList(seasons, id, direction);
  if (reordered === seasons) return;
  // Two-phase write: park numbers out of range first so the (project, number)
  // ordering never collides mid-update.
  for (const season of reordered) {
    const { error } = await supabase
      .from("seasons")
      .update({ number: season.number + 1000 })
      .eq("id", season.id);
    if (error) throw new Error(error.message);
  }
  for (const season of reordered) {
    const { error } = await supabase
      .from("seasons")
      .update({ number: season.number })
      .eq("id", season.id);
    if (error) throw new Error(error.message);
  }
}

export async function assignEpisodeToSeason(
  episodeId: string,
  seasonId: string | null,
): Promise<Episode> {
  const { data, error } = await supabase
    .from("episodes")
    .update({ season_id: seasonId })
    .eq("id", episodeId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}
