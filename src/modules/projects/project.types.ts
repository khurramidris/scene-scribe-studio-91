import type { Database } from "@/integrations/supabase/types";

export type Project = Database["public"]["Tables"]["projects"]["Row"];
export type Episode = Database["public"]["Tables"]["episodes"]["Row"];
export type Season = Database["public"]["Tables"]["seasons"]["Row"];

export type AspectFormat = Database["public"]["Enums"]["aspect_format"];
export type ProjectStatus = Database["public"]["Enums"]["project_status"];

export const FORMAT_LABELS: Record<AspectFormat, string> = {
  vertical_9_16: "Vertical microdrama (9:16)",
  horizontal_16_9: "Horizontal episode (16:9)",
};

export const STATUS_LABELS: Record<ProjectStatus, string> = {
  draft: "Draft",
  in_production: "In production",
  completed: "Completed",
  archived: "Archived",
};

export type CreateProjectInput = {
  title: string;
  logline?: string;
  genre?: string;
  tone?: string;
  format: AspectFormat;
};

export type UpdateProjectInput = Partial<
  Pick<
    Project,
    "title" | "logline" | "synopsis" | "genre" | "tone" | "format" | "status" | "language"
  >
>;
