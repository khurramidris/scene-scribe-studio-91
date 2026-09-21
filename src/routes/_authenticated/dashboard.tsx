import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Film, Plus, Smartphone } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { StudioShell } from "@/components/layout/StudioShell";
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
import { projectKeys, projectsQuery } from "@/modules/projects/project.queries";
import { createProject } from "@/modules/projects/project.service";
import {
  FORMAT_LABELS,
  STATUS_LABELS,
  type AspectFormat,
} from "@/modules/projects/project.types";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Productions — Backlot Studio" },
      { name: "description", content: "Your AI drama productions and episodes." },
      { property: "og:title", content: "Productions — Backlot Studio" },
      { property: "og:description", content: "Your AI drama productions and episodes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const queryClient = useQueryClient();
  const { data: projects, isLoading, error } = useQuery(projectsQuery());
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [logline, setLogline] = useState("");
  const [genre, setGenre] = useState("");
  const [format, setFormat] = useState<AspectFormat>("vertical_9_16");

  const create = useMutation({
    mutationFn: () => createProject({ title, logline, genre, format }),
    onSuccess: () => {
      toast.success("Production created");
      setTitle("");
      setLogline("");
      setGenre("");
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <StudioShell>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Productions</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every production holds its seasons, episodes, characters and generated shots.
          </p>
        </div>
        <Button onClick={() => setOpen((v) => !v)}>
          <Plus className="size-4" />
          New production
        </Button>
      </div>

      {open ? (
        <form
          className="panel mt-6 space-y-4 rounded-xl border border-border p-6"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="The Last Tenant"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="genre">Genre</Label>
              <Input
                id="genre"
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                placeholder="Revenge thriller"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="logline">Logline</Label>
            <Textarea
              id="logline"
              value={logline}
              onChange={(e) => setLogline(e.target.value)}
              placeholder="One sentence: who wants what, and what stands in the way."
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <Label>Format</Label>
            <Select value={format} onValueChange={(v) => setFormat(v as AspectFormat)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="vertical_9_16">{FORMAT_LABELS.vertical_9_16}</SelectItem>
                <SelectItem value="horizontal_16_9">{FORMAT_LABELS.horizontal_16_9}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={create.isPending || title.trim().length === 0}>
              {create.isPending ? "Creating…" : "Create production"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      <div className="mt-8">
        {isLoading ? <p className="text-sm text-muted-foreground">Loading productions…</p> : null}
        {error ? <p className="text-sm text-destructive">{(error as Error).message}</p> : null}
        {projects && projects.length === 0 ? (
          <div className="panel rounded-xl border border-dashed border-border p-10 text-center">
            <p className="text-sm text-muted-foreground">
              No productions yet. Create your first one to start the pipeline.
            </p>
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects?.map((project) => (
            <Link
              key={project.id}
              to="/projects/$projectId"
              params={{ projectId: project.id }}
              className="panel rounded-xl border border-border p-5 transition-colors hover:border-primary/50"
            >
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {project.format === "vertical_9_16" ? (
                  <Smartphone className="size-3.5" />
                ) : (
                  <Film className="size-3.5" />
                )}
                {project.format === "vertical_9_16" ? "9:16" : "16:9"}
                <span>·</span>
                {STATUS_LABELS[project.status]}
              </div>
              <h2 className="mt-2 text-lg font-semibold">{project.title}</h2>
              {project.logline ? (
                <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">{project.logline}</p>
              ) : null}
            </Link>
          ))}
        </div>
      </div>
    </StudioShell>
  );
}
