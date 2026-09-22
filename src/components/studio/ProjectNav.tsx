import { Link } from "@tanstack/react-router";

const TABS = [
  { to: "/projects/$projectId", label: "Production" },
  { to: "/projects/$projectId/story", label: "Story studio" },
  { to: "/projects/$projectId/characters", label: "Character studio" },
  { to: "/projects/$projectId/screenplay", label: "Screenplay" },
  { to: "/projects/$projectId/scenes", label: "Scenes" },
  { to: "/projects/$projectId/shots", label: "Shot planning" },
  { to: "/projects/$projectId/storyboard", label: "Storyboard" },
  { to: "/projects/$projectId/editor", label: "Episode editor" },
] as const;

export function ProjectNav({ projectId }: { projectId: string }) {
  return (
    <nav className="mt-5 flex flex-wrap gap-x-1 border-b border-border text-sm">
      {TABS.map((tab) => (
        <Link
          key={tab.to}
          to={tab.to}
          params={{ projectId }}
          activeOptions={{ exact: true }}
          activeProps={{ className: "text-foreground border-primary" }}
          className="-mb-px border-b-2 border-transparent px-3 py-2.5 font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
