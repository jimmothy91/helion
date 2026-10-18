import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Id = z.string().regex(/^[a-zA-Z0-9_-]{4,80}$/);
const FILE = "data/helion-library.json";

function worldsIn(payload: string): number {
  try {
    const parsed = JSON.parse(payload) as { categories?: { maps?: { worlds?: unknown[] }[] }[] };
    const categories = Array.isArray(parsed?.categories) ? parsed.categories : [];
    return categories.reduce((n, cat) => n + (cat.maps ?? []).reduce((m, map) => m + (map.worlds?.length ?? 0), 0), 0);
  } catch {
    return 0;
  }
}

function stampOf(payload: string): number {
  try {
    const parsed = JSON.parse(payload) as { savedAt?: number };
    return typeof parsed.savedAt === "number" ? parsed.savedAt : 0;
  } catch {
    return 0;
  }
}

function richer(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  const aw = worldsIn(a);
  const bw = worldsIn(b);
  if (aw === 0) return bw > 0 ? b : a;
  if (bw === 0) return a;
  const as = stampOf(a);
  const bs = stampOf(b);
  if (as !== bs) return as > bs ? a : b;
  return aw >= bw ? a : b;
}

async function readFilePayload(id: string): Promise<string | null> {
  try {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const raw = readFileSync(join(process.cwd(), FILE), "utf8");
    const all = JSON.parse(raw) as Record<string, string>;
    return typeof all[id] === "string" ? all[id] : null;
  } catch {
    return null;
  }
}

async function writeFilePayload(id: string, payload: string): Promise<void> {
  const { readFileSync, writeFileSync, mkdirSync, renameSync } = await import("node:fs");
  const { dirname, join } = await import("node:path");
  const path = join(process.cwd(), FILE);
  let all: Record<string, string> = {};
  try {
    all = JSON.parse(readFileSync(path, "utf8")) as Record<string, string>;
  } catch {
    all = {};
  }
  const prev = all[id];
  if (prev === payload) return;
  if (prev && worldsIn(payload) === 0 && worldsIn(prev) > 0) return;
  all[id] = payload;
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(all));
  renameSync(tmp, path);
  if (id === "helion") {
    try {
      const shipped = join(process.cwd(), "data/shipped-library.json");
      writeFileSync(shipped, all[id]);
    } catch {
      /* the preview copy in data/ is enough */
    }
  }
}

async function readDbPayload(id: string): Promise<string | null> {
  try {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<{ payload: string }>`select payload from map_library where id = ${id}`;
    return rows[0]?.payload ?? null;
  } catch {
    return null;
  }
}

async function writeDbPayload(id: string, payload: string): Promise<void> {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  await sql`insert into map_library (id, payload, updated_at) values (${id}, ${payload}, now())
    on conflict (id) do update set payload = excluded.payload, updated_at = now()`;
}

export const fetchMapLibrary = createServerFn({ method: "POST" })
  .validator(z.object({ id: Id }))
  .handler(async ({ data }): Promise<string | null> => {
    return richer(await readFilePayload(data.id), await readDbPayload(data.id));
  });

export const putMapLibrary = createServerFn({ method: "POST" })
  .validator(z.object({ id: Id, payload: z.string().min(2).max(400_000) }))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await writeFilePayload(data.id, data.payload);
    const kept = richer(await readFilePayload(data.id), data.payload);
    if (kept) {
      try {
        await writeDbPayload(data.id, kept);
      } catch {
        /* the file copy is enough in the preview */
      }
    }
    return { ok: true };
  });
