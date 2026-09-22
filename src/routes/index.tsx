import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Clapperboard } from "lucide-react";

import heroImage from "@/assets/hero-stage.jpg";

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

/** The four production stages, presented as a numbered pipeline rather than loose cards. */
const PIPELINE = [
  {
    index: "01",
    stage: "Engine",
    title: "Story development",
    body: "Idea, logline, beats and treatment.",
  },
  {
    index: "02",
    stage: "Assets",
    title: "Characters",
    body: "A character bible with locked visual identity.",
  },
  {
    index: "03",
    stage: "Sequence",
    title: "Script & scenes",
    body: "Screenplay, scene breakdown and shot list.",
  },
  {
    index: "04",
    stage: "Edit",
    title: "Shots & cut",
    body: "Generated shots, approvals and final export.",
  },
];

function Landing() {
  return (
    <div className="tech-grid min-h-screen">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex size-6 items-center justify-center rounded-sm bg-primary">
              <Clapperboard className="size-3.5 text-primary-foreground" />
            </span>
            <span className="font-display text-base font-bold tracking-tight">Backlot Studio</span>
          </div>
          <Link
            to="/auth"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
          >
            Sign in
          </Link>
        </div>
      </header>

      <section className="stage-light relative overflow-hidden">
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-6 py-20 lg:grid-cols-2 lg:gap-20 lg:py-28">
          <div className="space-y-8">
            <div className="inline-flex items-center gap-3">
              <span className="h-px w-8 bg-primary" />
              <span className="meta-label font-semibold text-primary">AI film production</span>
            </div>

            <h1 className="text-5xl font-bold leading-[1.06] sm:text-6xl xl:text-7xl">
              From story idea to <span className="text-primary">finished</span> episode.
            </h1>

            <p className="max-w-lg text-lg leading-relaxed text-muted-foreground">
              A production workspace for vertical microdramas and 16:9 television episodes — script,
              characters, storyboards, shot generation and approvals in one continuous pipeline.
            </p>

            <div className="pt-2">
              <Link
                to="/auth"
                className="group inline-flex items-center rounded-sm bg-primary px-10 py-4 text-sm font-semibold uppercase tracking-[0.18em] text-primary-foreground shadow-[var(--shadow-glow)] transition-colors hover:bg-primary/90"
              >
                Start a production
                <ArrowRight className="ml-3 size-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
          </div>

          <div className="viewfinder group relative">
            <div className="grain relative aspect-[4/3] overflow-hidden border border-border-strong bg-surface">
              <img
                src={heroImage}
                alt="Film crew on a night backlot with camera rig, monitors and warm key light"
                width={1920}
                height={1088}
                className="size-full object-cover opacity-85 grayscale transition-all duration-700 group-hover:opacity-100 group-hover:grayscale-0"
              />
              <span className="absolute right-4 top-4 z-10 bg-background/60 px-2 py-1 font-mono text-[10px] tracking-widest text-foreground/60 backdrop-blur-sm">
                CAM A // 24FPS
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-28">
        <div className="grid gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {PIPELINE.map((step) => (
            <div
              key={step.title}
              className="group bg-background p-8 transition-colors hover:bg-surface"
            >
              <div className="mb-8 font-mono text-[10px] tracking-[0.2em] text-primary">
                {step.index} / {step.stage.toUpperCase()}
              </div>
              <h2 className="text-lg font-bold">{step.title}</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8">
          <span className="meta-label">Backlot Studio — AI film production</span>
          <span className="meta-label">9:16 vertical · 16:9 widescreen</span>
        </div>
      </footer>
    </div>
  );
}
