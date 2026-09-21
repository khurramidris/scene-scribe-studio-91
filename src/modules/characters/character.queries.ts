import { queryOptions } from "@tanstack/react-query";

import { listCharacters, listReferences, listRelationships } from "./character.service";

export const characterKeys = {
  list: (projectId: string) => ["characters", projectId] as const,
  references: (projectId: string) => ["characters", projectId, "references"] as const,
  relationships: (projectId: string) => ["characters", projectId, "relationships"] as const,
};

export const charactersQuery = (projectId: string) =>
  queryOptions({ queryKey: characterKeys.list(projectId), queryFn: () => listCharacters(projectId) });

export const referencesQuery = (projectId: string) =>
  queryOptions({
    queryKey: characterKeys.references(projectId),
    queryFn: () => listReferences(projectId),
  });

export const relationshipsQuery = (projectId: string) =>
  queryOptions({
    queryKey: characterKeys.relationships(projectId),
    queryFn: () => listRelationships(projectId),
  });
