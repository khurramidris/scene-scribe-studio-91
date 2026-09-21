# Moving off the Lovable editor

The application is written to be developed, built and deployed without the
Lovable editor. This document lists everything required to take it over.

## What is Lovable-specific today

| Item | Status | Replacement |
| --- | --- | --- |
| Managed PostgreSQL/auth/storage (Supabase under the hood) | Used now | Your own Supabase project or any PostgreSQL + auth stack |
| `src/integrations/supabase/*` generated client | Standard `@supabase/supabase-js` | Keep as-is; only env vars change |
| `src/integrations/lovable` (Google sign-in broker) | Used for Google OAuth | Replace with `supabase.auth.signInWithOAuth("google")` and your own Google OAuth client |
| Managed AI gateway (`LOVABLE_API_KEY`) | Used for text/image/video generation | Swap the AI service adapters for direct provider SDKs or your own gateway |

Everything else — React app, routing, modules, services, SQL migrations — is
plain, portable TypeScript.

## Migration checklist

1. Export the repository to GitHub (Lovable supports GitHub sync) and clone it.
2. Create your own Supabase project.
3. Apply `drizzle/migrations/*.sql` in filename order.
4. Enable email/password and Google sign-in in your project; add your domains
   to the redirect allow-list.
5. Copy `.env.example` to `.env` and fill in your own URL and keys.
6. Copy storage objects from the managed buckets into your own buckets
   (`supabase storage cp` or the Storage API) and keep bucket names identical.
7. Replace the Google sign-in call in `src/modules/auth/auth.service.ts` with
   the direct Supabase OAuth call.
8. Point the AI and video service adapters at your own provider credentials.
9. Deploy the frontend/server build to your host of choice.

## External services

| Service | Purpose | Required from phase |
| --- | --- | --- |
| PostgreSQL (Supabase) | Database, auth, storage | 1 |
| AI text model provider | Story, script, scene generation | 4 |
| AI image model provider | Character refs, storyboards | 4 |
| AI video provider / GPU renderer | Shot generation | 7 |
| Text-to-speech provider | Dialogue audio | 8 |
| Payment processor | Subscriptions and credits | 10 |
