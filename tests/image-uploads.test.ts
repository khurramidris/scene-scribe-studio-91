import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertImageUploadPath,
  inspectImageUpload,
  MAX_IMAGE_UPLOAD_BYTES,
  validateImageUpload,
} from "@/lib/image-upload";
import { fakeSupabase, png, pngBytes } from "./helpers/fake-supabase";

const state = vi.hoisted(() => ({ client: undefined as unknown }));
vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return state.client;
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

import { uploadStudioImage } from "@/lib/image-upload.service";
import { registerReferenceUpload } from "@/lib/reference-upload.functions";
const register = registerReferenceUpload as unknown as (args: {
  data: unknown;
  context: unknown;
}) => Promise<{ id: string }>;
const owner = "11111111-1111-4111-8111-111111111111";
const project = "22222222-2222-4222-8222-222222222222";
const entity = "33333333-3333-4333-8333-333333333333";
const filename = "44444444-4444-4444-8444-444444444444.png";

describe("image upload validation", () => {
  it("rejects empty, oversized and unsupported uploads before sending them", () => {
    expect(() => validateImageUpload({ size: 0, type: "image/png" })).toThrow("empty");
    expect(() =>
      validateImageUpload({ size: MAX_IMAGE_UPLOAD_BYTES + 1, type: "image/png" }),
    ).toThrow("10 MB");
    expect(() => validateImageUpload({ size: 100, type: "image/svg+xml" })).toThrow("PNG");
    expect(() => inspectImageUpload(new TextEncoder().encode("not an image"), "image/png")).toThrow(
      "contents",
    );
    expect(() => inspectImageUpload(pngBytes(), "image/jpeg")).toThrow("contents");
    expect(() => inspectImageUpload(pngBytes(), "image/png")).not.toThrow();
  });

  it("requires the exact entity folder and a single immutable image filename", () => {
    const prefix = `${owner}/${project}/character/${entity}/`;
    expect(() => assertImageUploadPath(prefix + filename, prefix)).not.toThrow();
    for (const path of [
      `other/${filename}`,
      `${prefix}../${filename}`,
      `${prefix}nested/${filename}`,
    ]) {
      expect(() => assertImageUploadPath(path, prefix)).toThrow("slot");
    }
  });
});

describe("client uploads", () => {
  beforeEach(() => {
    state.client = fakeSupabase().client;
  });

  it("uploads original bytes and derives the extension from MIME type", async () => {
    const db = fakeSupabase();
    state.client = db.client;
    const file = new File([pngBytes()], "photo.with-wrong-extension.txt", { type: "image/png" });
    const save = vi.fn(async (path: string) => ({ path }));
    const result = await uploadStudioImage(file, "user-images", `${owner}/single/`, save);
    expect(result.path).toMatch(/\/single\/[a-f0-9-]+\.png$/);
    expect(db.upload).toHaveBeenCalledWith(result.path, file, {
      contentType: "image/png",
      upsert: false,
    });
    expect(save).toHaveBeenCalledOnce();
  });

  it("does not upload a forged file or register a failed upload", async () => {
    const db = fakeSupabase();
    state.client = db.client;
    const save = vi.fn();
    await expect(
      uploadStudioImage(
        new File(["forged"], "x.png", { type: "image/png" }),
        "user-images",
        `${owner}/single/`,
        save,
      ),
    ).rejects.toThrow("contents");
    expect(db.upload).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it("preserves a possibly registered image if its acknowledgement is lost", async () => {
    const db = fakeSupabase();
    state.client = db.client;
    await expect(
      uploadStudioImage(
        new File([pngBytes()], "x.png", { type: "image/png" }),
        "user-images",
        `${owner}/single/`,
        async () => {
          throw new Error("Connection lost");
        },
      ),
    ).rejects.toThrow("Connection lost");
    expect(db.remove).not.toHaveBeenCalled();
  });
});

describe("reference registration with in-memory storage", () => {
  function fixture(target: "character" | "location") {
    const path = `${owner}/${project}/${target}/${entity}/${filename}`;
    const db = fakeSupabase(
      {
        [target === "character" ? "characters" : "locations"]: [
          {
            id: entity,
            project_id: project,
            owner_id: owner,
            name: target === "character" ? "Sara" : "Family home",
          },
        ],
      },
      { [path]: png() },
    );
    const data = {
      target,
      entityId: entity,
      storagePath: path,
      mimeType: "image/png",
      originalName: "my-photo.png",
    };
    const context = { supabase: db.client, userId: owner };
    return { db, path, data, context };
  }

  it("saves an uploaded character reference as a real draft for explicit identity selection", async () => {
    const f = fixture("character");
    await register({ data: f.data, context: f.context });
    expect(f.db.rows["character_references"]?.[0]).toMatchObject({
      character_id: entity,
      project_id: project,
      owner_id: owner,
      provider: "upload",
      is_mock: false,
      status: "draft",
      storage_path: f.path,
      generation_metadata: {
        source: "upload",
        mime_type: "image/png",
        file_size_bytes: pngBytes().length,
      },
    });
  });

  it("selects an uploaded set image on the existing location record", async () => {
    const f = fixture("location");
    await register({ data: f.data, context: f.context });
    expect(f.db.rows["locations"]?.[0]).toMatchObject({
      reference_storage_path: f.path,
      status: "approved",
      reference_image_url: null,
    });
    expect(f.db.rows["character_references"]).toBeUndefined();
  });

  it("rejects a reference from another entity, project or user before downloading bytes", async () => {
    for (const storagePath of [
      `other/${filename}`,
      `${owner}/other/character/${entity}/${filename}`,
      `${owner}/${project}/character/other/${filename}`,
    ]) {
      const f = fixture("character");
      await expect(
        register({ data: { ...f.data, storagePath }, context: f.context }),
      ).rejects.toThrow("slot");
      expect(f.db.download).not.toHaveBeenCalled();
    }
    const f = fixture("character");
    await expect(
      register({ data: f.data, context: { ...f.context, userId: "another-owner" } }),
    ).rejects.toThrow("not found");
    expect(f.db.download).not.toHaveBeenCalled();
  });

  it("rejects missing or fake image objects without creating a reference", async () => {
    const f = fixture("character");
    f.db.files[f.path] = new Blob(["forged image bytes"], { type: "image/png" });
    await expect(register({ data: f.data, context: f.context })).rejects.toThrow("contents");
    expect(f.db.rows["character_references"]).toBeUndefined();
    delete f.db.files[f.path];
    await expect(register({ data: f.data, context: f.context })).rejects.toThrow(
      "could not be read",
    );
  });
});
