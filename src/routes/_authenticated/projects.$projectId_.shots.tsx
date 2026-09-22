import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  Copy,
  GripVertical,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Undo2,
} from "lucide-react";
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
import { generateShots } from "@/lib/screenplay.functions";
import { charactersQuery } from "@/modules/characters/character.queries";
import { episodesQuery } from "@/modules/projects/project.queries";
import {
  CAMERA_ANGLES,
  CAMERA_MOVEMENTS,
  SHOT_DURATION_LIMITS,
  SHOT_TYPES,
} from "@/modules/screenplay/screenplay.schemas";
import {
  locationsQuery,
  scenesQuery,
  screenplayKeys,
  screenplaysQuery,
  shotCharactersQuery,
  shotsQuery,
} from "@/modules/screenplay/screenplay.queries";
import { reorderList } from "@/modules/screenplay/screenplay.service";
import {
  addShotCharacter,
  createShot,
  deleteShot,
  duplicateShot,
  persistShotOrder,
  removeShotCharacter,
  setShotStatus,
  updateShot,
} from "@/modules/screenplay/shot.service";
import { readContinuity, type Scene, type Shot } from "@/modules/screenplay/screenplay.types";

export const Route = createFileRoute("/_authenticated/projects/$projectId_/shots")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Shot planning — Backlot Studio" },
      {
        name: "description",
        content:
          "Break approved scenes into camera-ready shots with continuity, image prompts and video prompts.",
      },
      { property: "og:title", content: "Shot planning — Backlot Studio" },
      {
        property: "og:description",
        content: "Camera-ready shot lists with continuity and generation prompts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ShotPlanning,
});

function ShotPlanning() {
  const { projectId } = Route.useParams();
  const queryClient = useQueryClient();
  const runGenerateShots = useServerFn(generateShots);

  const { data: episodes } = useQuery(episodesQuery(projectId));
  const { data: screenplays } = useQuery(screenplaysQuery(projectId));
  const { data: characters } = useQuery(charactersQuery(projectId));
  const { data: locations } = useQuery(locationsQuery(projectId));
  const { data: shotCharacters } = useQuery(shotCharactersQuery(projectId));

  const [episodeId, setEpisodeId] = useState("");
  const [screenplayId, setScreenplayId] = useState<string | null>(null);
  const [sceneId, setSceneId] = useState<string | null>(null);
  const [instructions, setInstructions] = useState("");
  const [maxSeconds, setMaxSeconds] = useState(String(SHOT_DURATION_LIMITS.default));
  const [dragId, setDragId] = useState<string | null>(null);

  useEffect(() => {
    if (!episodeId && episodes?.length) setEpisodeId(episodes[0]!.id);
  }, [episodes, episodeId]);

  const episodeScreenplays = useMemo(
    () => (screenplays ?? []).filter((s) => s.episode_id === episodeId),
    [screenplays, episodeId],
  );

  useEffect(() => {
    if (!episodeScreenplays.some((s) => s.id === screenplayId)) {
      const approved = episodeScreenplays.find((s) => s.status === "approved");
      setScreenplayId((approved ?? episodeScreenplays[0])?.id ?? null);
    }
  }, [episodeScreenplays, screenplayId]);

  const { data: scenes } = useQuery(scenesQuery(screenplayId));

  useEffect(() => {
    if (scenes?.length && !scenes.some((s) => s.id === sceneId)) setSceneId(scenes[0]!.id);
  }, [scenes, sceneId]);

  const scene = (scenes ?? []).find((s) => s.id === sceneId) ?? null;
  const { data: shots } = useQuery(shotsQuery(sceneId));

  const invalidate = () => {
    if (sceneId) void queryClient.invalidateQueries({ queryKey: screenplayKeys.shots(sceneId) });
    void queryClient.invalidateQueries({ queryKey: screenplayKeys.shotCharacters(projectId) });
  };

  const generate = useMutation({
    mutationFn: () =>
      runGenerateShots({
        data: {
          sceneId: sceneId!,
          maxShotSeconds: Math.min(
            SHOT_DURATION_LIMITS.max,
            Math.max(SHOT_DURATION_LIMITS.min, Number(maxSeconds) || SHOT_DURATION_LIMITS.default),
          ),
          instructions: instructions.trim() || undefined,
        },
      }),
    onSuccess: (result) => {
      invalidate();
      toast[result.isMock ? "warning" : "success"](
        result.isMock
          ? `Planned with the development mock — no AI provider is configured (${result.created} shots).`
          : `${result.created} shots planned. ${result.keptApproved} approved shots kept untouched.`,
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const commitOrder = async (ordered: Shot[]) => {
    try {
      await persistShotOrder(ordered);
      invalidate();
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const totalSeconds = (shots ?? []).reduce((sum, shot) => sum + Number(shot.duration_seconds), 0);

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
        <h1 className="mt-3 font-display text-3xl">Shot planning</h1>
        <p className="text-sm text-muted-foreground">
          Structured production instructions for the future storyboard and rendering stage. No video
          is generated here.
        </p>
        <ProjectNav projectId={projectId} />

        <section className="mt-6 rounded-lg border border-border bg-card p-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div>
              <Label>Episode</Label>
              <Select value={episodeId} onValueChange={setEpisodeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
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
              <Label>Screenplay draft</Label>
              <Select value={screenplayId ?? ""} onValueChange={setScreenplayId}>
                <SelectTrigger>
                  <SelectValue placeholder="None" />
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
            <div>
              <Label>Scene</Label>
              <Select value={sceneId ?? ""} onValueChange={setSceneId}>
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  {(scenes ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.scene_number}. {s.heading}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Max shot length (s)</Label>
              <Input
                inputMode="numeric"
                value={maxSeconds}
                onChange={(event) => setMaxSeconds(event.target.value)}
              />
            </div>
          </div>

          <div className="mt-3">
            <Label>Shot direction (optional)</Label>
            <Textarea
              rows={2}
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              placeholder="e.g. handheld coverage, keep the antagonist in shadow until the last shot"
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button onClick={() => generate.mutate()} disabled={!sceneId || generate.isPending}>
              {generate.isPending ? (
                <RefreshCw className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              Plan shots for this scene
            </Button>
            {scene ? (
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    await createShot(scene, (shots?.length ?? 1) - 1);
                    invalidate();
                  } catch (error) {
                    toast.error((error as Error).message);
                  }
                }}
              >
                <Plus className="size-4" /> Add shot
              </Button>
            ) : null}
            {shots?.length ? (
              <span className="text-xs text-muted-foreground">
                {shots.length} shots · {totalSeconds.toFixed(1)}s total · scene plans{" "}
                {scene?.estimated_duration_seconds}s
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Regenerating keeps every approved shot exactly as it is and replaces only the drafts.
          </p>
        </section>

        <div className="mt-6 space-y-4">
          {(shots ?? []).map((shot) => (
            <div
              key={shot.id}
              draggable
              onDragStart={() => setDragId(shot.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (!dragId || dragId === shot.id) return;
                const list = shots ?? [];
                const from = list.findIndex((s) => s.id === dragId);
                const to = list.findIndex((s) => s.id === shot.id);
                setDragId(null);
                if (from < 0 || to < 0) return;
                void commitOrder(reorderList(list, dragId, to - from));
              }}
            >
              <ShotCard
                shot={shot}
                characters={characters ?? []}
                locations={locations ?? []}
                assigned={(shotCharacters ?? [])
                  .filter((sc) => sc.shot_id === shot.id)
                  .map((sc) => sc.character_id)}
                onChanged={invalidate}
                onMove={(delta) => void commitOrder(reorderList(shots ?? [], shot.id, delta))}
              />
            </div>
          ))}
          {sceneId && !shots?.length ? (
            <p className="text-sm text-muted-foreground">No shots planned for this scene yet.</p>
          ) : null}
        </div>
      </div>
    </StudioShell>
  );
}

function ShotCard({
  shot,
  characters,
  locations,
  assigned,
  onChanged,
  onMove,
}: {
  shot: Shot;
  characters: Array<{ id: string; name: string }>;
  locations: Array<{ id: string; name: string }>;
  assigned: string[];
  onChanged: () => void;
  onMove: (delta: number) => void;
}) {
  const [form, setForm] = useState({
    shot_type: shot.shot_type ?? "",
    framing: shot.framing ?? "",
    camera_angle: shot.camera_angle ?? "",
    camera_movement: shot.camera_movement ?? "",
    duration: String(shot.duration_seconds),
    description: shot.description ?? "",
    action: shot.action ?? "",
    dialogue: shot.dialogue ?? "",
    emotional_tone: shot.emotional_tone ?? "",
    lighting: shot.lighting ?? "",
    sound_design: shot.sound_design ?? "",
    image_prompt: shot.image_prompt ?? "",
    video_prompt: shot.video_prompt ?? "",
    location_id: shot.location_id ?? "",
  });
  const [busy, setBusy] = useState(false);
  const approved = shot.status === "approved";
  const continuity = readContinuity(shot.continuity);

  const save = async () => {
    setBusy(true);
    try {
      await updateShot(shot, {
        shot_type: form.shot_type || null,
        framing: form.framing || null,
        camera_angle: form.camera_angle || null,
        camera_movement: form.camera_movement || null,
        duration_seconds: Math.max(
          SHOT_DURATION_LIMITS.min,
          Math.min(SHOT_DURATION_LIMITS.max, Number(form.duration) || SHOT_DURATION_LIMITS.default),
        ),
        description: form.description || null,
        action: form.action || null,
        dialogue: form.dialogue || null,
        emotional_tone: form.emotional_tone || null,
        lighting: form.lighting || null,
        sound_design: form.sound_design || null,
        image_prompt: form.image_prompt || null,
        video_prompt: form.video_prompt || null,
        location_id: form.location_id || null,
      });
      onChanged();
      toast.success(`Shot ${shot.shot_number} saved.`);
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
          <GripVertical className="size-4 cursor-grab text-muted-foreground" />
          <span className="rounded bg-secondary px-2 py-0.5 font-mono text-xs">
            Shot {shot.shot_number}
          </span>
          <span className="text-xs text-muted-foreground">
            {shot.shot_type} · {shot.camera_angle} · {shot.camera_movement} ·{" "}
            {Number(shot.duration_seconds).toFixed(1)}s
          </span>
          <StatusBadge status={shot.status} />
          {shot.is_mock ? <MockBadge /> : null}
          <span className="rounded border border-border px-2 py-0.5 text-[10px] uppercase text-muted-foreground">
            {shot.production_status}
          </span>
        </div>
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant="ghost" onClick={() => onMove(-1)} disabled={approved}>
            <ArrowUp className="size-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onMove(1)} disabled={approved}>
            <ArrowDown className="size-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              try {
                await duplicateShot(shot);
                onChanged();
              } catch (error) {
                toast.error((error as Error).message);
              }
            }}
          >
            <Copy className="size-4" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await setShotStatus(shot.id, approved ? "draft" : "approved");
                onChanged();
              } catch (error) {
                toast.error((error as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {approved ? <Undo2 className="size-4" /> : <Check className="size-4" />}
            {approved ? "Unlock" : "Approve"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            onClick={async () => {
              try {
                await deleteShot(shot);
                onChanged();
              } catch (error) {
                toast.error((error as Error).message);
              }
            }}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </header>

      <fieldset disabled={approved} className="mt-3 space-y-3">
        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <Label>Shot type</Label>
            <Select
              value={form.shot_type}
              onValueChange={(value) => setForm({ ...form, shot_type: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                {SHOT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Camera angle</Label>
            <Select
              value={form.camera_angle}
              onValueChange={(value) => setForm({ ...form, camera_angle: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Angle" />
              </SelectTrigger>
              <SelectContent>
                {CAMERA_ANGLES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Camera movement</Label>
            <Select
              value={form.camera_movement}
              onValueChange={(value) => setForm({ ...form, camera_movement: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Movement" />
              </SelectTrigger>
              <SelectContent>
                {CAMERA_MOVEMENTS.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Duration (s)</Label>
            <Input
              inputMode="decimal"
              value={form.duration}
              onChange={(event) => setForm({ ...form, duration: event.target.value })}
            />
          </div>
        </div>

        <div>
          <Label>Visual description</Label>
          <Textarea
            rows={2}
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
          />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label>Character action</Label>
            <Textarea
              rows={2}
              value={form.action}
              onChange={(event) => setForm({ ...form, action: event.target.value })}
            />
          </div>
          <div>
            <Label>Dialogue in this shot</Label>
            <Textarea
              rows={2}
              value={form.dialogue}
              onChange={(event) => setForm({ ...form, dialogue: event.target.value })}
            />
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <Label>Framing</Label>
            <Input
              value={form.framing}
              onChange={(event) => setForm({ ...form, framing: event.target.value })}
            />
          </div>
          <div>
            <Label>Emotional tone</Label>
            <Input
              value={form.emotional_tone}
              onChange={(event) => setForm({ ...form, emotional_tone: event.target.value })}
            />
          </div>
          <div>
            <Label>Lighting</Label>
            <Input
              value={form.lighting}
              onChange={(event) => setForm({ ...form, lighting: event.target.value })}
            />
          </div>
          <div>
            <Label>Location</Label>
            <Select
              value={form.location_id || "none"}
              onValueChange={(value) =>
                setForm({ ...form, location_id: value === "none" ? "" : value })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned</SelectItem>
                {locations.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label>Sound and environment</Label>
          <Input
            value={form.sound_design}
            onChange={(event) => setForm({ ...form, sound_design: event.target.value })}
          />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label>Image prompt (still frame)</Label>
            <Textarea
              rows={4}
              value={form.image_prompt}
              onChange={(event) => setForm({ ...form, image_prompt: event.target.value })}
            />
          </div>
          <div>
            <Label>Video prompt (motion from that frame)</Label>
            <Textarea
              rows={4}
              value={form.video_prompt}
              onChange={(event) => setForm({ ...form, video_prompt: event.target.value })}
            />
          </div>
        </div>

        <div>
          <Label>Cast in this shot</Label>
          <div className="mt-1 flex flex-wrap gap-2">
            {characters.map((character) => {
              const on = assigned.includes(character.id);
              return (
                <button
                  key={character.id}
                  type="button"
                  onClick={async () => {
                    try {
                      if (on) await removeShotCharacter(shot.id, character.id);
                      else await addShotCharacter(shot, character.id);
                      onChanged();
                    } catch (error) {
                      toast.error((error as Error).message);
                    }
                  }}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    on
                      ? "border-primary bg-secondary text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {character.name}
                </button>
              );
            })}
          </div>
        </div>

        <Button onClick={save} disabled={busy}>
          Save shot
        </Button>
      </fieldset>

      {Object.keys(continuity).length ? (
        <div className="mt-3 rounded-md border border-border bg-background p-3 text-xs">
          <h4 className="font-medium">Continuity</h4>
          <dl className="mt-1 grid gap-1 md:grid-cols-2">
            {Object.entries(continuity).map(([key, value]) => (
              <div key={key}>
                <dt className="text-muted-foreground">{key.replaceAll("_", " ")}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-muted-foreground">
            This is production metadata for the future rendering stage. It records intent; it does
            not by itself guarantee visual consistency in generated video.
          </p>
        </div>
      ) : null}
    </article>
  );
}
