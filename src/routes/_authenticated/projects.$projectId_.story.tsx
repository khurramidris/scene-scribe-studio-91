import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Check, RefreshCw, Sparkles, Trash2, Undo2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { StudioShell } from "@/components/layout/StudioShell";
import { MockBadge, StatusBadge } from "@/components/studio/StatusBadge";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { generateStory } from "@/lib/story.functions";
import { episodesQuery, projectKeys, projectQuery, seasonsQuery } from "@/modules/projects/project.queries";
import { updateProject } from "@/modules/projects/project.service";
import { artifactsQuery, bibleQuery, outlinesQuery, storyKeys } from "@/modules/story/story.queries";
import {
  deleteArtifact,
  deleteOutline,
  saveBible,
  setArtifactStatus,
  setOutlineStatus,
  updateArtifact,
} from "@/modules/story/story.service";
import { LANGUAGES } from "@/modules/story/story.schemas";
import type { StoryTask } from "@/modules/story/story.schemas";
import { readBeats, readStringList, type StoryArtifact } from "@/modules/story/story.types";

export const Route = createFileRoute("/_authenticated/projects/$projectId_/story")({
  head: () => ({
    meta: [
      { title: "Story studio — Backlot Studio" },
      {
        name: "description",
        content: "Develop the premise, concepts, synopsis, story bible and outlines with AI.",
      },
      { property: "og:title", content: "Story studio — Backlot Studio" },
      {
        property: "og:description",
        content: "Develop the premise, concepts, synopsis, story bible and outlines with AI.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StoryStudio,
});

function StoryStudio() {
  const { projectId } = Route.useParams();
  const queryClient = useQueryClient();
  const runGenerate = useServerFn(generateStory);

  const { data: project, isLoading } = useQuery(projectQuery(projectId));
  const { data: artifacts } = useQuery(artifactsQuery(projectId));
  const { data: bible } = useQuery(bibleQuery(projectId));
  const { data: outlines } = useQuery(outlinesQuery(projectId));
  const { data: seasons } = useQuery(seasonsQuery(projectId));
  const { data: episodes } = useQuery(episodesQuery(projectId));

  const [instructions, setInstructions] = useState("");
  const [seasonId, setSeasonId] = useState<string>("");
  const [episodeId, setEpisodeId] = useState<string>("");
  const [runningTask, setRunningTask] = useState<StoryTask | null>(null);

  const language = project?.language ?? "en";

  const refreshAll = () => {
    void queryClient.invalidateQueries({ queryKey: storyKeys.artifacts(projectId) });
    void queryClient.invalidateQueries({ queryKey: storyKeys.bible(projectId) });
    void queryClient.invalidateQueries({ queryKey: storyKeys.outlines(projectId) });
    void queryClient.invalidateQueries({ queryKey: ["characters", projectId] });
  };

  const generate = useMutation({
    mutationFn: async (task: StoryTask) => {
      setRunningTask(task);
      return runGenerate({
        data: {
          projectId,
          task,
          language,
          instructions: instructions.trim() || undefined,
          seasonId: task === "season_outline" ? seasonId || null : null,
          episodeId: task === "episode_outline" ? episodeId || null : null,
        },
      });
    },
    onSettled: () => setRunningTask(null),
    onSuccess: (result) => {
      refreshAll();
      toast[result.isMock ? "warning" : "success"](
        result.isMock
          ? "Generated with the development mock — no AI provider is configured."
          : "Generated.",
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const saveBrief = useMutation({
    mutationFn: (patch: Parameters<typeof updateProject>[1]) => updateProject(projectId, patch),
    onSuccess: () => {
      toast.success("Brief saved");
      void queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (isLoading) {
    return (
      <StudioShell>
        <p className="text-sm text-muted-foreground">Loading story studio…</p>
      </StudioShell>
    );
  }
  if (!project) {
    return (
      <StudioShell>
        <p className="text-sm text-muted-foreground">This production could not be found.</p>
      </StudioShell>
    );
  }

  const concepts = (artifacts ?? []).filter((a) => a.kind === "logline" || a.kind === "concept");
  const synopses = (artifacts ?? []).filter(
    (a) => a.kind === "synopsis" || a.kind === "treatment" || a.kind === "premise",
  );

  const busy = generate.isPending;

  return (
    <StudioShell>
      <Link
        to="/projects/$projectId"
        params={{ projectId }}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {project.title}
      </Link>
      <h1 className="mt-3 text-2xl font-semibold">Story studio</h1>
      <ProjectNav projectId={projectId} />

      <div className="panel mt-6 space-y-3 rounded-xl border border-border p-5">
        <Label htmlFor="instructions">Direction for the AI (optional)</Label>
        <Textarea
          id="instructions"
          rows={2}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="e.g. Set it in Lahore, keep the antagonist morally grey, end every episode on a cliffhanger."
        />
        <p className="text-xs text-muted-foreground">
          Output language: <strong>{LANGUAGES.find((l) => l.code === language)?.label ?? language}</strong>{" "}
          — change it in the brief below. Approved material is always sent as context and never
          overwritten.
        </p>
      </div>

      <Tabs defaultValue="brief" className="mt-6">
        <TabsList className="flex-wrap">
          <TabsTrigger value="brief">Brief</TabsTrigger>
          <TabsTrigger value="concepts">Concepts</TabsTrigger>
          <TabsTrigger value="synopsis">Synopsis</TabsTrigger>
          <TabsTrigger value="bible">Story bible</TabsTrigger>
          <TabsTrigger value="outlines">Outlines</TabsTrigger>
        </TabsList>

        {/* ------------------------------------------------------------ brief */}
        <TabsContent value="brief">
          <form
            className="panel space-y-4 rounded-xl border border-border p-6"
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              saveBrief.mutate({
                premise: String(form.get("premise") ?? ""),
                target_audience: String(form.get("target_audience") ?? ""),
                genre: String(form.get("genre") ?? ""),
                tone: String(form.get("tone") ?? ""),
                language: String(form.get("language") ?? "en"),
              });
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="premise">Story idea / premise</Label>
              <Textarea
                id="premise"
                name="premise"
                rows={4}
                defaultValue={project.premise ?? ""}
                placeholder="The seed of the drama in a few sentences."
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="genre">Genre</Label>
                <Input id="genre" name="genre" defaultValue={project.genre ?? ""} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tone">Tone</Label>
                <Input id="tone" name="tone" defaultValue={project.tone ?? ""} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="target_audience">Target audience</Label>
                <Input
                  id="target_audience"
                  name="target_audience"
                  defaultValue={project.target_audience ?? ""}
                  placeholder="Women 18-34, South Asia, mobile-first"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="language">Language</Label>
                <select
                  id="language"
                  name="language"
                  defaultValue={project.language}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <Button type="submit" disabled={saveBrief.isPending}>
              {saveBrief.isPending ? "Saving…" : "Save brief"}
            </Button>
          </form>
        </TabsContent>

        {/* --------------------------------------------------------- concepts */}
        <TabsContent value="concepts">
          <GenerateBar
            label="Generate 4 alternative concepts and loglines"
            running={runningTask === "concepts" && busy}
            disabled={busy}
            onRun={() => generate.mutate("concepts")}
          />
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {concepts.map((artifact) => (
              <ArtifactCard key={artifact.id} artifact={artifact} projectId={projectId} />
            ))}
            {concepts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No concepts yet. Generate a set, then approve the one you want to build on.
              </p>
            ) : null}
          </div>
        </TabsContent>

        {/* --------------------------------------------------------- synopsis */}
        <TabsContent value="synopsis">
          <GenerateBar
            label="Generate synopsis and treatment"
            running={runningTask === "synopsis" && busy}
            disabled={busy}
            onRun={() => generate.mutate("synopsis")}
          />
          <div className="mt-4 grid gap-4">
            {synopses.map((artifact) => (
              <ArtifactCard key={artifact.id} artifact={artifact} projectId={projectId} />
            ))}
            {synopses.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing written yet.</p>
            ) : null}
          </div>
        </TabsContent>

        {/* ------------------------------------------------------------ bible */}
        <TabsContent value="bible">
          <GenerateBar
            label={bible ? "Regenerate story bible" : "Generate story bible"}
            running={runningTask === "bible" && busy}
            disabled={busy || bible?.status === "approved"}
            onRun={() => generate.mutate("bible")}
            hint={
              bible?.status === "approved"
                ? "The bible is approved and locked. Unlock it to regenerate."
                : undefined
            }
          />
          {bible ? (
            <BibleEditor bible={bible} projectId={projectId} />
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">No story bible yet.</p>
          )}
        </TabsContent>

        {/* --------------------------------------------------------- outlines */}
        <TabsContent value="outlines">
          <div className="panel space-y-4 rounded-xl border border-border p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Season</Label>
                <Select value={seasonId} onValueChange={setSeasonId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Whole production" />
                  </SelectTrigger>
                  <SelectContent>
                    {(seasons ?? []).map((season) => (
                      <SelectItem key={season.id} value={season.id}>
                        S{season.number} — {season.title ?? "Untitled"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => generate.mutate("season_outline")}
                >
                  <Sparkles className="size-4" />
                  {runningTask === "season_outline" && busy ? "Writing…" : "Season outline"}
                </Button>
              </div>
              <div className="space-y-2">
                <Label>Episode</Label>
                <Select value={episodeId} onValueChange={setEpisodeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an episode" />
                  </SelectTrigger>
                  <SelectContent>
                    {(episodes ?? []).map((episode) => (
                      <SelectItem key={episode.id} value={episode.id}>
                        EP{episode.number} — {episode.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy || !episodeId}
                  onClick={() => generate.mutate("episode_outline")}
                >
                  <Sparkles className="size-4" />
                  {runningTask === "episode_outline" && busy ? "Writing…" : "Episode outline"}
                </Button>
              </div>
            </div>
          </div>

          <div className="mt-4 space-y-4">
            {(outlines ?? []).map((outline) => (
              <div key={outline.id} className="panel rounded-xl border border-border p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">
                    {outline.scope === "season" ? "Season outline" : "Episode outline"}
                  </span>
                  <StatusBadge status={outline.status} />
                  {outline.is_mock ? <MockBadge /> : null}
                  <span className="ml-auto flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        void setOutlineStatus(
                          outline.id,
                          outline.status === "approved" ? "draft" : "approved",
                        ).then(() =>
                          queryClient.invalidateQueries({ queryKey: storyKeys.outlines(projectId) }),
                        );
                      }}
                    >
                      {outline.status === "approved" ? <Undo2 className="size-4" /> : <Check className="size-4" />}
                      {outline.status === "approved" ? "Unlock" : "Approve"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={outline.status === "approved"}
                      onClick={() => {
                        void deleteOutline(outline.id).then(() =>
                          queryClient.invalidateQueries({ queryKey: storyKeys.outlines(projectId) }),
                        );
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </span>
                </div>
                {outline.summary ? (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                    {outline.summary}
                  </p>
                ) : null}
                <ol className="mt-3 space-y-2">
                  {readBeats(outline.beats).map((beat, index) => (
                    <li key={index} className="rounded-md border border-border p-3 text-sm">
                      <span className="text-muted-foreground">{index + 1}.</span>{" "}
                      <strong>{beat.title}</strong>
                      <p className="mt-1 text-muted-foreground">{beat.description}</p>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
            {outlines && outlines.length === 0 ? (
              <p className="text-sm text-muted-foreground">No outlines yet.</p>
            ) : null}
          </div>
        </TabsContent>
      </Tabs>
    </StudioShell>
  );
}

function GenerateBar({
  label,
  onRun,
  running,
  disabled,
  hint,
}: {
  label: string;
  onRun: () => void;
  running: boolean;
  disabled: boolean;
  hint?: string;
}) {
  return (
    <div className="panel flex flex-wrap items-center gap-3 rounded-xl border border-border p-4">
      <Button onClick={onRun} disabled={disabled}>
        {running ? <RefreshCw className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
        {running ? "Writing…" : label}
      </Button>
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </div>
  );
}

function ArtifactCard({ artifact, projectId }: { artifact: StoryArtifact; projectId: string }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(artifact.content);
  const [title, setTitle] = useState(artifact.title ?? "");
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: storyKeys.artifacts(projectId) });

  return (
    <div className="panel rounded-xl border border-border p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">{artifact.title ?? artifact.kind}</span>
        <StatusBadge status={artifact.status} />
        {artifact.is_mock ? <MockBadge /> : null}
      </div>

      {editing ? (
        <div className="mt-3 space-y-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
          <Textarea rows={8} value={content} onChange={(e) => setContent(e.target.value)} />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                void updateArtifact(artifact, { title, content })
                  .then(() => {
                    setEditing(false);
                    void invalidate();
                    toast.success("Saved");
                  })
                  .catch((error: Error) => toast.error(error.message));
              }}
            >
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{artifact.content}</p>
      )}

      {!editing ? (
        <div className="mt-3 flex flex-wrap gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              void setArtifactStatus(
                artifact.id,
                artifact.status === "approved" ? "draft" : "approved",
              )
                .then(invalidate)
                .catch((error: Error) => toast.error(error.message));
            }}
          >
            {artifact.status === "approved" ? <Undo2 className="size-4" /> : <Check className="size-4" />}
            {artifact.status === "approved" ? "Unlock" : "Approve"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={artifact.status === "approved"}
            onClick={() => {
              void deleteArtifact(artifact.id)
                .then(invalidate)
                .catch((error: Error) => toast.error(error.message));
            }}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function BibleEditor({
  bible,
  projectId,
}: {
  bible: NonNullable<ReturnType<typeof useQuery<never>>["data"]> extends never
    ? never
    : import("@/modules/story/story.types").StoryBible;
  projectId: string;
}) {
  const queryClient = useQueryClient();
  const locked = bible.status === "approved";
  const invalidate = () => queryClient.invalidateQueries({ queryKey: storyKeys.bible(projectId) });

  return (
    <form
      className="panel mt-4 space-y-4 rounded-xl border border-border p-6"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        void saveBible(
          projectId,
          {
            world: String(form.get("world") ?? ""),
            central_conflict: String(form.get("central_conflict") ?? ""),
            tone_guidelines: String(form.get("tone_guidelines") ?? ""),
            themes: String(form.get("themes") ?? "")
              .split("\n")
              .map((v) => v.trim())
              .filter(Boolean),
            narrative_rules: String(form.get("narrative_rules") ?? "")
              .split("\n")
              .map((v) => v.trim())
              .filter(Boolean),
          },
          bible,
        )
          .then(() => {
            toast.success("Story bible saved");
            void invalidate();
          })
          .catch((error: Error) => toast.error(error.message));
      }}
    >
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold">Story bible</h2>
        <StatusBadge status={bible.status} />
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="ml-auto"
          onClick={() => {
            void saveBible(projectId, { status: locked ? "draft" : "approved" })
              .then(invalidate)
              .catch((error: Error) => toast.error(error.message));
          }}
        >
          {locked ? <Undo2 className="size-4" /> : <Check className="size-4" />}
          {locked ? "Unlock" : "Approve"}
        </Button>
      </div>
      <div className="space-y-2">
        <Label htmlFor="world">World</Label>
        <Textarea id="world" name="world" rows={4} defaultValue={bible.world ?? ""} disabled={locked} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="central_conflict">Central conflict</Label>
        <Textarea
          id="central_conflict"
          name="central_conflict"
          rows={3}
          defaultValue={bible.central_conflict ?? ""}
          disabled={locked}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="themes">Themes (one per line)</Label>
          <Textarea
            id="themes"
            name="themes"
            rows={5}
            defaultValue={readStringList(bible.themes).join("\n")}
            disabled={locked}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="narrative_rules">Narrative rules (one per line)</Label>
          <Textarea
            id="narrative_rules"
            name="narrative_rules"
            rows={5}
            defaultValue={readStringList(bible.narrative_rules).join("\n")}
            disabled={locked}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="tone_guidelines">Tone guidelines</Label>
        <Textarea
          id="tone_guidelines"
          name="tone_guidelines"
          rows={3}
          defaultValue={bible.tone_guidelines ?? ""}
          disabled={locked}
        />
      </div>
      <Button type="submit" disabled={locked}>
        Save story bible
      </Button>
    </form>
  );
}
