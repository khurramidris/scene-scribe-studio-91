import { z } from "zod";

/**
 * Structured contracts for screenplay and shot generation. The JSON Schema is
 * sent to the AI provider in strict mode; the zod schema re-validates the
 * response on the server so malformed output never reaches the database.
 */

const strictObject = (properties: Record<string, unknown>) => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});

const str = { type: "string" } as const;
const num = { type: "number" } as const;
const strArray = { type: "array", items: str } as const;

export const SCENE_SETTINGS = ["interior", "exterior", "other"] as const;
export type SceneSetting = (typeof SCENE_SETTINGS)[number];

const settingEnum = { type: "string", enum: SCENE_SETTINGS } as const;

export const screenplayJsonSchema = strictObject({
  title: str,
  logline: str,
  scenes: {
    type: "array",
    items: strictObject({
      scene_number: num,
      heading: str,
      setting: settingEnum,
      location_name: str,
      time_of_day: str,
      objective: str,
      action: str,
      atmosphere: str,
      lighting: str,
      props: strArray,
      wardrobe: strArray,
      characters: strArray,
      estimated_duration_seconds: num,
      dialogue: {
        type: "array",
        items: strictObject({ character: str, parenthetical: str, line: str }),
      },
    }),
  },
});

export const dialogueLineSchema = z.object({
  character: z.string(),
  parenthetical: z.string().default(""),
  line: z.string(),
});

export const sceneSchema = z.object({
  scene_number: z.number(),
  heading: z.string(),
  setting: z.enum(SCENE_SETTINGS),
  location_name: z.string(),
  time_of_day: z.string(),
  objective: z.string(),
  action: z.string(),
  atmosphere: z.string(),
  lighting: z.string(),
  props: z.array(z.string()),
  wardrobe: z.array(z.string()),
  characters: z.array(z.string()),
  estimated_duration_seconds: z.number(),
  dialogue: z.array(dialogueLineSchema),
});

export const screenplaySchema = z.object({
  title: z.string(),
  logline: z.string(),
  scenes: z.array(sceneSchema).min(1),
});

/** Single-scene regeneration reuses the same scene contract. */
export const singleSceneJsonSchema = strictObject({
  scene: (screenplayJsonSchema as never as { properties: Record<string, { items: unknown }> })
    .properties['scenes']!.items,
});
export const singleSceneSchema = z.object({ scene: sceneSchema });

export const shotsJsonSchema = strictObject({
  shots: {
    type: "array",
    items: strictObject({
      shot_number: num,
      shot_type: str,
      framing: str,
      camera_angle: str,
      camera_movement: str,
      duration_seconds: num,
      description: str,
      action: str,
      dialogue: str,
      emotional_tone: str,
      lighting: str,
      sound_design: str,
      props: strArray,
      wardrobe: strArray,
      characters: strArray,
      image_prompt: str,
      video_prompt: str,
      continuity: strictObject({
        character_positions: str,
        previous_shot_end_state: str,
        camera_direction: str,
        next_shot_start_state: str,
      }),
    }),
  },
});

export const shotSchema = z.object({
  shot_number: z.number(),
  shot_type: z.string(),
  framing: z.string(),
  camera_angle: z.string(),
  camera_movement: z.string(),
  duration_seconds: z.number(),
  description: z.string(),
  action: z.string(),
  dialogue: z.string(),
  emotional_tone: z.string(),
  lighting: z.string(),
  sound_design: z.string(),
  props: z.array(z.string()),
  wardrobe: z.array(z.string()),
  characters: z.array(z.string()),
  image_prompt: z.string(),
  video_prompt: z.string(),
  continuity: z.object({
    character_positions: z.string(),
    previous_shot_end_state: z.string(),
    camera_direction: z.string(),
    next_shot_start_state: z.string(),
  }),
});

export const shotsSchema = z.object({ shots: z.array(shotSchema).min(1) });

export const SHOT_TYPES = [
  "Extreme wide",
  "Wide",
  "Medium wide",
  "Medium",
  "Medium close-up",
  "Close-up",
  "Extreme close-up",
  "Insert",
  "Over-the-shoulder",
  "Two-shot",
  "POV",
] as const;

export const CAMERA_ANGLES = [
  "Eye level",
  "Low angle",
  "High angle",
  "Dutch angle",
  "Overhead",
  "Worm's eye",
] as const;

export const CAMERA_MOVEMENTS = [
  "Static",
  "Pan",
  "Tilt",
  "Dolly in",
  "Dolly out",
  "Tracking",
  "Handheld",
  "Crane",
  "Push in",
  "Slow zoom",
] as const;

/**
 * Shot length limits are a property of the eventual rendering provider, not of
 * the application. They are read from configuration so a different provider can
 * be adopted without code changes.
 */
export const SHOT_DURATION_LIMITS = { min: 1, max: 20, default: 5 } as const;

export function clampShotDuration(seconds: number): number {
  if (!Number.isFinite(seconds)) return SHOT_DURATION_LIMITS.default;
  return Math.min(SHOT_DURATION_LIMITS.max, Math.max(SHOT_DURATION_LIMITS.min, seconds));
}
