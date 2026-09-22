import { createFileRoute } from "@tanstack/react-router";

import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { EXPORT_BUCKET } from "@/lib/timeline.functions";

const STALE_MINUTES = 30;

/**
 * Claims the oldest queued episode export for the external render worker.
 *
 * The worker never receives database or provider credentials: it gets short
 * lived signed URLs for the source clips and one signed upload URL for the
 * finished MP4, and authenticates with the shared cron secret.
 */
export const Route = createFileRoute("/api/public/exports/claim")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const staleBefore = new Date(Date.now() - STALE_MINUTES * 60_000).toISOString();

        // Recover exports whose worker died mid render.
        await supabaseAdmin
          .from("episode_exports")
          .update({ state: "queued", claimed_at: null })
          .in("state", ["processing", "uploading"])
          .lt("updated_at", staleBefore);

        const { data: queued, error } = await supabaseAdmin
          .from("episode_exports")
          .select("*")
          .eq("state", "queued")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
        if (!queued) return Response.json({ ok: true, job: null });

        // Single-flight claim: only the caller that flips queued -> processing wins.
        // The fresh attempt token makes every later result traceable to this attempt.
        const attemptToken = crypto.randomUUID();
        const { data: claimed } = await supabaseAdmin
          .from("episode_exports")
          .update({
            state: "processing",
            claimed_at: new Date().toISOString(),
            attempt_token: attemptToken,
            attempts: (queued.attempts ?? 0) + 1,
          })
          .eq("id", queued.id)
          .eq("state", "queued")
          .select("*")
          .maybeSingle();
        if (!claimed) return Response.json({ ok: true, job: null });

        if ((claimed.attempts ?? 0) > 3) {
          await supabaseAdmin
            .from("episode_exports")
            .update({
              state: "failed",
              error: { message: "The export failed repeatedly and was stopped." },
              completed_at: new Date().toISOString(),
            })
            .eq("id", claimed.id);
          return Response.json({ ok: true, job: null });
        }

        const spec = (claimed.timeline ?? {}) as any;
        const clips = Array.isArray(spec.clips) ? spec.clips : [];

        const sources: any[] = [];
        for (const clip of clips) {
          const { data: signed, error: signError } = await supabaseAdmin.storage
            .from(spec.bucket ?? "shot-videos")
            .createSignedUrl(clip.storagePath, 3600);
          if (signError || !signed) {
            await supabaseAdmin
              .from("episode_exports")
              .update({
                state: "failed",
                error: { message: "A source clip could not be read." },
                completed_at: new Date().toISOString(),
              })
              .eq("id", claimed.id);
            return Response.json({ ok: true, job: null });
          }
          sources.push({
            url: signed.signedUrl,
            order: clip.order,
            trimInSeconds: clip.trimInSeconds ?? 0,
            trimOutSeconds: clip.trimOutSeconds ?? 0,
            durationSeconds: clip.durationSeconds ?? 0,
            muted: Boolean(clip.muted),
          });
        }

        const outputPath = `${claimed.owner_id}/${claimed.project_id}/${claimed.episode_id}/${claimed.id}.mp4`;
        const { data: upload, error: uploadError } = await supabaseAdmin.storage
          .from(EXPORT_BUCKET)
          .createSignedUploadUrl(outputPath, { upsert: true });
        if (uploadError || !upload) {
          await supabaseAdmin
            .from("episode_exports")
            .update({
              state: "failed",
              error: { message: "An upload destination could not be prepared." },
              completed_at: new Date().toISOString(),
            })
            .eq("id", claimed.id);
          return Response.json({ ok: true, job: null });
        }

        return Response.json({
          ok: true,
          job: {
            id: claimed.id,
            width: claimed.width,
            height: claimed.height,
            fps: claimed.fps,
            aspect: claimed.aspect,
            burnSubtitles: claimed.burn_subtitles,
            subtitlesSrt: spec.subtitlesSrt ?? null,
            titleCard: spec.titleCard ?? { enabled: false },
            episodeTitle: spec.episodeTitle ?? "",
            projectTitle: spec.projectTitle ?? "",
            clips: sources.sort((a, b) => a.order - b.order),
            upload: { url: upload.signedUrl, path: outputPath, token: upload.token },
          },
        });
      },
    },
  },
});
