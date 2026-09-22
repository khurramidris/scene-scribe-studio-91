import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { EXPORT_BUCKET } from "@/lib/timeline.functions";

const Body = z.object({
  exportId: z.string().uuid(),
  ok: z.boolean(),
  storagePath: z.string().max(500).optional(),
  fileSizeBytes: z.number().int().nonnegative().optional(),
  durationSeconds: z.number().nonnegative().optional(),
  error: z.string().max(2000).optional(),
});

/** The render worker reports the outcome of one export here. */
export const Route = createFileRoute("/api/public/exports/complete")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;

        let body: z.infer<typeof Body>;
        try {
          body = Body.parse(await request.json());
        } catch {
          return Response.json({ ok: false, error: "Invalid payload" }, { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        if (!body.ok || !body.storagePath) {
          await supabaseAdmin
            .from("episode_exports")
            .update({
              state: "failed",
              error: { message: body.error ?? "The render worker reported a failure." },
              completed_at: new Date().toISOString(),
            })
            .eq("id", body.exportId);
          return Response.json({ ok: true });
        }

        // Only mark completed once the file really exists in our own storage.
        const { data: file, error: statError } = await supabaseAdmin.storage
          .from(EXPORT_BUCKET)
          .download(body.storagePath);
        if (statError || !file || file.size === 0) {
          await supabaseAdmin
            .from("episode_exports")
            .update({
              state: "failed",
              error: { message: "The exported file could not be verified in storage." },
              completed_at: new Date().toISOString(),
            })
            .eq("id", body.exportId);
          return Response.json({ ok: true });
        }

        const { error } = await supabaseAdmin
          .from("episode_exports")
          .update({
            state: "completed",
            storage_path: body.storagePath,
            mime_type: "video/mp4",
            file_size_bytes: body.fileSizeBytes ?? file.size,
            duration_seconds: body.durationSeconds ?? null,
            error: null,
            completed_at: new Date().toISOString(),
          })
          .eq("id", body.exportId);
        if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

        return Response.json({ ok: true });
      },
    },
  },
});
