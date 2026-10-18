import { supabase } from "@/integrations/supabase/client";
import { inspectImageUpload, validateImageUpload } from "./image-upload";

/** Immutable upload paths keep images available to queued and historical renders. */
export async function uploadStudioImage<T>(
  file: File,
  bucket: "character-references" | "user-images",
  prefix: string,
  register: (storagePath: string) => Promise<T>,
): Promise<T> {
  const extension = validateImageUpload(file);
  inspectImageUpload(new Uint8Array(await file.arrayBuffer()), file.type);
  const path = `${prefix}${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error(error.message);
  // A lost response can mean registration succeeded. Never delete the image
  // here: it may already be referenced by a character, a set or a running job.
  return register(path);
}
