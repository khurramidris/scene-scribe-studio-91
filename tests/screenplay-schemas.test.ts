import { describe, expect, it } from "vitest";

import {
  clampShotDuration,
  screenplaySchema,
  shotsSchema,
  SHOT_DURATION_LIMITS,
  singleSceneSchema,
} from "@/modules/screenplay/screenplay.schemas";
import { reorderList } from "@/modules/screenplay/screenplay.service";
import {
  estimateRuntimeSeconds,
  formatRuntime,
  readContinuity,
  readDialogue,
  readList,
} from "@/modules/screenplay/screenplay.types";

const validScene = {
  scene_number: 1,
  heading: "INT. TEA HOUSE - NIGHT",
  setting: "interior" as const,
  location_name: "Tea house",
  time_of_day: "Night",
  objective: "Sara confronts her brother",
  action: "Sara pushes through the beaded curtain.",
  atmosphere: "Smoky, close",
  lighting: "Single bulb overhead",
  props: ["teapot"],
  wardrobe: ["grey shawl"],
  characters: ["Sara"],
  estimated_duration_seconds: 25,
  dialogue: [{ character: "Sara", parenthetical: "quiet", line: "You lied to me." }],
};

describe("screenplay contracts", () => {
  it("accepts a well-formed screenplay", () => {
    const parsed = screenplaySchema.safeParse({
      title: "Episode one",
      logline: "A confrontation.",
      scenes: [validScene],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a screenplay with no scenes", () => {
    expect(screenplaySchema.safeParse({ title: "x", logline: "y", scenes: [] }).success).toBe(false);
  });

  it("rejects an invalid setting value", () => {
    const parsed = singleSceneSchema.safeParse({ scene: { ...validScene, setting: "underwater" } });
    expect(parsed.success).toBe(false);
  });

  it("rejects a shot list missing continuity", () => {
    const parsed = shotsSchema.safeParse({
      shots: [{ shot_number: 1, shot_type: "Wide", duration_seconds: 4 }],
    });
    expect(parsed.success).toBe(false);
  });
});

describe("shot duration limits", () => {
  it("clamps to the configured provider range", () => {
    expect(clampShotDuration(0.2)).toBe(SHOT_DURATION_LIMITS.min);
    expect(clampShotDuration(900)).toBe(SHOT_DURATION_LIMITS.max);
    expect(clampShotDuration(6)).toBe(6);
    expect(clampShotDuration(Number.NaN)).toBe(SHOT_DURATION_LIMITS.default);
  });
});

describe("ordering", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("moves an item down", () => {
    expect(reorderList(items, "a", 1).map((i) => i.id)).toEqual(["b", "a", "c"]);
  });

  it("moves an item up", () => {
    expect(reorderList(items, "c", -1).map((i) => i.id)).toEqual(["a", "c", "b"]);
  });

  it("is a no-op at the boundaries", () => {
    expect(reorderList(items, "a", -1)).toBe(items);
    expect(reorderList(items, "c", 1)).toBe(items);
  });
});

describe("stored json readers", () => {
  it("keeps only well-formed dialogue lines", () => {
    expect(readDialogue([{ character: "A", line: "hi" }, { line: "orphan" }, 3])).toEqual([
      { character: "A", parenthetical: "", line: "hi" },
    ]);
  });

  it("keeps only strings in lists", () => {
    expect(readList(["a", 2, null, "b"])).toEqual(["a", "b"]);
  });

  it("keeps only string continuity fields", () => {
    expect(readContinuity({ camera_direction: "left to right", frames: 12 })).toEqual({
      camera_direction: "left to right",
    });
  });
});

describe("runtime estimates", () => {
  it("converts words to seconds at 140 wpm", () => {
    expect(estimateRuntimeSeconds(140)).toBe(60);
  });

  it("formats minutes and seconds", () => {
    expect(formatRuntime(95)).toBe("1m 35s");
  });
});
