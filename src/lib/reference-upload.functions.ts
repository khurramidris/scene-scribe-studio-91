import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const UploadInput = z.object({
  target: z.enum(["character", "location"]),
  entityId: z.string().uuid(),
  storagePath: z.string().min(1).max(400),
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
  originalName: z.string().max(200),
  kind: z.enum(["appearance", "costume", "expression", "prop"]).default("appearance"),
  label: z.string().trim().max(120).default(""),
});

export const registerReferenceUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UploadInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: entity, error } = await supabase
      .from(data.target === "character" ? "characters" : "locations")
      .select("id, project_id, owner_id, name")
      .eq("id", data.entityId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!entity || entity.owner_id !== userId) throw new Error("Character or set not found.");

    const { assertImageUploadPath } = await import("./image-upload");
    assertImageUploadPath(
      data.storagePath,
      `${userId}/${entity.project_id}/${data.target}/${entity.id}/`,
    );
    const { readStoredImage, REFERENCE_BUCKET } = await import("./reference-images.server");
    const { bytes, mimeType } = await readStoredImage(
      supabase,
      REFERENCE_BUCKET,
      data.storagePath,
      data.mimeType,
    );
    const metadata = {
      source: "upload",
      original_name: data.originalName,
      mime_type: mimeType,
      file_size_bytes: bytes.byteLength,
      uploaded_at: new Date().toISOString(),
    };

    if (data.target === "character") {
      const { data: row, error: insertError } = await supabase
        .from("character_references")
        .insert({
          character_id: entity.id,
          project_id: entity.project_id,
          owner_id: userId,
          kind: data.kind,
          label: data.label || data.originalName,
          prompt: `User-provided ${data.kind} reference for ${entity.name}. Preserve the identity in the supplied image.`,
          storage_path: data.storagePath,
          provider: "upload",
          is_mock: false,
          status: "draft",
          generation_metadata: metadata,
        })
        .select("id")
        .single();
      if (insertError) throw new Error(insertError.message);
      return { id: row.id, storagePath: data.storagePath };
    }

    const { data: row, error: updateError } = await supabase
      .from("locations")
      .update({
        reference_storage_path: data.storagePath,
        reference_image_url: null,
        status: "approved",
        generation_metadata: metadata,
      })
      .eq("id", entity.id)
      .select("id")
      .single();
    if (updateError) throw new Error(updateError.message);
    return { id: row.id, storagePath: data.storagePath };
  });
