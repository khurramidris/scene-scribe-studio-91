import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, png, PNG_BASE64 } from "./helpers/fake-supabase";
import { buildFramePlan } from "@/lib/storyboard-plan.server";
import { loadReferenceImages } from "@/lib/reference-images.server";

const state = vi.hoisted(() => ({ admin: undefined as unknown }));
vi.mock("@/integrations/supabase/client.server", () => ({
  get supabaseAdmin() {
    return state.admin;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate: (value: unknown) => unknown = (value) => value;
    const builder = {
      middleware: () => builder,
      inputValidator: (fn: typeof validate) => {
        validate = fn;
        return builder;
      },
      handler: (fn: (args: unknown) => unknown) => (args: { data: unknown; context: unknown }) =>
        fn({ ...args, data: validate(args.data) }),
    };
    return builder;
  },
}));
import { generateStoryboardFrames } from "@/lib/storyboard.functions";
import { generateCharacterImages } from "@/lib/character-image.functions";
import {
  loadUploadedFrames,
  modeForInputs,
  registerUserImage,
  submitSingleVideo,
} from "@/lib/single-video.functions";
type Handler = (args: { data: unknown; context: unknown }) => Promise<unknown>;
const owner = "11111111-1111-4111-8111-111111111111";
const project = "22222222-2222-4222-8222-222222222222";
const shotId = "33333333-3333-4333-8333-333333333333";
const startId = "44444444-4444-4444-8444-444444444444";
const endId = "55555555-5555-4555-8555-555555555555";

function fixture(count = 1) {
  const characters = Array.from({ length: count }, (_, i) => ({
    id: `character-${i}`,
    project_id: project,
    name: `Actor ${i}`,
    approved_reference_id: `reference-${i}`,
    description: "Lead",
    appearance_prompt: "Blue jacket",
  }));
  const refs = characters.map((character, i) => ({
    id: character.approved_reference_id,
    character_id: character.id,
    project_id: project,
    storage_path: `${owner}/${project}/character/${i}/portrait.png`,
    status: "approved",
    is_mock: false,
  }));
  const setPath = `${owner}/${project}/location/home/set.png`;
  const db = fakeSupabase(
    {
      projects: [{ id: project, format: "vertical_9_16" }],
      shots: [
        {
          id: shotId,
          project_id: project,
          scene_id: "scene",
          episode_id: "episode",
          owner_id: owner,
          location_id: null,
          description: "A family argument",
          shot_type: "Wide",
          continuity: {},
        },
      ],
      scenes: [{ id: "scene", project_id: project, location_id: "home", time_of_day: "Night" }],
      shot_characters: characters.map((character) => ({
        shot_id: shotId,
        project_id: project,
        character_id: character.id,
        character_reference_id: null,
      })),
      characters,
      character_references: refs,
      locations: [
        {
          id: "home",
          project_id: project,
          name: "Family home",
          description: "Green walls",
          reference_storage_path: setPath,
          status: "approved",
        },
      ],
    },
    Object.fromEntries([...refs.map((ref) => [ref.storage_path, png()]), [setPath, png()]]),
  );
  state.admin = db.client;
  return db;
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("Network disabled in upload tests."))),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("storyboard reference selection", () => {
  it("combines the locked character and the inherited scene set", async () => {
    const db = fixture();
    const plan = await buildFramePlan(db.client, shotId);
    expect(plan.referenceAssets.map((asset) => asset.type)).toEqual(["character", "location"]);
    expect(plan.referenceAssets[0]?.id).toBe("reference-0");
    expect(plan.referenceAssets[1]?.id).toBe("home");
    expect(plan.prompt).toContain("Family home");
    expect(plan.prompt).toContain("Green walls");
    const inputs = await loadReferenceImages(db.client, plan.referenceAssets);
    expect(inputs).toHaveLength(2);
    expect(inputs.every((input) => input.base64 === PNG_BASE64)).toBe(true);
    expect(inputs[0]?.label).toContain("Actor 0");
    expect(inputs[1]?.label).toContain("Family home");
  });

  it("keeps every selected cast image and the set rather than truncating after three", async () => {
    const db = fixture(4);
    const plan = await buildFramePlan(db.client, shotId);
    expect(plan.referenceAssets).toHaveLength(5);
    expect(await loadReferenceImages(db.client, plan.referenceAssets)).toHaveLength(5);
  });

  it("honors a shot's specific character reference and location override", async () => {
    const db = fixture();
    db.rows["character_references"]!.push({
      id: "costume",
      project_id: project,
      character_id: "character-0",
      status: "approved",
      storage_path: "costume.png",
      is_mock: false,
    });
    db.rows["shot_characters"]![0]!["character_reference_id"] = "costume";
    db.rows["shots"]![0]!["location_id"] = "office";
    db.rows["locations"]!.push({
      id: "office",
      project_id: project,
      name: "Office",
      status: "approved",
      reference_storage_path: "office.png",
    });
    const plan = await buildFramePlan(db.client, shotId);
    expect(plan.referenceAssets.map((asset) => asset.id)).toEqual(["costume", "office"]);
    expect(plan.prompt).toContain("Office");
    expect(plan.prompt).not.toContain("Family home");
  });

  it("does not silently substitute another character image when the selected one is unavailable", async () => {
    const db = fixture();
    db.rows["characters"]![0]!["approved_reference_id"] = "unapproved-or-deleted";
    await expect(buildFramePlan(db.client, shotId)).rejects.toThrow("no longer approved");
  });

  it("excludes mock identities and unapproved location images", async () => {
    const db = fixture();
    db.rows["character_references"]![0]!["is_mock"] = true;
    db.rows["locations"]![0]!["status"] = "draft";
    expect((await buildFramePlan(db.client, shotId)).referenceAssets).toEqual([]);
  });

  it("rejects a selected set from another production and fails on missing reference bytes", async () => {
    const db = fixture();
    db.rows["locations"]![0]!["project_id"] = "another-project";
    await expect(buildFramePlan(db.client, shotId)).rejects.toThrow("not found");
    const good = fixture();
    const plan = await buildFramePlan(good.client, shotId);
    delete good.files[plan.referenceAssets[1]!.storagePath];
    await expect(loadReferenceImages(good.client, plan.referenceAssets)).rejects.toThrow(
      "could not be read",
    );
  });
});

describe("microdrama generation with uploaded images", () => {
  it("conditions character variations on the locked uploaded identity", async () => {
    const db = fakeSupabase(
      {
        characters: [
          {
            id: startId,
            project_id: project,
            owner_id: owner,
            name: "Sara",
            approved_reference_id: "portrait",
          },
        ],
        character_references: [
          {
            id: "portrait",
            character_id: startId,
            project_id: project,
            status: "approved",
            is_mock: false,
            storage_path: "portrait.png",
          },
        ],
      },
      { "portrait.png": png() },
    );
    state.admin = db.client;
    vi.stubEnv("LOVABLE_API_KEY", "offline-test-key");
    vi.stubEnv("AI_GATEWAY_URL", "https://image-renderer.invalid/v1");
    const fetch = vi.fn(async () => Response.json({ data: [{ b64_json: PNG_BASE64 }] }));
    vi.stubGlobal("fetch", fetch);
    await (generateCharacterImages as unknown as Handler)({
      data: { characterId: startId, kind: "costume", count: 1 },
      context: { supabase: db.client, userId: owner },
    });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://image-renderer.invalid/v1/images/edits");
    const form = init.body as FormData;
    expect(form.getAll("image[]")).toHaveLength(1);
    expect(form.get("prompt")).toContain("Character identity: Sara");
    expect(db.rows["characters"]?.[0]?.["approved_reference_id"]).toBe("portrait");
    expect(db.rows["character_references"]).toHaveLength(2);
  });
  it("sends both character and set bytes to the image renderer and records their provenance", async () => {
    const db = fixture();
    vi.stubEnv("AI_GATEWAY_API_KEY", "offline-test-key");
    vi.stubEnv("LOVABLE_API_KEY", "offline-test-key");
    vi.stubEnv("AI_GATEWAY_URL", "https://image-renderer.invalid/v1");
    const fetch = vi.fn(async () => Response.json({ data: [{ b64_json: PNG_BASE64 }] }));
    vi.stubGlobal("fetch", fetch);
    await (generateStoryboardFrames as unknown as Handler)({
      data: { shotId, count: 1 },
      context: { supabase: db.client, userId: owner },
    });
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://image-renderer.invalid/v1/images/edits");
    const form = init.body as FormData;
    const images = form.getAll("image[]") as File[];
    expect(images).toHaveLength(2);
    for (const image of images)
      expect(btoa(String.fromCharCode(...new Uint8Array(await image.arrayBuffer())))).toBe(
        PNG_BASE64,
      );
    expect(form.get("prompt")).toContain("Image 1: Character identity: Actor 0");
    expect(form.get("prompt")).toContain("Image 2: Set / location: Family home");
    expect(db.rows["storyboard_frames"]?.[0]).toMatchObject({
      used_reference_conditioning: true,
      reference_inputs: ["reference-0", "home"],
      generation_params: {
        reference_assets: [
          expect.objectContaining({ type: "character" }),
          expect.objectContaining({ type: "location" }),
        ],
      },
    });
    expect(db.rows["production_jobs"]?.[0]).toMatchObject({ state: "completed" });
  });
});

describe("standalone image-to-video", () => {
  function videoFixture() {
    const db = fakeSupabase(
      {
        user_images: [
          { id: startId, owner_id: owner, storage_path: "start.png", mime_type: "image/png" },
          { id: endId, owner_id: owner, storage_path: "end.png", mime_type: "image/png" },
        ],
      },
      { "start.png": png(), "end.png": png() },
    );
    state.admin = db.client;
    return db;
  }

  it("validates a standalone upload and records its actual stored size", async () => {
    const db = videoFixture();
    const path = `${owner}/single/test.png`;
    db.files[path] = png();
    await (registerUserImage as unknown as Handler)({
      data: {
        storagePath: path,
        mimeType: "image/png",
        fileSizeBytes: 999999,
        role: "start",
        originalName: "photo.png",
      },
      context: { supabase: db.client, userId: owner },
    });
    expect(db.rows["user_images"]?.at(-1)).toMatchObject({
      storage_path: path,
      owner_id: owner,
      file_size_bytes: png().size,
    });
  });

  it("loads actual uploaded bytes with explicit first/last roles", async () => {
    const db = videoFixture();
    const images = await loadUploadedFrames(db.client, [
      { id: startId, role: "first_frame" },
      { id: endId, role: "last_frame" },
    ]);
    expect(images).toEqual([
      { base64: PNG_BASE64, mimeType: "image/png", role: "first_frame" },
      { base64: PNG_BASE64, mimeType: "image/png", role: "last_frame" },
    ]);
    await expect(
      loadUploadedFrames(db.client, [{ id: "not-owned", role: "first_frame" }]),
    ).rejects.toThrow("not found");
  });

  it("selects the correct mode for uploaded image combinations", () => {
    expect(modeForInputs(false, false)).toBe("text_to_video");
    expect(modeForInputs(true, false)).toBe("image_to_video");
    expect(modeForInputs(true, true)).toBe("first_last_frame");
    expect(() => modeForInputs(false, true)).toThrow("starting image");
  });

  it("submits an uploaded starting image to the configured video adapter", async () => {
    const db = videoFixture();
    vi.stubEnv("VIDEO_PROVIDER", "external");
    vi.stubEnv("EXTERNAL_VIDEO_API_URL", "https://video-renderer.invalid");
    vi.stubEnv("EXTERNAL_VIDEO_API_KEY", "offline-test-key");
    const fetch = vi.fn(async () => Response.json({ id: "offline-render" }));
    vi.stubGlobal("fetch", fetch);
    await (submitSingleVideo as unknown as Handler)({
      data: {
        prompt: "A slow camera move",
        aspect: "9:16",
        resolution: "720p",
        durationSeconds: 5,
        startImageId: startId,
        idempotencyKey: "offline-test-render",
      },
      context: { supabase: db.client, userId: owner },
    });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://video-renderer.invalid/jobs");
    expect(JSON.parse(init.body as string)).toMatchObject({
      mode: "image_to_video",
      images: [{ base64: PNG_BASE64, mimeType: "image/png", role: "first_frame" }],
    });
    expect(db.rows["production_jobs"]?.[0]).toMatchObject({
      job_type: "single_video",
      state: "processing",
      provider_job_id: "offline-render",
    });
  });
});
