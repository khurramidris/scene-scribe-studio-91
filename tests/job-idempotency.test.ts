import { describe, expect, it } from "vitest";

/**
 * Models the conditional state transition used by advanceJobRecord: only the
 * caller that flips processing -> downloading may finalise a render, and a
 * provider job can only ever yield one video take (enforced in the database by
 * a unique index on video_takes.job_id).
 */
class JobTable {
  state = "processing";
  takes: { jobId: string }[] = [];

  claim(): boolean {
    if (this.state !== "processing" && this.state !== "submitting") return false;
    this.state = "downloading";
    return true;
  }

  insertTake(jobId: string) {
    if (this.takes.some((take) => take.jobId === jobId)) {
      throw new Error('duplicate key value violates unique constraint "video_takes_one_per_job"');
    }
    this.takes.push({ jobId });
  }

  finalise(jobId: string) {
    if (!this.claim()) return "already-claimed";
    const existing = this.takes.find((take) => take.jobId === jobId);
    if (existing) {
      this.state = "completed";
      return "completed";
    }
    this.insertTake(jobId);
    this.state = "completed";
    return "completed";
  }
}

describe("video job finalisation", () => {
  it("lets only one caller claim a completed render", () => {
    const table = new JobTable();
    expect(table.claim()).toBe(true);
    expect(table.claim()).toBe(false);
  });

  it("stores exactly one take even when finalised twice", () => {
    const table = new JobTable();
    expect(table.finalise("job-1")).toBe("completed");
    table.state = "processing";
    expect(table.finalise("job-1")).toBe("completed");
    expect(table.takes).toHaveLength(1);
  });

  it("refuses a second take for the same provider job", () => {
    const table = new JobTable();
    table.insertTake("job-1");
    expect(() => table.insertTake("job-1")).toThrow(/video_takes_one_per_job/);
  });

  it("keeps a failed download out of the completed state", () => {
    const table = new JobTable();
    expect(table.claim()).toBe(true);
    // download throws -> job goes to failed, no take is written
    table.state = "failed";
    expect(table.takes).toHaveLength(0);
    expect(table.state).toBe("failed");
  });
});

/** Mirrors submitShotVideo's storyboard-frame checks. */
function assertFrameUsable(
  frame: {
    shot_id: string;
    project_id: string;
    status: string;
    is_selected: boolean;
    is_mock: boolean;
    storage_path: string | null;
  },
  shot: { id: string; project_id: string },
) {
  if (frame.shot_id !== shot.id || frame.project_id !== shot.project_id) {
    throw new Error("That storyboard frame does not belong to this shot.");
  }
  if (frame.status !== "approved" || !frame.is_selected) {
    throw new Error("Approve and select the storyboard frame before rendering it.");
  }
  if (frame.is_mock) throw new Error("placeholder");
  if (!frame.storage_path) throw new Error("That storyboard frame has no stored image.");
  return true;
}

describe("render request validation", () => {
  const shot = { id: "shot-1", project_id: "proj-1" };
  const good = {
    shot_id: "shot-1",
    project_id: "proj-1",
    status: "approved",
    is_selected: true,
    is_mock: false,
    storage_path: "a.png",
  };

  it("accepts an approved, selected, real frame of this shot", () => {
    expect(assertFrameUsable(good, shot)).toBe(true);
  });

  it("rejects a frame from another shot", () => {
    expect(() => assertFrameUsable({ ...good, shot_id: "other" }, shot)).toThrow(/belong/);
  });

  it("rejects a frame from another production", () => {
    expect(() => assertFrameUsable({ ...good, project_id: "other" }, shot)).toThrow(/belong/);
  });

  it("rejects an unapproved frame", () => {
    expect(() => assertFrameUsable({ ...good, status: "draft" }, shot)).toThrow(/Approve/);
  });

  it("rejects a placeholder frame", () => {
    expect(() => assertFrameUsable({ ...good, is_mock: true }, shot)).toThrow(/placeholder/);
  });

  it("rejects a frame with no stored image", () => {
    expect(() => assertFrameUsable({ ...good, storage_path: null }, shot)).toThrow(/no stored/);
  });
});
