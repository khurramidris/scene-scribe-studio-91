import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Check, History, RefreshCw, Sparkles, Trash2, Undo2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { generateScreenplay, regenerateScene } from "@/lib/screenplay.functions";
import { episodesQuery, projectQuery } from "@/modules/projects/project.queries";
import {
  scenesQuery,
  screenplayKeys,
  screenplaysQuery,
} from "@/modules/screenplay/screenplay.queries";
import {
  deleteScreenplay,
  setSceneStatus,
  setScreenplayStatus,
  updateScene,
} from "@/modules/screenplay/screenplay.service";
import {
  estimateRuntimeSeconds,
  formatRuntime,
  readDialogue,
  sceneWordCount,
  SETTING_LABELS,
  type Scene,
  type Screenplay,
} from "@/modules/screenplay/screenplay.types";
import { LANGUAGES } from "@/modules/story/story.schemas";
import { listRevisions } from "@/modules/story/story.service";

export const Route = createFileRoute("/_authenticated/projects/$projectId_/screenplay")({
  head: () => ({
    meta: [
      { title: "Screenplay studio — Backlot Studio" },
      {
        name: "description",
        content:
          "Generate, edit and approve episode screenplays scene by scene from approved story material.",
      },
      { property: "og:title", content: "Screenplay studio — Backlot Studio" },
      {
        property: "og:description",
        content: "Write and approve episode screenplays scene by scene.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ScreenplayStudio,
});

function ScreenplayStudio() {
  const { projectId } = Route.useParams();
  const queryClient = useQueryClient();
  const runGenerate = useServerFn(generateScreenplay);
  const runRegenerateScene = useServerFn(regenerateScene);

  const { data: project } = useQuery(projectQuery(projectId));
  const { data: episodes } = useQuery(episodesQuery(projectId));
  const { data: screenplays } = useQuery(screenplaysQuery(projectId));

  const [episodeId, setEpisodeId] = useState("");
  const [screenplayId, setScreenplayId] = useState<string | null>(null);
  const [instructions, setInstructions] = useState("");
  const [language, setLanguage] = useState<string>("");
  const [duration, setDuration] = useState<string>("");

  useEffect(() => {
    if (!episodeId && episodes?.length) setEpisodeId(episodes[0]!.id);
  }, [episodes, episodeId]);

  useEffect(() => {
    if (project && !language) setLanguage(project.language);
  }, [project, language]);

  const episodeScreenplays = useMemo(
    () => (screenplays ?? []).filter((s) => s.episode_id === episodeId),
    [screenplays, episodeId],
  );

  useEffect(() => {
    if (episodeScreenplays.length) {
      const current = episodeScreenplays.find((s) => s.id === screenplayId);
      if (!current) setScreenplayId(episodeScreenplays[0]!.id);
    } else {
      setScreenplayId(null);
    }
  }, [episodeScreenplays, screenplayId]);

  const screenplay = episodeScreenplays.find((s) => s.id === screenplayId) ?? null;
  const { data: scenes } = useQuery(scenesQuery(screenplayId));

  const episode = episodes?.find((e) => e.id === episodeId) ?? null;
  const targetDuration = Number(duration) || episode?.target_duration_seconds || 90;

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: screenplayKeys.list(projectId) });
    if (screenplayId)
      void queryClient.invalidateQueries({ queryKey: screenplayKeys.scenes(screenplayId) });
  };

  const generate = useMutation({
    mutationFn: () =>
      runGenerate({
        data: {
          projectId,
          episodeId,
          language: language || "en",
          targetDurationSeconds: targetDuration,
          instructions: instructions.trim() || undefined,
        },
      }),
    onSuccess: (result) => {
      setScreenplayId(result.screenplayId);
      invalidate();
      toast[result.isMock ? "warning" : "success"](
        result.isMock
          ? `Draft written with the development mock — no AI provider is configured (${result.sceneCount} scenes).`
          : `Draft v-next written: ${result.sceneCount} scenes.`,
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const setStatus = useMutation({
    mutationFn: ({ target, status }: { target: Screenplay; status: Screenplay["status"] }) =>
      setScreenplayStatus(target, status),
    onSuccess: () => {
      invalidate();
      toast.success("Screenplay status updated.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeScreenplay = useMutation({
    mutationFn: (target: Screenplay) => deleteScreenplay(target),
    onSuccess: () => {
      setScreenplayId(null);
      invalidate();
      toast.success("Draft deleted.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const totalWords = (scenes ?? []).reduce((sum, scene) => sum + sceneWordCount(scene), 0);
  const plannedSeconds = (scenes ?? []).reduce(
    (sum, scene) => sum + (scene.estimated_duration_seconds ?? 0),
    0,
  );

  return (
    <StudioShell>
      <div className="mx-auto w-full max-w-6xl px-4 py-8">
        <Link
          to="/projects/$projectId"
          params={{ projectId }}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back to production
        </Link>
        <h1 className="mt-3 font-display text-3xl">Screenplay studio</h1>
        <p className="text-sm text-muted-foreground">
          Every generation writes a new draft version. Approved drafts and approved scenes are never
          overwritten.
        </p>
        <ProjectNav projectId={projectId} />

        <section className="mt-6 rounded-lg border border-border bg-card p-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div>
              <Label>Episode</Label>
              <Select value={episodeId} onValueChange={setEpisodeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an episode" />
                </SelectTrigger>
                <SelectContent>
                  {(episodes ?? []).map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      Ep {e.number} — {e.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Language</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger>
                  <SelectValue placeholder="Language" />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((l) => (
                    <SelectItem key={l.code} value={l.code}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="duration">Target duration (seconds)</Label>
              <Input
                id="duration"
                inputMode="numeric"
                value={duration}
                placeholder={String(episode?.target_duration_seconds ?? 90)}
                onChange={(event) => setDuration(event.target.value)}
              />
            </div>
            <div>
              <Label>Draft version</Label>
              <Select value={screenplayId ?? ""} onValueChange={setScreenplayId}>
                <SelectTrigger>
                  <SelectValue placeholder="No drafts yet" />
                </SelectTrigger>
                <SelectContent>
                  {episodeScreenplays.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      v{s.version} — {s.status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-3">
            <Label htmlFor="instructions">Creative direction (optional)</Label>
            <Textarea
              id="instructions"
              rows={2}
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              placeholder="e.g. open on the confrontation, keep the mother off-screen until the last scene"
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button onClick={() => generate.mutate()} disabled={!episodeId || generate.isPending}>
              {generate.isPending ? (
                <RefreshCw className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              {episodeScreenplays.length ? "Write a new draft" : "Write the screenplay"}
            </Button>
            {screenplay ? (
              <>
                <StatusBadge status={screenplay.status} />
                {screenplay.is_mock ? <MockBadge /> : null}
                {screenplay.status === "approved" ? (
                  <Button
                    variant="outline"
                    onClick={() => setStatus.mutate({ target: screenplay, status: "draft" })}
                  >
                    <Undo2 className="size-4" /> Unlock
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => setStatus.mutate({ target: screenplay, status: "approved" })}
                  >
                    <Check className="size-4" /> Approve draft
                  </Button>
                )}
                <Button
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => removeScreenplay.mutate(screenplay)}
                >
                  <Trash2 className="size-4" /> Delete draft
                </Button>
              </>
            ) : null}
          </div>

          {scenes?.length ? (
            <p className="mt-3 text-xs text-muted-foreground">
              {scenes.length} scenes · {totalWords} words · estimated runtime{" "}
              {formatRuntime(estimateRuntimeSeconds(totalWords))} · planned{" "}
              {formatRuntime(plannedSeconds)} · target {formatRuntime(targetDuration)}
            </p>
          ) : null}
        </section>

        <div className="mt-6 space-y-4">
          {(scenes ?? []).map((scene) => (
            <SceneCard
              key={scene.id}
              scene={scene}
              locked={screenplay?.status === "approved"}
              onChanged={invalidate}
              onRegenerate={async (note) => {
                const result = await runRegenerateScene({
                  data: { sceneId: scene.id, instructions: note || undefined },
                });
                invalidate();
                toast[result.isMock ? "warning" : "success"](
                  result.isMock
                    ? "Scene rewritten with the development mock — no AI provider is configured."
                    : "Scene rewritten.",
                );
              }}
            />
          ))}
          {screenplayId && !scenes?.length ? (
            <p className="text-sm text-muted-foreground">This draft has no scenes.</p>
          ) : null}
        </div>
      </div>
    </StudioShell>
  );
}

function SceneCard({
  scene,
  locked,
  onChanged,
  onRegenerate,
}: {
  scene: Scene;
  locked: boolean;
  onChanged: () => void;
  onRegenerate: (instructions: string) => Promise<void>;
}) {
  const [heading, setHeading] = useState(scene.heading);
  const [action, setAction] = useState(scene.action ?? "");
  const [dialogueText, setDialogueText] = useState(() =>
    readDialogue(scene.dialogue)
      .map((d) => `${d.character}${d.parenthetical ? ` (${d.parenthetical})` : ""}: ${d.line}`)
      .join("\n"),
  );
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    setHeading(scene.heading);
    setAction(scene.action ?? "");
    setDialogueText(
      readDialogue(scene.dialogue)
        .map((d) => `${d.character}${d.parenthetical ? ` (${d.parenthetical})` : ""}: ${d.line}`)
        .join("\n"),
    );
  }, [scene]);

  const approved = scene.status === "approved";
  const readOnly = locked || approved;

  const { data: revisions, refetch: refetchRevisions } = useQuery({
    queryKey: ["revisions", "scene", scene.id],
    queryFn: () => listRevisions("scene", scene.id),
    enabled: showHistory,
  });

  const save = async () => {
    const dialogue = dialogueText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const match = /^([^:()]+?)\s*(?:\(([^)]*)\))?\s*:\s*(.*)$/.exec(line);
        if (!match) return { character: "", parenthetical: "", line };
        return { character: match[1]!.trim(), parenthetical: match[2] ?? "", line: match[3] ?? "" };
      });
    setBusy(true);
    try {
      await updateScene(scene, { heading, action, dialogue });
      onChanged();
      toast.success(`Scene ${scene.scene_number} saved.`);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggleApproval = async () => {
    setBusy(true);
    try {
      await setSceneStatus(scene.id, approved ? "draft" : "approved");
      onChanged();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="rounded bg-secondary px-2 py-0.5 font-mono text-xs">
            {scene.scene_number}
          </span>
          <span className="font-mono text-xs text-muted-foreground">
            {SETTING_LABELS[scene.setting]}
          </span>
          <StatusBadge status={scene.status} />
          {scene.is_mock ? <MockBadge /> : null}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => setShowHistory((v) => !v)}>
            <History className="size-4" /> History
          </Button>
          <Button size="sm" variant="outline" onClick={toggleApproval} disabled={busy}>
            {approved ? <Undo2 className="size-4" /> : <Check className="size-4" />}
            {approved ? "Unlock" : "Approve scene"}
          </Button>
        </div>
      </header>

      <Input
        className="mt-3 font-mono uppercase"
        value={heading}
        readOnly={readOnly}
        onChange={(event) => setHeading(event.target.value)}
      />
      <Textarea
        className="mt-2"
        rows={4}
        value={action}
        readOnly={readOnly}
        onChange={(event) => setAction(event.target.value)}
        placeholder="Action"
      />
      <Textarea
        className="mt-2 font-mono text-sm"
        rows={6}
        value={dialogueText}
        readOnly={readOnly}
        onChange={(event) => setDialogueText(event.target.value)}
        placeholder={"CHARACTER (beat): line of dialogue"}
      />
      <p className="mt-1 text-xs text-muted-foreground">
        One line per speech: <span className="font-mono">NAME (parenthetical): dialogue</span> ·{" "}
        {sceneWordCount(scene)} words · {scene.estimated_duration_seconds}s planned
      </p>

      {!readOnly ? (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <Button size="sm" onClick={save} disabled={busy}>
            Save scene
          </Button>
          <Input
            className="max-w-sm"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Rewrite direction (optional)"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onRegenerate(note);
              } catch (error) {
                toast.error((error as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <RefreshCw className="size-4" /> Rewrite this scene
          </Button>
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          {approved
            ? "Approved — unlock the scene to edit or rewrite it."
            : "The draft is approved — unlock the draft to edit scenes."}
        </p>
      )}

      {showHistory ? (
        <div className="mt-3 space-y-2 rounded-md border border-border bg-background p-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium">Revision history</h4>
            <Button size="sm" variant="ghost" onClick={() => void refetchRevisions()}>
              Refresh
            </Button>
          </div>
          {(revisions ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">No earlier versions recorded.</p>
          ) : (
            (revisions ?? []).map((revision) => {
              const content = revision.content as Record<string, unknown>;
              return (
                <div key={revision.id} className="rounded border border-border p-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      {new Date(revision.created_at).toLocaleString()} · {revision.note}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={readOnly}
                      onClick={async () => {
                        try {
                          await updateScene(scene, {
                            heading: String(content["heading"] ?? scene.heading),
                            action: String(content["action"] ?? ""),
                            dialogue: content["dialogue"] ?? [],
                          });
                          onChanged();
                          toast.success("Earlier version restored.");
                        } catch (error) {
                          toast.error((error as Error).message);
                        }
                      }}
                    >
                      Restore
                    </Button>
                  </div>
                  <p className="mt-1 font-mono">{String(content["heading"] ?? "")}</p>
                </div>
              );
            })
          )}
        </div>
      ) : null}
    </article>
  );
}
