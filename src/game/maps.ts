import {
  AI_FACTIONS,
  DEFAULT_LOCK_S,
  ELLIPSE,
  HUSK_KIND,
  MAX_PLANETS,
  PLAYER_FACTION,
  TEMPLATES,
  planetLevelSize,
  planetName,
  freshPlanet,
} from "./catalog";
import type { Cohort, Faction, PlanetDef, PlanetLevel, SetupConfig, Skill } from "./types";
import { NEUTRAL_ID, PLAYER_ID } from "./types";
import { MAX_ROCKS, legacyCircleRocks, parseRock, rockKey, rocksFromIndex } from "./fields";

export const MAPS_KEY = "helion.maps.v1";
export const LIBRARY_KEY = "helion.library.v1";
export const LIBRARY_BACKUP_KEY = "helion.library.v1.bak";
const LIBRARY_SESSION_KEY = "helion.library.v1.session";
export const MAX_MAPS = 12;
export const MAX_CATEGORIES = 12;
export const MIN_ORBIT = 88;

export type MapWorld = {
  id: string;
  name: string;
  template: number;
  x: number;
  y: number;
  still: boolean;
  ox: number;
  oy: number;
  owner: number;
  level: PlanetLevel;
  /** Satellites present when the match starts. */
  start: number;
  /** Forges this many per second at level 1. */
  rate: number;
  /** Satellites to break it at level 1. */
  health: number;
  /** Satellites to rise from level 1. */
  rise: number;
  /** Satellites to claim it once it is empty. */
  claim: number;
  /** Seconds a Husk stays sealed after it is lost. */
  cooldown?: number;
  /** Orbit speed relative to the world's usual pace. 1 is normal. */
  spin: number;
  /** Vertical stretch of the orbit. 1 is a circle. */
  flat?: number;
  /** Rotation of the orbit ellipse, in radians. */
  tilt?: number;
};

export const SUN_SELECT = "sun:";
export const MAX_SUNS = 5;
export const MAX_SUN_SCALE = 3.75;

export type MapSun = { id: string; x: number; y: number; scale: number };

/** Objects held together on a map. Not a saved group. */
export type MapLock = {
  id: string;
  worldIds: string[];
  sunIds: string[];
  orbit: boolean;
  ox: number;
  oy: number;
  spin: number;
  /** Spin the whole cluster around a center while the map plays. */
  turn: boolean;
  cx: number;
  cy: number;
  /** 1 is a full turn about every 8 seconds. Negative turns the other way. */
  pspin: number;
};

export type GroupAnchor = { kind: "world" | "sun"; index: number };

/** A selection remembered relative to its own center, so it can be stamped again. */
export type RememberWorld = {
  name: string;
  template: number;
  dx: number;
  dy: number;
  relOx: number;
  relOy: number;
  anchor: GroupAnchor | null;
  still: boolean;
  owner: number;
  level: PlanetLevel;
  start: number;
  rate: number;
  health: number;
  rise: number;
  claim: number;
  cooldown?: number;
  spin: number;
  flat?: number;
  tilt?: number;
};

export type RememberSun = { dx: number; dy: number; scale: number };

export type RememberGroup = {
  id: string;
  name: string;
  worlds: RememberWorld[];
  suns: RememberSun[];
};

export const GROUPS_KEY = "helion.groups.v1";
export const MAX_GROUPS = 24;

export function sunKey(id: string) {
  return `${SUN_SELECT}${id}`;
}

export function sunIdFromKey(key: string | null): string | null {
  if (!key?.startsWith(SUN_SELECT)) return null;
  return key.slice(SUN_SELECT.length) || null;
}

let sunSeq = 1;
export function newSunId(): string {
  sunSeq += 1;
  return `s${Date.now().toString(36)}${sunSeq}`;
}

export type CustomMap = {
  id: string;
  name: string;
  skill: Skill;
  worlds: MapWorld[];
  /** Placed stars, at most five. Omitted maps have none. */
  suns?: MapSun[];
  /** Painted asteroid cells, "ix:iy" on the rock grid. Omitted maps have none. */
  rocks?: string[];
  /** Clusters locked together. Omitted maps have none. */
  locks?: MapLock[];
};

export type MapCategory = {
  id: string;
  name: string;
  maps: CustomMap[];
};

const SKILLS: Skill[] = ["cautious", "even", "relentless"];

let worldSeq = 1;

export function newWorldId(): string {
  worldSeq += 1;
  return `w${Date.now().toString(36)}${worldSeq}`;
}

export function defaultWorldStats(owner: number): Pick<MapWorld, "start" | "rate" | "health" | "rise" | "claim" | "spin"> {
  return {
    start: owner === PLAYER_ID ? 48 : owner > 0 ? 36 : 0,
    rate: 8,
    health: 200,
    rise: 200,
    claim: 200,
    spin: 1,
  };
}

export function snapFormation(
  x: number,
  y: number,
  others: { x: number; y: number }[],
  reach = 36,
): {
  x: number;
  y: number;
  kind: "axis" | "angle" | "grid" | null;
  nx?: number;
  ny?: number;
  lock?: "x" | "y" | "both";
} {
  const grid = 56;
  const closest = (value: number, marks: number[]) => {
    let best: number | null = null;
    let gap = reach + 1;
    for (const mark of marks) {
      const d = Math.abs(mark - value);
      if (d <= reach && d < gap) {
        gap = d;
        best = mark;
      }
    }
    return best;
  };
  const onGrid = (value: number) => {
    const g = Math.round(value / grid) * grid;
    return Math.abs(g - value) <= reach ? g : null;
  };
  const matchSpan = (anchor: number, free: number, spans: number[]) => {
    const sign = Math.sign(free - anchor) || 1;
    let best = free;
    let gap = reach + 1;
    for (const span of spans) {
      if (span <= 12) continue;
      const candidate = anchor + sign * span;
      const d = Math.abs(candidate - free);
      if (d <= reach && d < gap) {
        gap = d;
        best = candidate;
      }
    }
    return best;
  };

  if (!others.length) {
    const gx = onGrid(x);
    const gy = onGrid(y);
    const sx = gx ?? x;
    const sy = gy ?? y;
    const lock = gx != null && gy != null ? "both" : gx != null ? "x" : gy != null ? "y" : undefined;
    return { x: sx, y: sy, kind: sx !== x || sy !== y ? "grid" : null, lock };
  }

  const hitX0 = closest(x, others.map((o) => o.x));
  const hitY0 = closest(y, others.map((o) => o.y));
  let hitX = hitX0;
  let hitY = hitY0;
  if (hitX != null && hitY != null) {
    const lockX = hitX;
    const lockY = hitY;
    const stacked = others.some((o) => Math.abs(o.x - lockX) < 0.5 && Math.abs(o.y - lockY) < 0.5);
    if (stacked) {
      if (Math.abs(x - hitX) <= Math.abs(y - hitY)) hitY = null;
      else hitX = null;
    }
  }
  const spans: number[] = [];
  for (let i = 0; i < others.length; i++) {
    for (let j = i + 1; j < others.length; j++) {
      spans.push(Math.hypot(others[i].x - others[j].x, others[i].y - others[j].y));
    }
  }

  if (hitX != null || hitY != null) {
    const sx = hitX ?? x;
    const sy = hitY ?? y;
    let x3 = sx;
    let y3 = sy;
    if (hitX != null && hitY == null) {
      const anchor = others
        .filter((o) => Math.abs(o.x - sx) < 0.5)
        .sort((a, b) => Math.abs(a.y - y) - Math.abs(b.y - y))[0];
      if (anchor) {
        const edges = spans.slice();
        for (const o of others) {
          if (o === anchor) continue;
          edges.push(Math.hypot(o.x - anchor.x, o.y - anchor.y));
        }
        y3 = matchSpan(anchor.y, y, edges);
      }
    } else if (hitY != null && hitX == null) {
      const anchor = others
        .filter((o) => Math.abs(o.y - sy) < 0.5)
        .sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x))[0];
      if (anchor) {
        const edges = spans.slice();
        for (const o of others) {
          if (o === anchor) continue;
          edges.push(Math.hypot(o.x - anchor.x, o.y - anchor.y));
        }
        x3 = matchSpan(anchor.x, x, edges);
      }
    }
    const lock = hitX != null && hitY != null ? "both" : hitX != null ? "x" : "y";
    return { x: x3, y: y3, kind: "axis", lock };
  }

  let near = others[0];
  let nd = Infinity;
  for (const o of others) {
    const d = Math.hypot(x - o.x, y - o.y);
    if (d > 12 && d < nd) {
      nd = d;
      near = o;
    }
  }
  if (Number.isFinite(nd)) {
    const ang = Math.atan2(y - near.y, x - near.x);
    const steps = [0, 45, 60, 90, 120, 135, 180, 225, 240, 270, 300, 315].map((d) => (d * Math.PI) / 180);
    let bestA = ang;
    let ad = 0.26;
    for (const step of steps) {
      const alt = Math.abs(Math.atan2(Math.sin(ang - step), Math.cos(ang - step)));
      if (alt < ad) {
        ad = alt;
        bestA = step;
      }
    }
    let length = nd;
    let snappedLen = false;
    let gap = reach + 1;
    const edges = spans.slice();
    for (const o of others) edges.push(Math.hypot(o.x - near.x, o.y - near.y));
    for (const span of edges) {
      if (span <= 12) continue;
      const d = Math.abs(span - nd);
      if (d <= reach && d < gap) {
        gap = d;
        length = span;
        snappedLen = true;
      }
    }
    if (bestA !== ang || snappedLen) {
      return {
        x: near.x + Math.cos(bestA) * length,
        y: near.y + Math.sin(bestA) * length,
        kind: "angle",
        nx: near.x,
        ny: near.y,
      };
    }
  }

  const gx = onGrid(x);
  const gy = onGrid(y);
  if (gx != null || gy != null) {
    const sx = gx ?? x;
    const sy = gy ?? y;
    const lock = gx != null && gy != null ? "both" : gx != null ? "x" : "y";
    return { x: sx, y: sy, kind: "grid", lock };
  }
  return { x, y, kind: null };
}

export function createMap(n: number): CustomMap {
  return {
    id: `map-${Date.now().toString(36)}-${n}`,
    name: `Map ${n}`,
    skill: "even",
    worlds: [],
  };
}

export function createCategory(n: number): MapCategory {
  return {
    id: `cat-${Date.now().toString(36)}-${n}`,
    name: `Category ${n}`,
    maps: [createMap(1)],
  };
}

export function sideLabel(owner: number): string {
  if (owner === NEUTRAL_ID) return "Empty";
  if (owner === PLAYER_ID) return "You";
  return AI_FACTIONS.find((f) => f.id === owner)?.name ?? "Rival";
}

export function sideColor(owner: number): [number, number, number] {
  if (owner === PLAYER_ID) return PLAYER_FACTION.color;
  if (owner === NEUTRAL_ID) return [118, 116, 114];
  return AI_FACTIONS.find((f) => f.id === owner)?.color ?? [118, 116, 114];
}

export function separate(
  x: number,
  y: number,
  ox: number,
  oy: number,
  move: "world" | "point",
  flat = 1,
  tilt = 0,
): { x: number; y: number; ox: number; oy: number } {
  const squash = Math.max(0, Math.min(8, flat));
  const c = Math.cos(tilt);
  const s = Math.sin(tilt);
  const dx = x - ox;
  const dy = y - oy;
  const lx = c * dx + s * dy;
  const ly = -s * dx + c * dy;
  const toWorld = (localX: number, localY: number) => ({
    x: ox + c * localX - s * localY,
    y: oy + s * localX + c * localY,
  });
  if (squash <= 0.001) {
    const sign = Math.sign(lx) || 1;
    if (move === "world") {
      const dist = Math.max(MIN_ORBIT, Math.abs(lx));
      const next = toWorld(sign * dist, 0);
      return { x: next.x, y: next.y, ox, oy };
    }
    if (Math.abs(lx) >= MIN_ORBIT) {
      const next = toWorld(lx, 0);
      return { x, y, ox: x - (next.x - ox), oy: y - (next.y - oy) };
    }
    const next = toWorld(sign * MIN_ORBIT, 0);
    return { x, y, ox: x - (next.x - ox), oy: y - (next.y - oy) };
  }
  const yScale = ELLIPSE * squash;
  const py = ly / yScale;
  const orbit = Math.hypot(lx, py);
  if (orbit >= MIN_ORBIT) return { x, y, ox, oy };
  const ang = orbit < 0.001 ? Math.PI : Math.atan2(py, lx);
  const next = toWorld(Math.cos(ang) * MIN_ORBIT, Math.sin(ang) * MIN_ORBIT * yScale);
  if (move === "world") return { x: next.x, y: next.y, ox, oy };
  return { x, y, ox: x - (next.x - ox), oy: y - (next.y - oy) };
}

function orbitPose(x: number, y: number, ox: number, oy: number, flat = 1, tilt = 0) {
  const kept = separate(x, y, ox, oy, "point", flat, tilt);
  const dx = kept.x - kept.ox;
  const dy = kept.y - kept.oy;
  const c = Math.cos(tilt);
  const s = Math.sin(tilt);
  const lx = c * dx + s * dy;
  const ly = -s * dx + c * dy;
  if (flat <= 0.001) {
    return {
      ox: kept.ox,
      oy: kept.oy,
      orbit: Math.max(MIN_ORBIT, Math.abs(lx)),
      angle: lx >= 0 ? 0 : Math.PI,
    };
  }
  const py = ly / (ELLIPSE * flat);
  return {
    ox: kept.ox,
    oy: kept.oy,
    orbit: Math.max(MIN_ORBIT, Math.hypot(lx, py)),
    angle: Math.atan2(py, lx),
  };
}

export function clusterCircle(
  worlds: MapWorld[],
  suns: MapSun[],
  worldIds: string[],
  sunIds: string[],
): { x: number; y: number; r: number } {
  const wantW = new Set(worldIds);
  const wantS = new Set(sunIds);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let any = false;
  const span = (x: number, y: number, hx: number, hy: number) => {
    any = true;
    minX = Math.min(minX, x - hx);
    maxX = Math.max(maxX, x + hx);
    minY = Math.min(minY, y - hy);
    maxY = Math.max(maxY, y + hy);
  };
  for (const sun of suns) {
    if (!wantS.has(sun.id)) continue;
    const scale = Math.max(0.45, Math.min(MAX_SUN_SCALE, sun.scale || 1));
    const rad = 18 * scale;
    span(sun.x, sun.y, rad, rad);
  }
  for (const w of worlds) {
    if (!wantW.has(w.id)) continue;
    const body = planetLevelSize(w.level ?? 1);
    if (w.still) {
      span(w.x, w.y, body, body);
      continue;
    }
    const flat = typeof w.flat === "number" && Number.isFinite(w.flat) ? w.flat : 1;
    const tilt = typeof w.tilt === "number" && Number.isFinite(w.tilt) ? w.tilt : 0;
    const pose = orbitPose(w.x, w.y, w.ox, w.oy, flat, tilt);
    const a = pose.orbit;
    const b = a * ELLIPSE * Math.max(0, flat);
    const hx = Math.hypot(a * Math.cos(tilt), b * Math.sin(tilt)) + body;
    const hy = Math.hypot(a * Math.sin(tilt), b * Math.cos(tilt)) + body;
    span(pose.ox, pose.oy, hx, hy);
  }
  if (!any) return { x: 0, y: 0, r: 0 };
  const x = (minX + maxX) / 2;
  const y = (minY + maxY) / 2;
  return { x, y, r: Math.hypot(maxX - minX, maxY - minY) / 2 + 20 };
}

export function turnFor(
  locks: MapLock[] | undefined,
  kind: "world" | "sun",
  id: string,
): { ox: number; oy: number; spin: number } | null {
  if (!locks?.length || !id) return null;
  const lock = locks.find((item) => {
    if (!item.turn) return false;
    if (kind === "world") return item.worldIds.includes(id);
    return item.sunIds.includes(id);
  });
  if (!lock) return null;
  const pace = typeof lock.pspin === "number" && Number.isFinite(lock.pspin) ? lock.pspin : 1;
  return { ox: lock.cx, oy: lock.cy, spin: pace * 0.8 };
}

export function cohortFor(
  locks: MapLock[] | undefined,
  worlds: MapWorld[],
  suns: MapSun[],
  kind: "world" | "sun",
  id: string,
): Cohort | null {
  if (!locks?.length || !id) return null;
  const lock = locks.find((item) => {
    if (!item.orbit) return false;
    if (kind === "world") return item.worldIds.includes(id);
    return item.sunIds.includes(id);
  });
  if (!lock) return null;
  const circle = clusterCircle(worlds, suns, lock.worldIds, lock.sunIds);
  if (circle.r < 1) return null;
  const dx = circle.x - lock.ox;
  const dy = circle.y - lock.oy;
  const radius = Math.hypot(dx, dy);
  if (radius < 1) return null;
  return { ox: lock.ox, oy: lock.oy, angle: Math.atan2(dy, dx), radius, spin: lock.spin || 0.12 };
}

function followOf(w: MapWorld, worlds: MapWorld[], suns: MapSun[], locks?: MapLock[]) {
  if (w.still || !locks?.length) return null;
  const lock = locks.find((item) => item.worldIds.includes(w.id));
  if (!lock) return null;
  let best: { kind: "world" | "sun"; id: string; x: number; y: number; r: number; d: number } | null = null;
  const nearer = (kind: "world" | "sun", id: string, x: number, y: number, r: number) => {
    const d = Math.hypot(w.ox - x, w.oy - y);
    if (d > r) return best;
    if (!best || r < best.r || (r === best.r && d < best.d)) return { kind, id, x, y, r, d };
    return best;
  };
  for (const sun of suns) {
    if (!lock.sunIds.includes(sun.id)) continue;
    const scale = Math.max(0.45, Math.min(MAX_SUN_SCALE, sun.scale || 1));
    best = nearer("sun", sun.id, sun.x, sun.y, 18 * scale);
  }
  for (const other of worlds) {
    if (other.id === w.id || !lock.worldIds.includes(other.id)) continue;
    best = nearer("world", other.id, other.x, other.y, planetLevelSize(other.level ?? 1));
  }
  if (!best) return null;
  return { kind: best.kind, id: best.id, dx: w.ox - best.x, dy: w.oy - best.y };
}

export function defsFromWorlds(worlds: MapWorld[], locks?: MapLock[], suns: MapSun[] = []): PlanetDef[] {
  return worlds.map((w, i) => {
    const tmpl = TEMPLATES[Math.abs(w.template) % TEMPLATES.length];
    const level = (w.level ?? 1) as PlanetLevel;
    const base = {
      ...tmpl,
      id: w.id,
      name: w.name.trim() || planetName(i),
      seed: tmpl.seed + i * 19,
      level,
      size: planetLevelSize(level),
      tuneRate: w.rate ?? 8,
      tuneHealth: w.health ?? 200,
      tuneRise: w.rise ?? 200,
      tuneClaim: w.claim ?? 200,
    };
    const pace = (tmpl.spin || 0.08) * (w.spin ?? 1);
    const flat = typeof w.flat === "number" && Number.isFinite(w.flat) ? w.flat : 1;
    const tilt = typeof w.tilt === "number" && Number.isFinite(w.tilt) ? w.tilt : 0;
    const cooldown = tmpl.kind === HUSK_KIND ? (w.cooldown ?? DEFAULT_LOCK_S) : undefined;
    if (w.still) {
      const cohort = cohortFor(locks, worlds, suns, "world", w.id);
      const whirl = turnFor(locks, "world", w.id);
      return {
        ...base,
        still: true,
        anchorX: w.x,
        anchorY: w.y,
        orbit: 0,
        angle: 0,
        spin: 0,
        flat: 1,
        tilt: 0,
        ...(cooldown != null ? { cooldown } : {}),
        ...(cohort ? { cohort } : {}),
        ...(whirl ? { whirl } : {}),
      };
    }
    const pose = orbitPose(w.x, w.y, w.ox, w.oy, flat, tilt);
    const cohort = cohortFor(locks, worlds, suns, "world", w.id);
    const whirl = turnFor(locks, "world", w.id);
    const follow = followOf(w, worlds, suns, locks);
    return {
      ...base,
      still: false,
      anchorX: pose.ox,
      anchorY: pose.oy,
      orbit: pose.orbit,
      angle: pose.angle,
      spin: pace,
      flat,
      tilt,
      ...(cooldown != null ? { cooldown } : {}),
      ...(cohort ? { cohort } : {}),
      ...(whirl ? { whirl } : {}),
      ...(follow ? { follow } : {}),
    };
  });
}

export function canLaunch(map: CustomMap): boolean {
  const you = map.worlds.some((w) => w.owner === PLAYER_ID);
  const rival = map.worlds.some((w) => w.owner > 0);
  return you && rival;
}

export function compileMap(map: CustomMap): {
  defs: PlanetDef[];
  planets: Record<string, ReturnType<typeof freshPlanet>>;
  factions: Faction[];
  setup: SetupConfig;
} {
  const rivalIds = [...new Set(map.worlds.map((w) => w.owner).filter((id) => id > 0))].sort((a, b) => a - b);
  const factions: Faction[] = [
    PLAYER_FACTION,
    ...rivalIds
      .map((id) => AI_FACTIONS.find((f) => f.id === id))
      .filter((f): f is Faction => Boolean(f)),
  ];
  const defs = defsFromWorlds(map.worlds, map.locks, map.suns ?? []).map((d) => ({
    ...d,
    maxLevel: (d.level ?? 1) as PlanetLevel,
    level: 1 as PlanetLevel,
    size: planetLevelSize(1),
  }));
  const planets: Record<string, ReturnType<typeof freshPlanet>> = {};
  for (const w of map.worlds) {
    const start = Math.max(0, Math.round(w.start ?? defaultWorldStats(w.owner).start));
    if (w.owner === PLAYER_ID) planets[w.id] = freshPlanet(PLAYER_ID, start);
    else if (w.owner > 0 && factions.some((f) => f.id === w.owner)) planets[w.id] = freshPlanet(w.owner, start);
    else planets[w.id] = freshPlanet(NEUTRAL_ID, start);
  }
  const setup: SetupConfig = {
    planetCount: Math.max(1, map.worlds.length),
    aiCount: Math.max(1, factions.length - 1),
    skill: map.skill,
  };
  return { defs, planets, factions, setup };
}

function finite(n: unknown, fallback = 0): number {
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

/** Planets still on the previous defaults pick up the doubled costs. Tuned ones stay. */
function liftEconomy(rate: number, health: number, rise: number, claim: number) {
  if (rate === 2 && health === 100 && rise === 100 && claim === 50) {
    return { rate: 8, health: 200, rise: 200, claim: 200 };
  }
  if (rate === 4 && health === 200 && rise === 200 && claim === 200) {
    return { rate: 8, health, rise, claim };
  }
  return { rate, health, rise, claim };
}

function sanitizeWorld(raw: unknown, index: number): MapWorld | null {
  if (!raw || typeof raw !== "object") return null;
  const w = raw as Partial<MapWorld>;
  if (typeof w.id !== "string" || !w.id) return null;
  const owner = finite(w.owner, NEUTRAL_ID);
  const known = owner === PLAYER_ID || owner === NEUTRAL_ID || AI_FACTIONS.some((f) => f.id === owner);
  const side = known ? owner : NEUTRAL_ID;
  const defaults = defaultWorldStats(side);
  const count = (n: unknown, min: number, max: number, fallback: number) => {
    if (typeof n !== "number" || !Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.round(n)));
  };
  const economy = liftEconomy(
    count(w.rate, 0, 40, defaults.rate),
    count(w.health, 1, 9999, defaults.health),
    count(w.rise, 1, 9999, defaults.rise),
    count(w.claim, 0, 9999, defaults.claim),
  );
  return {
    id: w.id,
    name: typeof w.name === "string" && w.name.trim() ? w.name.slice(0, 18) : planetName(index),
    template: Math.max(0, Math.floor(finite(w.template))),
    x: finite(w.x),
    y: finite(w.y),
    still: w.still !== false,
    ox: finite(w.ox, finite(w.x) - 140),
    oy: finite(w.oy, finite(w.y)),
    owner: side,
    level: w.level === 2 || w.level === 3 || w.level === 4 || w.level === 5 ? w.level : 1,
    start: count(w.start, 0, 999, defaults.start),
    rate: economy.rate,
    health: economy.health,
    rise: economy.rise,
    claim: economy.claim,
    spin: Math.max(-2000, Math.min(2000, Math.round((typeof w.spin === "number" && Number.isFinite(w.spin) ? w.spin : 1) * 100))) / 100,
    flat: count((w.flat ?? 1) * 100, 0, 800, 100) / 100,
    ...(TEMPLATES[Math.abs(Math.floor(finite(w.template))) % TEMPLATES.length]?.kind === HUSK_KIND
      ? { cooldown: count(w.cooldown, 1, 300, DEFAULT_LOCK_S) }
      : {}),
    ...(typeof w.tilt === "number" && Number.isFinite(w.tilt) && Math.abs(w.tilt) > 1e-4
      ? { tilt: Math.atan2(Math.sin(w.tilt), Math.cos(w.tilt)) }
      : {}),
  };
}

function sanitizeMap(raw: unknown, index: number): CustomMap | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Partial<CustomMap>;
  if (typeof m.id !== "string" || !m.id) return null;
  const worlds = Array.isArray(m.worlds)
    ? m.worlds.map(sanitizeWorld).filter((w): w is MapWorld => Boolean(w)).slice(0, MAX_PLANETS)
    : [];
  const skill = SKILLS.includes(m.skill as Skill) ? (m.skill as Skill) : "even";
  const legacy = (m as { sun?: { x?: unknown; y?: unknown } }).sun;
  const rawSuns = Array.isArray(m.suns) ? m.suns : legacy ? [legacy] : [];
  const suns = rawSuns
    .map((raw, i) => {
      if (!raw || typeof raw !== "object") return null;
      const s = raw as Partial<MapSun>;
      if (typeof s.x !== "number" || typeof s.y !== "number" || !Number.isFinite(s.x) || !Number.isFinite(s.y)) return null;
      const scale = typeof s.scale === "number" && Number.isFinite(s.scale) ? Math.max(0.45, Math.min(MAX_SUN_SCALE, s.scale)) : 1;
      const id = typeof s.id === "string" && s.id ? s.id : `s-legacy-${i}`;
      return { id, x: s.x, y: s.y, scale };
    })
    .filter((s): s is MapSun => Boolean(s))
    .slice(0, MAX_SUNS);
  const rocks = sanitizeRocks(m);
  const worldIds = new Set(worlds.map((w) => w.id));
  const sunIds = new Set(suns.map((s) => s.id));
  const locks = Array.isArray(m.locks)
    ? m.locks
        .map((raw) => sanitizeLock(raw, worldIds, sunIds))
        .filter((lock): lock is MapLock => Boolean(lock))
    : [];
  return {
    id: m.id,
    name: typeof m.name === "string" && m.name.trim() ? m.name.slice(0, 24) : `Map ${index + 1}`,
    skill,
    worlds,
    ...(suns.length ? { suns } : {}),
    ...(rocks.length ? { rocks } : {}),
    ...(locks.length ? { locks } : {}),
  };
}

function sanitizeRocks(m: Partial<CustomMap> & { fields?: unknown }): string[] {
  const index = new Map<string, number>();
  const take = (key: string) => {
    const rock = parseRock(key);
    if (!rock) return;
    const id = rockKey(rock.ix, rock.iy);
    if (!index.has(id) && index.size >= MAX_ROCKS) return;
    index.set(id, rock.pack);
  };
  if (Array.isArray(m.rocks)) {
    for (const key of m.rocks) if (typeof key === "string") take(key);
  }
  if (!index.size && Array.isArray(m.fields)) {
    for (const raw of m.fields) {
      if (!raw || typeof raw !== "object") continue;
      const f = raw as { x?: unknown; y?: unknown; r?: unknown };
      if (typeof f.x !== "number" || typeof f.y !== "number" || !Number.isFinite(f.x) || !Number.isFinite(f.y)) continue;
      const r = typeof f.r === "number" && Number.isFinite(f.r) ? f.r : 120;
      for (const key of legacyCircleRocks(f.x, f.y, r)) take(key);
    }
  }
  return rocksFromIndex(index);
}

function sanitizeLock(raw: unknown, worldIds: Set<string>, sunIds: Set<string>): MapLock | null {
  if (!raw || typeof raw !== "object") return null;
  const lock = raw as Partial<MapLock>;
  if (typeof lock.id !== "string" || !lock.id) return null;
  const worlds = Array.isArray(lock.worldIds) ? lock.worldIds.filter((id): id is string => typeof id === "string" && worldIds.has(id)) : [];
  const suns = Array.isArray(lock.sunIds) ? lock.sunIds.filter((id): id is string => typeof id === "string" && sunIds.has(id)) : [];
  if (!worlds.length && !suns.length) return null;
  const spin = typeof lock.spin === "number" && Number.isFinite(lock.spin) ? Math.max(0.02, Math.min(1, Math.abs(lock.spin))) : 0.12;
  const pace = typeof lock.pspin === "number" && Number.isFinite(lock.pspin) ? Math.max(-20, Math.min(20, Math.round(lock.pspin * 100) / 100)) : 1;
  return {
    id: lock.id,
    worldIds: worlds,
    sunIds: suns,
    orbit: lock.orbit === true,
    ox: finite(lock.ox),
    oy: finite(lock.oy),
    spin,
    turn: lock.turn === true,
    cx: finite(lock.cx, finite(lock.ox)),
    cy: finite(lock.cy, finite(lock.oy)),
    pspin: pace,
  };
}

function sanitizeCategory(raw: unknown, index: number): MapCategory | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Partial<MapCategory>;
  if (typeof c.id !== "string" || !c.id) return null;
  const maps = Array.isArray(c.maps)
    ? c.maps.map(sanitizeMap).filter((m): m is CustomMap => Boolean(m)).slice(0, MAX_MAPS)
    : [];
  return {
    id: c.id,
    name: typeof c.name === "string" && c.name.trim() ? c.name.slice(0, 24) : `Category ${index + 1}`,
    maps: maps.length ? maps : [{ ...createMap(1), id: `${c.id}-map`, name: "Map 1" }],
  };
}

function loadLegacyMaps(): CustomMap[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(MAPS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(sanitizeMap).filter((m): m is CustomMap => Boolean(m)).slice(0, MAX_MAPS);
  } catch {
    return [];
  }
}

function sanitizeAnchor(raw: unknown): GroupAnchor | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Partial<GroupAnchor>;
  if ((a.kind !== "world" && a.kind !== "sun") || typeof a.index !== "number" || !Number.isFinite(a.index)) return null;
  const index = Math.floor(a.index);
  if (index < 0) return null;
  return { kind: a.kind, index };
}

function sanitizeRememberWorld(raw: unknown): RememberWorld | null {
  if (!raw || typeof raw !== "object") return null;
  const w = raw as Partial<RememberWorld>;
  const owner = finite(w.owner, NEUTRAL_ID);
  const known = owner === PLAYER_ID || owner === NEUTRAL_ID || AI_FACTIONS.some((f) => f.id === owner);
  const side = known ? owner : NEUTRAL_ID;
  const defaults = defaultWorldStats(side);
  const count = (n: unknown, min: number, max: number, fallback: number) => {
    if (typeof n !== "number" || !Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.round(n)));
  };
  const economy = liftEconomy(
    count(w.rate, 0, 40, defaults.rate),
    count(w.health, 1, 9999, defaults.health),
    count(w.rise, 1, 9999, defaults.rise),
    count(w.claim, 0, 9999, defaults.claim),
  );
  return {
    name: typeof w.name === "string" && w.name.trim() ? w.name.slice(0, 18) : "World",
    template: Math.max(0, Math.floor(finite(w.template))),
    dx: finite(w.dx),
    dy: finite(w.dy),
    relOx: finite(w.relOx, finite(w.dx)),
    relOy: finite(w.relOy, finite(w.dy)),
    anchor: sanitizeAnchor(w.anchor),
    still: w.still !== false,
    owner: side,
    level: w.level === 2 || w.level === 3 || w.level === 4 || w.level === 5 ? w.level : 1,
    start: count(w.start, 0, 999, defaults.start),
    rate: economy.rate,
    health: economy.health,
    rise: economy.rise,
    claim: economy.claim,
    spin: Math.max(-2000, Math.min(2000, Math.round((typeof w.spin === "number" && Number.isFinite(w.spin) ? w.spin : 1) * 100))) / 100,
    flat: count((w.flat ?? 1) * 100, 0, 800, 100) / 100,
    ...(TEMPLATES[Math.abs(Math.floor(finite(w.template))) % TEMPLATES.length]?.kind === HUSK_KIND
      ? { cooldown: count(w.cooldown, 1, 300, DEFAULT_LOCK_S) }
      : {}),
    ...(typeof w.tilt === "number" && Number.isFinite(w.tilt) && Math.abs(w.tilt) > 1e-4
      ? { tilt: Math.atan2(Math.sin(w.tilt), Math.cos(w.tilt)) }
      : {}),
  };
}

function sanitizeRememberSun(raw: unknown): RememberSun | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Partial<RememberSun>;
  const scale = finite(s.scale, 1);
  if (!Number.isFinite(scale)) return null;
  return {
    dx: finite(s.dx),
    dy: finite(s.dy),
    scale: Math.max(0.45, Math.min(MAX_SUN_SCALE, scale)),
  };
}

export function sanitizeRememberGroup(raw: unknown): RememberGroup | null {
  if (!raw || typeof raw !== "object") return null;
  const g = raw as Partial<RememberGroup>;
  if (typeof g.id !== "string" || !g.id) return null;
  const worlds = Array.isArray(g.worlds) ? g.worlds.map(sanitizeRememberWorld).filter((w): w is RememberWorld => Boolean(w)) : [];
  const suns = Array.isArray(g.suns) ? g.suns.map(sanitizeRememberSun).filter((s): s is RememberSun => Boolean(s)) : [];
  if (!worlds.length && !suns.length) return null;
  worlds.forEach((w) => {
    if (w.anchor?.kind === "world" && w.anchor.index >= worlds.length) w.anchor = null;
    if (w.anchor?.kind === "sun" && w.anchor.index >= suns.length) w.anchor = null;
  });
  const name = typeof g.name === "string" && g.name.trim() ? g.name.trim().slice(0, 24) : "Group";
  return { id: g.id, name, worlds: worlds.slice(0, MAX_PLANETS), suns: suns.slice(0, MAX_SUNS) };
}

export function groupsFromPayload(raw: string | null): RememberGroup[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    const list = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && Array.isArray((parsed as { groups?: unknown }).groups)
        ? (parsed as { groups: unknown[] }).groups
        : [];
    return list.map(sanitizeRememberGroup).filter((g): g is RememberGroup => Boolean(g)).slice(0, MAX_GROUPS);
  } catch {
    return [];
  }
}

export function loadGroups(): RememberGroup[] {
  const direct = [
    groupsFromPayload(typeof localStorage === "undefined" ? null : readStore(localStorage, GROUPS_KEY)),
    groupsFromPayload(typeof sessionStorage === "undefined" ? null : readStore(sessionStorage, GROUPS_KEY)),
  ];
  return direct.find((list) => list.length) ?? direct[0] ?? [];
}

export function saveGroups(groups: RememberGroup[]): void {
  const trimmed = groups
    .map(sanitizeRememberGroup)
    .filter((g): g is RememberGroup => Boolean(g))
    .slice(0, MAX_GROUPS);
  const raw = JSON.stringify(trimmed);
  if (typeof localStorage !== "undefined") writeStore(localStorage, GROUPS_KEY, raw);
  if (typeof sessionStorage !== "undefined") writeStore(sessionStorage, GROUPS_KEY, raw);
}

export function countWorlds(categories: MapCategory[]): number {
  return categories.reduce((n, c) => n + c.maps.reduce((m, map) => m + map.worlds.length, 0), 0);
}

export type LibraryRecord = { savedAt: number; categories: MapCategory[]; groups: RememberGroup[] };

export function categoriesFromPayload(raw: string | null): LibraryRecord | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      const categories = parsed
        .map(sanitizeCategory)
        .filter((c): c is MapCategory => Boolean(c))
        .slice(0, MAX_CATEGORIES);
      return categories.length ? { savedAt: 0, categories, groups: [] } : null;
    }
    if (!parsed || typeof parsed !== "object") return null;
    const envelope = parsed as { v?: unknown; savedAt?: unknown; categories?: unknown; groups?: unknown };
    if (envelope.v !== 2 || !Array.isArray(envelope.categories)) return null;
    const categories = envelope.categories
      .map(sanitizeCategory)
      .filter((c): c is MapCategory => Boolean(c))
      .slice(0, MAX_CATEGORIES);
    const groups = Array.isArray(envelope.groups)
      ? envelope.groups.map(sanitizeRememberGroup).filter((g): g is RememberGroup => Boolean(g)).slice(0, MAX_GROUPS)
      : [];
    return {
      savedAt: typeof envelope.savedAt === "number" && Number.isFinite(envelope.savedAt) ? envelope.savedAt : 0,
      categories,
      groups,
    };
  } catch {
    return null;
  }
}

function readStore(store: Storage, key: string): string | null {
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}

function writeStore(store: Storage, key: string, value: string) {
  try {
    store.setItem(key, value);
  } catch {
    /* private mode / quota */
  }
}

export function loadLibraryRecord(): LibraryRecord {
  const candidates = [
    categoriesFromPayload(typeof localStorage === "undefined" ? null : readStore(localStorage, LIBRARY_KEY)),
    categoriesFromPayload(typeof localStorage === "undefined" ? null : readStore(localStorage, LIBRARY_BACKUP_KEY)),
    categoriesFromPayload(typeof sessionStorage === "undefined" ? null : readStore(sessionStorage, LIBRARY_SESSION_KEY)),
  ].filter((item): item is LibraryRecord => Boolean(item));
  if (candidates.length) {
    candidates.sort((a, b) => b.savedAt - a.savedAt || countWorlds(b.categories) - countWorlds(a.categories));
    const best = candidates[0];
    const groups = loadGroups();
    return { ...best, groups: groups.length ? groups : best.groups };
  }
  const legacy = loadLegacyMaps();
  if (!legacy.length) return { savedAt: 0, categories: [], groups: loadGroups() };
  const migrated: MapCategory[] = [{ id: "cat-legacy", name: "Category 1", maps: legacy }];
  saveLibrary(migrated);
  return { savedAt: Date.now(), categories: migrated, groups: loadGroups() };
}

export function loadLibrary(): MapCategory[] {
  return loadLibraryRecord().categories;
}

export function saveLibrary(categories: MapCategory[]): void {
  const trimmed = categories.slice(0, MAX_CATEGORIES).map((c) => ({
    ...c,
    name: (c.name || "").slice(0, 24),
    maps: c.maps.slice(0, MAX_MAPS),
  }));
  if (!trimmed.length) return;
  const groups = loadGroups();
  const raw = JSON.stringify({ v: 2, savedAt: Date.now(), categories: trimmed, groups });
  if (typeof localStorage !== "undefined") {
    writeStore(localStorage, LIBRARY_BACKUP_KEY, readStore(localStorage, LIBRARY_KEY) || raw);
    writeStore(localStorage, LIBRARY_KEY, raw);
  }
  if (typeof sessionStorage !== "undefined") writeStore(sessionStorage, LIBRARY_SESSION_KEY, raw);
}

export function loadMaps(): CustomMap[] {
  return loadLibrary().flatMap((c) => c.maps);
}

/** Put a played map back only when the library no longer has it. Never replace a saved copy. */
export function mergeSourceMap(categories: MapCategory[], map: CustomMap | null | undefined): MapCategory[] {
  if (!map || typeof map.id !== "string" || !Array.isArray(map.worlds) || map.worlds.length === 0) return categories;
  const base = categories.length
    ? categories.map((cat) => ({ ...cat, maps: cat.maps.map((item) => ({ ...item, worlds: item.worlds.slice() })) }))
    : [createCategory(1)];
  if (base.some((cat) => cat.maps.some((item) => item.id === map.id))) return base;
  base[0] = { ...base[0], maps: [map, ...base[0].maps].slice(0, MAX_MAPS) };
  return base;
}
