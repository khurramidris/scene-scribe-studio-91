# Status — implemented, verified, and outstanding

Last verified: phase "Ship V1" (episode editor, MP4 export, background job recovery).


## Implemented and verified end to end

| Area | State |
| --- | --- |
| Auth (email/password + Google) | Working. Profile + default `member` role created by trigger. |
| Productions CRUD | Working (title, genre, tone, logline, synopsis, format, status). |
| Seasons / episodes | Create, rename, reorder, delete, episode assignment. |
| Story studio | Brief, AI concepts/loglines, synopsis + treatment, story bible, season/episode outlines, approve / edit / delete / regenerate, revision snapshots. |
| Character studio | Cast drafting, editable profiles, relationships, AI reference images, approval, private storage with signed URLs. |
| Screenplay studio | AI screenplay generation, versioned drafts, per-scene editing, rewrite one scene, revision history + restore, approve / unlock / delete. |
| Scene breakdown | Structured scene rows, cast links, reusable locations, create / duplicate / reorder / delete / regenerate, approval. |
| Shot planning | AI shot lists with camera, timing, prompts and continuity; add / duplicate / delete / drag-reorder / approve. |
| Storyboard studio | Per-shot frame generation (1 or 3 alternatives), reference-image conditioning where the provider supports it, select / reject / delete, lightbox, batch "frames for this scene" and "frames for the episode" through controlled server-side jobs. |
| Shot video generation | Image-to-video (and text-to-video / first+last frame where the provider declares support) from an approved frame; capability-driven mode, resolution and duration controls; multiple takes; approve one take; download; previous takes retained. |
| Production jobs + queue | `production_jobs` rows for every image and video generation, idempotency keys, attempt counts, progress, structured errors, cancellation, per-user active-job limit (3); `/queue` page lists every job with provider, model, elapsed time, retry-by-polling, cancel and a link to the shot. |
| Permanent media storage | Every generated frame and clip is downloaded server-side into the private `storyboard-frames` / `shot-videos` buckets; a failed download leaves the job `failed`, never `completed`. Playback uses short-lived signed URLs. |
| Workflow overview | Production page shows the approval state of each stage and flags approved scenes that predate the latest story-bible change. |
| Episode editor | Loads an episode's approved takes as an ordered timeline; reorder, remove, swap take, trim start/end, mute, title card, SRT burn-in, total duration, explicit Save, persisted in `episode_timelines`. |
| MP4 export | `episode_exports` + standalone FFmpeg worker: normalise, concatenate, title card, subtitle burn-in, upload to the private `episode-exports` bucket, signed download, export history, partial exports allowed. |
| Background job recovery | `/api/public/cron/tick` advances active video jobs and recovers stale ones; `/api/public/exports/claim` + `/complete` drive the export worker. Both authenticate with the cron secret; no credentials reach the browser. |
| Ownership hardening | Composite keys plus `owns_project()`; migration 0003 fixes optional FKs to column-specific `ON DELETE SET NULL`; migration 0004 revokes direct browser writes to jobs, takes and frames and adds one-active-render and one-take-per-job unique indexes. |


## Part 1 corrections (this phase)

1. **FK deletion behaviour** — migration `0003` recreates `scenes.location_id`,
   `shots.location_id` and `shot_characters.character_reference_id` with
   `ON DELETE SET NULL (column)` so only the nullable id is cleared.
   Verified live: deleting a referenced location and a referenced character
   image left the scene, shot and link rows intact with the id set to NULL.
2. **Atomic shot regeneration** — `regenerate_scene_shots(scene, shots, meta)`
   PostgreSQL function: ownership check, advisory lock per scene, archive of
   every replaced draft into `content_revisions`, then delete + reinsert in one
   transaction. Approved shots keep their ids and their positions in the
   sequence; any failure rolls everything back.
3. **Authenticated cross-user isolation** — `tests/cross-user-isolation.test.ts`
   creates two real accounts and asserts that user B cannot read, edit, delete,
   insert into or regenerate user A's productions, episodes, characters,
   locations, scenes or shots, including through the privileged RPC.
4. **Environment files** — `.gitignore` excludes `.env` variants and
   `.env.example` contains placeholders only. `.env` is still tracked in Git and
   must be untracked locally with `git rm --cached .env`; it holds only
   publishable keys, so no credential rotation is required.

## Real end-to-end verification (live database, real provider)

Signed in as a test director account against the live database:

1. Production "QA Storyboard Drama" (vertical 9:16) with episode, approved
   screenplay, approved scene and one approved shot.
2. Storyboard studio generated a **real** frame via the AI gateway image model
   (`is_mock = false`), stored in the private bucket.
3. The frame was approved.
4. A **real** image-to-video job was submitted: provider `ai-gateway`, model
   `google/gemini-omni-1.1-flash`, mode `image_to_video`, 360p, 5s.
5. The job progressed queued → processing → downloading → completed (37s,
   attempt 1) and the resulting 723,778-byte `video/mp4` was stored in our own
   `shot-videos` bucket.
6. The clip played back in the browser; the take was approved
   (`status = approved`, `is_selected = true`, shot `production_status = rendered`).
7. After a hard browser reload the frame, clip, approval states and generation
   metadata were all still present. Zero console errors throughout.
8. The production queue listed both jobs as completed with provider, model,
   elapsed time and a link to the shot.
9. All test data was deleted afterwards.

## Tested with mocks only

- The external REST provider and the self-hosted GPU provider (documented in
  `docs/VIDEO_PROVIDER_CONTRACT.md`) — no such endpoint is configured here.
- `MockVideoProvider` / `MockImageProvider` are used only when no provider is
  configured; their output is flagged `is_mock` in the database and badged
  "Mock" in the UI, and mock frames cannot be sent to video generation.

## V1 acceptance test — executed live (real provider, real MP4)

Signed in as the test director account against the live database and the
configured gateway renderer:

1. Production "V1 Export Acceptance" (vertical 9:16), episode 1 "Last Train",
   approved screenplay, approved scene, three approved shot plans.
2. "Frames for this scene" produced **three real** storyboard frames
   (`is_mock = false`) in the private `storyboard-frames` bucket; one frame was
   approved and selected per shot.
3. Three **real** image-to-video renders were submitted (provider `ai-gateway`,
   model `google/gemini-omni-1.1-flash`, 360p, 3s each). All three reached
   `completed` and were stored in the private `shot-videos` bucket
   (921,590 / 938,917 / 693,354 bytes). One take approved per shot.
4. Episode editor loaded all three clips in narrative order (0:09 total).
   Clip 1 was trimmed by 1s, saved, and the page reloaded — the timeline came
   back at 0:08 with the trim intact.
5. "Export episode" queued an export; the FFmpeg worker claimed it, normalised,
   concatenated and uploaded the result.
6. The finished MP4 was downloaded through the app's signed download link and
   inspected: **h264 + aac, 1080×1920, 8.02s, 6,396,538 bytes** — matching the
   trimmed timeline exactly. It plays.
7. Source takes, timeline, export record and MP4 all survived a reload.

### Failure-recovery tests (separate)

- **Interrupted export**: an export left in `processing` past the 30-minute
  stale window was automatically requeued by the claim endpoint and rendered to
  `completed` on the next worker run.
- **Unreadable source clip**: an export whose clip path does not exist was
  marked `failed` with "A source clip could not be read." and surfaced in the
  export history; it was never reported as completed.
- **Duplicate finalisation**: covered by `tests/job-idempotency.test.ts` plus
  the `video_takes_one_per_job` unique index and the atomic
  `processing → downloading` claim.

## Tested with mocks only

- The external REST provider and the self-hosted GPU provider (documented in
  `docs/VIDEO_PROVIDER_CONTRACT.md`) — no such endpoint is configured here.
- `MockVideoProvider` / `MockImageProvider` are used only when no provider is
  configured; their output is flagged `is_mock` in the database and badged
  "Mock" in the UI, and mock frames cannot be sent to video generation or
  exported.

## Build, typecheck and tests

- `bunx tsgo --noEmit` — clean.
- Production build — OK.
- `bunx vitest run` — **84 tests passing** across 10 files (story and screenplay
  schemas, season reordering, provider mock flagging, video capability
  negotiation, shot regeneration with partially approved sequences, anonymous
  isolation, two-account authenticated isolation, job idempotency, timeline
  persistence and export validation).

## Running the export worker

`worker/export-worker/` is a standalone Node + FFmpeg service (source,
`Dockerfile` and `README.md` included). It holds no database or provider
credentials: it authenticates with the shared cron secret and receives only
short-lived signed URLs.

```
BACKLOT_APP_URL=https://<your-app-host> \
BACKLOT_CRON_SECRET=<shared secret> \
node worker/export-worker/index.mjs        # add RUN_ONCE=1 for a single pass
```

It was run locally against the dev server for the acceptance test above. It is
**not yet deployed** to a hosted environment — that is a manual deployment step
(any container host will do).

## Environment variables (no values)

| Variable | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` | Browser database/auth client |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Server-side clients |
| `LOVABLE_API_KEY` / `AI_GATEWAY_API_KEY`, `AI_GATEWAY_URL` | Text, image and video gateway |
| `AI_TEXT_MODEL`, `AI_IMAGE_MODEL`, `AI_VIDEO_MODEL` | Model overrides |
| `VIDEO_PROVIDER` | `gateway` \| `external` \| `selfhosted` \| `mock` |
| `EXTERNAL_VIDEO_API_URL`, `EXTERNAL_VIDEO_API_KEY`, `EXTERNAL_VIDEO_MODEL` | External commercial renderer |
| `SELF_HOSTED_RENDER_URL`, `SELF_HOSTED_RENDER_TOKEN`, `SELF_HOSTED_RENDER_MODEL` | Future GPU worker |
| `LOVABLE_CRON_SECRET` (+ `_PREVIOUS` during rotation) | Authenticates the cron tick and the export worker |
| `BACKLOT_APP_URL`, `BACKLOT_CRON_SECRET` | Export worker configuration |

## Outstanding / not yet built

- Export worker not deployed to a hosted environment (runs on demand today).
- Audio: clip audio is preserved and clips can be muted; no background-music
  upload, AI dubbing, voice cloning or automatic subtitle generation.
  Subtitles are supported by uploading an SRT and burning it in.
- Billing, credits and usage metering.
- Playwright smoke suite committed to the repo (flows were driven ad hoc).
- `.env` still tracked by Git — run `git rm --cached .env` locally. It holds
  only publishable keys, so no credential rotation is required.

## External services required

| Need | Service |
| --- | --- |
| Database, auth, storage | PostgreSQL / Supabase project |
| Text + image + video generation | Lovable AI gateway, or any compatible gateway via `AI_GATEWAY_URL` |
| Long-form / high-res video | External commercial API or self-hosted GPU renderer implementing `docs/VIDEO_PROVIDER_CONTRACT.md` |
| Video assembly (FFmpeg) | `worker/export-worker` on any container host |
| Payments | Stripe or Paddle |
| Media delivery | CDN in front of the storage bucket |

