import { queryOptions } from "@tanstack/react-query";

import {
  listLocations,
  listProjectScenes,
  listSceneCharacters,
  listScenes,
  listScreenplays,
} from "./screenplay.service";
import { listShotCharacters, listShots } from "./shot.service";

export const screenplayKeys = {
  list: (projectId: string) => ["screenplays", projectId] as const,
  scenes: (screenplayId: string) => ["scenes", "screenplay", screenplayId] as const,
  projectScenes: (projectId: string) => ["scenes", "project", projectId] as const,
  sceneCharacters: (projectId: string) => ["scene-characters", projectId] as const,
  shots: (sceneId: string) => ["shots", sceneId] as const,
  shotCharacters: (projectId: string) => ["shot-characters", projectId] as const,
  locations: (projectId: string) => ["locations", projectId] as const,
};

export const screenplaysQuery = (projectId: string) =>
  queryOptions({
    queryKey: screenplayKeys.list(projectId),
    queryFn: () => listScreenplays(projectId),
  });

export const scenesQuery = (screenplayId: string | null) =>
  queryOptions({
    queryKey: screenplayKeys.scenes(screenplayId ?? "none"),
    queryFn: () => (screenplayId ? listScenes(screenplayId) : Promise.resolve([])),
    enabled: Boolean(screenplayId),
  });

export const projectScenesQuery = (projectId: string) =>
  queryOptions({
    queryKey: screenplayKeys.projectScenes(projectId),
    queryFn: () => listProjectScenes(projectId),
  });

export const sceneCharactersQuery = (projectId: string) =>
  queryOptions({
    queryKey: screenplayKeys.sceneCharacters(projectId),
    queryFn: () => listSceneCharacters(projectId),
  });

export const shotsQuery = (sceneId: string | null) =>
  queryOptions({
    queryKey: screenplayKeys.shots(sceneId ?? "none"),
    queryFn: () => (sceneId ? listShots(sceneId) : Promise.resolve([])),
    enabled: Boolean(sceneId),
  });

export const shotCharactersQuery = (projectId: string) =>
  queryOptions({
    queryKey: screenplayKeys.shotCharacters(projectId),
    queryFn: () => listShotCharacters(projectId),
  });

export const locationsQuery = (projectId: string) =>
  queryOptions({
    queryKey: screenplayKeys.locations(projectId),
    queryFn: () => listLocations(projectId),
  });
