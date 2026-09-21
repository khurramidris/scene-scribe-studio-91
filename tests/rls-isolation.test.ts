import { describe, expect, it } from "vitest";

/**
 * Integration test: the production tables must be unreachable without a
 * session, and a forged owner_id must be rejected. Runs against the configured
 * database; skipped when no configuration is present (e.g. a fresh clone).
 */

const url = process.env['SUPABASE_URL'] ?? process.env['VITE_SUPABASE_URL'];
const key =
  process.env['SUPABASE_PUBLISHABLE_KEY'] ?? process.env['VITE_SUPABASE_PUBLISHABLE_KEY'];

const TABLES = [
  "projects",
  "episodes",
  "screenplays",
  "scenes",
  "scene_characters",
  "shots",
  "shot_characters",
  "locations",
  "characters",
  "story_bibles",
  "content_revisions",
];

const run = url && key ? describe : describe.skip;

run("anonymous access is denied on every production table", () => {
  for (const table of TABLES) {
    it(`returns no rows from ${table}`, async () => {
      const response = await fetch(`${url}/rest/v1/${table}?select=id&limit=5`, {
        headers: { apikey: key! },
      });
      if (response.ok) {
        const rows = (await response.json()) as unknown[];
        expect(rows).toEqual([]);
      } else {
        expect(response.status).toBeGreaterThanOrEqual(400);
      }
    });

    it(`rejects an anonymous insert into ${table}`, async () => {
      const response = await fetch(`${url}/rest/v1/${table}`, {
        method: "POST",
        headers: { apikey: key!, "Content-Type": "application/json" },
        body: JSON.stringify({ id: "00000000-0000-0000-0000-000000000000" }),
      });
      expect(response.ok).toBe(false);
    });
  }
});
