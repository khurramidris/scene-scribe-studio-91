import { createFileRoute } from "@tanstack/react-router";

import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/** Bounded work per tick so a backlog can never fan out into a request storm. */
const MAX_JOBS_PER_TICK = 5;
/** A job stuck in a transient state for longer than this is recovered. */
const STALE_MINUTES = 20;

/**
 * Scheduled tick. Advances active video renders so a job finishes even when
 * every browser tab is closed, and recovers interrupted ones.
 */
export const Route = createFileRoute("/api/public/cron/tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { advanceJobRecord } = await import("@/lib/video.functions");

        const staleBefore = new Date(Date.now() - STALE_MINUTES * 60_000).toISOString();

        // Recover renders that were claimed for download but never finished.
        await supabaseAdmin
          .from("production_jobs")
          .update({ state: "processing" })
          .eq("job_type", "shot_video")
          .eq("state", "downloading")
          .lt("updated_at", staleBefore);

        const { data: jobs, error } = await supabaseAdmin
          .from("production_jobs")
          .select("*")
          .eq("job_type", "shot_video")
          .in("state", ["submitting", "processing"])
          .order("created_at", { ascending: true })
          .limit(MAX_JOBS_PER_TICK);
        if (error) {
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }

        const results: { jobId: string; state: string }[] = [];
        for (const job of jobs ?? []) {
          try {
            const advanced = await advanceJobRecord(job);
            results.push({ jobId: job.id, state: advanced?.state ?? job.state });
          } catch (cause) {
            const message = cause instanceof Error ? cause.message : "Tick failed.";
            await supabaseAdmin
              .from("production_jobs")
              .update({
                error: { message, stage: "worker" },
                attempts: (job.attempts ?? 0) + 1,
                ...(Number(job.attempts ?? 0) + 1 >= 5
                  ? { state: "failed", completed_at: new Date().toISOString() }
                  : {}),
              })
              .eq("id", job.id);
            results.push({ jobId: job.id, state: "error" });
          }
        }

        return Response.json({ ok: true, processed: results.length, results });
      },
    },
  },
});
