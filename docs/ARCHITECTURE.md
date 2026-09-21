# Architecture

## Stack

| Layer | Technology |
| --- | --- |
| UI | React 19, TypeScript, Tailwind CSS v4, Radix/shadcn primitives |
| Routing / SSR | TanStack Start (TanStack Router + Vite) |
| Data fetching | TanStack Query |
| Backend logic | TanStack server functions (`createServerFn`) + server routes under `src/routes/api/` |
| Database / auth / storage | PostgreSQL via Supabase |

Nothing in the application depends on a proprietary runtime: the build is a
standard Vite build, the database is standard PostgreSQL, and all schema
changes live as SQL migration files in the repository.

## Layering rules

1. **Routes** (`src/routes/`) render pages and wire user intent. They hold no
   business logic and no direct third-party calls.
2. **Modules** (`src/modules/<domain>/`) own domain logic, types, query
   definitions and data-access services.
3. **Services** (`src/services/`) wrap external systems behind interfaces
   (AI text/image/video providers, storage) so a provider can be replaced
   without touching feature code.
4. **Server-only code** lives in `*.server.ts` helpers or inside
   `createServerFn` handlers. Privileged keys are read only there.

## Current modules

- `modules/auth` — session state (`useAuth`) and auth actions (`auth.service`).
- `modules/projects` — projects, seasons and episodes: types, data access
  (`project.service`) and query definitions (`project.queries`).

## Data ownership and security

- Every table has Row Level Security enabled with policies scoped to
  `auth.uid()`, plus explicit `GRANT`s for `authenticated` and `service_role`.
- Roles live in a dedicated `user_roles` table and are checked through the
  `has_role(uuid, app_role)` security-definer function. Roles are never stored
  on the profile row.
- A trigger on new users creates the profile row and the default `member` role.
- No third-party API key or privileged database credential is ever referenced
  from browser code.

## Database (current)

- `profiles` — user-facing account data, keyed by the auth user id.
- `user_roles` — role grants (`admin`, `member`).
- `projects` — a production: title, logline, genre, tone, language, format
  (`vertical_9_16` / `horizontal_16_9`), status, settings JSON.
- `seasons` — optional grouping of episodes within a production.
- `episodes` — numbered episodes with target duration and status.

Planned in later phases: `characters`, `character_references`, `locations`,
`scripts`, `script_revisions`, `scenes`, `shots`, `storyboard_frames`,
`assets` (versioned media), `generation_jobs`, `approvals`, `subscriptions`,
`credit_ledger`, `usage_records`.

## Video generation (phase 7 design)

A single `VideoProvider` interface with `submit`, `status`, `fetchResult`,
optional `cancel`, and declared capabilities. A registry resolves the provider
per request from project settings and environment configuration. Planned
adapters: managed gateway video, an external commercial API, and a
self-hosted GPU renderer reached over HTTP. When no provider is configured, an
explicit `mock` provider is used; mock results are flagged in the database and
labelled in the UI, never presented as real generations.
