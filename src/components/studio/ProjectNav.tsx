import { Link } from "@tanstack/react-router";

const TABS = [
  { to: "/projects/$projectId", label: "Production" },
  { to: "/projects/$projectId/story", label: "Story studio" },
  { to: "/projects/$projectId/characters", label: "Character studio" },
  { to: "/projects/$projectId/screenplay", label: "Screenplay" },
  { to: "/projects/$projectId/scenes", label: "Scenes" },
  { to: "/projects/$projectId/shots", label: "Shot planning" },
] as const;

export function ProjectNav({ projectId }: { projectId: string }) {
  return (
    <nav className="mt-4 flex flex-wrap gap-1 border-b border-border pb-2 text-sm">
      {TABS.map((tab) => (
        <Link
          key={tab.to}
          to={tab.to}
          params={{ projectId }}
          activeOptions={{ exact: true }}
          activeProps={{ className: "bg-secondary text-foreground" }}
          className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground"
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
