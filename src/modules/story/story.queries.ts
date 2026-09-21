import { queryOptions } from "@tanstack/react-query";

import { getBible, listArtifacts, listOutlines } from "./story.service";

export const storyKeys = {
  artifacts: (projectId: string) => ["story", projectId, "artifacts"] as const,
  bible: (projectId: string) => ["story", projectId, "bible"] as const,
  outlines: (projectId: string) => ["story", projectId, "outlines"] as const,
};

export const artifactsQuery = (projectId: string) =>
  queryOptions({ queryKey: storyKeys.artifacts(projectId), queryFn: () => listArtifacts(projectId) });

export const bibleQuery = (projectId: string) =>
  queryOptions({ queryKey: storyKeys.bible(projectId), queryFn: () => getBible(projectId) });

export const outlinesQuery = (projectId: string) =>
  queryOptions({ queryKey: storyKeys.outlines(projectId), queryFn: () => listOutlines(projectId) });
