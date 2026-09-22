import { describe, expect, it } from "vitest";

import { EXPORT_PRESETS } from "@/lib/timeline.functions";

type Clip = {
  shotId: string;
  takeId: string;
  order: number;
  durationSeconds: number;
  trimInSeconds: number;
  trimOutSeconds: number;
};

function clipLength(clip: Clip): number {
  return Math.max(0, clip.durationSeconds - clip.trimInSeconds - clip.trimOutSeconds);
}

function timelineDuration(clips: Clip[], titleCardSeconds = 0): number {
  return clips.reduce((sum, clip) => sum + clipLength(clip), 0) + titleCardSeconds;
}

/** Mirrors the ownership validation performed by saveEpisodeTimeline / requestEpisodeExport. */
function validateClips(
  clips: Clip[],
  takes: { id: string; shot_id: string; episode_id: string; storage_path: string | null; is_mock: boolean }[],
  episodeId: string,
) {
  const byId = new Map(takes.map((t) => [t.id, t]));
  for (const clip of clips) {
    const take = byId.get(clip.takeId);
    if (!take) throw new Error("A clip refers to a video take you do not have access to.");
    if (take.episode_id !== episodeId || take.shot_id !== clip.shotId) {
      throw new Error("A clip refers to a take from a different shot or episode.");
    }
    if (!take.storage_path) throw new Error("A clip has no stored video asset.");
    if (take.is_mock) throw new Error("A development placeholder clip cannot be exported.");
  }
  return true;
}

const baseClip = (over: Partial<Clip> = {}): Clip => ({
  shotId: "shot-1",
  takeId: "take-1",
  order: 0,
  durationSeconds: 5,
  trimInSeconds: 0,
  trimOutSeconds: 0,
  ...over,
});

describe("export presets", () => {
  it("uses one preset per aspect ratio", () => {
    expect(EXPORT_PRESETS["9:16"]).toMatchObject({ width: 1080, height: 1920, fps: 30 });
    expect(EXPORT_PRESETS["16:9"]).toMatchObject({ width: 1920, height: 1080, fps: 30 });
  });
});

describe("timeline duration", () => {
  it("subtracts trim from each clip", () => {
    const clips = [
      baseClip({ trimInSeconds: 1 }),
      baseClip({ shotId: "shot-2", takeId: "take-2", order: 1, trimOutSeconds: 2 }),
    ];
    expect(timelineDuration(clips)).toBe(7);
  });

  it("never returns a negative clip length", () => {
    expect(clipLength(baseClip({ trimInSeconds: 4, trimOutSeconds: 4 }))).toBe(0);
  });

  it("includes the title card", () => {
    expect(timelineDuration([baseClip()], 3)).toBe(8);
  });
});

describe("timeline clip validation", () => {
  const takes = [
    { id: "take-1", shot_id: "shot-1", episode_id: "ep-1", storage_path: "a.mp4", is_mock: false },
    { id: "take-2", shot_id: "shot-2", episode_id: "ep-2", storage_path: "b.mp4", is_mock: false },
    { id: "take-3", shot_id: "shot-3", episode_id: "ep-1", storage_path: null, is_mock: false },
    { id: "take-4", shot_id: "shot-4", episode_id: "ep-1", storage_path: "d.mp4", is_mock: true },
  ];

  it("accepts takes from this episode and shot", () => {
    expect(validateClips([baseClip()], takes, "ep-1")).toBe(true);
  });

  it("rejects an unknown take", () => {
    expect(() => validateClips([baseClip({ takeId: "nope" })], takes, "ep-1")).toThrow(
      /do not have access/,
    );
  });

  it("rejects a take from another episode", () => {
    expect(() =>
      validateClips([baseClip({ shotId: "shot-2", takeId: "take-2" })], takes, "ep-1"),
    ).toThrow(/different shot or episode/);
  });

  it("rejects a take whose shot does not match the clip", () => {
    expect(() => validateClips([baseClip({ takeId: "take-3" })], takes, "ep-1")).toThrow(
      /different shot or episode/,
    );
  });

  it("rejects a take without a stored asset", () => {
    expect(() =>
      validateClips([baseClip({ shotId: "shot-3", takeId: "take-3" })], takes, "ep-1"),
    ).toThrow(/no stored video asset/);
  });

  it("rejects a placeholder take", () => {
    expect(() =>
      validateClips([baseClip({ shotId: "shot-4", takeId: "take-4" })], takes, "ep-1"),
    ).toThrow(/placeholder/);
  });
});
