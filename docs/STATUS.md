# Status — implemented, verified, and outstanding

Last verified: phase "Storyboard Studio, AI Video Generation & Production Job Management".

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
| Ownership hardening | Composite keys plus `owns_project()`; migration 0003 fixes optional FKs to column-specific `ON DELETE SET NULL`. |

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

## Build, typecheck and tests

- `bunx tsgo --noEmit` — clean.
- Production build — OK.
- `bunx vitest run` — 60 tests passing (story and screenplay schemas, season
  reordering, provider mock flagging, video capability negotiation, shot
  regeneration with partially approved sequences, anonymous isolation,
  two-account authenticated isolation).

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

## Outstanding / not yet built

- Episode editor (timeline assembly), audio/dialogue generation, subtitles and
  final export. The data contracts exist in
  `src/modules/production/production.types.ts`; no tables or UI yet.
- Job progress currently advances while a page polls it; a persistent
  background worker has **not** been deployed. Long renders continue on the
  provider side and are picked up on the next poll or from the queue page.
- Billing, credits and usage metering.
- Playwright smoke suite committed to the repo (flows were driven manually).
- `.env` still tracked by Git (see above).

## External services required

| Need | Service |
| --- | --- |
| Database, auth, storage | PostgreSQL / Supabase project |
| Text + image + video generation | Lovable AI gateway, or any compatible gateway via `AI_GATEWAY_URL` |
| Long-form / high-res video | External commercial API or self-hosted GPU renderer implementing `docs/VIDEO_PROVIDER_CONTRACT.md` |
| Video assembly (FFmpeg) | Separate worker service |
| Payments | Stripe or Paddle |
| Media delivery | CDN in front of the storage bucket |
