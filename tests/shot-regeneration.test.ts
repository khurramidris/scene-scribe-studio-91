import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAccount, deleteAccount, hasLiveDatabase, type TestAccount } from "./helpers/accounts";

/**
 * `regenerate_scene_shots` must be atomic and sequence-safe: approved shots
 * keep their identifiers and their place in the sequence, drafts are archived
 * before they are replaced, and a failure changes nothing.
 */
const run = hasLiveDatabase ? describe : describe.skip;

run("atomic shot regeneration", () => {
  let user: TestAccount;
  let sceneId = "";
  let projectId = "";
  const approvedIds: string[] = [];

  const newShots = [
    { shot_type: "Wide", description: "New A", action: "walks in", duration_seconds: 4 },
    { shot_type: "Close", description: "New B", action: "turns", duration_seconds: 3 },
  ];

  beforeAll(async () => {
    user = await createAccount("shots");
    const db = user.client;

    const { data: project } = await db
      .from("projects")
      .insert({ owner_id: user.id, title: "Regeneration fixture" })
      .select("*")
      .single();
    projectId = project!.id;

    const { data: episode } = await db
      .from("episodes")
      .insert({ project_id: projectId, owner_id: user.id, number: 1, title: "Ep 1" })
      .select("*")
      .single();

    const { data: screenplay } = await db
      .from("screenplays")
      .insert({
        project_id: projectId,
        episode_id: episode!.id,
        owner_id: user.id,
        version: 1,
      })
      .select("*")
      .single();

    const { data: scene } = await db
      .from("scenes")
      .insert({
        project_id: projectId,
        screenplay_id: screenplay!.id,
        episode_id: episode!.id,
        owner_id: user.id,
        scene_number: 1,
        sort_order: 0,
        heading: "INT. FLAT - NIGHT",
        setting: "interior",
      })
      .select("*")
      .single();
    sceneId = scene!.id;

    // Sequence: approved, draft, approved.
    const statuses = ["approved", "draft", "approved"] as const;
    for (let i = 0; i < statuses.length; i += 1) {
      const { data: shot } = await db
        .from("shots")
        .insert({
          project_id: projectId,
          episode_id: episode!.id,
          screenplay_id: screenplay!.id,
          scene_id: sceneId,
          owner_id: user.id,
          shot_number: i + 1,
          sort_order: i,
          description: `Original ${i}`,
          status: statuses[i],
        })
        .select("*")
        .single();
      if (statuses[i] === "approved") approvedIds.push(shot!.id);
    }
  }, 60_000);

  afterAll(async () => {
    if (user) await deleteAccount(user);
  }, 60_000);

  it("keeps approved shots, their identifiers and their sequence positions", async () => {
    const { error } = await user.client.rpc("regenerate_scene_shots", {
      p_scene_id: sceneId,
      p_shots: newShots,
      p_meta: { provider: "test", is_mock: true },
    });
    expect(error).toBeNull();

    const { data: shots } = await user.client
      .from("shots")
      .select("*")
      .eq("scene_id", sceneId)
      .order("sort_order");

    expect(shots).toHaveLength(4);
    // The first approved shot stays at position 0, the second stays at position 2.
    expect(shots![0]!.id).toBe(approvedIds[0]);
    expect(shots![2]!.id).toBe(approvedIds[1]);
    expect(shots!.filter((s) => s.status === "approved")).toHaveLength(2);
    expect(shots!.map((s) => s.shot_number)).toEqual([1, 2, 3, 4]);
  });

  it("archives every replaced draft", async () => {
    const { data: revisions } = await user.client
      .from("content_revisions")
      .select("*")
      .eq("project_id", projectId)
      .eq("entity_type", "shot");
    expect((revisions ?? []).length).toBeGreaterThan(0);
  });

  it("is repeatable without duplicating or losing approved shots", async () => {
    await user.client.rpc("regenerate_scene_shots", {
      p_scene_id: sceneId,
      p_shots: newShots,
      p_meta: { provider: "test", is_mock: true },
    });
    const { data: shots } = await user.client
      .from("shots")
      .select("*")
      .eq("scene_id", sceneId)
      .order("sort_order");
    expect(shots).toHaveLength(4);
    expect(shots!.filter((s) => s.status === "approved").map((s) => s.id).sort()).toEqual(
      [...approvedIds].sort(),
    );
  });

  it("changes nothing when the payload is invalid", async () => {
    const before = await user.client.from("shots").select("id").eq("scene_id", sceneId);
    const { error } = await user.client.rpc("regenerate_scene_shots", {
      p_scene_id: sceneId,
      p_shots: [{ duration_seconds: "not-a-number" }],
      p_meta: {},
    });
    expect(error).not.toBeNull();
    const after = await user.client.from("shots").select("id").eq("scene_id", sceneId);
    expect((after.data ?? []).length).toBe((before.data ?? []).length);
  });
});
