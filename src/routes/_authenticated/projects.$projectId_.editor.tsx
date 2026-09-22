import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowDown,
  ArrowUp,
  Download,
  Film,
  Play,
  RefreshCw,
  Save,
  Scissors,
  Trash2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { StudioShell } from "@/components/layout/StudioShell";
import { ProjectNav } from "@/components/studio/ProjectNav";
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
import { Switch } from "@/components/ui/switch";
import { signStudioUrls } from "@/lib/storyboard.functions";
import {
  requestEpisodeExport,
  saveEpisodeTimeline,
  signExportUrl,
} from "@/lib/timeline.functions";
import { episodesQuery } from "@/modules/projects/project.queries";
import { exportsQuery, timelineKeys, timelineQuery } from "@/modules/production/timeline.queries";

export const Route = createFileRoute("/_authenticated/projects/$projectId_/editor")({
  component: EpisodeEditorPage,
  head: () => ({
    meta: [
      { title: "Episode editor — Backlot Studio" },
      {
        name: "description",
        content:
          "Assemble approved shot takes into an ordered episode timeline and export a finished MP4.",
      },
      { property: "og:title", content: "Episode editor — Backlot Studio" },
      {
        property: "og:description",
        content: "Order, trim and export your approved AI-generated shots as one episode.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Clip = {
  shotId: string;
  sceneId: string;
  takeId: string;
  order: number;
  startAt: number;
  durationSeconds: number;
  trimInSeconds: number;
  trimOutSeconds: number;
  muted: boolean;
  transitionIn: "cut" | "dissolve" | "fade";
};

type TitleCard = {
  enabled: boolean;
  position: "start" | "end";
  text: string;
  subtitle: string;
  durationSeconds: number;
};

function clipLength(clip: Clip): number {
  return Math.max(0, clip.durationSeconds - clip.trimInSeconds - clip.trimOutSeconds);
}

function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function EpisodeEditorPage() {
  const { projectId } = Route.useParams();
  const queryClient = useQueryClient();

  const episodes = useQuery(episodesQuery(projectId));
  const [episodeId, setEpisodeId] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!episodeId && episodes.data?.length) setEpisodeId(episodes.data[0]!.id);
  }, [episodes.data, episodeId]);

  const timeline = useQuery(timelineQuery(episodeId));
  const exports = useQuery(exportsQuery(episodeId));

  const [clips, setClips] = useState<Clip[]>([]);
  const [titleCard, setTitleCard] = useState<TitleCard>({
    enabled: false,
    position: "start",
    text: "",
    subtitle: "",
    durationSeconds: 3,
  });
  const [subtitlesSrt, setSubtitlesSrt] = useState<string | null>(null);
  const [burnSubtitles, setBurnSubtitles] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!timeline.data) return;
    setClips(timeline.data.timeline.clips as Clip[]);
    setTitleCard(timeline.data.timeline.titleCard as TitleCard);
    setSubtitlesSrt(timeline.data.timeline.subtitlesSrt ?? null);
    setBurnSubtitles(Boolean(timeline.data.timeline.burnSubtitles));
    setDirty(false);
  }, [timeline.data]);

  const takes = timeline.data?.takes ?? [];
  const shots = timeline.data?.shots ?? [];
  const takesByShot = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const take of takes as any[]) {
      const list = map.get(take.shot_id) ?? [];
      list.push(take);
      map.set(take.shot_id, list);
    }
    return map;
  }, [takes]);
  const shotById = useMemo(
    () => new Map((shots as any[]).map((shot) => [shot.id, shot])),
    [shots],
  );

  // Signed playback URLs for every stored take in this episode.
  const sign = useServerFn(signStudioUrls);
  const paths = useMemo(
    () => (takes as any[]).map((t) => t.storage_path).filter(Boolean),
    [takes],
  );
  const signed = useQuery({
    queryKey: ["take-urls", episodeId, paths.length],
    enabled: paths.length > 0,
    staleTime: 50 * 60 * 1000,
    queryFn: () => sign({ data: { bucket: "shot-videos", paths } }),
  });
  const urlFor = (takeId: string) => {
    const take = (takes as any[]).find((t) => t.id === takeId);
    return take?.storage_path ? signed.data?.urls?.[take.storage_path] : undefined;
  };

  const totalDuration =
    clips.reduce((sum, clip) => sum + clipLength(clip), 0) +
    (titleCard.enabled ? titleCard.durationSeconds : 0);

  const missingShots = (shots as any[]).filter(
    (shot) => !clips.some((clip) => clip.shotId === shot.id),
  );

  function mutateClips(next: Clip[]) {
    setClips(next.map((clip, index) => ({ ...clip, order: index })));
    setDirty(true);
  }

  /** Plays the next clip in the saved order, or stops at the end of the episode. */
  function advanceFrom(index: number) {
    if (index + 1 < clips.length) setPlayingIndex(index + 1);
    else setPlayingIndex(null);
  }

  const approvedClips = (timeline.data?.approvedClips ?? []) as Clip[];
  function restoreApprovedTakes() {
    if (!approvedClips.length) {
      toast.error("This episode has no approved takes to restore.");
      return;
    }
    mutateClips(approvedClips.map((clip) => ({ ...clip })));
    toast.success(`Restored ${approvedClips.length} approved take(s).`);
  }

  const save = useServerFn(saveEpisodeTimeline);
  const saveMutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          episodeId: episodeId!,
          timeline: { clips, titleCard, subtitlesSrt, burnSubtitles },
        },
      }),
    onSuccess: () => {
      setDirty(false);
      toast.success("Timeline saved.");
      queryClient.invalidateQueries({ queryKey: timelineKeys.timeline(episodeId ?? "none") });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const requestExport = useServerFn(requestEpisodeExport);
  const exportMutation = useMutation({
    mutationFn: () => requestExport({ data: { episodeId: episodeId! } }),
    onSuccess: () => {
      toast.success("Export queued. It will appear below when the render finishes.");
      queryClient.invalidateQueries({ queryKey: timelineKeys.exports(episodeId ?? "none") });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const signExport = useServerFn(signExportUrl);
  const downloadMutation = useMutation({
    mutationFn: (exportId: string) => signExport({ data: { exportId } }),
    onSuccess: (result) => window.open(result.url, "_blank", "noopener"),
    onError: (error: Error) => toast.error(error.message),
  });

  async function onSrtUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setSubtitlesSrt(text);
    setBurnSubtitles(true);
    setDirty(true);
    toast.success(`Loaded ${file.name}.`);
  }

  const aspect = timeline.data?.aspect ?? "9:16";
  const preset = timeline.data?.preset;

  return (
    <StudioShell>
      <div className="mx-auto w-full max-w-6xl px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Episode editor</h1>
            <p className="text-sm text-muted-foreground">
              Order and trim your approved takes, then export the episode as one MP4.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={episodeId ?? ""} onValueChange={setEpisodeId}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Select an episode" />
              </SelectTrigger>
              <SelectContent>
                {(episodes.data ?? []).map((episode) => (
                  <SelectItem key={episode.id} value={episode.id}>
                    Ep {episode.number} — {episode.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={() => saveMutation.mutate()} disabled={!episodeId || saveMutation.isPending}>
              <Save className="mr-2 h-4 w-4" />
              {dirty ? "Save changes" : "Saved"}
            </Button>
          </div>
        </div>

        <ProjectNav projectId={projectId} />

        {timeline.isLoading ? (
          <p className="py-10 text-sm text-muted-foreground">Loading the timeline…</p>
        ) : !episodeId ? (
          <p className="py-10 text-sm text-muted-foreground">Create an episode first.</p>
        ) : (
          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <section className="space-y-3">
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3 text-sm">
                <span className="font-medium">{clips.length} clips</span>
                <span className="text-muted-foreground">·</span>
                <span>{formatDuration(totalDuration)} total</span>
                <span className="text-muted-foreground">·</span>
                <span>
                  {aspect} {preset ? `${preset.width}×${preset.height} @ ${preset.fps}fps` : ""}
                </span>
                {missingShots.length > 0 && (
                  <span className="rounded bg-amber-500/15 px-2 py-0.5 text-xs text-amber-500">
                    {missingShots.length} shot(s) without an approved take
                  </span>
                )}
                <span className="ml-auto flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!clips.length}
                    onClick={() => setPlayingIndex(0)}
                  >
                    <Play className="mr-1 h-3.5 w-3.5" /> Play episode
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!approvedClips.length}
                    onClick={restoreApprovedTakes}
                  >
                    <RefreshCw className="mr-1 h-3.5 w-3.5" /> Restore approved takes
                  </Button>
                </span>
              </div>

              {clips.length === 0 && (
                <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                  This timeline is empty.{" "}
                  {approvedClips.length > 0 ? (
                    <>
                      Use <span className="font-medium">Restore approved takes</span> to rebuild it
                      from your {approvedClips.length} approved take(s).
                    </>
                  ) : (
                    <>
                      <Link
                        to="/projects/$projectId/storyboard"
                        params={{ projectId }}
                        className="text-primary underline"
                      >
                        Go to Storyboard Studio
                      </Link>{" "}
                      to render and approve shots.
                    </>
                  )}
                </div>
              )}

              {clips.map((clip, index) => {
                const shot = shotById.get(clip.shotId) as any;
                const options = takesByShot.get(clip.shotId) ?? [];
                const url = urlFor(clip.takeId);
                return (
                  <div
                    key={clip.shotId}
                    className="rounded-lg border border-border bg-card p-3"
                  >
                    <div className="flex flex-wrap items-start gap-3">
                      <div className="w-10 shrink-0 text-center">
                        <div className="text-lg font-semibold">{index + 1}</div>
                        <div className="mt-1 flex flex-col gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            disabled={index === 0}
                            onClick={() => {
                              const next = [...clips];
                              [next[index - 1], next[index]] = [next[index]!, next[index - 1]!];
                              mutateClips(next);
                            }}
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            disabled={index === clips.length - 1}
                            onClick={() => {
                              const next = [...clips];
                              [next[index + 1], next[index]] = [next[index]!, next[index + 1]!];
                              mutateClips(next);
                            }}
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">
                            Shot {shot?.shot_number ?? "?"}
                          </span>
                          <span className="truncate text-sm text-muted-foreground">
                            {shot?.description ?? ""}
                          </span>
                        </div>

                        <div className="mt-3 grid gap-3 sm:grid-cols-4">
                          <div>
                            <Label className="text-xs">Take</Label>
                            <Select
                              value={clip.takeId}
                              onValueChange={(value) => {
                                const take = (takes as any[]).find((t) => t.id === value);
                                const next = [...clips];
                                next[index] = {
                                  ...clip,
                                  takeId: value,
                                  durationSeconds: Number(
                                    take?.duration_seconds ?? clip.durationSeconds,
                                  ),
                                  trimInSeconds: 0,
                                  trimOutSeconds: 0,
                                };
                                mutateClips(next);
                              }}
                            >
                              <SelectTrigger className="h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {options.map((take: any) => (
                                  <SelectItem key={take.id} value={take.id}>
                                    v{take.version}
                                    {take.is_selected ? " (approved)" : ""}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-xs">Trim start (s)</Label>
                            <Input
                              className="h-8"
                              type="number"
                              min={0}
                              step={0.1}
                              value={clip.trimInSeconds}
                              onChange={(event) => {
                                const next = [...clips];
                                next[index] = {
                                  ...clip,
                                  trimInSeconds: Math.max(0, Number(event.target.value) || 0),
                                };
                                mutateClips(next);
                              }}
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Trim end (s)</Label>
                            <Input
                              className="h-8"
                              type="number"
                              min={0}
                              step={0.1}
                              value={clip.trimOutSeconds}
                              onChange={(event) => {
                                const next = [...clips];
                                next[index] = {
                                  ...clip,
                                  trimOutSeconds: Math.max(0, Number(event.target.value) || 0),
                                };
                                mutateClips(next);
                              }}
                            />
                          </div>
                          <div className="flex items-end gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!url}
                              onClick={() => setPlayingIndex(index)}
                            >
                              <Play className="mr-1 h-3.5 w-3.5" /> Play
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              title={clip.muted ? "Unmute" : "Mute"}
                              onClick={() => {
                                const next = [...clips];
                                next[index] = { ...clip, muted: !clip.muted };
                                mutateClips(next);
                              }}
                            >
                              {clip.muted ? (
                                <VolumeX className="h-4 w-4" />
                              ) : (
                                <Volume2 className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-destructive"
                              title="Remove from timeline"
                              onClick={() =>
                                mutateClips(clips.filter((_, i) => i !== index))
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                          <Scissors className="h-3 w-3" /> {clipLength(clip).toFixed(1)}s on the
                          timeline (source {clip.durationSeconds.toFixed(1)}s)
                        </p>

                        {playingIndex === index && url && (
                          <video
                            key={`${clip.takeId}-${clip.trimInSeconds}-${clip.trimOutSeconds}`}
                            ref={videoRef}
                            src={url}
                            controls
                            autoPlay
                            muted={clip.muted}
                            className="mt-3 max-h-80 w-full rounded-md bg-black"
                            onLoadedMetadata={(event) => {
                              // Start where the user trimmed, not at the source start.
                              const video = event.currentTarget;
                              const start = Math.min(
                                clip.trimInSeconds,
                                Math.max(0, (video.duration || clip.durationSeconds) - 0.05),
                              );
                              if (start > 0) video.currentTime = start;
                            }}
                            onTimeUpdate={(event) => {
                              const video = event.currentTarget;
                              const source = video.duration || clip.durationSeconds;
                              const end = Math.max(
                                clip.trimInSeconds,
                                source - clip.trimOutSeconds,
                              );
                              if (video.currentTime >= end - 0.03) {
                                video.pause();
                                advanceFrom(index);
                              }
                            }}
                            onEnded={() => advanceFrom(index)}
                            onError={() => {
                              setPlayingIndex(null);
                              toast.error(
                                "This clip could not be played. Refresh the page to renew its media link.",
                              );
                            }}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {missingShots.length > 0 && (
                <div className="rounded-lg border border-border bg-card p-3 text-sm">
                  <p className="font-medium">Shots without an approved take</p>
                  <ul className="mt-2 space-y-1 text-muted-foreground">
                    {missingShots.map((shot: any) => (
                      <li key={shot.id} className="flex items-center justify-between gap-2">
                        <span className="truncate">
                          Shot {shot.shot_number} — {shot.description ?? ""}
                        </span>
                        <Link
                          to="/projects/$projectId/storyboard"
                          params={{ projectId }}
                          className="shrink-0 text-primary underline"
                        >
                          Open in Storyboard Studio
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            <aside className="space-y-4">
              <div className="rounded-lg border border-border bg-card p-4">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <Film className="h-4 w-4" /> Title card
                </h2>
                <div className="mt-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Show a title card</Label>
                    <Switch
                      checked={titleCard.enabled}
                      onCheckedChange={(checked) => {
                        setTitleCard({ ...titleCard, enabled: checked });
                        setDirty(true);
                      }}
                    />
                  </div>
                  {titleCard.enabled && (
                    <>
                      <Input
                        placeholder="Title"
                        value={titleCard.text}
                        onChange={(event) => {
                          setTitleCard({ ...titleCard, text: event.target.value });
                          setDirty(true);
                        }}
                      />
                      <Input
                        placeholder="Subtitle (optional)"
                        value={titleCard.subtitle}
                        onChange={(event) => {
                          setTitleCard({ ...titleCard, subtitle: event.target.value });
                          setDirty(true);
                        }}
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <Select
                          value={titleCard.position}
                          onValueChange={(value) => {
                            setTitleCard({ ...titleCard, position: value as "start" | "end" });
                            setDirty(true);
                          }}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="start">At the start</SelectItem>
                            <SelectItem value="end">At the end</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          type="number"
                          min={1}
                          max={15}
                          className="h-8"
                          value={titleCard.durationSeconds}
                          onChange={(event) => {
                            setTitleCard({
                              ...titleCard,
                              durationSeconds: Number(event.target.value) || 3,
                            });
                            setDirty(true);
                          }}
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-border bg-card p-4">
                <h2 className="text-sm font-semibold">Subtitles</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Upload an existing SRT file to burn it into the export.
                </p>
                <input
                  type="file"
                  accept=".srt,text/plain"
                  onChange={onSrtUpload}
                  className="mt-3 w-full text-xs"
                />
                {subtitlesSrt && (
                  <div className="mt-3 flex items-center justify-between">
                    <Label className="text-xs">Burn into the video</Label>
                    <Switch
                      checked={burnSubtitles}
                      onCheckedChange={(checked) => {
                        setBurnSubtitles(checked);
                        setDirty(true);
                      }}
                    />
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-border bg-card p-4">
                <h2 className="text-sm font-semibold">Export</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {clips.length} clip(s), {formatDuration(totalDuration)},{" "}
                  {preset ? `${preset.width}×${preset.height}` : aspect}
                  {missingShots.length > 0 ? " — partial episode" : ""}
                </p>
                <Button
                  className="mt-3 w-full"
                  disabled={!clips.length || dirty || exportMutation.isPending}
                  onClick={() => exportMutation.mutate()}
                >
                  <Film className="mr-2 h-4 w-4" /> Export episode
                </Button>
                {dirty && (
                  <p className="mt-2 text-xs text-amber-500">Save the timeline before exporting.</p>
                )}

                <div className="mt-4 space-y-2">
                  {(exports.data ?? []).map((record: any) => (
                    <div
                      key={record.id}
                      className="rounded-md border border-border/60 p-2 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium capitalize">{record.state}</span>
                        <span className="text-muted-foreground">
                          {new Date(record.created_at).toLocaleString()}
                        </span>
                      </div>
                      <p className="mt-1 text-muted-foreground">
                        {record.clip_count} clip(s) · {record.width}×{record.height}
                        {record.is_partial ? " · partial" : ""}
                      </p>
                      {record.error?.message && (
                        <p className="mt-1 text-destructive">{record.error.message}</p>
                      )}
                      {record.state === "completed" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-2 w-full"
                          onClick={() => downloadMutation.mutate(record.id)}
                        >
                          <Download className="mr-1 h-3.5 w-3.5" /> Download MP4
                        </Button>
                      )}
                    </div>
                  ))}
                  {!exports.data?.length && (
                    <p className="text-xs text-muted-foreground">No exports yet.</p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 w-full"
                  onClick={() => exports.refetch()}
                >
                  <RefreshCw className="mr-1 h-3.5 w-3.5" /> Refresh
                </Button>
              </div>
            </aside>
          </div>
        )}
      </div>
    </StudioShell>
  );
}
