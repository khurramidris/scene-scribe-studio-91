# Local development

## Requirements

- Node.js 20+ (or Bun 1.1+)
- A PostgreSQL database — a Supabase project is the supported setup
- Supabase CLI (for applying migrations outside this editor)

## Setup

```bash
bun install          # or: npm install
cp .env.example .env # fill in your project values
bun run dev          # starts the app on http://localhost:8080
```

## Scripts

| Command | Purpose |
| --- | --- |
| `bun run dev` | development server with HMR |
| `bun run build` | production build |
| `bun run preview` | serve the production build locally |
| `bun run lint` | ESLint |
| `bun run format` | Prettier |

## Database

SQL migrations live in `drizzle/migrations/` and are applied in filename order.
Against your own Supabase project:

```bash
supabase link --project-ref <your-project-ref>
psql "$DATABASE_URL" -f drizzle/migrations/0000_core_foundation_profiles_roles_projects.sql
```

Every migration that creates a table in `public` must, in order: create the
table, `GRANT` privileges, enable RLS, then create policies.

## Auth configuration

Email/password and Google sign-in are used. On your own Supabase project,
enable both under Authentication → Providers and add your app origin to the
redirect allow-list.

## Deployment

- **Frontend + server functions:** any Node or edge host that runs a Vite/Nitro
  build output (Cloudflare Workers, Vercel, Netlify, a Node server).
- **Database, auth, storage:** your Supabase project.
- **GPU rendering:** a separate service you host; the app talks to it over
  HTTP only (see `docs/ARCHITECTURE.md`).

## Testing

Unit tests run with Vitest against module logic and service interfaces with
providers faked. Browser smoke tests use Playwright against the critical path.
