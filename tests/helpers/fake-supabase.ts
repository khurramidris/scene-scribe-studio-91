import { vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6y0sAAAAASUVORK5CYII=";
export const pngBytes = () => Uint8Array.from(atob(PNG_BASE64), (c) => c.charCodeAt(0));
export const png = () => new Blob([pngBytes()], { type: "image/png" });
type Row = Record<string, unknown>;

/** Query filters operate on rows, rather than returning the same canned value for every read. */
export function fakeSupabase(
  initial: Record<string, Row[]> = {},
  files: Record<string, Blob> = {},
) {
  const rows = structuredClone(initial);
  const download = vi.fn(async (path: string) => ({
    data: files[path] ?? null,
    error: files[path] ? null : { message: "Not found" },
  }));
  const upload = vi.fn(
    async (path: string, bytes: Blob | Uint8Array, options: { contentType: string }) => {
      files[path] =
        bytes instanceof Blob ? bytes : new Blob([bytes], { type: options.contentType });
      return { data: { path }, error: null };
    },
  );
  const remove = vi.fn(async () => ({ error: null }));
  const storage = { from: vi.fn(() => ({ download, upload, remove })) };
  const from = vi.fn((table: string) => {
    const filters: ((row: Row) => boolean)[] = [];
    let patch: Row | undefined;
    let inserted: Row[] | undefined;
    const result = () => {
      const items = (rows[table] ?? []).filter((row) => filters.every((filter) => filter(row)));
      if (patch) items.forEach((row) => Object.assign(row, patch));
      if (inserted) {
        rows[table] = [...(rows[table] ?? []), ...inserted];
        const data = inserted;
        inserted = undefined;
        return { data, error: null, count: data.length };
      }
      return { data: items, error: null, count: items.length };
    };
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn((key: string, value: unknown) => {
        filters.push((row) => row[key] === value);
        return query;
      }),
      in: vi.fn((key: string, values: unknown[]) => {
        filters.push((row) => values.includes(row[key]));
        return query;
      }),
      update: vi.fn((value: Row) => {
        patch = value;
        return query;
      }),
      insert: vi.fn((value: Row | Row[]) => {
        inserted = (Array.isArray(value) ? value : [value]).map((row) => ({
          id: crypto.randomUUID(),
          ...row,
        }));
        return query;
      }),
      maybeSingle: vi.fn(async () => {
        const r = result();
        return { ...r, data: r.data[0] ?? null };
      }),
      single: vi.fn(async () => {
        const r = result();
        return { ...r, data: r.data[0] ?? null };
      }),
      then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
        Promise.resolve(result()).then(resolve, reject),
    };
    return query;
  });
  const client = { from, storage } as unknown as SupabaseClient<Database>;
  return { client, rows, files, from, storage, download, upload, remove };
}
