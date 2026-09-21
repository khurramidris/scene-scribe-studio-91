import type { Database } from "@/integrations/supabase/types";

export type Screenplay = Database["public"]["Tables"]["screenplays"]["Row"];
export type Scene = Database["public"]["Tables"]["scenes"]["Row"];
export type Shot = Database["public"]["Tables"]["shots"]["Row"];
export type SceneCharacter = Database["public"]["Tables"]["scene_characters"]["Row"];
export type ShotCharacter = Database["public"]["Tables"]["shot_characters"]["Row"];
export type ProductionLocation = Database["public"]["Tables"]["locations"]["Row"];
export type SceneSettingValue = Database["public"]["Enums"]["scene_setting"];
export type ShotProductionStatus = Database["public"]["Enums"]["shot_production_status"];

export type DialogueLine = { character: string; parenthetical?: string; line: string };

export function readDialogue(value: unknown): DialogueLine[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as Record<string, unknown>;
    if (typeof row['character'] !== "string" || typeof row['line'] !== "string") return [];
    return [
      {
        character: row['character'],
        parenthetical: typeof row['parenthetical'] === "string" ? row['parenthetical'] : "",
        line: row['line'],
      },
    ];
  });
}

export function readList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

export function readContinuity(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === "string") out[key] = item;
  }
  return out;
}

/** Words of action plus dialogue in a scene — used for runtime estimates. */
export function sceneWordCount(scene: Scene): number {
  const dialogue = readDialogue(scene.dialogue)
    .map((d) => d.line)
    .join(" ");
  return `${scene.action ?? ""} ${dialogue}`.trim().split(/\s+/).filter(Boolean).length;
}

/** Industry rule of thumb: ~140 spoken words per minute of screen time. */
export function estimateRuntimeSeconds(words: number): number {
  return Math.round((words / 140) * 60);
}

export function formatRuntime(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safe / 60);
  return `${minutes}m ${String(safe % 60).padStart(2, "0")}s`;
}

export const SETTING_LABELS: Record<SceneSettingValue, string> = {
  interior: "INT.",
  exterior: "EXT.",
  other: "—",
};
