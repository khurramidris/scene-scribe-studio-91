import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Download, Film, ImagePlus, Loader2, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { StudioShell } from "@/components/layout/StudioShell";
import { MockBadge } from "@/components/studio/StatusBadge";
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
import { Textarea } from "@/components/ui/textarea";
import { IMAGE_UPLOAD_ACCEPT, IMAGE_UPLOAD_HELP } from "@/lib/image-upload";
import { uploadStudioImage } from "@/lib/image-upload.service";
import {
  listSingleVideos,
  registerUserImage,
  submitSingleVideo,
} from "@/lib/single-video.functions";
import { signStudioUrls } from "@/lib/storyboard.functions";
import { advanceVideoJob, getVideoCapabilities } from "@/lib/video.functions";
import { useAuth } from "@/modules/auth/useAuth";
import { elapsedLabel, JOB_STATE_LABELS, isActive } from "@/modules/production/production.types";

export const Route = createFileRoute("/_authenticated/single-video")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Single video — Backlot Studio" },
      {
        name: "description",
        content:
          "Generate one AI video clip from a prompt, with optional starting and ending images, then download the MP4.",
      },
      { property: "og:title", content: "Single video — Backlot Studio" },
      {
        property: "og:description",
        content: "One-clip AI video generation with optional first and last frame images.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SingleVideoStudio,
});

type UploadedImage = { id: string; storagePath: string; previewUrl: string };

function SingleVideoStudio() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const runCapabilities = useServerFn(getVideoCapabilities);
  const runRegister = useServerFn(registerUserImage);
  const runSubmit = useServerFn(submitSingleVideo);
  const runList = useServerFn(listSingleVideos);
  const runSign = useServerFn(signStudioUrls);
  const runAdvance = useServerFn(advanceVideoJob);

  const { data: capability } = useQuery({
    queryKey: ["video-capabilities"],
    queryFn: () => runCapabilities({}),
  });
  const caps = capability?.capabilities;
  const supportsEndFrame = Boolean(caps?.modes.includes("first_last_frame"));

  const { data: history } = useQuery({
    queryKey: ["single-videos"],
    queryFn: () => runList({}),
    refetchInterval: 8000,
  });

  const [prompt, setPrompt] = useState("");
  const [aspect, setAspect] = useState<"9:16" | "16:9">("9:16");
  const [resolution, setResolution] = useState("");
  const [duration, setDuration] = useState(5);
  const [start, setStart] = useState<UploadedImage | null>(null);
  const [end, setEnd] = useState<UploadedImage | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(
    () => () => {
      if (start) URL.revokeObjectURL(start.previewUrl);
    },
    [start],
  );
  useEffect(
    () => () => {
      if (end) URL.revokeObjectURL(end.previewUrl);
    },
    [end],
  );

  useEffect(() => {
    if (caps && !resolution) setResolution(caps.resolutions[0] ?? "720p");
  }, [caps, resolution]);

  const mode = !start ? "text_to_video" : end ? "first_last_frame" : "image_to_video";

  const videoPaths = useMemo(
    () => (history?.videos ?? []).map((v) => v.storage_path).filter(Boolean),
    [history],
  );
  const videoPathKey = videoPaths.join(",");

  useEffect(() => {
    if (!videoPathKey) return;
    let cancelled = false;
    void runSign({ data: { bucket: "shot-videos", paths: videoPathKey.split(",") } })
      .then((res) => {
        if (!cancelled) setUrls((prev) => ({ ...prev, ...res.urls }));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [videoPathKey, runSign]);

  const activeJobs = useMemo(() => (history?.jobs ?? []).filter(isActive), [history]);
  const activeJobKey = activeJobs.map((job) => job.id).join(",");
  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["single-videos"] });
  }, [queryClient]);

  // The job row is authoritative: closing the tab never loses a submitted render.
  useEffect(() => {
    if (!activeJobKey) return;
    const timer = setInterval(() => {
      void (async () => {
        for (const jobId of activeJobKey.split(",")) {
          try {
            await runAdvance({ data: { jobId } });
          } catch {
            /* surfaced on the job row */
          }
        }
        refresh();
      })();
    }, 10000);
    return () => clearInterval(timer);
  }, [activeJobKey, runAdvance, refresh]);

  const upload = useCallback(
    async (file: File, role: "start" | "end"): Promise<UploadedImage> => {
      if (!user) throw new Error("Sign in first.");
      const row = await uploadStudioImage(
        file,
        "user-images",
        `${user.id}/single/`,
        (storagePath) =>
          runRegister({
            data: {
              storagePath,
              mimeType: file.type,
              fileSizeBytes: file.size,
              originalName: file.name.slice(0, 200),
              role,
            },
          }),
      );
      return { id: row.id, storagePath: row.storage_path, previewUrl: URL.createObjectURL(file) };
    },
    [user, runRegister],
  );

  const startUpload = useMutation({
    mutationFn: (file: File) => upload(file, "start"),
    onSuccess: (image) => setStart(image),
    onError: (error: Error) => toast.error(error.message),
  });
  const endUpload = useMutation({
    mutationFn: (file: File) => upload(file, "end"),
    onSuccess: (image) => setEnd(image),
    onError: (error: Error) => toast.error(error.message),
  });

  const submit = useMutation({
    mutationFn: () =>
      runSubmit({
        data: {
          prompt,
          aspect,
          resolution,
          durationSeconds: duration,
          startImageId: start?.id ?? null,
          endImageId: end?.id ?? null,
          idempotencyKey: `single:${crypto.randomUUID()}`,
        },
      }),
    onSuccess: (res) => {
      toast.success(
        res.isMock
          ? "Placeholder render queued — no video provider is configured"
          : "Render queued. It keeps running even if you close this page.",
      );
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const clearImage = (which: "start" | "end") => {
    if (which === "start") {
      setStart(null);
      setEnd(null);
    } else {
      setEnd(null);
    }
    // Removing a form input must not remove images used by queued or saved videos.
  };

  const clamped = caps
    ? Math.min(Math.max(duration, caps.minDurationSeconds), caps.maxDurationSeconds)
    : duration;

  return (
    <StudioShell>
      <div className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-semibold">Single video</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          One clip from a prompt — optionally starting and ending on your own images. No story,
          screenplay or episode needed.
        </p>

        {capability ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Renderer: <span className="text-foreground">{capability.provider}</span> ·{" "}
            {capability.model} · {caps?.resolutions.join(", ")} · {caps?.minDurationSeconds}–
            {caps?.maxDurationSeconds}s
            {caps?.isMock ? " · development placeholder only, no real video is produced" : ""}
          </p>
        ) : null}

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <section className="rounded-lg border border-border bg-card p-4">
            <Label htmlFor="prompt" className="text-xs">
              Prompt
            </Label>
            <Textarea
              id="prompt"
              rows={5}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="A woman steps off a night bus into heavy rain, neon signs reflecting in puddles; distant traffic and soft rain."
              className="mt-1"
            />

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <ImageSlot
                label="Starting image (optional)"
                image={start}
                busy={startUpload.isPending}
                disabled={endUpload.isPending || submit.isPending}
                lockRemoval={endUpload.isPending || submit.isPending}
                onPick={(file) => startUpload.mutate(file)}
                onClear={() => void clearImage("start")}
              />
              <ImageSlot
                label="Ending image (optional)"
                image={end}
                busy={endUpload.isPending}
                disabled={!supportsEndFrame || !start || startUpload.isPending || submit.isPending}
                lockRemoval={startUpload.isPending || submit.isPending}
                disabledReason={
                  !supportsEndFrame
                    ? `${capability?.provider ?? "This renderer"} does not support first-and-last-frame generation.`
                    : "Add a starting image first — an ending image needs one."
                }
                onPick={(file) => endUpload.mutate(file)}
                onClear={() => void clearImage("end")}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {IMAGE_UPLOAD_HELP}. Add a starting image to animate your own image.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div>
                <Label className="text-xs">Aspect</Label>
                <Select value={aspect} onValueChange={(v) => setAspect(v as "9:16" | "16:9")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(caps?.aspects ?? ["9:16", "16:9"]).map((a) => (
                      <SelectItem key={a} value={a}>
                        {a}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
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
              <div>
                <Label className="text-xs">Seconds</Label>
                <Input
                  type="number"
                  min={caps?.minDurationSeconds ?? 3}
                  max={caps?.maxDurationSeconds ?? 10}
                  value={clamped}
                  onChange={(event) => setDuration(Number(event.target.value))}
                />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button
                disabled={
                  submit.isPending ||
                  startUpload.isPending ||
                  endUpload.isPending ||
                  prompt.trim().length < 3 ||
                  !caps?.modes.includes(mode)
                }
                onClick={() => submit.mutate()}
              >
                {submit.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Film className="mr-2 h-4 w-4" />
                )}
                Generate video
              </Button>
              <span className="meta-label text-muted-foreground">
                Mode: {mode.replace(/_/g, " ")}
              </span>
            </div>

            {activeJobs.length ? (
              <div className="mt-4 space-y-2">
                {activeJobs.map((job) => (
                  <div
                    key={job.id}
                    className="flex items-center gap-3 rounded-md border border-border/70 p-2 text-xs text-muted-foreground"
                  >
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span className="text-foreground">{JOB_STATE_LABELS[job.state]}</span>
                    <span>{job.progress}%</span>
                    <span>{elapsedLabel(job)}</span>
                  </div>
                ))}
              </div>
            ) : null}

            {(history?.jobs ?? [])
              .filter((job) => job.state === "failed")
              .slice(0, 1)
              .map((job) => (
                <p key={job.id} className="mt-3 text-xs text-destructive">
                  Last render failed: {(job.error as { message?: string } | null)?.message}
                </p>
              ))}
          </section>

          <section>
            <h2 className="text-sm font-medium">Your videos</h2>
            {!(history?.videos ?? []).length ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Generated clips appear here and stay available after a reload.
              </p>
            ) : null}
            <div className="mt-3 space-y-4">
              {(history?.videos ?? []).map((video) => {
                const url = urls[video.storage_path];
                return (
                  <div key={video.id} className="rounded-lg border border-border bg-card p-3">
                    {video.is_mock ? (
                      <div className="flex aspect-video items-center justify-center rounded bg-secondary text-xs text-orange-400">
                        Development placeholder — not a real render
                      </div>
                    ) : url ? (
                      <video src={url} controls playsInline className="w-full rounded" />
                    ) : (
                      <div className="flex aspect-video items-center justify-center rounded bg-secondary text-xs text-muted-foreground">
                        Loading…
                      </div>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      {video.is_mock ? <MockBadge /> : null}
                      <span>
                        {video.mode.replace(/_/g, " ")} · {video.aspect} · {video.resolution}
                      </span>
                      {video.duration_seconds ? <span>{video.duration_seconds}s</span> : null}
                      <div className="ml-auto flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setPrompt(video.prompt);
                            setAspect(video.aspect === "16:9" ? "16:9" : "9:16");
                            setResolution(video.resolution);
                            toast.message("Settings loaded — adjust and generate again.");
                          }}
                        >
                          <RefreshCw className="mr-1 h-3.5 w-3.5" /> Regenerate
                        </Button>
                        {url ? (
                          <a
                            href={url}
                            download
                            aria-label="Download this video as MP4"
                            className="rounded p-1 hover:text-foreground"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </a>
                        ) : null}
                      </div>
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                      {video.prompt}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </StudioShell>
  );
}

function ImageSlot(props: {
  label: string;
  image: UploadedImage | null;
  busy: boolean;
  disabled?: boolean;
  lockRemoval?: boolean;
  disabledReason?: string;
  onPick: (file: File) => void;
  onClear: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div>
      <Label className="text-xs">{props.label}</Label>
      <div className="mt-1 rounded-md border border-dashed border-border p-2">
        {props.image ? (
          <div className="relative">
            <img
              src={props.image.previewUrl}
              alt="Selected frame"
              className="h-32 w-full rounded object-cover"
            />
            <button
              className="absolute right-1 top-1 rounded bg-background/80 p-1"
              aria-label="Remove image"
              onClick={props.onClear}
              disabled={props.lockRemoval || props.busy}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={props.disabled || props.busy}
            onClick={() => input.current?.click()}
            className="flex h-32 w-full flex-col items-center justify-center gap-1 rounded text-xs text-muted-foreground disabled:opacity-50"
          >
            {props.busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ImagePlus className="h-4 w-4" />
            )}
            {props.busy ? "Uploading…" : "Upload an image"}
          </button>
        )}
        <input
          ref={input}
          type="file"
          accept={IMAGE_UPLOAD_ACCEPT}
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) props.onPick(file);
            event.target.value = "";
          }}
        />
      </div>
      {props.disabled && props.disabledReason ? (
        <p className="mt-1 text-[11px] text-amber-400">{props.disabledReason}</p>
      ) : null}
    </div>
  );
}
