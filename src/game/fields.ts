import type { Craft, MatchState } from "./types";

/** Asteroid terrain sits on this grid. A cell is map, not an object. */
export const FIELD_CELL = 34;
/** Plenty of belts and walls. Old circle objects capped at 8. */
export const MAX_ROCKS = 4800;
const CLEAR_PER = 0.028;

export type RockBrush = {
  shape: "bar" | "ring";
  erase: boolean;
  /** Cells across the bar, or the ring's thickness. */
  thick: number;
  /** Bar length in cells, or ring radius in cells. */
  span: number;
  /** How tightly rocks are packed into each cell. 3 matches the old fields. */
  pack: number;
};

/** Sparse to packed. Omitted on a saved cell means the middle value. */
export const ROCK_PACK_MIN = 1;
export const ROCK_PACK_MAX = 5;
export const ROCK_PACK = 3;

export type FieldBand = "open" | "thin" | "thick";

export type FieldSurvey = {
  band: FieldBand;
  keep: number;
  /** Rock cells this flight crosses. */
  fieldIds: string[];
};

export function rockKey(ix: number, iy: number) {
  return `${ix}:${iy}`;
}

export function parseRock(key: string): { ix: number; iy: number; pack: number } | null {
  const match = /^(-?\d+):(-?\d+)(?::([1-5]))?$/.exec(key);
  if (!match) return null;
  const ix = Number(match[1]);
  const iy = Number(match[2]);
  const pack = match[3] ? Number(match[3]) : ROCK_PACK;
  if (!Number.isFinite(ix) || !Number.isFinite(iy)) return null;
  return { ix, iy, pack };
}

export function encodeRock(ix: number, iy: number, pack = ROCK_PACK) {
  const id = rockKey(ix, iy);
  const p = clampInt(pack, ROCK_PACK_MIN, ROCK_PACK_MAX);
  return p === ROCK_PACK ? id : `${id}:${p}`;
}

function clampInt(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function unit(n: number) {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export function snapRockPoint(x: number, y: number) {
  return {
    x: (Math.floor(x / FIELD_CELL) + 0.5) * FIELD_CELL,
    y: (Math.floor(y / FIELD_CELL) + 0.5) * FIELD_CELL,
  };
}

export function snapAngle(rad: number) {
  const step = Math.PI / 4;
  return Math.round(rad / step) * step;
}

function cellIndex(x: number, y: number) {
  return { ix: Math.floor(x / FIELD_CELL), iy: Math.floor(y / FIELD_CELL) };
}

/** Eight-way step so a snapped bar stays on the cell grid. */
function stepDir(rad: number) {
  const a = snapAngle(rad);
  let ix = Math.round(Math.cos(a));
  let iy = Math.round(Math.sin(a));
  if (!ix && !iy) ix = 1;
  return { ix, iy };
}

/**
 * `length` cells along the step, `thick` cells across.
 * A diagonal also fills the corner beside each step so a flight cannot slip through.
 */
function gridBar(ix: number, iy: number, dix: number, diy: number, length: number, thick: number) {
  const t0 = -Math.floor((thick - 1) / 2);
  const px = -diy;
  const py = dix;
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (x: number, y: number) => {
    const key = rockKey(x, y);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(key);
  };
  const n = Math.max(1, length);
  for (let i = 0; i < n; i++) {
    for (let t = 0; t < thick; t++) {
      const x = ix + dix * i + px * (t0 + t);
      const y = iy + diy * i + py * (t0 + t);
      add(x, y);
      if (dix && diy) add(x + dix, y);
    }
  }
  return out;
}

/** Cells a straight bar covers. `thick` is the full width in cells. Used when snap is off. */
export function barCells(x0: number, y0: number, x1: number, y1: number, thick: number): string[] {
  const width = Math.max(1, thick) * FIELD_CELL;
  const half = width / 2;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  const ux = len < 0.001 ? 1 : dx / len;
  const uy = len < 0.001 ? 0 : dy / len;
  const px = -uy;
  const py = ux;
  const minX = Math.floor((Math.min(x0, x1) - half) / FIELD_CELL) - 1;
  const maxX = Math.floor((Math.max(x0, x1) + half) / FIELD_CELL) + 1;
  const minY = Math.floor((Math.min(y0, y1) - half) / FIELD_CELL) - 1;
  const maxY = Math.floor((Math.max(y0, y1) + half) / FIELD_CELL) + 1;
  const out: string[] = [];
  for (let ix = minX; ix <= maxX; ix++) {
    for (let iy = minY; iy <= maxY; iy++) {
      const cx = (ix + 0.5) * FIELD_CELL;
      const cy = (iy + 0.5) * FIELD_CELL;
      const vx = cx - x0;
      const vy = cy - y0;
      const along = vx * ux + vy * uy;
      const side = Math.abs(vx * px + vy * py);
      if (along >= -half * 0.2 && along <= len + half * 0.2 && side <= half) out.push(rockKey(ix, iy));
    }
  }
  return out;
}

/** Cells in a ring. `radius` is the midline, in cells. */
export function ringCells(cx: number, cy: number, radius: number, thick: number): string[] {
  const mid = Math.max(1, radius) * FIELD_CELL;
  const half = (Math.max(1, thick) * FIELD_CELL) / 2;
  const inner = Math.max(0, mid - half);
  const outer = mid + half;
  const minX = Math.floor((cx - outer) / FIELD_CELL) - 1;
  const maxX = Math.floor((cx + outer) / FIELD_CELL) + 1;
  const minY = Math.floor((cy - outer) / FIELD_CELL) - 1;
  const maxY = Math.floor((cy + outer) / FIELD_CELL) + 1;
  const out: string[] = [];
  for (let ix = minX; ix <= maxX; ix++) {
    for (let iy = minY; iy <= maxY; iy++) {
      const x = (ix + 0.5) * FIELD_CELL;
      const y = (iy + 0.5) * FIELD_CELL;
      const d = Math.hypot(x - cx, y - cy);
      if (d >= inner && d <= outer) out.push(rockKey(ix, iy));
    }
  }
  return out;
}

/** Old circle fields become terrain so a map already painted is not thrown away. */
export function legacyCircleRocks(x: number, y: number, r: number): string[] {
  const rad = Math.max(FIELD_CELL, Math.min(900, r));
  const out: string[] = [];
  const minX = Math.floor((x - rad) / FIELD_CELL);
  const maxX = Math.floor((x + rad) / FIELD_CELL);
  const minY = Math.floor((y - rad) / FIELD_CELL);
  const maxY = Math.floor((y + rad) / FIELD_CELL);
  for (let ix = minX; ix <= maxX; ix++) {
    for (let iy = minY; iy <= maxY; iy++) {
      const cx = (ix + 0.5) * FIELD_CELL;
      const cy = (iy + 0.5) * FIELD_CELL;
      if (Math.hypot(cx - x, cy - y) <= rad) out.push(rockKey(ix, iy));
    }
  }
  return out;
}

export function brushCells(
  brush: RockBrush,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  moved: boolean,
  snap: boolean,
  magnet: { x: number; y: number } | null,
): string[] {
  const thick = clampInt(brush.thick, 1, 8);
  const pack = clampInt(brush.pack ?? ROCK_PACK, ROCK_PACK_MIN, ROCK_PACK_MAX);
  const stamp = (keys: string[]) => keys.map((key) => {
    const rock = parseRock(key);
    return rock ? encodeRock(rock.ix, rock.iy, pack) : key;
  });
  if (brush.shape === "ring") {
    const span = clampInt(brush.span, 2, 48);
    const center = magnet ?? (snap ? snapRockPoint(x0, y0) : { x: x0, y: y0 });
    let radius = span;
    if (moved) {
      const d = Math.hypot(x1 - center.x, y1 - center.y);
      radius = clampInt(d / FIELD_CELL, 2, 48);
    }
    return stamp(ringCells(center.x, center.y, radius, thick));
  }
  const span = clampInt(brush.span, 1, 64);
  if (!moved) {
    const c = cellIndex(x0, y0);
    const back = Math.floor((span - 1) / 2);
    return stamp(gridBar(c.ix - back, c.iy, 1, 0, span, thick));
  }
  if (snap) {
    const start = cellIndex(x0, y0);
    const origin = snapRockPoint(x0, y0);
    const dir = stepDir(Math.atan2(y1 - origin.y, x1 - origin.x));
    const dist = Math.hypot(x1 - origin.x, y1 - origin.y);
    const length = Math.max(span, Math.min(160, Math.round(dist / FIELD_CELL)));
    return stamp(gridBar(start.ix, start.iy, dir.ix, dir.iy, length, thick));
  }
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const len = Math.max(span * FIELD_CELL, dist);
  const ux = dist < 0.001 ? 1 : (x1 - x0) / dist;
  const uy = dist < 0.001 ? 0 : (y1 - y0) / dist;
  return stamp(barCells(x0, y0, x0 + ux * len, y0 + uy * len, thick));
}

export function applyRocks(have: string[], stamp: string[], erase: boolean): string[] {
  const index = rockIndex(have);
  if (erase) {
    for (const key of stamp) {
      const rock = parseRock(key);
      if (rock) index.delete(rockKey(rock.ix, rock.iy));
    }
    return rocksFromIndex(index);
  }
  for (const key of stamp) {
    const rock = parseRock(key);
    if (!rock) continue;
    const id = rockKey(rock.ix, rock.iy);
    if (!index.has(id) && index.size >= MAX_ROCKS) break;
    index.set(id, rock.pack);
  }
  return rocksFromIndex(index);
}

/** Cell id to pack. A missing suffix is the middle density. */
export function rockIndex(keys: string[] | undefined) {
  const index = new Map<string, number>();
  for (const key of keys ?? []) {
    const rock = parseRock(key);
    if (!rock) continue;
    index.set(rockKey(rock.ix, rock.iy), rock.pack);
  }
  return index;
}

export function rocksFromIndex(index: Map<string, number>) {
  const out: string[] = [];
  for (const [id, pack] of index) out.push(pack === ROCK_PACK ? id : `${id}:${pack}`);
  return out;
}

export function rockSet(keys: string[] | undefined) {
  return new Set(rockIndex(keys).keys());
}

/** Edge cells leak. A thick patch is nearly solid. Pack 3 is the original curve. */
export function rockDensity(wear: Record<string, number> | undefined, rocks: Map<string, number>, ix: number, iy: number) {
  const key = rockKey(ix, iy);
  const pack = rocks.get(key);
  if (pack == null) return 0;
  if (wear && key in wear) return wear[key];
  let n = 0;
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      if (!ox && !oy) continue;
      if (rocks.has(rockKey(ix + ox, iy + oy))) n += 1;
    }
  }
  const base = 0.28 + 0.72 * (n / 8);
  return Math.min(1, base * (pack / ROCK_PACK));
}

function bandOf(worst: number): FieldBand {
  return worst < 0.22 ? "open" : worst < 0.55 ? "thin" : "thick";
}

function rocksOf(match: MatchState) {
  return rockIndex(match.sourceMap?.rocks);
}

/** How a straight flight would fare. Does not dig. */
export function surveyFlight(
  match: MatchState,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  _time: number,
): FieldSurvey | null {
  const rocks = rocksOf(match);
  if (!rocks.size) return null;
  const wear = match.fieldWear ?? {};
  let worst = 0;
  let seen = 0;
  const ids = new Set<string>();
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (FIELD_CELL * 0.5)));
  for (let s = 0; s <= steps; s++) {
    const x = x0 + ((x1 - x0) * s) / steps;
    const y = y0 + ((y1 - y0) * s) / steps;
    const ix = Math.floor(x / FIELD_CELL);
    const iy = Math.floor(y / FIELD_CELL);
    const density = rockDensity(wear, rocks, ix, iy);
    if (density <= 0.04) continue;
    worst = Math.max(worst, density);
    seen += 1;
    ids.add(rockKey(ix, iy));
  }
  if (!seen) return null;
  return { band: bandOf(worst), keep: Math.max(0.18, 1 - worst * 0.7), fieldIds: [...ids] };
}

export function enemyInFields(match: MatchState, owner: number, fieldIds: string[], _time: number) {
  if (!fieldIds.length) return false;
  const want = new Set(fieldIds);
  const rocks = rocksOf(match);
  const wear = match.fieldWear ?? {};
  for (const c of match.crafts ?? []) {
    if (c.owner === owner || c.payload < 1 || c.hold) continue;
    const ix = Math.floor(c.x / FIELD_CELL);
    const iy = Math.floor(c.y / FIELD_CELL);
    const key = rockKey(ix, iy);
    if (!want.has(key)) continue;
    if (rockDensity(wear, rocks, ix, iy) > 0.2) return true;
  }
  return false;
}

/** Traveling satellites only. Orbiting ones never call this. */
export function chewCraft(match: MatchState, c: Craft, x0: number, y0: number, _time: number) {
  const rocks = rocksOf(match);
  if (!rocks.size || c.payload < 1 || c.hold) return;
  const moved = Math.hypot(c.x - x0, c.y - y0);
  if (moved < 0.8) return;
  if (!match.fieldWear) match.fieldWear = {};
  const wear = match.fieldWear;
  const steps = Math.max(1, Math.ceil(moved / (FIELD_CELL * 0.5)));
  let worst = 0;
  let entered = 0;
  let lost = 0;
  const seen = new Set((c.dug ?? "").split("|").filter(Boolean));
  const first = seen.size === 0;
  const start = Math.floor(c.payload);
  for (let s = 1; s <= steps; s++) {
    const x = x0 + ((c.x - x0) * s) / steps;
    const y = y0 + ((c.y - y0) * s) / steps;
    const ix = Math.floor(x / FIELD_CELL);
    const iy = Math.floor(y / FIELD_CELL);
    const key = rockKey(ix, iy);
    if (seen.has(key)) continue;
    const density = rockDensity(wear, rocks, ix, iy);
    if (density <= 0.04) continue;
    seen.add(key);
    const payload = Math.floor(c.payload);
    if (payload < 1) break;
    const pack = rocks.get(key) ?? ROCK_PACK;
    const kill = density * 0.7 * (0.65 + (pack / ROCK_PACK) * 0.35);
    let drop = 0;
    for (let n = 0; n < payload; n++) {
      if (unit(c.id * 13.1 + ix * 17 + iy * 31 + n * 7.3) < kill) drop += 1;
    }
    if (payload > 1) drop = Math.min(drop, payload - 1);
    c.payload -= drop;
    wear[key] = Math.max(0, density - payload * CLEAR_PER * (ROCK_PACK / pack));
    entered += payload;
    lost += drop;
    worst = Math.max(worst, density);
  }
  c.dug = [...seen].slice(-80).join("|");
  if (!entered) return;
  const band = bandOf(worst);
  const note = match.fieldNotes?.[c.owner] ?? { band, entered: 0, lost: 0 };
  const rank = { open: 0, thin: 1, thick: 2 };
  note.band = rank[band] > rank[note.band] ? band : note.band;
  if (first) note.entered += start;
  note.lost += lost;
  match.fieldNotes = { ...match.fieldNotes, [c.owner]: note };
}

export function rockSpeck(ix: number, iy: number, density: number, pack = ROCK_PACK) {
  const specks: { x: number; y: number; s: number; rot: number; sides: number; tone: number; squash: number }[] = [];
  const n = Math.min(7, pack + (density > 0.65 ? 2 : 1));
  for (let k = 0; k < n; k++) {
    const jx = unit(ix * 9.2 + iy * 3.1 + k * 4.7);
    const jy = unit(iy * 8.4 + ix * 2.2 + k * 6.1);
    specks.push({
      x: (ix + jx) * FIELD_CELL,
      y: (iy + jy) * FIELD_CELL,
      s: 3.2 + pack * 0.75 + density * 1.1,
      rot: unit(ix * 2.7 + iy * 5.1 + k * 8.3) * Math.PI * 2,
      sides: 5 + Math.floor(unit(ix * 4.4 + iy + k * 6.6) * 3),
      tone: unit(ix * 7.1 + iy * 2.8 + k * 3.4),
      squash: 0.62 + unit(iy * 6.2 + ix + k * 9.5) * 0.38,
    });
  }
  return specks;
}
