import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { Database } from "@/integrations/supabase/types";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  characterId: z.string().uuid(),
  kind: z.enum(["appearance", "costume", "expression", "prop"]).default("appearance"),
  label: z.string().max(120).optional(),
  extraPrompt: z.string().max(1000).optional(),
  count: z.number().int().min(1).max(4).default(2),
});

export const BUCKET = "character-references";

/**
 * Generates appearance options for a character through the provider-independent
 * image interface, stores the bytes in project storage, and records one
 * `character_references` row per image (flagged when the provider is a mock).
 */
export const generateCharacterImages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: character, error: charError } = await supabase
      .from("characters")
      .select("*, projects(format)")
      .eq("id", data.characterId)
      .maybeSingle();
    if (charError) throw new Error(charError.message);
    if (!character) throw new Error("Character not found.");

    const format = (character as { projects?: { format?: string } }).projects?.format;
    const aspect = format === "horizontal_16_9" ? "landscape" : "portrait";

    const promptParts = [
      `Cinematic character reference portrait of ${character.name}.`,
      character.appearance_prompt ?? character.description ?? "",
      character.age_range ? `Age range: ${character.age_range}.` : "",
      data.kind === "costume" ? "Full costume study, full body, neutral studio backdrop." : "",
      data.kind === "expression" ? "Expression sheet, close-up, neutral backdrop." : "",
      data.extraPrompt ?? "",
      "Consistent identity, photoreal, soft key light, shallow depth of field, no text or watermarks.",
    ].filter(Boolean);
    const prompt = promptParts.join(" ");

    const { resolveImageProvider } = await import("@/services/ai/image.registry.server");
    const provider = resolveImageProvider();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: identity, error: identityError } = character.approved_reference_id
      ? await supabase
          .from("character_references")
          .select("id, storage_path, is_mock")
          .eq("id", character.approved_reference_id)
          .eq("character_id", character.id)
          .eq("project_id", character.project_id)
          .eq("status", "approved")
          .maybeSingle()
      : { data: null, error: null };
    if (identityError) throw new Error(identityError.message);
    const { loadReferenceImages } = await import("./reference-images.server");
    const references =
      identity?.storage_path && !identity.is_mock && provider.supportsReferenceImages
        ? await loadReferenceImages(supabase, [
            {
              id: identity.id,
              type: "character",
              storagePath: identity.storage_path,
              label: `Character identity: ${character.name}`,
            },
          ])
        : [];

    const created: Database["public"]["Tables"]["character_references"]["Row"][] = [];
    for (let i = 0; i < data.count; i += 1) {
      const image = await provider.generate({ prompt, aspect, references });
      const bytes = Uint8Array.from(atob(image.base64), (c) => c.charCodeAt(0));
      const ext = image.contentType === "image/svg+xml" ? "svg" : "png";
      const path = `${userId}/${character.project_id}/${character.id}/${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabaseAdmin.storage
        .from(BUCKET)
        .upload(path, bytes, { contentType: image.contentType, upsert: false });
      if (uploadError) throw new Error(`Could not store the image: ${uploadError.message}`);

      // The bucket is private; browsers read images through short-lived signed
      // URLs issued by `signReferenceUrls` below.

      const { data: row, error } = await supabase
        .from("character_references")
        .insert({
          character_id: character.id,
          project_id: character.project_id,
          owner_id: userId,
          kind: data.kind,
          label: data.label ?? null,
          prompt,
          image_url: null,
          storage_path: path,
          provider: image.provider,
          is_mock: image.isMock,
          status: "draft" as const,
          generation_metadata: { model: image.model, generated_at: new Date().toISOString() },
        })
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      created.push(row);
    }

    return { references: created, isMock: provider.isMock };
  });

const SignInput = z.object({ paths: z.array(z.string().min(1)).max(60) });

/**
 * Issues short-lived signed URLs for the caller's own reference images.
 * Ownership is re-checked against `character_references` under RLS before the
 * privileged storage client is used.
 */
export const signReferenceUrls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SignInput.parse(input))
  .handler(async ({ data, context }) => {
    if (data.paths.length === 0) return { urls: {} as Record<string, string> };

    const [characters, locations] = await Promise.all([
      context.supabase
        .from("character_references")
        .select("storage_path")
        .in("storage_path", data.paths),
      context.supabase
        .from("locations")
        .select("reference_storage_path")
        .in("reference_storage_path", data.paths),
    ]);
    if (characters.error) throw new Error(characters.error.message);
    if (locations.error) throw new Error(locations.error.message);

    const allowed = [
      ...new Set([
        ...(characters.data ?? []).map((row) => row.storage_path),
        ...(locations.data ?? []).map((row) => row.reference_storage_path),
      ]),
    ].filter((path): path is string => typeof path === "string");
    if (allowed.length === 0) return { urls: {} as Record<string, string> };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error: signError } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrls(allowed, 60 * 60);
    if (signError) throw new Error(signError.message);

    const urls: Record<string, string> = {};
    for (const entry of signed ?? []) {
      if (entry.path && entry.signedUrl) urls[entry.path] = entry.signedUrl;
    }
    return { urls };
  });
