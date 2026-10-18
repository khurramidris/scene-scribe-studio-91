import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { ImageReferenceInput } from "@/services/ai/image.provider";
import { imageBytesToBase64, inspectImageUpload, validateImageUpload } from "./image-upload";

export const REFERENCE_BUCKET = "character-references";
export type ReferenceAsset = {
  id: string;
  type: "character" | "location";
  storagePath: string;
  label: string;
};

/** The caller's storage client enforces ownership before bytes are read. */
export async function readStoredImage(
  client: SupabaseClient<Database>,
  bucket: "character-references" | "user-images",
  path: string,
  declaredType?: string,
) {
  const { data: blob, error } = await client.storage.from(bucket).download(path);
  if (error || !blob) throw new Error("The uploaded image could not be read. Upload it again.");
  const mimeType = declaredType ?? blob.type;
  validateImageUpload({ size: blob.size, type: mimeType });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  inspectImageUpload(bytes, mimeType);
  return { bytes, mimeType };
}

export async function loadReferenceImages(
  client: SupabaseClient<Database>,
  assets: ReferenceAsset[],
): Promise<ImageReferenceInput[]> {
  const images: ImageReferenceInput[] = [];
  for (const asset of assets) {
    const { bytes, mimeType } = await readStoredImage(client, REFERENCE_BUCKET, asset.storagePath);
    images.push({ base64: imageBytesToBase64(bytes), mimeType, label: asset.label });
  }
  return images;
}
