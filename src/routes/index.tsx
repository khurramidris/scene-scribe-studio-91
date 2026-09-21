import { createFileRoute, Link } from "@tanstack/react-router";
import { Clapperboard, Film, Users, Wand2 } from "lucide-react";

import heroImage from "@/assets/hero-stage.jpg";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Backlot Studio — AI microdrama production platform" },
      {
        name: "description",
        content:
          "Turn a story idea into a finished AI drama episode: script, characters, storyboards, shots and final cut.",
      },
      { property: "og:title", content: "Backlot Studio — AI microdrama production platform" },
      {
        property: "og:description",
        content:
          "Turn a story idea into a finished AI drama episode: script, characters, storyboards, shots and final cut.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const PIPELINE = [
  { icon: Wand2, title: "Story development", body: "Idea, logline, beats and treatment." },
  { icon: Users, title: "Characters", body: "A character bible with locked visual identity." },
  { icon: Film, title: "Script & scenes", body: "Screenplay, scene breakdown and shot list." },
  { icon: Clapperboard, title: "Shots & cut", body: "Generated shots, approvals and final export." },
];

function Landing() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <Clapperboard className="size-5 text-primary" />
          <span className="font-display text-sm font-semibold">Backlot Studio</span>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to="/auth">Sign in</Link>
        </Button>
      </header>

      <section className="stage-light relative overflow-hidden px-4 pb-20 pt-10">
        <div className="mx-auto max-w-4xl text-center">
          <p className="font-display text-xs uppercase tracking-[0.3em] text-primary">
            AI film production
          </p>
          <h1 className="mt-4 text-4xl font-semibold leading-tight sm:text-6xl">
            From story idea to finished episode.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground">
            A production workspace for vertical microdramas and 16:9 television episodes — script,
            characters, storyboards, shot generation and approvals in one continuous pipeline.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/auth">Start a production</Link>
            </Button>
          </div>
        </div>

        <div className="mx-auto mt-14 max-w-5xl overflow-hidden rounded-xl border border-border shadow-[var(--shadow-stage)]">
          <img
            src={heroImage}
            alt="Film crew on a night backlot with camera rig, monitors and warm key light"
            width={1920}
            height={1088}
            className="w-full object-cover"
          />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-24">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PIPELINE.map((step) => (
            <div key={step.title} className="panel rounded-xl border border-border p-5">
              <step.icon className="size-5 text-primary" />
              <h2 className="mt-3 text-base font-semibold">{step.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
