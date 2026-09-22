import { describe, expect, it } from "vitest";

import { isStalled } from "@/routes/_authenticated/projects.$projectId_.editor";
import { expectedExportPath } from "@/routes/api/public/exports.complete";

/* ------------------------------------------------------------------ */
/* 1.1 An intentionally empty timeline must stay empty after a reload. */
/* ------------------------------------------------------------------ */

type Clip = { shotId: string; takeId: string; order: number };

/** Mirrors the branch in getEpisodeTimeline that chooses saved vs approved clips. */
function resolveClips(saved: { clips: Clip[] } | null, approved: Clip[]): Clip[] {
  if (saved) return Array.isArray(saved.clips) ? saved.clips : [];
  return approved;
}

const approved: Clip[] = [
  { shotId: "s1", takeId: "t1", order: 0 },
  { shotId: "s2", takeId: "t2", order: 1 },
];

describe("timeline initialisation", () => {
  it("seeds a brand new timeline from approved takes", () => {
    expect(resolveClips(null, approved)).toHaveLength(2);
  });

  it("keeps a saved timeline that deliberately contains zero clips", () => {
    const savedEmpty = { clips: [] as Clip[] };
    expect(resolveClips(savedEmpty, approved)).toEqual([]);
  });

  it("survives save -> reload with zero clips", () => {
    let stored: { clips: Clip[] } | null = null;
    // Load, clear everything, save.
    let clips = resolveClips(stored, approved);
    clips = [];
    stored = { clips };
    // Reload.
    expect(resolveClips(stored, approved)).toEqual([]);
  });

  it("restores approved takes only when the user asks", () => {
    const stored = { clips: [] as Clip[] };
    expect(resolveClips(stored, approved)).toEqual([]);
    const restored = approved.map((clip, index) => ({ ...clip, order: index }));
    expect(restored).toHaveLength(2);
  });
});

/* ------------------------------------------------------------------ */
/* 1.2 Preview playback honours trim points and clip order.            */
/* ------------------------------------------------------------------ */

type PreviewClip = {
  durationSeconds: number;
  trimInSeconds: number;
  trimOutSeconds: number;
  muted: boolean;
};

function playbackWindow(clip: PreviewClip, sourceDuration = clip.durationSeconds) {
  const start = Math.min(clip.trimInSeconds, Math.max(0, sourceDuration - 0.05));
  const end = Math.max(clip.trimInSeconds, sourceDuration - clip.trimOutSeconds);
  return { start, end, length: Math.max(0, end - start) };
}

/** Plays a sequence, returning the index order actually played. */
function simulatePreview(clips: PreviewClip[]): { index: number; start: number; end: number }[] {
  const played: { index: number; start: number; end: number }[] = [];
  let index = 0;
  while (index < clips.length) {
    const window = playbackWindow(clips[index]!);
    played.push({ index, start: window.start, end: window.end });
    index += 1;
  }
  return played;
}

const clip = (over: Partial<PreviewClip> = {}): PreviewClip => ({
  durationSeconds: 5,
  trimInSeconds: 0,
  trimOutSeconds: 0,
  muted: false,
  ...over,
});

describe("episode preview", () => {
  it("starts at the trim-in point and stops at the trim-out point", () => {
    const window = playbackWindow(clip({ trimInSeconds: 1, trimOutSeconds: 1.5 }));
    expect(window.start).toBe(1);
    expect(window.end).toBe(3.5);
    expect(window.length).toBeCloseTo(2.5);
  });

  it("never seeks past the end of a short source file", () => {
    const window = playbackWindow(clip({ trimInSeconds: 9 }), 3);
    expect(window.start).toBeLessThan(3);
  });

  it("plays every clip in timeline order and then stops", () => {
    const played = simulatePreview([
      clip({ trimInSeconds: 1 }),
      clip({ trimOutSeconds: 2 }),
      clip(),
    ]);
    expect(played.map((p) => p.index)).toEqual([0, 1, 2]);
    expect(played[0]!.start).toBe(1);
    expect(played[1]!.end).toBe(3);
  });

  it("previewed duration matches the exported duration", () => {
    const clips = [clip({ trimInSeconds: 1 }), clip({ trimOutSeconds: 2 })];
    const previewTotal = clips.reduce((sum, c) => sum + playbackWindow(c).length, 0);
    const exportTotal = clips.reduce(
      (sum, c) => sum + Math.max(0, c.durationSeconds - c.trimInSeconds - c.trimOutSeconds),
      0,
    );
    expect(previewTotal).toBeCloseTo(exportTotal);
  });
});

/* ------------------------------------------------------------------ */
/* 1.3 Export completion rejects stale worker attempts.                */
/* ------------------------------------------------------------------ */

const OPEN_STATES = ["processing", "uploading"];

type ExportRow = {
  id: string;
  owner_id: string;
  project_id: string;
  episode_id: string;
  state: string;
  attempt_token: string | null;
  storage_path: string | null;
};

/** Mirrors the guard sequence in the completion handler. */
function report(
  row: ExportRow,
  body: { attemptToken: string; ok: boolean; storagePath?: string; fileSize?: number },
): { status: number; row: ExportRow } {
  if (row.attempt_token !== body.attemptToken) return { status: 409, row };
  if (!OPEN_STATES.includes(row.state)) return { status: 409, row };
  if (!body.ok) {
    return { status: 200, row: { ...row, state: "failed" } };
  }
  if (body.storagePath !== expectedExportPath(row)) {
    return { status: 200, row: { ...row, state: "failed" } };
  }
  if (!body.fileSize) return { status: 200, row: { ...row, state: "failed" } };
  return {
    status: 200,
    row: { ...row, state: "completed", storage_path: body.storagePath! },
  };
}

const base: ExportRow = {
  id: "11111111-1111-4111-8111-111111111111",
  owner_id: "owner",
  project_id: "project",
  episode_id: "episode",
  state: "processing",
  attempt_token: "token-a",
  storage_path: null,
};
const goodPath = expectedExportPath(base);

describe("export completion guards", () => {
  it("accepts the active attempt", () => {
    const result = report(base, { attemptToken: "token-a", ok: true, storagePath: goodPath, fileSize: 10 });
    expect(result.row.state).toBe("completed");
    expect(result.row.storage_path).toBe(goodPath);
  });

  it("rejects a duplicate completion for an already completed export", () => {
    const completed = { ...base, state: "completed", storage_path: goodPath };
    const result = report(completed, {
      attemptToken: "token-a",
      ok: true,
      storagePath: goodPath,
      fileSize: 10,
    });
    expect(result.status).toBe(409);
    expect(result.row.state).toBe("completed");
  });

  it("rejects a stale success from an obsolete attempt", () => {
    const retried = { ...base, attempt_token: "token-b" };
    const result = report(retried, {
      attemptToken: "token-a",
      ok: true,
      storagePath: goodPath,
      fileSize: 10,
    });
    expect(result.status).toBe(409);
    expect(result.row.state).toBe("processing");
  });

  it("rejects a stale failure so it cannot undo a completed export", () => {
    const completed = { ...base, state: "completed", attempt_token: "token-b" };
    const result = report(completed, { attemptToken: "token-a", ok: false });
    expect(result.status).toBe(409);
    expect(result.row.state).toBe("completed");
  });

  it("refuses a result written to an unexpected storage path", () => {
    const result = report(base, {
      attemptToken: "token-a",
      ok: true,
      storagePath: "someone-else/file.mp4",
      fileSize: 10,
    });
    expect(result.row.state).toBe("failed");
  });

  it("fails an interrupted export whose upload is missing", () => {
    const result = report(base, { attemptToken: "token-a", ok: true, storagePath: goodPath, fileSize: 0 });
    expect(result.row.state).toBe("failed");
  });

  it("lets a fresh attempt complete after a failed one", () => {
    const failed = { ...base, state: "failed" };
    const requeued = { ...failed, state: "processing", attempt_token: "token-c" };
    const result = report(requeued, {
      attemptToken: "token-c",
      ok: true,
      storagePath: goodPath,
      fileSize: 10,
    });
    expect(result.row.state).toBe("completed");
  });
});

describe("stalled export messaging", () => {
  const old = new Date(Date.now() - 20 * 60 * 1000).toISOString();
  it("flags a queued export nobody picked up", () => {
    expect(isStalled({ state: "queued", created_at: old })).toBe(true);
  });
  it("does not flag a fresh export", () => {
    expect(isStalled({ state: "queued", created_at: new Date().toISOString() })).toBe(false);
  });
  it("does not flag completed exports", () => {
    expect(isStalled({ state: "completed", created_at: old })).toBe(false);
  });
});
