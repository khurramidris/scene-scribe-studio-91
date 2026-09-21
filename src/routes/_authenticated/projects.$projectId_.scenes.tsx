import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  Plus,
  RefreshCw,
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
import { regenerateScene } from "@/lib/screenplay.functions";
import { charactersQuery } from "@/modules/characters/character.queries";
import { episodesQuery } from "@/modules/projects/project.queries";
import {
  locationsQuery,
  sceneCharactersQuery,
  scenesQuery,
  screenplayKeys,
  screenplaysQuery,
} from "@/modules/screenplay/screenplay.queries";
import {
  addSceneCharacter,
  createLocation,
  createScene,
  deleteScene,
  duplicateScene,
  persistSceneOrder,
  removeSceneCharacter,
  reorderList,
  setSceneStatus,
  updateScene,
} from "@/modules/screenplay/screenplay.service";
import {
  readList,
  SETTING_LABELS,
  type Scene,
  type SceneSettingValue,
} from "@/modules/screenplay/screenplay.types";

export const Route = createFileRoute("/_authenticated/projects/$projectId_/scenes")({
  head: () => ({
    meta: [
      { title: "Scene breakdown — Backlot Studio" },
      {
        name: "description",
        content:
          "Turn an episode screenplay into a structured production plan: locations, cast, props, wardrobe and timing per scene.",
      },
      { property: "og:title", content: "Scene breakdown — Backlot Studio" },
      {
        property: "og:description",
        content: "Structured scene breakdown with locations, cast, props and timing.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ScenesWorkspace,
});

function ScenesWorkspace() {
  const { projectId } = Route.useParams();
  const queryClient = useQueryClient();
  const runRegenerateScene = useServerFn(regenerateScene);

  const { data: episodes } = useQuery(episodesQuery(projectId));
  const { data: screenplays } = useQuery(screenplaysQuery(projectId));
  const { data: characters } = useQuery(charactersQuery(projectId));
  const { data: locations } = useQuery(locationsQuery(projectId));
  const { data: sceneCharacters } = useQuery(sceneCharactersQuery(projectId));

  const [episodeId, setEpisodeId] = useState("");
  const [screenplayId, setScreenplayId] = useState<string | null>(null);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);

  useEffect(() => {
    if (!episodeId && episodes?.length) setEpisodeId(episodes[0]!.id);
  }, [episodes, episodeId]);

  const episodeScreenplays = useMemo(
    () => (screenplays ?? []).filter((s) => s.episode_id === episodeId),
    [screenplays, episodeId],
  );

  useEffect(() => {
    const approved = episodeScreenplays.find((s) => s.status === "approved");
    const fallback = approved ?? episodeScreenplays[0] ?? null;
    if (!episodeScreenplays.some((s) => s.id === screenplayId)) {
      setScreenplayId(fallback?.id ?? null);
    }
  }, [episodeScreenplays, screenplayId]);

  const screenplay = episodeScreenplays.find((s) => s.id === screenplayId) ?? null;
  const { data: scenes } = useQuery(scenesQuery(screenplayId));

  useEffect(() => {
    if (scenes?.length && !scenes.some((s) => s.id === selectedSceneId)) {
      setSelectedSceneId(scenes[0]!.id);
    }
  }, [scenes, selectedSceneId]);

  const selected = (scenes ?? []).find((s) => s.id === selectedSceneId) ?? null;

  const invalidate = () => {
    if (screenplayId)
      void queryClient.invalidateQueries({ queryKey: screenplayKeys.scenes(screenplayId) });
    void queryClient.invalidateQueries({ queryKey: screenplayKeys.sceneCharacters(projectId) });
    void queryClient.invalidateQueries({ queryKey: screenplayKeys.locations(projectId) });
  };

  const move = useMutation({
    mutationFn: async ({ id, delta }: { id: string; delta: number }) => {
      const ordered = reorderList(scenes ?? [], id, delta);
      await persistSceneOrder(ordered);
    },
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message),
  });

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
        <h1 className="mt-3 font-display text-3xl">Scene breakdown</h1>
        <p className="text-sm text-muted-foreground">
          Editing one scene never touches the others. Approved scenes are locked until you unlock
          them.
        </p>
        <ProjectNav projectId={projectId} />

        <section className="mt-6 grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-2">
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
            <Label>Screenplay draft</Label>
            <Select value={screenplayId ?? ""} onValueChange={setScreenplayId}>
              <SelectTrigger>
                <SelectValue placeholder="No screenplay for this episode yet" />
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
        </section>

        {!screenplay ? (
          <p className="mt-6 text-sm text-muted-foreground">
            Write a screenplay for this episode in the{" "}
            <Link to="/projects/$projectId/screenplay" params={{ projectId }} className="underline">
              Screenplay studio
            </Link>{" "}
            first.
          </p>
        ) : (
          <div className="mt-6 grid gap-4 lg:grid-cols-[280px_1fr]">
            <aside className="space-y-2">
              {(scenes ?? []).map((scene) => (
                <button
                  key={scene.id}
                  onClick={() => setSelectedSceneId(scene.id)}
                  className={`w-full rounded-md border p-2 text-left text-sm transition-colors ${
                    scene.id === selectedSceneId
                      ? "border-primary bg-secondary"
                      : "border-border hover:bg-secondary/50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs">{scene.scene_number}</span>
                    <StatusBadge status={scene.status} />
                  </div>
                  <p className="mt-1 line-clamp-2 font-mono text-xs uppercase text-muted-foreground">
                    {scene.heading}
                  </p>
                </button>
              ))}
              <Button
                variant="outline"
                className="w-full"
                onClick={async () => {
                  try {
                    await createScene(screenplay, (scenes?.length ?? 1) - 1);
                    invalidate();
                  } catch (error) {
                    toast.error((error as Error).message);
                  }
                }}
              >
                <Plus className="size-4" /> Add scene
              </Button>
            </aside>

            {selected ? (
              <SceneDetail
                key={selected.id}
                scene={selected}
                characters={characters ?? []}
                locations={locations ?? []}
                assigned={(sceneCharacters ?? [])
                  .filter((sc) => sc.scene_id === selected.id)
                  .map((sc) => sc.character_id)}
                onChanged={invalidate}
                onMove={(delta) => move.mutate({ id: selected.id, delta })}
                onDuplicate={async () => {
                  try {
                    await duplicateScene(selected);
                    invalidate();
                    toast.success("Scene duplicated.");
                  } catch (error) {
                    toast.error((error as Error).message);
                  }
                }}
                onDelete={async () => {
                  try {
                    await deleteScene(selected);
                    setSelectedSceneId(null);
                    invalidate();
                    toast.success("Scene deleted.");
                  } catch (error) {
                    toast.error((error as Error).message);
                  }
                }}
                onRegenerate={async (note) => {
                  const result = await runRegenerateScene({
                    data: { sceneId: selected.id, instructions: note || undefined },
                  });
                  invalidate();
                  toast[result.isMock ? "warning" : "success"](
                    result.isMock
                      ? "Rewritten with the development mock — no AI provider is configured."
                      : "Scene rewritten.",
                  );
                }}
              />
            ) : (
              <p className="text-sm text-muted-foreground">Select a scene.</p>
            )}
          </div>
        )}
      </div>
    </StudioShell>
  );
}

function SceneDetail({
  scene,
  characters,
  locations,
  assigned,
  onChanged,
  onMove,
  onDuplicate,
  onDelete,
  onRegenerate,
}: {
  scene: Scene;
  characters: Array<{ id: string; name: string }>;
  locations: Array<{ id: string; name: string }>;
  assigned: string[];
  onChanged: () => void;
  onMove: (delta: number) => void;
  onDuplicate: () => Promise<void>;
  onDelete: () => Promise<void>;
  onRegenerate: (instructions: string) => Promise<void>;
}) {
  const [form, setForm] = useState({
    heading: scene.heading,
    setting: scene.setting as SceneSettingValue,
    locationId: scene.location_id ?? "",
    locationName: scene.location_name ?? "",
    timeOfDay: scene.time_of_day ?? "",
    objective: scene.objective ?? "",
    action: scene.action ?? "",
    atmosphere: scene.atmosphere ?? "",
    lighting: scene.lighting ?? "",
    props: readList(scene.props).join("\n"),
    wardrobe: readList(scene.wardrobe).join("\n"),
    duration: String(scene.estimated_duration_seconds),
  });
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const approved = scene.status === "approved";

  const save = async () => {
    setBusy(true);
    try {
      await updateScene(scene, {
        heading: form.heading,
        setting: form.setting,
        location_id: form.locationId || null,
        location_name: form.locationName || null,
        time_of_day: form.timeOfDay || null,
        objective: form.objective || null,
        action: form.action || null,
        atmosphere: form.atmosphere || null,
        lighting: form.lighting || null,
        estimated_duration_seconds: Math.max(1, Number(form.duration) || 20),
        props: form.props
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        wardrobe: form.wardrobe
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
      });
      onChanged();
      toast.success("Scene saved.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="rounded bg-secondary px-2 py-0.5 font-mono text-xs">
            Scene {scene.scene_number}
          </span>
          <span className="font-mono text-xs text-muted-foreground">
            {SETTING_LABELS[scene.setting]}
          </span>
          <StatusBadge status={scene.status} />
          {scene.is_mock ? <MockBadge /> : null}
        </div>
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant="ghost" onClick={() => onMove(-1)} disabled={approved}>
            <ArrowUp className="size-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onMove(1)} disabled={approved}>
            <ArrowDown className="size-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void onDuplicate()}>
            <Copy className="size-4" /> Duplicate
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await setSceneStatus(scene.id, approved ? "draft" : "approved");
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
            onClick={() => void onDelete()}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </header>

      <fieldset disabled={approved} className="mt-4 space-y-3">
        <div>
          <Label>Heading</Label>
          <Input
            className="font-mono uppercase"
            value={form.heading}
            onChange={(e) => setForm({ ...form, heading: e.target.value })}
          />
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <Label>Setting</Label>
            <Select
              value={form.setting}
              onValueChange={(value) => setForm({ ...form, setting: value as SceneSettingValue })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="interior">Interior</SelectItem>
                <SelectItem value="exterior">Exterior</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Location (library)</Label>
            <Select
              value={form.locationId || "none"}
              onValueChange={(value) => {
                if (value === "none") {
                  setForm({ ...form, locationId: "" });
                  return;
                }
                const match = locations.find((l) => l.id === value);
                setForm({
                  ...form,
                  locationId: value,
                  locationName: match?.name ?? form.locationName,
                });
              }}
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
          <div>
            <Label>Time of day</Label>
            <Input
              value={form.timeOfDay}
              onChange={(e) => setForm({ ...form, timeOfDay: e.target.value })}
            />
          </div>
        </div>

        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Label>Location name</Label>
            <Input
              value={form.locationName}
              onChange={(e) => setForm({ ...form, locationName: e.target.value })}
            />
          </div>
          <Button
            variant="outline"
            onClick={async () => {
              if (!form.locationName.trim()) return;
              try {
                const created = await createLocation(
                  scene.project_id,
                  form.locationName.trim(),
                  form.setting,
                );
                setForm({ ...form, locationId: created.id });
                onChanged();
                toast.success("Added to the location library.");
              } catch (error) {
                toast.error((error as Error).message);
              }
            }}
          >
            Add to library
          </Button>
        </div>

        <div>
          <Label>Narrative objective</Label>
          <Textarea
            rows={2}
            value={form.objective}
            onChange={(e) => setForm({ ...form, objective: e.target.value })}
          />
        </div>
        <div>
          <Label>Action</Label>
          <Textarea
            rows={5}
            value={form.action}
            onChange={(e) => setForm({ ...form, action: e.target.value })}
          />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label>Props (one per line)</Label>
            <Textarea
              rows={3}
              value={form.props}
              onChange={(e) => setForm({ ...form, props: e.target.value })}
            />
          </div>
          <div>
            <Label>Wardrobe (one per line)</Label>
            <Textarea
              rows={3}
              value={form.wardrobe}
              onChange={(e) => setForm({ ...form, wardrobe: e.target.value })}
            />
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <Label>Atmosphere</Label>
            <Input
              value={form.atmosphere}
              onChange={(e) => setForm({ ...form, atmosphere: e.target.value })}
            />
          </div>
          <div>
            <Label>Lighting</Label>
            <Input
              value={form.lighting}
              onChange={(e) => setForm({ ...form, lighting: e.target.value })}
            />
          </div>
          <div>
            <Label>Estimated duration (s)</Label>
            <Input
              inputMode="numeric"
              value={form.duration}
              onChange={(e) => setForm({ ...form, duration: e.target.value })}
            />
          </div>
        </div>

        <div>
          <Label>Cast in this scene</Label>
          <div className="mt-1 flex flex-wrap gap-2">
            {characters.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No characters yet — create them in the Character studio.
              </p>
            ) : (
              characters.map((character) => {
                const on = assigned.includes(character.id);
                return (
                  <button
                    key={character.id}
                    type="button"
                    onClick={async () => {
                      try {
                        if (on) await removeSceneCharacter(scene.id, character.id);
                        else await addSceneCharacter(scene, character.id);
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
              })
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <Button onClick={save} disabled={busy}>
            Save scene
          </Button>
          <Input
            className="max-w-sm"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Rewrite direction (optional)"
          />
          <Button
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
            <RefreshCw className="size-4" /> Regenerate scene
          </Button>
        </div>
      </fieldset>

      {approved ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Approved — unlock this scene to edit or regenerate it.
        </p>
      ) : null}
    </section>
  );
}
