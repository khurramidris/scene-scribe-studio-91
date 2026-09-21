import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createAccount,
  deleteAccount,
  hasLiveDatabase,
  type TestAccount,
} from "./helpers/accounts";

/**
 * Two real authenticated accounts. User B must not be able to read, write,
 * delete or attach anything to User A's production.
 */
const run = hasLiveDatabase ? describe : describe.skip;

run("authenticated cross-user isolation", () => {
  let alice: TestAccount;
  let bob: TestAccount;
  const created: Record<string, string> = {};

  beforeAll(async () => {
    alice = await createAccount("a");
    bob = await createAccount("b");

    const { data: project, error } = await alice.client
      .from("projects")
      .insert({ owner_id: alice.id, title: "Alice private production" })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    created['project'] = project.id;

    const { data: episode, error: episodeError } = await alice.client
      .from("episodes")
      .insert({
        project_id: project.id,
        owner_id: alice.id,
        number: 1,
        title: "Episode one",
      })
      .select("*")
      .single();
    if (episodeError) throw new Error(episodeError.message);
    created['episode'] = episode.id;

    const { data: character, error: characterError } = await alice.client
      .from("characters")
      .insert({ project_id: project.id, owner_id: alice.id, name: "Alice's lead" })
      .select("*")
      .single();
    if (characterError) throw new Error(characterError.message);
    created['character'] = character.id;

    const { data: location, error: locationError } = await alice.client
      .from("locations")
      .insert({
        project_id: project.id,
        owner_id: alice.id,
        name: "Rooftop",
        setting: "exterior",
      })
      .select("*")
      .single();
    if (locationError) throw new Error(locationError.message);
    created['location'] = location.id;
  }, 60_000);

  afterAll(async () => {
    if (alice) await deleteAccount(alice);
    if (bob) await deleteAccount(bob);
  }, 60_000);

  it("hides the other user's production", async () => {
    const { data } = await bob.client.from("projects").select("*").eq("id", created['project']!);
    expect(data ?? []).toEqual([]);
  });

  for (const table of ["episodes", "characters", "locations"] as const) {
    it(`hides the other user's ${table}`, async () => {
      const { data } = await bob.client.from(table).select("*").eq("project_id", created['project']!);
      expect(data ?? []).toEqual([]);
    });
  }

  it("rejects editing the other user's production", async () => {
    const { data } = await bob.client
      .from("projects")
      .update({ title: "hijacked" })
      .eq("id", created['project']!)
      .select("*");
    expect(data ?? []).toEqual([]);
  });

  it("rejects deleting the other user's episode", async () => {
    await bob.client.from("episodes").delete().eq("id", created['episode']!);
    const { data } = await alice.client.from("episodes").select("id").eq("id", created['episode']!);
    expect((data ?? []).length).toBe(1);
  });

  it("rejects attaching a new record to the other user's production", async () => {
    const { error } = await bob.client.from("characters").insert({
      project_id: created['project']!,
      owner_id: bob.id,
      name: "Smuggled character",
    });
    expect(error).not.toBeNull();
  });

  it("rejects forging the other user's owner_id", async () => {
    const { error } = await bob.client.from("projects").insert({
      owner_id: alice.id,
      title: "Forged ownership",
    });
    expect(error).not.toBeNull();
  });

  it("rejects the privileged regeneration function on someone else's scene", async () => {
    const { error } = await bob.client.rpc("regenerate_scene_shots", {
      p_scene_id: crypto.randomUUID(),
      p_shots: [],
      p_meta: {},
    });
    expect(error).not.toBeNull();
  });
});
