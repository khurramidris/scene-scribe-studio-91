import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  Check,
  Download,
  Film,
  Images,
  Layers,
  Maximize2,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { StudioShell } from "@/components/layout/StudioShell";
import { ProjectNav } from "@/components/studio/ProjectNav";
import { MockBadge, StatusBadge } from "@/components/studio/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  generateMissingStoryboards,
  generateStoryboardFrames,
  selectStoryboardFrame,
  signStudioUrls,
} from "@/lib/storyboard.functions";
import {
  advanceVideoJob,
  approveVideoTake,
  cancelVideoJob,
  getVideoCapabilities,
  submitShotVideo,
} from "@/lib/video.functions";
import { episodesQuery } from "@/modules/projects/project.queries";
import {
  framesQuery,
  jobsQuery,
  productionKeys,
  takesQuery,
} from "@/modules/production/production.queries";
import { deleteFrame, rejectFrame } from "@/modules/production/production.service";
import {
  elapsedLabel,
  isActive,
  JOB_STATE_LABELS,
  type ProductionJob,
  type StoryboardFrame,
  type VideoTake,
} from "@/modules/production/production.types";
import { projectScenesQuery, shotsQuery } from "@/modules/screenplay/screenplay.queries";
import type { Shot } from "@/modules/screenplay/screenplay.types";

type SubmitVars = {
  shotId: string;
  frameId?: string | null;
  endFrameId?: string | null;
  mode: "text_to_video" | "image_to_video" | "first_last_frame";
  resolution: string;
  durationSeconds: number;
  negativePrompt?: string;
  seed?: number;
  extraPrompt?: string;
  idempotencyKey: string;
};

export const Route = createFileRoute("/_authenticated/projects/$projectId_/storyboard")({
  head: () => ({
    meta: [
      { title: "Storyboard studio — Backlot Studio" },
      {
        name: "description",
        content:
          "Generate storyboard frames from approved shots, choose the frame that defines each shot, and render video takes.",
      },
      { property: "og:title", content: "Storyboard studio — Backlot Studio" },
      {
        property: "og:description",
        content: "Storyboard frames and shot-level video generation for AI drama production.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StoryboardStudio,
});

function StoryboardStudio() {
  const { projectId } = Route.useParams();
  const queryClient = useQueryClient();

  const runFrames = useServerFn(generateStoryboardFrames);
  const runBatch = useServerFn(generateMissingStoryboards);
  const runSelect = useServerFn(selectStoryboardFrame);
  const runSign = useServerFn(signStudioUrls);
  const runCapabilities = useServerFn(getVideoCapabilities);
  const runSubmit = useServerFn(submitShotVideo);
  const runAdvance = useServerFn(advanceVideoJob);
  const runCancel = useServerFn(cancelVideoJob);
  const runApprove = useServerFn(approveVideoTake);

  const { data: episodes } = useQuery(episodesQuery(projectId));
  const [episodeId, setEpisodeId] = useState<string>("");
  useEffect(() => {
    if (!episodeId && episodes?.length) setEpisodeId(episodes[0]!.id);
  }, [episodes, episodeId]);

  const { data: allScenes } = useQuery(projectScenesQuery(projectId));
  const scenes = useMemo(
    () => (allScenes ?? []).filter((s) => s.episode_id === episodeId),
    [allScenes, episodeId],
  );
  const [sceneId, setSceneId] = useState<string>("");
  useEffect(() => {
    if (scenes.length && !scenes.some((s) => s.id === sceneId)) setSceneId(scenes[0]!.id);
  }, [scenes, sceneId]);

  const { data: shots, isLoading: shotsLoading } = useQuery(shotsQuery(sceneId || null));
  const { data: frames } = useQuery(framesQuery(episodeId));
  const { data: takes } = useQuery(takesQuery(episodeId));
  const { data: jobs } = useQuery(jobsQuery(projectId));
  const { data: capability } = useQuery({
    queryKey: ["video-capabilities"],
    queryFn: () => runCapabilities({}),
  });

  const [urls, setUrls] = useState<Record<string, string>>({});
  const [lightbox, setLightbox] = useState<string | null>(null);

  const framePaths = useMemo(
    () => (frames ?? []).map((f) => f.storage_path).filter(Boolean),
    [frames],
  );
  const takePaths = useMemo(() => (takes ?? []).map((t) => t.storage_path).filter(Boolean), [takes]);

  useEffect(() => {
    let cancelled = false;
    async function sign() {
      const next: Record<string, string> = {};
      if (framePaths.length) {
        const res = await runSign({ data: { bucket: "storyboard-frames", paths: framePaths } });
        Object.assign(next, res.urls);
      }
      if (takePaths.length) {
        const res = await runSign({ data: { bucket: "shot-videos", paths: takePaths } });
        Object.assign(next, res.urls);
      }
      if (!cancelled) setUrls((prev) => ({ ...prev, ...next }));
    }
    void sign().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [framePaths.join(","), takePaths.join(","), runSign]);

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: productionKeys.frames(episodeId) });
    void queryClient.invalidateQueries({ queryKey: productionKeys.takes(episodeId) });
    void queryClient.invalidateQueries({ queryKey: productionKeys.jobs(projectId) });
  }, [queryClient, episodeId, projectId]);

  // Advance any render that is still running. The job row is authoritative, so
  // closing the tab does not lose work — polling simply resumes on the next visit.
  const activeJobs = useMemo(() => (jobs ?? []).filter(isActive), [jobs]);
  useEffect(() => {
    if (!activeJobs.length) return;
    let stop = false;
    const timer = setInterval(() => {
      if (stop) return;
      void (async () => {
        for (const job of activeJobs) {
          try {
            await runAdvance({ data: { jobId: job.id } });
          } catch {
            /* surfaced on the job row */
          }
        }
        invalidate();
      })();
    }, 10000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [activeJobs.map((j) => j.id).join(","), runAdvance, invalidate]);

  const frameMutation = useMutation({
    mutationFn: (vars: { shotId: string; count: number }) =>
      runFrames({ data: { shotId: vars.shotId, count: vars.count, useReferences: true } }),
    onSuccess: (res) => {
      toast.success(res.isMock ? "Placeholder frame created (no image provider)" : "Frame ready");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const batchMutation = useMutation({
    mutationFn: (vars: { scope: "scene" | "episode"; id: string }) =>
      runBatch({ data: { scope: vars.scope, id: vars.id, limit: 8 } }),
    onSuccess: (res) => {
      toast.success(`${res.created} frame(s) generated. ${res.remaining} shot(s) still without one.`);
      if (res.failures.length) toast.error(res.failures[0]!.message);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const selectMutation = useMutation({
    mutationFn: (frameId: string) => runSelect({ data: { frameId } }),
    onSuccess: () => {
      toast.success("Frame approved for this shot");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (frame: StoryboardFrame) => deleteFrame(frame),
    onSuccess: () => {
      toast.success("Alternative removed");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rejectMutation = useMutation({
    mutationFn: (frameId: string) => rejectFrame(frameId),
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message),
  });

  const submitMutation = useMutation({
    mutationFn: (vars: SubmitVars) => runSubmit({ data: vars }),
    onSuccess: (res) => {
      toast.success(res.isMock ? "Placeholder render queued (no video provider)" : "Render queued");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const approveMutation = useMutation({
    mutationFn: (takeId: string) => runApprove({ data: { takeId } }),
    onSuccess: () => {
      toast.success("Take approved");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const cancelMutation = useMutation({
    mutationFn: (jobId: string) => runCancel({ data: { jobId } }),
    onSuccess: () => {
      toast.success("Render cancelled");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const framesByShot = useMemo(() => {
    const map = new Map<string, StoryboardFrame[]>();
    for (const frame of frames ?? []) {
      const list = map.get(frame.shot_id) ?? [];
      list.push(frame);
      map.set(frame.shot_id, list);
    }
    return map;
  }, [frames]);

  const takesByShot = useMemo(() => {
    const map = new Map<string, VideoTake[]>();
    for (const take of takes ?? []) {
      const list = map.get(take.shot_id) ?? [];
      list.push(take);
      map.set(take.shot_id, list);
    }
    return map;
  }, [takes]);

  const jobsByShot = useMemo(() => {
    const map = new Map<string, ProductionJob[]>();
    for (const job of jobs ?? []) {
      if (!job.shot_id) continue;
      const list = map.get(job.shot_id) ?? [];
      list.push(job);
      map.set(job.shot_id, list);
    }
    return map;
  }, [jobs]);

  return (
    <StudioShell>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <Link
          to="/projects/$projectId"
          params={{ projectId }}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to production
        </Link>
        <h1 className="mt-3 text-2xl font-semibold">Storyboard studio</h1>
        <p className="text-sm text-muted-foreground">
          Turn approved shots into frames, choose the frame that defines each shot, then render the
          clip.
        </p>
        <ProjectNav projectId={projectId} />

        <div className="mt-6 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4">
          <div className="min-w-48">
            <Label className="text-xs">Episode</Label>
            <Select value={episodeId} onValueChange={setEpisodeId}>
              <SelectTrigger>
                <SelectValue placeholder="Select an episode" />
              </SelectTrigger>
              <SelectContent>
                {(episodes ?? []).map((episode) => (
                  <SelectItem key={episode.id} value={episode.id}>
                    {episode.number}. {episode.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-64">
            <Label className="text-xs">Scene</Label>
            <Select value={sceneId} onValueChange={setSceneId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a scene" />
              </SelectTrigger>
              <SelectContent>
                {scenes.map((scene) => (
                  <SelectItem key={scene.id} value={scene.id}>
                    {scene.scene_number}. {scene.heading}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="secondary"
            disabled={!sceneId || batchMutation.isPending}
            onClick={() => batchMutation.mutate({ scope: "scene", id: sceneId })}
          >
            <Layers className="mr-2 h-4 w-4" /> Frames for this scene
          </Button>
          <Button
            variant="outline"
            disabled={!episodeId || batchMutation.isPending}
            onClick={() => batchMutation.mutate({ scope: "episode", id: episodeId })}
          >
            <Images className="mr-2 h-4 w-4" /> Frames for the episode
          </Button>
        </div>

        {capability ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Renderer: <span className="text-foreground">{capability.provider}</span> ·{" "}
            {capability.model} · {capability.capabilities.resolutions.join(", ")} ·{" "}
            {capability.capabilities.minDurationSeconds}–
            {capability.capabilities.maxDurationSeconds}s
            {capability.capabilities.isMock
              ? " · development placeholder only, no real video is produced"
              : ""}
          </p>
        ) : null}

        {shotsLoading ? (
          <p className="mt-8 text-sm text-muted-foreground">Loading shots…</p>
        ) : !(shots ?? []).length ? (
          <p className="mt-8 text-sm text-muted-foreground">
            This scene has no shots yet. Plan them in Shot planning first.
          </p>
        ) : (
          <div className="mt-6 space-y-5">
            {(shots ?? []).map((shot) => (
              <ShotBoard
                key={shot.id}
                shot={shot}
                frames={framesByShot.get(shot.id) ?? []}
                takes={takesByShot.get(shot.id) ?? []}
                jobs={jobsByShot.get(shot.id) ?? []}
                urls={urls}
                capability={capability}
                onGenerate={(count) => frameMutation.mutate({ shotId: shot.id, count })}
                generating={frameMutation.isPending}
                onSelect={(frameId) => selectMutation.mutate(frameId)}
                onReject={(frameId) => rejectMutation.mutate(frameId)}
                onDelete={(frame) => deleteMutation.mutate(frame)}
                onZoom={setLightbox}
                onSubmit={(vars) => submitMutation.mutate(vars)}
                submitting={submitMutation.isPending}
                onApprove={(takeId) => approveMutation.mutate(takeId)}
                onCancel={(jobId) => cancelMutation.mutate(jobId)}
              />
            ))}
          </div>
        )}
      </div>

      {lightbox ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 p-6"
          onClick={() => setLightbox(null)}
        >
          <button
            className="absolute right-6 top-6 text-muted-foreground hover:text-foreground"
            aria-label="Close"
            onClick={() => setLightbox(null)}
          >
            <X className="h-6 w-6" />
          </button>
          <img src={lightbox} alt="Storyboard frame" className="max-h-full max-w-full rounded-lg" />
        </div>
      ) : null}
    </StudioShell>
  );
}

type Capability = Awaited<ReturnType<typeof getVideoCapabilities>> | undefined;

function ShotBoard(props: {
  shot: Shot;
  frames: StoryboardFrame[];
  takes: VideoTake[];
  jobs: ProductionJob[];
  urls: Record<string, string>;
  capability: Capability;
  generating: boolean;
  submitting: boolean;
  onGenerate: (count: number) => void;
  onSelect: (frameId: string) => void;
  onReject: (frameId: string) => void;
  onDelete: (frame: StoryboardFrame) => void;
  onZoom: (url: string) => void;
  onSubmit: (vars: SubmitVars) => void;
  onApprove: (takeId: string) => void;
  onCancel: (jobId: string) => void;
}) {
  const { shot, frames, takes, jobs, urls, capability } = props;
  const selected = frames.find((f) => f.is_selected) ?? null;
  const caps = capability?.capabilities;

  const [resolution, setResolution] = useState<string>("");
  const [duration, setDuration] = useState<number>(Number(shot.duration_seconds) || 5);
  const [mode, setMode] = useState<string>("image_to_video");
  useEffect(() => {
    if (caps && !resolution) setResolution(caps.resolutions[0] ?? "720p");
  }, [caps, resolution]);

  const clamped = caps
    ? Math.min(Math.max(duration, caps.minDurationSeconds), caps.maxDurationSeconds)
    : duration;

  const activeJob = jobs.find(isActive) ?? null;
  const lastFailed = jobs.find((j) => j.state === "failed") ?? null;

  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <header className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-secondary px-2 py-0.5 text-xs font-semibold">
          Shot {shot.shot_number}
        </span>
        <span className="text-sm text-muted-foreground">
          {shot.shot_type} · {shot.camera_angle} · {shot.camera_movement} · {shot.duration_seconds}s
        </span>
        <StatusBadge status={shot.status} />
        {shot.is_mock ? <MockBadge /> : null}
        <div className="ml-auto flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={props.generating}
            onClick={() => props.onGenerate(1)}
          >
            <Sparkles className="mr-2 h-4 w-4" /> Frame
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={props.generating}
            onClick={() => props.onGenerate(3)}
          >
            <RefreshCw className="mr-2 h-4 w-4" /> 3 alternatives
          </Button>
        </div>
      </header>

      <p className="mt-2 text-sm text-muted-foreground">{shot.description}</p>

      {frames.length ? (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {frames.map((frame) => {
            const url = urls[frame.storage_path];
            return (
              <div
                key={frame.id}
                className={`overflow-hidden rounded-md border ${frame.is_selected ? "border-emerald-500/60" : "border-border"}`}
              >
                <div className="relative aspect-[3/4] bg-secondary">
                  {url ? (
                    <img src={url} alt="Storyboard alternative" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                      Loading…
                    </div>
                  )}
                  {url ? (
                    <button
                      className="absolute right-1 top-1 rounded bg-background/80 p-1"
                      aria-label="Inspect full screen"
                      onClick={() => props.onZoom(url)}
                    >
                      <Maximize2 className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-1 p-2">
                  <StatusBadge status={frame.status} />
                  {frame.is_mock ? <MockBadge /> : null}
                  {!frame.used_reference_conditioning && !frame.is_mock ? (
                    <span
                      title="The image provider could not take the approved character images as inputs, so visual consistency is not guaranteed."
                      className="rounded-full border border-amber-500/40 px-2 py-0.5 text-[11px] text-amber-400"
                    >
                      No ref conditioning
                    </span>
                  ) : null}
                  <div className="ml-auto flex gap-1">
                    {!frame.is_selected ? (
                      <Button size="sm" variant="ghost" onClick={() => props.onSelect(frame.id)}>
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                    ) : null}
                    <Button size="sm" variant="ghost" onClick={() => props.onReject(frame.id)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => props.onDelete(frame)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">No frames generated for this shot yet.</p>
      )}

      {/* Video generation */}
      <div className="mt-4 rounded-md border border-border/70 bg-background/40 p-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-40">
            <Label className="text-xs">Mode</Label>
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(caps?.modes ?? []).map((m) => (
                  <SelectItem key={m} value={m}>
                    {m.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-32">
            <Label className="text-xs">Resolution</Label>
            <Select value={resolution} onValueChange={setResolution}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(caps?.resolutions ?? []).map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-28">
            <Label className="text-xs">Seconds</Label>
            <Input
              type="number"
              min={caps?.minDurationSeconds ?? 1}
              max={caps?.maxDurationSeconds ?? 20}
              value={clamped}
              onChange={(event) => setDuration(Number(event.target.value))}
            />
          </div>
          <Button
            disabled={props.submitting || Boolean(activeJob) || (mode !== "text_to_video" && !selected)}
            onClick={() =>
              props.onSubmit({
                shotId: shot.id,
                frameId: selected?.id ?? null,
                mode: mode as "text_to_video" | "image_to_video" | "first_last_frame",
                resolution,
                durationSeconds: clamped,
                idempotencyKey: `video:${shot.id}:${Date.now()}`,
              })
            }
          >
            <Film className="mr-2 h-4 w-4" /> Generate video
          </Button>
          {mode !== "text_to_video" && !selected ? (
            <span className="text-xs text-amber-400">Approve a storyboard frame first.</span>
          ) : null}
        </div>

        {activeJob ? (
          <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="text-foreground">{JOB_STATE_LABELS[activeJob.state]}</span>
            <span>{activeJob.progress}%</span>
            <span>{elapsedLabel(activeJob)}</span>
            {caps?.supportsCancel ? (
              <Button size="sm" variant="ghost" onClick={() => props.onCancel(activeJob.id)}>
                Cancel
              </Button>
            ) : null}
          </div>
        ) : null}

        {lastFailed && !activeJob ? (
          <p className="mt-3 text-xs text-destructive">
            Last render failed: {(lastFailed.error as { message?: string } | null)?.message}
          </p>
        ) : null}

        {takes.length ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {takes.map((take) => {
              const url = urls[take.storage_path];
              return (
                <div
                  key={take.id}
                  className={`rounded-md border p-2 ${take.is_selected ? "border-emerald-500/60" : "border-border"}`}
                >
                  {take.is_mock ? (
                    <div className="flex aspect-video items-center justify-center rounded bg-secondary text-xs text-orange-400">
                      Development placeholder — not a real render
                    </div>
                  ) : url ? (
                    <video src={url} controls className="w-full rounded" />
                  ) : (
                    <div className="flex aspect-video items-center justify-center rounded bg-secondary text-xs text-muted-foreground">
                      Loading…
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <StatusBadge status={take.status} />
                    {take.is_mock ? <MockBadge /> : null}
                    <span>
                      v{take.version} · {take.provider}/{take.model}
                    </span>
                    {take.duration_seconds ? <span>{take.duration_seconds}s</span> : null}
                    <div className="ml-auto flex gap-1">
                      {url ? (
                        <a
                          href={url}
                          download
                          aria-label={`Download take v${take.version}`}
                          className="rounded p-1 hover:text-foreground"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </a>
                      ) : null}
                      {!take.is_selected && !take.is_mock ? (
                        <Button size="sm" variant="ghost" onClick={() => props.onApprove(take.id)}>
                          Approve take
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </article>
  );
}
