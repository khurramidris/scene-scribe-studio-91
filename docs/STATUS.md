# Status — implemented, verified, and outstanding

Last verified: phase "Story Development Studio + Character Studio".

## Implemented and verified end to end

| Area | State |
| --- | --- |
| Auth (email/password + Google) | Working. Profile + default `member` role created by trigger. |
| Productions CRUD | Working (title, genre, tone, logline, synopsis, format, status). |
| Episodes | Create / list / delete / assign to a season. |
| Seasons | Create, rename, reorder (up/down), delete, episode assignment. |
| Story studio | Brief (premise, genre, tone, audience, language), AI concepts/loglines, synopsis + treatment, story bible, season/episode outlines, approve / edit / delete / regenerate, revision snapshots. |
| Character studio | Cast drafting from the story, editable profiles, relationships, AI reference images (appearance/costume/expression/prop), approval ("Lock in"), private storage with signed URLs. |
| Security | RLS owner policies + explicit GRANTs on every table; signed-out REST read of `projects` returns no rows. |
| Tests | `bun run test` (Vitest): story schemas, season reordering, AI provider mock flagging. |

Browser verification was run signed-in against the live database: production and
season created through the UI, four AI concepts generated and stored, cast
drafted from the story, three real reference images generated and displayed.
All test rows were deleted afterwards.

## Provider independence

- `src/services/ai/text.provider.ts` / `image.provider.ts` define the contracts.
- `text.registry.server.ts` / `image.registry.server.ts` resolve an adapter from
  environment configuration. With no provider configured they return an
  explicitly flagged mock (`is_mock` in the database, "Mock" badge in the UI).
  Mock output is never presented as a real generation.
- Swapping providers means adding one adapter file; feature code is untouched.

## Outstanding / not yet built

- Screenplay, scene breakdown, storyboards, video generation, shot approvals,
  episode editing, audio/subtitles, export.
- Billing, credits, usage metering.
- Playwright smoke suite committed to the repo (browser flows were verified
  manually this phase).
- `.env` is still tracked by git. Run `git rm --cached .env` once locally; the
  file only contains publishable keys, so no rotation is required.

## External services required

| Need | Service |
| --- | --- |
| Database, auth, storage | PostgreSQL / Supabase project (yours or managed) |
| Text + image generation | Any OpenAI-compatible gateway (`AI_GATEWAY_URL`, `AI_GATEWAY_API_KEY`) |
| Google sign-in outside Lovable | Your own Google OAuth client id/secret in Supabase Auth providers |
| Long-form / high-res video | External commercial API or self-hosted GPU renderer (never run in Lovable) |
| Video assembly (FFmpeg) | Separate worker service |
| Payments | Stripe or Paddle |
| Media delivery | CDN in front of the storage bucket |
