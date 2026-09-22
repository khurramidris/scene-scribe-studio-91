import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { getEpisodeTimeline } from "@/lib/timeline.functions";

export const timelineKeys = {
  timeline: (episodeId: string) => ["episode-timeline", episodeId] as const,
  exports: (episodeId: string) => ["episode-exports", episodeId] as const,
};

export function timelineQuery(episodeId: string | undefined) {
  return queryOptions({
    queryKey: timelineKeys.timeline(episodeId ?? "none"),
    enabled: Boolean(episodeId),
    queryFn: () => getEpisodeTimeline({ data: { episodeId: episodeId! } }),
  });
}

export function exportsQuery(episodeId: string | undefined) {
  return queryOptions({
    queryKey: timelineKeys.exports(episodeId ?? "none"),
    enabled: Boolean(episodeId),
    refetchInterval: 8000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("episode_exports")
        .select("*")
        .eq("episode_id", episodeId!)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}
