import { queryOptions } from "@tanstack/react-query";

import { getProject, listEpisodes, listProjects } from "./project.service";

export const projectKeys = {
  all: ["projects"] as const,
  detail: (id: string) => ["projects", id] as const,
  episodes: (projectId: string) => ["projects", projectId, "episodes"] as const,
};

export const projectsQuery = () =>
  queryOptions({ queryKey: projectKeys.all, queryFn: listProjects });

export const projectQuery = (id: string) =>
  queryOptions({ queryKey: projectKeys.detail(id), queryFn: () => getProject(id) });

export const episodesQuery = (projectId: string) =>
  queryOptions({ queryKey: projectKeys.episodes(projectId), queryFn: () => listEpisodes(projectId) });
