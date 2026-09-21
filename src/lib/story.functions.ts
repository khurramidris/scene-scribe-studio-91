import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { STORY_TASKS, TASK_SCHEMAS, type StoryTask } from "@/modules/story/story.schemas";

const GenerateInput = z.object({
  projectId: z.string().uuid(),
  task: z.enum(STORY_TASKS),
  language: z.string().min(2).max(12),
  seasonId: z.string().uuid().nullish(),
  episodeId: z.string().uuid().nullish(),
  instructions: z.string().max(2000).optional(),
});

const SYSTEM = `You are a senior showrunner and development executive for short-form serialised drama (microdramas).
You write producible, culturally specific, emotionally driven material.
Respect every piece of approved material you are given: never contradict it, build on it.
Return ONLY data that matches the requested schema.`;

/**
 * Generates one piece of story development, validates it against the schema on
 * the server, and persists it under the signed-in owner. Approved material is
 * never overwritten: artifacts are append-only and an approved story bible must
 * be un-approved before it can be regenerated.
 */
export const generateStory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => GenerateInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("*")
      .eq("id", data.projectId)
      .maybeSingle();
    if (projectError) throw new Error(projectError.message);
    if (!project) throw new Error("Production not found.");

    const [{ data: bible }, { data: approved }, { data: characters }] = await Promise.all([
      supabase.from("story_bibles").select("*").eq("project_id", data.projectId).maybeSingle(),
      supabase
        .from("story_artifacts")
        .select("kind, title, content")
        .eq("project_id", data.projectId)
        .eq("status", "approved"),
      supabase
        .from("characters")
        .select("name, role, description, motivation, arc")
        .eq("project_id", data.projectId),
    ]);

    if (data.task === "bible" && bible?.status === "approved") {
      throw new Error("The story bible is approved. Unlock it before regenerating.");
    }

    const spec = TASK_SCHEMAS[data.task as StoryTask];
    const contextLines = [
      `Title: ${project.title}`,
      project.premise ? `Premise: ${project.premise}` : null,
      project.logline ? `Logline: ${project.logline}` : null,
      project.genre ? `Genre: ${project.genre}` : null,
      project.tone ? `Tone: ${project.tone}` : null,
      project.target_audience ? `Target audience: ${project.target_audience}` : null,
      `Format: ${project.format === "vertical_9_16" ? "vertical 9:16 microdrama, 60-120s episodes" : "horizontal 16:9 episodes"}`,
      project.synopsis ? `Existing synopsis: ${project.synopsis}` : null,
      bible?.world ? `Approved world: ${bible.world}` : null,
      bible?.central_conflict ? `Approved central conflict: ${bible.central_conflict}` : null,
      Array.isArray(bible?.themes) && bible.themes.length
        ? `Approved themes: ${JSON.stringify(bible.themes)}`
        : null,
      Array.isArray(bible?.narrative_rules) && bible.narrative_rules.length
        ? `Approved narrative rules: ${JSON.stringify(bible.narrative_rules)}`
        : null,
      approved?.length
        ? `Approved story material (do not contradict):\n${approved
            .map((a) => `- [${a.kind}] ${a.title ?? ""} ${a.content}`.slice(0, 1200))
            .join("\n")}`
        : null,
      characters?.length
        ? `Existing characters: ${characters.map((c) => `${c.name} (${c.role ?? "role tbd"})`).join(", ")}`
        : null,
      data.instructions ? `Additional direction from the producer: ${data.instructions}` : null,
    ].filter(Boolean);

    const { resolveTextProvider } = await import("@/services/ai/text.registry.server");
    const provider = resolveTextProvider();
    const result = await provider.generateStructured({
      schemaName: spec.name,
      schema: spec.json,
      system: SYSTEM,
      prompt: `${spec.instruction}\n\nProduction brief:\n${contextLines.join("\n")}`,
      language: data.language,
    });

    const parsed = spec.zod.safeParse(result.data);
    if (!parsed.success) {
      throw new Error("The AI returned data that did not match the expected structure. Try again.");
    }

    const meta = {
      provider: result.provider,
      model: result.model,
      task: data.task,
      generated_at: new Date().toISOString(),
    };
    const base = {
      project_id: data.projectId,
      owner_id: userId,
      language: data.language,
      is_ai_generated: true,
      is_mock: result.isMock,
      generation_metadata: meta,
    };

    if (data.task === "concepts") {
      const value = parsed.data as z.infer<typeof import("@/modules/story/story.schemas").conceptsSchema>;
      const { data: rows, error } = await supabase
        .from("story_artifacts")
        .insert(
          value.concepts.map((c) => ({
            ...base,
            kind: "logline" as const,
            title: c.title,
            content: `${c.logline}\n\nAngle: ${c.angle}`,
          })),
        )
        .select("*");
      if (error) throw new Error(error.message);
      return { kind: "artifacts" as const, rows, isMock: result.isMock };
    }

    if (data.task === "synopsis") {
      const value = parsed.data as { synopsis: string; treatment: string };
      const { data: rows, error } = await supabase
        .from("story_artifacts")
        .insert([
          { ...base, kind: "synopsis" as const, title: "Synopsis", content: value.synopsis },
          { ...base, kind: "treatment" as const, title: "Treatment", content: value.treatment },
        ])
        .select("*");
      if (error) throw new Error(error.message);
      return { kind: "artifacts" as const, rows, isMock: result.isMock };
    }

    if (data.task === "bible") {
      const value = parsed.data as {
        world: string;
        central_conflict: string;
        themes: string[];
        narrative_rules: string[];
        tone_guidelines: string;
      };
      if (bible) {
        await supabase.from("content_revisions").insert({
          project_id: data.projectId,
          owner_id: userId,
          entity_type: "story_bible",
          entity_id: bible.id,
          content: bible as never,
          note: "Superseded by AI regeneration",
        });
      }
      const { data: row, error } = await supabase
        .from("story_bibles")
        .upsert(
          {
            project_id: data.projectId,
            owner_id: userId,
            language: data.language,
            world: value.world,
            central_conflict: value.central_conflict,
            themes: value.themes,
            narrative_rules: value.narrative_rules,
            tone_guidelines: value.tone_guidelines,
            status: "draft" as const,
            generation_metadata: meta,
          },
          { onConflict: "project_id" },
        )
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return { kind: "bible" as const, row, isMock: result.isMock };
    }

    if (data.task === "season_outline" || data.task === "episode_outline") {
      const value = parsed.data as {
        summary: string;
        beats: Array<{ title: string; description: string }>;
      };
      const { data: row, error } = await supabase
        .from("story_outlines")
        .insert({
          ...base,
          scope: data.task === "season_outline" ? ("season" as const) : ("episode" as const),
          season_id: data.seasonId ?? null,
          episode_id: data.episodeId ?? null,
          summary: value.summary,
          beats: value.beats,
        })
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return { kind: "outline" as const, row, isMock: result.isMock };
    }

    // characters
    const value = parsed.data as {
      characters: Array<Record<string, string>>;
    };
    const existing = new Set((characters ?? []).map((c) => String(c.name).toLowerCase()));
    const fresh = value.characters.filter((c) => !existing.has(String(c['name'] ?? '').toLowerCase()));
    if (fresh.length === 0) {
      return { kind: "characters" as const, rows: [], isMock: result.isMock };
    }
    const { data: rows, error } = await supabase
      .from("characters")
      .insert(
        fresh.map((c, index) => ({
          project_id: data.projectId,
          owner_id: userId,
          language: data.language,
          is_ai_generated: true,
          is_mock: result.isMock,
          generation_metadata: meta,
          name: c['name'] ?? "Unnamed",
          role: c['role'] ?? null,
          age_range: c['age_range'] ?? null,
          description: c['description'] ?? null,
          personality: c['personality'] ?? null,
          motivation: c['motivation'] ?? null,
          backstory: c['backstory'] ?? null,
          arc: c['arc'] ?? null,
          appearance_prompt: c['appearance_prompt'] ?? null,
          sort_order: existing.size + index,
        })),
      )
      .select("*");
    if (error) throw new Error(error.message);
    return { kind: "characters" as const, rows, isMock: result.isMock };
  });
