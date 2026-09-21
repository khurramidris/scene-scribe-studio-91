import type { Database } from "@/integrations/supabase/types";

export type StoryBible = Database["public"]["Tables"]["story_bibles"]["Row"];
export type StoryArtifact = Database["public"]["Tables"]["story_artifacts"]["Row"];
export type StoryOutline = Database["public"]["Tables"]["story_outlines"]["Row"];
export type ContentRevision = Database["public"]["Tables"]["content_revisions"]["Row"];
export type ApprovalStatus = Database["public"]["Enums"]["approval_status"];
export type StoryArtifactKind = Database["public"]["Enums"]["story_artifact_kind"];

export type OutlineBeat = { title: string; description: string };

export const ARTIFACT_LABELS: Record<StoryArtifactKind, string> = {
  premise: "Premise",
  logline: "Concept",
  concept: "Concept",
  synopsis: "Synopsis",
  treatment: "Treatment",
};

export const STATUS_LABELS: Record<ApprovalStatus, string> = {
  draft: "Draft",
  pending: "In review",
  approved: "Approved",
  rejected: "Rejected",
};

export function readBeats(value: unknown): OutlineBeat[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const beat = item as Record<string, unknown>;
    if (typeof beat['title'] !== "string" || typeof beat['description'] !== "string") return [];
    return [{ title: beat['title'], description: beat['description'] }];
  });
}

export function readStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}
