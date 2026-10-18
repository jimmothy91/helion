import { z } from "zod";

const FILE = "data/loss-reports.json";

export const Report = z.object({
  id: z.string().regex(/^[a-f0-9]{8}$/),
  build: z.string().min(1).max(40),
  bot: z.string().min(1).max(40),
  map: z.string().min(1).max(80),
  card: z.string().min(2).max(4000),
});

export type ReportRow = z.infer<typeof Report> & { createdAt: string };

/** Query string required to read the published cards. Not a player secret. */
export const REPORT_KEY = "helion-reports";

function stamp(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return typeof value === "string" && value ? value : new Date().toISOString();
}

async function readFileRows(): Promise<ReportRow[]> {
  try {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const raw = readFileSync(join(process.cwd(), FILE), "utf8");
    const parsed = JSON.parse(raw) as ReportRow[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeFileRows(rows: ReportRow[]): Promise<void> {
  const { writeFileSync, mkdirSync, renameSync } = await import("node:fs");
  const { dirname, join } = await import("node:path");
  const path = join(process.cwd(), FILE);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(rows));
  renameSync(tmp, path);
}

async function readDbRows(): Promise<ReportRow[]> {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const rows = await sql<{ id: string; build: string; bot: string; map: string; card: string; createdAt: unknown }>`
    select id, build, bot, map, card, created_at as "createdAt" from loss_reports order by created_at`;
  return rows.map((row) => ({ ...row, createdAt: stamp(row.createdAt) }));
}

async function writeDb(row: ReportRow): Promise<void> {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  await sql`insert into loss_reports (id, build, bot, map, card)
    values (${row.id}, ${row.build}, ${row.bot}, ${row.map}, ${row.card})
    on conflict (id) do nothing`;
}

function merge(fileRows: ReportRow[], dbRows: ReportRow[]): ReportRow[] {
  const byId = new Map<string, ReportRow>();
  for (const row of fileRows) byId.set(row.id, row);
  for (const row of dbRows) byId.set(row.id, row);
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function readReports(): Promise<ReportRow[]> {
  const fileRows = await readFileRows();
  try {
    return merge(fileRows, await readDbRows());
  } catch {
    return fileRows;
  }
}

export async function saveReports(reports: z.infer<typeof Report>[]): Promise<{ ok: true; kept: number }> {
  const rows = await readReports();
  const seen = new Set(rows.map((row) => row.id));
  let kept = 0;
  let stored = false;
  for (const report of reports) {
    if (seen.has(report.id)) {
      stored = true;
      continue;
    }
    const row: ReportRow = { ...report, createdAt: new Date().toISOString() };
    try {
      await writeDb(row);
      stored = true;
    } catch {
      /* the published database is the copy players reach; the file is the preview copy */
    }
    rows.push(row);
    seen.add(row.id);
    kept += 1;
  }
  let filed = false;
  if (kept > 0) {
    try {
      await writeFileRows(rows);
      filed = true;
    } catch {
      /* a published server cannot keep this file; the database row is enough */
    }
  }
  if (kept > 0 && !stored && !filed) {
    throw new Error("The report could not be stored.");
  }
  return { ok: true, kept };
}
