import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { StudioShell } from "@/components/layout/StudioShell";
import { ProjectNav } from "@/components/studio/ProjectNav";
import { SeasonsPanel } from "@/components/studio/SeasonsPanel";
import { assignEpisodeToSeason } from "@/modules/projects/season.service";
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
import {
  episodesQuery,
  projectKeys,
  projectQuery,
} from "@/modules/projects/project.queries";
import {
  createEpisode,
  deleteEpisode,
  deleteProject,
  updateProject,
} from "@/modules/projects/project.service";
import {
  FORMAT_LABELS,
  STATUS_LABELS,
  type AspectFormat,
  type ProjectStatus,
} from "@/modules/projects/project.types";

export const Route = createFileRoute("/_authenticated/projects/$projectId")({
  head: () => ({
    meta: [
      { title: "Production — Backlot Studio" },
      { name: "description", content: "Production details, episodes and pipeline status." },
      { property: "og:title", content: "Production — Backlot Studio" },
      {
        property: "og:description",
        content: "Production details, episodes and pipeline status.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProjectDetail,
});

function ProjectDetail() {
  const { projectId } = Route.useParams();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: project, isLoading } = useQuery(projectQuery(projectId));
  const { data: episodes } = useQuery(episodesQuery(projectId));
  const [episodeTitle, setEpisodeTitle] = useState("");

  const save = useMutation({
    mutationFn: (patch: Parameters<typeof updateProject>[1]) => updateProject(projectId, patch),
    onSuccess: () => {
      toast.success("Saved");
      void queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
      void queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const addEpisode = useMutation({
    mutationFn: () => createEpisode(projectId, episodeTitle),
    onSuccess: () => {
      setEpisodeTitle("");
      void queryClient.invalidateQueries({ queryKey: projectKeys.episodes(projectId) });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const removeEpisode = useMutation({
    mutationFn: (id: string) => deleteEpisode(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: projectKeys.episodes(projectId) }),
    onError: (err: Error) => toast.error(err.message),
  });

  const removeProject = useMutation({
    mutationFn: () => deleteProject(projectId),
    onSuccess: () => {
      toast.success("Production deleted");
      void queryClient.invalidateQueries({ queryKey: projectKeys.all });
      void navigate({ to: "/dashboard" });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <StudioShell>
        <p className="text-sm text-muted-foreground">Loading production…</p>
      </StudioShell>
    );
  }

  if (!project) {
    return (
      <StudioShell>
        <p className="text-sm text-muted-foreground">This production could not be found.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/dashboard">Back to productions</Link>
        </Button>
      </StudioShell>
    );
  }

  return (
    <StudioShell>
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Productions
      </Link>

      <div className="mt-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{project.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {FORMAT_LABELS[project.format]} · {STATUS_LABELS[project.status]}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => removeProject.mutate()}
          disabled={removeProject.isPending}
        >
          <Trash2 className="size-4" />
          Delete
        </Button>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <form
          className="panel space-y-4 rounded-xl border border-border p-6"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            save.mutate({
              title: String(form.get("title") ?? project.title),
              logline: String(form.get("logline") ?? ""),
              synopsis: String(form.get("synopsis") ?? ""),
              genre: String(form.get("genre") ?? ""),
              tone: String(form.get("tone") ?? ""),
            });
          }}
        >
          <h2 className="text-base font-semibold">Production details</h2>
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" name="title" defaultValue={project.title} required />
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
          </div>
          <div className="space-y-2">
            <Label htmlFor="logline">Logline</Label>
            <Textarea id="logline" name="logline" defaultValue={project.logline ?? ""} rows={2} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="synopsis">Synopsis</Label>
            <Textarea
              id="synopsis"
              name="synopsis"
              defaultValue={project.synopsis ?? ""}
              rows={5}
            />
          </div>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save changes"}
          </Button>
        </form>

        <div className="space-y-6">
          <div className="panel space-y-4 rounded-xl border border-border p-6">
            <h2 className="text-base font-semibold">Format & status</h2>
            <div className="space-y-2">
              <Label>Format</Label>
              <Select
                value={project.format}
                onValueChange={(v) => save.mutate({ format: v as AspectFormat })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vertical_9_16">{FORMAT_LABELS.vertical_9_16}</SelectItem>
                  <SelectItem value="horizontal_16_9">{FORMAT_LABELS.horizontal_16_9}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={project.status}
                onValueChange={(v) => save.mutate({ status: v as ProjectStatus })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(STATUS_LABELS) as ProjectStatus[]).map((status) => (
                    <SelectItem key={status} value={status}>
                      {STATUS_LABELS[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="panel space-y-4 rounded-xl border border-border p-6">
            <h2 className="text-base font-semibold">Episodes</h2>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (episodeTitle.trim().length === 0) return;
                addEpisode.mutate();
              }}
            >
              <Input
                value={episodeTitle}
                onChange={(e) => setEpisodeTitle(e.target.value)}
                placeholder="Episode title"
              />
              <Button type="submit" size="icon" disabled={addEpisode.isPending}>
                <Plus className="size-4" />
              </Button>
            </form>
            <ul className="space-y-2">
              {episodes?.map((episode) => (
                <li
                  key={episode.id}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
                >
                  <span>
                    <span className="text-muted-foreground">EP{episode.number}</span>{" "}
                    {episode.title}
                  </span>
                  <select
                    className="ml-auto mr-2 h-8 rounded-md border border-input bg-transparent px-2 text-xs"
                    value={episode.season_id ?? ""}
                    aria-label={`Season for ${episode.title}`}
                    onChange={(e) => {
                      void assignEpisodeToSeason(episode.id, e.target.value || null)
                        .then(() =>
                          queryClient.invalidateQueries({
                            queryKey: projectKeys.episodes(projectId),
                          }),
                        )
                        .catch((error: Error) => toast.error(error.message));
                    }}
                  >
                    <option value="">No season</option>
                    {(seasons ?? []).map((season) => (
                      <option key={season.id} value={season.id}>
                        S{season.number} — {season.title ?? "Untitled"}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => removeEpisode.mutate(episode.id)}
                    aria-label={`Delete ${episode.title}`}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
              {episodes && episodes.length === 0 ? (
                <li className="text-sm text-muted-foreground">No episodes yet.</li>
              ) : null}
            </ul>
          </div>

          <SeasonsPanel projectId={projectId} />
        </div>
      </div>
    </StudioShell>
  );
}
