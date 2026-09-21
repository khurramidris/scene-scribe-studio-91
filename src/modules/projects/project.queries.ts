import { queryOptions } from "@tanstack/react-query";

import { getProject, listEpisodes, listProjects } from "./project.service";
import { listSeasons } from "./season.service";

export const projectKeys = {
  all: ["projects"] as const,
  detail: (id: string) => ["projects", id] as const,
  episodes: (projectId: string) => ["projects", projectId, "episodes"] as const,
  seasons: (projectId: string) => ["projects", projectId, "seasons"] as const,
};

export const seasonsQuery = (projectId: string) =>
  queryOptions({ queryKey: projectKeys.seasons(projectId), queryFn: () => listSeasons(projectId) });

export const projectsQuery = () =>
  queryOptions({ queryKey: projectKeys.all, queryFn: listProjects });

export const projectQuery = (id: string) =>
  queryOptions({ queryKey: projectKeys.detail(id), queryFn: () => getProject(id) });

export const episodesQuery = (projectId: string) =>
  queryOptions({ queryKey: projectKeys.episodes(projectId), queryFn: () => listEpisodes(projectId) });
