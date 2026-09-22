import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { StudioShell } from "@/components/layout/StudioShell";
import { MockBadge } from "@/components/studio/StatusBadge";
import { Button } from "@/components/ui/button";
import { advanceVideoJob, cancelVideoJob } from "@/lib/video.functions";
import { jobsQuery, productionKeys } from "@/modules/production/production.queries";
import { elapsedLabel, isActive, JOB_STATE_LABELS } from "@/modules/production/production.types";

export const Route = createFileRoute("/_authenticated/queue")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Production queue — Backlot Studio" },
      {
        name: "description",
        content:
          "Track every storyboard and video generation job: state, provider, elapsed time, errors, retries and results.",
      },
      { property: "og:title", content: "Production queue — Backlot Studio" },
      {
        property: "og:description",
        content: "Persistent job tracking for AI storyboard and video generation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: QueuePage,
});

function QueuePage() {
  const queryClient = useQueryClient();
  const { data: jobs, isLoading } = useQuery(jobsQuery());
  const runAdvance = useServerFn(advanceVideoJob);
  const runCancel = useServerFn(cancelVideoJob);

  const refresh = () => queryClient.invalidateQueries({ queryKey: productionKeys.jobs() });

  const advance = useMutation({
    mutationFn: (jobId: string) => runAdvance({ data: { jobId } }),
    onSuccess: () => void refresh(),
    onError: (error: Error) => toast.error(error.message),
  });

  const cancel = useMutation({
    mutationFn: (jobId: string) => runCancel({ data: { jobId } }),
    onSuccess: () => {
      toast.success("Cancelled");
      void refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <StudioShell>
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Production queue</h1>
            <p className="text-sm text-muted-foreground">
              Every generation job, with its provider, state and result. Work continues on the
              server if you close this page.
            </p>
          </div>
          <Button variant="outline" onClick={() => void refresh()}>
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
        </div>

        {isLoading ? (
          <p className="mt-8 text-sm text-muted-foreground">Loading jobs…</p>
        ) : !(jobs ?? []).length ? (
          <p className="mt-8 text-sm text-muted-foreground">No generation jobs yet.</p>
        ) : (
          <div className="mt-6 space-y-2">
            {(jobs ?? []).map((job) => (
              <div
                key={job.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3 text-sm"
              >
                <span className="rounded bg-secondary px-2 py-0.5 text-xs">
                  {job.job_type === "shot_video" ? "Video" : "Storyboard"}
                </span>
                <span className="font-medium">{JOB_STATE_LABELS[job.state]}</span>
                {job.is_mock ? <MockBadge /> : null}
                <span className="text-xs text-muted-foreground">
                  {job.provider}/{job.model} · {elapsedLabel(job)} · attempt {job.attempts}
                  {isActive(job) ? ` · ${job.progress}%` : ""}
                </span>
                {job.error ? (
                  <span className="text-xs text-destructive">
                    {(job.error as { message?: string }).message}
                  </span>
                ) : null}
                <div className="ml-auto flex items-center gap-2">
                  <Link
                    to="/projects/$projectId/storyboard"
                    params={{ projectId: job.project_id }}
                    className="text-xs text-muted-foreground underline hover:text-foreground"
                  >
                    Open shot
                  </Link>
                  {isActive(job) ? (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={advance.isPending}
                        onClick={() => advance.mutate(job.id)}
                      >
                        Check now
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={cancel.isPending}
                        onClick={() => cancel.mutate(job.id)}
                      >
                        Cancel
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </StudioShell>
  );
}
