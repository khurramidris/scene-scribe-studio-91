import { queryOptions } from "@tanstack/react-query";

import { listEpisodeFrames, listEpisodeTakes, listJobs } from "./production.service";

export const productionKeys = {
  frames: (episodeId: string) => ["storyboard-frames", episodeId] as const,
  takes: (episodeId: string) => ["video-takes", episodeId] as const,
  jobs: (projectId?: string) => ["production-jobs", projectId ?? "all"] as const,
};

export const framesQuery = (episodeId: string) =>
  queryOptions({
    queryKey: productionKeys.frames(episodeId),
    queryFn: () => listEpisodeFrames(episodeId),
    enabled: Boolean(episodeId),
  });

export const takesQuery = (episodeId: string) =>
  queryOptions({
    queryKey: productionKeys.takes(episodeId),
    queryFn: () => listEpisodeTakes(episodeId),
    enabled: Boolean(episodeId),
  });

export const jobsQuery = (projectId?: string) =>
  queryOptions({
    queryKey: productionKeys.jobs(projectId),
    queryFn: () => listJobs(projectId),
    refetchInterval: 8000,
  });
