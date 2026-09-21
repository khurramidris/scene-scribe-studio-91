import { z } from "zod";

/**
 * Structured output contracts. The JSON Schema is sent to the AI provider
 * (strict mode) and the zod schema re-validates the response on the server, so
 * malformed AI output can never reach the database.
 */

export const STORY_TASKS = [
  "concepts",
  "synopsis",
  "bible",
  "season_outline",
  "episode_outline",
  "characters",
] as const;
export type StoryTask = (typeof STORY_TASKS)[number];

const strictObject = (properties: Record<string, unknown>) => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});

const str = { type: "string" } as const;
const strArray = { type: "array", items: str } as const;

export const conceptsJsonSchema = strictObject({
  concepts: {
    type: "array",
    items: strictObject({ title: str, logline: str, angle: str }),
  },
});
export const conceptsSchema = z.object({
  concepts: z
    .array(z.object({ title: z.string(), logline: z.string(), angle: z.string() }))
    .min(1),
});

export const synopsisJsonSchema = strictObject({ synopsis: str, treatment: str });
export const synopsisSchema = z.object({ synopsis: z.string().min(1), treatment: z.string().min(1) });

export const bibleJsonSchema = strictObject({
  world: str,
  central_conflict: str,
  themes: strArray,
  narrative_rules: strArray,
  tone_guidelines: str,
});
export const bibleSchema = z.object({
  world: z.string(),
  central_conflict: z.string(),
  themes: z.array(z.string()),
  narrative_rules: z.array(z.string()),
  tone_guidelines: z.string(),
});

export const outlineJsonSchema = strictObject({
  summary: str,
  beats: {
    type: "array",
    items: strictObject({ title: str, description: str }),
  },
});
export const outlineSchema = z.object({
  summary: z.string(),
  beats: z.array(z.object({ title: z.string(), description: z.string() })).min(1),
});

export const charactersJsonSchema = strictObject({
  characters: {
    type: "array",
    items: strictObject({
      name: str,
      role: str,
      age_range: str,
      description: str,
      personality: str,
      motivation: str,
      backstory: str,
      arc: str,
      appearance_prompt: str,
    }),
  },
});
export const charactersSchema = z.object({
  characters: z
    .array(
      z.object({
        name: z.string().min(1),
        role: z.string(),
        age_range: z.string(),
        description: z.string(),
        personality: z.string(),
        motivation: z.string(),
        backstory: z.string(),
        arc: z.string(),
        appearance_prompt: z.string(),
      }),
    )
    .min(1),
});

export const TASK_SCHEMAS: Record<
  StoryTask,
  { name: string; json: Record<string, unknown>; zod: z.ZodTypeAny; instruction: string }
> = {
  concepts: {
    name: "story_concepts",
    json: conceptsJsonSchema,
    zod: conceptsSchema,
    instruction:
      "Propose 4 distinct alternative story concepts for this drama. Each has a short title, a one-sentence logline, and the creative angle that makes it different.",
  },
  synopsis: {
    name: "story_synopsis",
    json: synopsisJsonSchema,
    zod: synopsisSchema,
    instruction:
      "Write a tight synopsis (150-250 words) and a longer treatment (400-700 words) covering the full arc of the production.",
  },
  bible: {
    name: "story_bible",
    json: bibleJsonSchema,
    zod: bibleSchema,
    instruction:
      "Write the story bible: the fictional world, the central conflict, 3-6 themes, 4-8 narrative rules the writers must respect, and tone guidelines.",
  },
  season_outline: {
    name: "season_outline",
    json: outlineJsonSchema,
    zod: outlineSchema,
    instruction:
      "Write a season outline: a season summary and one beat per episode, in broadcast order. Each beat has an episode title and what happens in it.",
  },
  episode_outline: {
    name: "episode_outline",
    json: outlineJsonSchema,
    zod: outlineSchema,
    instruction:
      "Write an episode outline: an episode summary and the ordered scene beats. Each beat has a scene title and what happens in it.",
  },
  characters: {
    name: "character_profiles",
    json: charactersJsonSchema,
    zod: charactersSchema,
    instruction:
      "Create 4-6 core character profiles. For each, give the dramatic role, age range, a physical/behavioural description, personality, motivation, backstory, narrative arc, and an appearance_prompt: a concise, purely visual English description usable for image generation (never translate appearance_prompt).",
  },
};

export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "ur", label: "اردو (Urdu)" },
  { code: "hi", label: "हिन्दी (Hindi)" },
  { code: "ar", label: "العربية (Arabic)" },
  { code: "es", label: "Español (Spanish)" },
  { code: "tr", label: "Türkçe (Turkish)" },
] as const;

export function languageLabel(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.label ?? code;
}
