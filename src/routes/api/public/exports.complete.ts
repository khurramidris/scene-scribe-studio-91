import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { EXPORT_BUCKET } from "@/lib/timeline.functions";

const Body = z.object({
  exportId: z.string().uuid(),
  attemptToken: z.string().uuid(),
  ok: z.boolean(),
  storagePath: z.string().max(500).optional(),
  fileSizeBytes: z.number().int().nonnegative().optional(),
  durationSeconds: z.number().nonnegative().optional(),
  error: z.string().max(2000).optional(),
});

/** States from which an export attempt may still be finalised. */
const OPEN_STATES = ["processing", "uploading"] as const;

export function expectedExportPath(record: {
  owner_id: string;
  project_id: string;
  episode_id: string;
  id: string;
}): string {
  return `${record.owner_id}/${record.project_id}/${record.episode_id}/${record.id}.mp4`;
}

/**
 * The render worker reports the outcome of one export attempt here.
 *
 * A result is only accepted when it carries the token issued to the attempt
 * that currently owns the export, so a late report from an obsolete worker can
 * never overwrite a newer attempt or an already completed export.
 */
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

        const { data: record, error: readError } = await supabaseAdmin
          .from("episode_exports")
          .select("id, owner_id, project_id, episode_id, state, attempt_token")
          .eq("id", body.exportId)
          .maybeSingle();
        if (readError) return Response.json({ ok: false, error: readError.message }, { status: 500 });
        if (!record) return Response.json({ ok: false, error: "Export not found" }, { status: 404 });

        if (record.attempt_token !== body.attemptToken) {
          return Response.json({ ok: false, error: "stale_attempt" }, { status: 409 });
        }
        if (!OPEN_STATES.includes(record.state as (typeof OPEN_STATES)[number])) {
          return Response.json({ ok: false, error: "export_not_open" }, { status: 409 });
        }

        // Every write is conditional on the attempt still being the active one.
        const guard = (query: any) =>
          query
            .eq("id", body.exportId)
            .eq("attempt_token", body.attemptToken)
            .in("state", OPEN_STATES as unknown as string[]);

        const fail = async (message: string) => {
          await guard(
            supabaseAdmin.from("episode_exports").update({
              state: "failed",
              error: { message },
              completed_at: new Date().toISOString(),
            }),
          );
          return Response.json({ ok: true });
        };

        if (!body.ok || !body.storagePath) {
          return fail(body.error ?? "The render worker reported a failure.");
        }

        // The worker may only write to the path this export was given.
        const expected = expectedExportPath(record);
        if (body.storagePath !== expected) {
          return fail("The render worker reported an unexpected storage location.");
        }

        // Only mark completed once the file really exists in our own storage.
        const { data: file, error: statError } = await supabaseAdmin.storage
          .from(EXPORT_BUCKET)
          .download(body.storagePath);
        if (statError || !file || file.size === 0) {
          return fail("The exported file could not be verified in storage.");
        }

        const { data: updated, error } = await guard(
          supabaseAdmin
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
            .select("id"),
        ).maybeSingle();
        if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
        if (!updated) {
          // Another attempt finalised it while we were verifying the upload.
          return Response.json({ ok: false, error: "stale_attempt" }, { status: 409 });
        }

        return Response.json({ ok: true });
      },
    },
  },
});
