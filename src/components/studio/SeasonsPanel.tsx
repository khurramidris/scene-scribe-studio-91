import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { projectKeys, seasonsQuery } from "@/modules/projects/project.queries";
import {
  createSeason,
  deleteSeason,
  moveSeason,
  updateSeason,
} from "@/modules/projects/season.service";

export function SeasonsPanel({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const { data: seasons, isLoading } = useQuery(seasonsQuery(projectId));
  const [title, setTitle] = useState("");

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: projectKeys.seasons(projectId) });
    void queryClient.invalidateQueries({ queryKey: projectKeys.episodes(projectId) });
  };

  const add = useMutation({
    mutationFn: () => createSeason(projectId, title),
    onSuccess: () => {
      setTitle("");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <section className="panel rounded-xl border border-border p-6">
      <h2 className="text-base font-semibold">Seasons</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Group episodes into seasons and set the running order.
      </p>

      <form
        className="mt-4 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
      >
        <div className="min-w-48 flex-1 space-y-2">
          <Label htmlFor="season-title">New season</Label>
          <Input
            id="season-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Season title"
          />
        </div>
        <Button type="submit" variant="secondary" disabled={add.isPending}>
          {add.isPending ? "Adding…" : "Add season"}
        </Button>
      </form>

      {isLoading ? <p className="mt-4 text-sm text-muted-foreground">Loading seasons…</p> : null}

      <ul className="mt-4 space-y-2">
        {(seasons ?? []).map((season, index) => (
          <li
            key={season.id}
            className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3"
          >
            <span className="text-sm text-muted-foreground">S{season.number}</span>
            <Input
              defaultValue={season.title ?? ""}
              className="h-8 max-w-64"
              onBlur={(e) => {
                const next = e.target.value.trim();
                if (next === (season.title ?? "")) return;
                void updateSeason(season.id, { title: next })
                  .then(invalidate)
                  .catch((error: Error) => toast.error(error.message));
              }}
            />
            <div className="ml-auto flex gap-1">
              <Button
                size="sm"
                variant="ghost"
                disabled={index === 0}
                onClick={() => {
                  void moveSeason(seasons ?? [], season.id, -1)
                    .then(invalidate)
                    .catch((error: Error) => toast.error(error.message));
                }}
              >
                <ArrowUp className="size-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={index === (seasons?.length ?? 0) - 1}
                onClick={() => {
                  void moveSeason(seasons ?? [], season.id, 1)
                    .then(invalidate)
                    .catch((error: Error) => toast.error(error.message));
                }}
              >
                <ArrowDown className="size-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  void deleteSeason(season.id)
                    .then(invalidate)
                    .catch((error: Error) => toast.error(error.message));
                }}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </li>
        ))}
        {seasons && seasons.length === 0 ? (
          <li className="text-sm text-muted-foreground">No seasons yet.</li>
        ) : null}
      </ul>
    </section>
  );
}
