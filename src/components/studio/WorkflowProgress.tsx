import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Check, Circle } from "lucide-react";
import type { ReactNode } from "react";

import { charactersQuery } from "@/modules/characters/character.queries";
import {
  projectScenesQuery,
  screenplaysQuery,
} from "@/modules/screenplay/screenplay.queries";
import { bibleQuery } from "@/modules/story/story.queries";

type StageState = "empty" | "in_progress" | "approved";

const ICONS: Record<StageState, ReactNode> = {
  approved: <Check className="size-4 text-primary" />,
  in_progress: <Circle className="size-4 text-muted-foreground" />,
  empty: <Circle className="size-4 text-muted-foreground/40" />,
};

const LABELS: Record<StageState, string> = {
  approved: "Approved",
  in_progress: "In progress",
  empty: "Not started",
};

/**
 * Stage-by-stage view of the production workflow. It reports state only: it
 * never deletes or overwrites downstream work when upstream material changes,
 * it just flags what may now be out of date.
 */
export function WorkflowProgress({ projectId }: { projectId: string }) {
  const { data: bible } = useQuery(bibleQuery(projectId));
  const { data: characters } = useQuery(charactersQuery(projectId));
  const { data: screenplays } = useQuery(screenplaysQuery(projectId));
  const { data: scenes } = useQuery(projectScenesQuery(projectId));

  const bibleState: StageState = !bible
    ? "empty"
    : bible.status === "approved"
      ? "approved"
      : "in_progress";

  const castState: StageState = !characters?.length
    ? "empty"
    : characters.some((c) => c.status === "approved")
      ? "approved"
      : "in_progress";

  const screenplayState: StageState = !screenplays?.length
    ? "empty"
    : screenplays.some((s) => s.status === "approved")
      ? "approved"
      : "in_progress";

  const sceneState: StageState = !scenes?.length
    ? "empty"
    : scenes.every((s) => s.status === "approved")
      ? "approved"
      : "in_progress";

  const approvedScreenplay = (screenplays ?? []).find((s) => s.status === "approved");
  const staleScenes =
    approvedScreenplay && bible?.updated_at
      ? (scenes ?? []).filter(
          (scene) =>
            scene.status === "approved" &&
            new Date(scene.updated_at).getTime() < new Date(bible.updated_at).getTime(),
        ).length
      : 0;

  const stages = [
    { label: "Story bible", state: bibleState, to: "/projects/$projectId/story" as const },
    { label: "Characters", state: castState, to: "/projects/$projectId/characters" as const },
    { label: "Screenplay", state: screenplayState, to: "/projects/$projectId/screenplay" as const },
    { label: "Scene breakdown", state: sceneState, to: "/projects/$projectId/scenes" as const },
    { label: "Shot list", state: "in_progress" as StageState, to: "/projects/$projectId/shots" as const },
  ];

  return (
    <section className="mt-4 rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-medium">Production workflow</h2>
      <ol className="mt-2 grid gap-2 md:grid-cols-5">
        {stages.map((stage) => (
          <li key={stage.label}>
            <Link
              to={stage.to}
              params={{ projectId }}
              className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm transition-colors hover:bg-secondary/50"
            >
              {ICONS[stage.state]}
              <span>
                {stage.label}
                <span className="block text-xs text-muted-foreground">{LABELS[stage.state]}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
      {staleScenes > 0 ? (
        <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
          <AlertTriangle className="mt-0.5 size-4 text-destructive" />
          {staleScenes} approved scene{staleScenes === 1 ? "" : "s"} predate the latest story bible
          change and may be out of date. Nothing was changed automatically — review and regenerate
          only what you want to replace.
        </p>
      ) : null}
    </section>
  );
}
