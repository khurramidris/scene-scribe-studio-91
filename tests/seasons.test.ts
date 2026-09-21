import { describe, expect, it } from "vitest";

import { reorderSeasonList } from "../src/modules/projects/season.service";
import type { Season } from "../src/modules/projects/project.types";

const season = (id: string, number: number): Season =>
  ({
    id,
    number,
    project_id: "p",
    owner_id: "o",
    title: `S${number}`,
    summary: null,
    created_at: "",
    updated_at: "",
  }) as Season;

describe("season ordering", () => {
  const seasons = [season("a", 1), season("b", 2), season("c", 3)];

  it("moves a season down and renumbers contiguously", () => {
    const result = reorderSeasonList(seasons, "a", 1);
    expect(result.map((s) => s.id)).toEqual(["b", "a", "c"]);
    expect(result.map((s) => s.number)).toEqual([1, 2, 3]);
  });

  it("moves a season up", () => {
    const result = reorderSeasonList(seasons, "c", -1);
    expect(result.map((s) => s.id)).toEqual(["a", "c", "b"]);
  });

  it("is a no-op at the boundaries", () => {
    expect(reorderSeasonList(seasons, "a", -1)).toBe(seasons);
    expect(reorderSeasonList(seasons, "c", 1)).toBe(seasons);
  });
});
