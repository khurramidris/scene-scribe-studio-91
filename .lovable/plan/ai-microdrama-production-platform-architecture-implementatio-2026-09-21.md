# AI Microdrama Production Platform — Architecture & Implementation Plan

## 1. Scope

A production SaaS that takes a story idea through: story development → characters → screenplay → scene breakdown → storyboards → AI video generation → shot approval → episode assembly → audio/subtitles → export. Supports 9:16 microdrama and 16:9 episode formats. Every stage is reviewable, regenerable, and version-preserving.

## 2. Stack and portability

- React 19 + TypeScript + TanStack Start (Vite). Standard, portable, self-hostable build.
- Postgres via Supabase (auth, RLS, storage, SQL migrations).
- Server logic in typed server functions (`createServerFn`) and HTTP routes for webhooks — plain TypeScript, no proprietary runtime lock-in.
- All schema as numbered SQL migration files committed in the repo.
- `.env.example` documents every variable; no secrets in the repo, none in browser code.

### Backend ownership note

Your own Supabase project can only be linked by you in Lovable under Project Settings → Connectors → Supabase; it cannot be connected from chat. If you do not link one now, we enable the built-in managed Postgres backend (Supabase under the hood) and keep everything portable: standard SQL migrations, standard `@supabase/supabase-js` client, storage buckets, and env-based config. Migration path later = create your own Supabase project, run the migrations, copy storage objects, swap four env vars. This will be written up in `docs/MIGRATION.md`.

## 3. Module structure

```text
src/
  routes/                 thin pages only
  modules/
    auth/                 session, guards, profile
    projects/             projects, seasons, episodes
    story/                idea, logline, beat sheet, treatment
    characters/           bible, refs, identity locking
    script/               screenplay, revisions
    scenes/               breakdown, shots
    storyboard/           frame images
    video/                job orchestration + approvals
    audio/                dialogue, music, sfx, subtitles
    export/               assembly, render manifest
    billing/              plans, credits, usage
  services/
    ai/                   text/image/video provider interfaces
    video/                provider registry (see §5)
    storage/              signed upload/download
  server/…                server-only helpers
  db/migrations/          SQL
```

Rule enforced throughout: components render, modules hold logic, services own external I/O.

## 4. Data model (first cut)

Core: `profiles`, `user_roles` (separate table, never on profile), `projects`, `seasons`, `episodes`, `scenes`, `shots`.

Creative: `characters`, `character_references`, `locations`, `scripts`, `script_revisions`, `storyboard_frames`, `reference_images`.

Assets & pipeline: `assets` (unified media rows: image/video/audio, versioned, provider-tagged), `generation_jobs` (provider, status, external id, cost, error, cancellable), `approvals` (entity type + id + version + approver).

Commerce: `subscriptions`, `credit_ledger`, `usage_records`.

Continuity guarantees:
- Assets are append-only versions; approval pins a version. Regenerating a shot creates a new version and never mutates an approved one.
- Characters carry a locked identity record (description + seed + reference images) reused by every downstream image/video prompt.
- Scenes/shots hold ordered positions and dependency links so a re-run touches only the targeted node.
- RLS on every table, scoped to `auth.uid()` via project ownership; explicit GRANTs per table.

## 5. Video generation architecture

One interface, many providers:

```ts
interface VideoProvider {
  id: string;
  capabilities: { maxSeconds; resolutions; aspectRatios; cancel: boolean; imageToVideo: boolean };
  submit(req: VideoRequest): Promise<{ externalId: string }>;
  status(externalId: string): Promise<JobStatus>;
  fetchResult(externalId: string): Promise<{ bytes | url; mimeType }>;
  cancel?(externalId: string): Promise<void>;
}
```

Registry resolves a provider per request from project settings + env. Planned adapters: Lovable AI Gateway video, external commercial API (configurable base URL + key), and a self-hosted GPU endpoint (FastH3-compatible) that is HTTP-only — no GPU model ever runs inside Lovable.

Orchestration: submit → persist `generation_jobs` row → poll from the client against a status endpoint → on completion download and store the MP4 in our own storage bucket → create a new asset version. Failures, retries with bounded backoff, cancellation, and regeneration all go through the same job record.

Unconfigured provider → an explicit `mock` provider that returns a clearly labelled placeholder, flagged in the database and visibly marked in the UI as a development mock. Never presented as a real generation.

## 6. Phased delivery

Each phase ships working software plus a report (functionality, DB changes, tests, external dependencies, limitations, next task).

1. **Foundation** — design system, app shell, routing, error/not-found handling, docs skeleton, `.env.example`.
2. **Auth & ownership** — email sign-up/sign-in, profiles, roles table, protected area, RLS baseline.
3. **Projects & structure** — projects, seasons, episodes CRUD with format (9:16 / 16:9), real persistence, real lists.
4. **Story & characters** — AI story development, character bible with identity locking, reference image generation, approvals.
5. **Script & scene breakdown** — screenplay generation, revisions, scene/shot decomposition, editing.
6. **Storyboards** — per-shot frame images, regenerate-one, approve-one.
7. **Video pipeline** — provider interface, registry, job lifecycle, shot approval, version preservation.
8. **Audio & subtitles** — dialogue TTS, music/SFX slots, subtitle track generation and editing.
9. **Assembly & export** — timeline assembly, render manifest, export.
10. **Billing** — plans, credit ledger, usage metering and limits.
11. **Hardening & handover** — docs, migration guide, test pass, security review.

## 7. Testing

Vitest for module logic (state machines, versioning, credit math, prompt builders) with provider adapters faked at the interface. SQL-level checks that RLS denies cross-user reads. Playwright smoke runs for the critical path per phase. Every phase's tests are run and reported, not claimed.

## 8. In-Lovable vs external

- In Lovable: full frontend, database, auth, storage, server functions, text/image/TTS generation, short-clip video generation, billing logic.
- External: self-hosted GPU rendering (FastH3), long-form/high-resolution commercial rendering, heavy FFmpeg assembly for long exports, payment processor account, CDN/custom domain.

## 9. First implementation step after approval

Phase 1 + 2 together: design system and app shell, enable the backend, auth with profiles and roles, protected studio area, and the projects table foundation — with migrations, `.env.example`, and `docs/` started.
