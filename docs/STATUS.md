# Status — implemented, verified, and outstanding

Last verified: phase "Screenplay Studio, Scene Breakdown & Shot Planning".

## Implemented and verified end to end

| Area | State |
| --- | --- |
| Auth (email/password + Google) | Working. Profile + default `member` role created by trigger. |
| Productions CRUD | Working (title, genre, tone, logline, synopsis, format, status). |
| Seasons / episodes | Create, rename, reorder, delete, episode assignment. |
| Story studio | Brief, AI concepts/loglines, synopsis + treatment, story bible, season/episode outlines, approve / edit / delete / regenerate, revision snapshots. |
| Character studio | Cast drafting, editable profiles, relationships, AI reference images, approval, private storage with signed URLs. |
| Screenplay studio | Episode selection, AI screenplay generation from approved story material, versioned drafts, per-scene editing, save, rewrite one scene, revision history + restore, approve / unlock / delete, word count and runtime estimate. |
| Scene breakdown | Scenes stored as structured rows (heading, setting, location, time of day, objective, action, dialogue, props, wardrobe, atmosphere, lighting, duration), cast links to existing characters, reusable locations, create / duplicate / reorder / delete / regenerate, approval. |
| Shot planning | AI shot lists per approved scene with type, framing, angle, movement, duration, description, action, dialogue, tone, lighting, sound, image prompt, video prompt, continuity block; add / duplicate / delete / drag-reorder / approve; configurable max shot length. |
| Workflow overview | Production page shows the approval state of each stage and flags approved scenes that predate the latest story-bible change. Nothing downstream is deleted or overwritten automatically. |
| Ownership hardening | Migration 0002 adds composite keys and the `owns_project()` security-definer check; every insert policy now requires the parent project to belong to the caller. |
| Tests | `bun run test` — 45 tests passing (story schemas, screenplay/shot schemas, season reordering, AI provider mock flagging, anonymous-access isolation across all production tables). |

### Live verification run (signed in, real database)

1. A test production with an episode, approved story bible and two characters was created.
2. The Screenplay Studio generated a real AI screenplay: 1 draft version, 5 scenes,
   9 scene–character links, 2 locations auto-created (`is_mock = false`).
3. A scene was approved in the Scenes workspace.
4. Shot planning produced 6 real shots with prompts and continuity metadata.
5. Shot 1 was approved and the shot list regenerated: the approved shot was kept
   byte-for-byte as shot 1 and only the drafts were replaced.
6. All test data was deleted afterwards; the tables are empty again.

Build and typecheck are clean; zero browser console errors during the run.

## Provider independence

- `src/services/ai/text.provider.ts` / `image.provider.ts` define the contracts;
  registries resolve an adapter from environment configuration and fall back to
  an explicitly flagged mock (`is_mock` in the database, "Mock" badge in the UI).
- Shot duration is provider-configurable (`SHOT_DURATION_LIMITS`), not hardcoded
  to any one video model.

## Prepared for the next phase (storyboard + video)

`shots` already carries `storyboard_frame_url`, `storyboard_storage_path`,
`start_frame_storage_path`, `end_frame_storage_path`, `video_job_id`,
`video_asset_url`, `video_storage_path`, `audio_asset_url`,
`audio_storage_path`, `render_history` and `production_status`. These are
extension points only — no video generation exists yet and none is simulated.

## Outstanding / not yet built

- Storyboard frame generation, AI video rendering, audio/subtitles, episode
  editing, export.
- Billing, credits, usage metering.
- Playwright smoke suite committed to the repo (flows were driven manually).
- Cross-user (second authenticated account) write-denial test; the committed
  isolation test covers anonymous access on every production table.
- `.env` is still tracked by git. Run `git rm --cached .env` once locally; the
  file contains only publishable keys, so no rotation is required.

## External services required

| Need | Service |
| --- | --- |
| Database, auth, storage | PostgreSQL / Supabase project (yours or managed) |
| Text + image generation | Any OpenAI-compatible gateway (`AI_GATEWAY_URL`, `AI_GATEWAY_API_KEY`) |
| Google sign-in outside Lovable | Your own Google OAuth client id/secret in Supabase Auth providers |
| Long-form / high-res video | External commercial API or self-hosted GPU renderer |
| Video assembly (FFmpeg) | Separate worker service |
| Payments | Stripe or Paddle |
| Media delivery | CDN in front of the storage bucket |
