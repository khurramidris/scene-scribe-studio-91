import { describe, expect, it } from "vitest";

import { STORY_TASKS, TASK_SCHEMAS, languageLabel } from "../src/modules/story/story.schemas";

describe("story structured output contracts", () => {
  it("defines a schema, zod validator and instruction for every task", () => {
    for (const task of STORY_TASKS) {
      const entry = TASK_SCHEMAS[task];
      expect(entry.name).toBeTruthy();
      expect(entry.instruction.length).toBeGreaterThan(10);
      expect(entry.json).toBeTruthy();
      expect(typeof entry.zod.safeParse).toBe("function");
    }
  });

  it("rejects malformed AI output before it can reach the database", () => {
    expect(TASK_SCHEMAS.concepts.zod.safeParse({ concepts: [] }).success).toBe(false);
    expect(TASK_SCHEMAS.synopsis.zod.safeParse({ synopsis: "x" }).success).toBe(false);
  });

  it("accepts a well-formed concepts response", () => {
    const result = TASK_SCHEMAS.concepts.zod.safeParse({
      concepts: [{ title: "A", logline: "B", angle: "C" }],
    });
    expect(result.success).toBe(true);
  });

  it("labels configured languages including Urdu", () => {
    expect(languageLabel("ur")).toMatch(/Urdu/i);
    expect(languageLabel("en")).toMatch(/English/i);
  });
});
