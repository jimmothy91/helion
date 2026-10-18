import { hash3 } from "./noise";
import type { Cohort, Faction, GameSpeed, PlanetDef, PlanetLevel, PlanetPalette, SetupConfig, Skill } from "./types";
import { NEUTRAL_ID, PLAYER_ID } from "./types";

export const STEP = 1 / 20;
/** Live pace relative to the original clock. Fast is that clock. */
export const SPEED_SCALE: Record<GameSpeed, number> = {
  slow: 0.25,
  medium: 0.5,
  fast: 1,
};
export const OFFLINE_CAP_S = 8 * 3600;
export const ELLIPSE = 0.58;
export const MIN_PLANETS = 6;
export const MAX_PLANETS = 36;
export const MIN_AI = 1;
export const MAX_AI = 8;

export const SKILL_META: Record<Skill, { label: string; blurb: string }> = {
  cautious: { label: "Easy", blurb: "They spend to stay alive, and they will not press a lead." },
  even: { label: "Normal", blurb: "Behind, they stay alive. Ahead, they try to close." },
  relentless: { label: "Hard", blurb: "They spend to finish the game, and they will not sit on a lead." },
};

export const PLAYER_FACTION: Faction = {
  id: PLAYER_ID,
  name: "Helion",
  color: [64, 196, 255],
  ai: false,
};

export const AI_FACTIONS: Faction[] = [
  { id: 1, name: "Vesper", color: [235, 64, 78], ai: true },
  { id: 2, name: "Brume", color: [42, 204, 118], ai: true },
  { id: 3, name: "Sable", color: [245, 176, 42], ai: true },
  { id: 4, name: "Nox", color: [168, 96, 255], ai: true },
  { id: 5, name: "Cinder", color: [255, 122, 48], ai: true },
  { id: 6, name: "Ichor", color: [214, 72, 156], ai: true },
  { id: 7, name: "Gale", color: [186, 214, 92], ai: true },
  { id: 8, name: "Wraith", color: [120, 148, 196], ai: true },
];

export const NEUTRAL_COLOR: [number, number, number] = [118, 116, 114];

const NAMES = [
  "Aether",
  "Ember",
  "Vellum",
  "Hollow",
  "Mire",
  "Glade",
  "Nimbus",
  "Rime",
  "Umbral",
  "Kite",
  "Quill",
  "Dusk",
  "Vale",
  "Orth",
  "Pinion",
  "Cass",
  "Lumen",
  "Wisp",
];

export function planetName(index: number): string {
  return NAMES[index % NAMES.length];
}

type Template = Omit<PlanetDef, "id" | "orbit" | "angle">;

export const TEMPLATES: Template[] = [
  {
    name: "Aether",
    kind: "Garden world",
    blurb: "A first garden. Forges run even and quiet.",
    size: 22,
    rate: 1.35,
    spin: 0.08,
    seed: 11,
    clouds: true,
    palette: {
      ocean: [42, 92, 110],
      land: [168, 158, 126],
      land2: [112, 132, 96],
      ice: [226, 230, 232],
      cloud: [236, 240, 242],
      atmo: [140, 190, 210],
      threshold: 0.42,
    },
  },
  {
    name: "Ember",
    kind: "Volcanic",
    blurb: "A furnace with a crust.",
    size: 16,
    rate: 1.7,
    spin: 0.12,
    seed: 23,
    palette: {
      ocean: [28, 18, 16],
      land: [72, 42, 36],
      land2: [48, 32, 28],
      ice: [90, 70, 62],
      cloud: [40, 28, 24],
      atmo: [180, 90, 70],
      lava: [220, 92, 48],
      threshold: 0.72,
    },
  },
  {
    name: "Vellum",
    kind: "Desert",
    blurb: "Wind-cut plains. Silent docks.",
    size: 18,
    rate: 1.55,
    spin: 0.1,
    seed: 41,
    palette: {
      ocean: [150, 118, 78],
      land: [196, 154, 96],
      land2: [168, 122, 74],
      ice: [220, 200, 168],
      cloud: [232, 214, 186],
      atmo: [210, 180, 130],
      threshold: 0.58,
    },
  },
  {
    name: "Hollow",
    kind: "Barren",
    blurb: "A world that already died once.",
    size: 14,
    rate: 1.2,
    spin: 0.04,
    seed: 59,
    palette: {
      ocean: [78, 76, 74],
      land: [128, 122, 114],
      land2: [96, 92, 86],
      ice: [186, 184, 180],
      cloud: [160, 158, 154],
      atmo: [150, 148, 146],
      threshold: 0.5,
    },
  },
  {
    name: "Mire",
    kind: "Ocean",
    blurb: "A deep wet world.",
    size: 20,
    rate: 1.85,
    spin: 0.07,
    seed: 67,
    clouds: true,
    palette: {
      ocean: [22, 58, 72],
      land: [48, 86, 62],
      land2: [36, 70, 54],
      ice: [210, 222, 224],
      cloud: [200, 216, 220],
      atmo: [90, 160, 170],
      threshold: 0.28,
    },
  },
  {
    name: "Glade",
    kind: "Forest",
    blurb: "Green enough to matter.",
    size: 21,
    rate: 1.9,
    spin: 0.09,
    seed: 83,
    clouds: true,
    palette: {
      ocean: [36, 78, 108],
      land: [62, 112, 72],
      land2: [92, 128, 70],
      ice: [224, 230, 228],
      cloud: [232, 236, 238],
      atmo: [120, 180, 150],
      threshold: 0.4,
    },
  },
  {
    name: "Nimbus",
    kind: "Gas giant",
    blurb: "A giant of weather.",
    size: 34,
    rate: 2.4,
    spin: 0.16,
    seed: 97,
    gas: true,
    palette: {
      ocean: [92, 102, 124],
      land: [186, 168, 138],
      land2: [120, 124, 140],
      ice: [220, 214, 200],
      cloud: [210, 200, 180],
      atmo: [170, 180, 200],
      threshold: 0.5,
    },
  },
  {
    name: "Rime",
    kind: "Ice",
    blurb: "Ice with a memory.",
    size: 19,
    rate: 1.6,
    spin: 0.05,
    seed: 109,
    clouds: true,
    palette: {
      ocean: [48, 78, 102],
      land: [186, 210, 220],
      land2: [150, 178, 196],
      ice: [236, 242, 246],
      cloud: [230, 236, 240],
      atmo: [170, 200, 220],
      threshold: 0.36,
    },
  },
  {
    name: "Umbral",
    kind: "Outer dark",
    blurb: "The last light.",
    size: 26,
    rate: 2.1,
    spin: 0.03,
    seed: 131,
    rings: true,
    palette: {
      ocean: [18, 20, 26],
      land: [40, 44, 54],
      land2: [28, 30, 38],
      ice: [90, 100, 120],
      cloud: [60, 64, 74],
      atmo: [90, 120, 150],
      threshold: 0.48,
    },
  },
  {
    name: "Kiln",
    kind: "Husk",
    blurb: "Falls quiet when lost. Nothing can take it until the lock ends.",
    size: 18,
    rate: 1.5,
    spin: 0.06,
    seed: 149,
    cooldown: 30,
    palette: {
      ocean: [96, 68, 42],
      land: [176, 128, 78],
      land2: [124, 84, 48],
      ice: [220, 190, 146],
      cloud: [198, 164, 118],
      atmo: [190, 146, 96],
      threshold: 0.5,
    },
  },
];

export const HUSK_KIND = "Husk";
export const DEFAULT_LOCK_S = 30;
export const LOCK_WAKE_S = 3;
export const TORTILLA: [number, number, number] = [198, 154, 96];

export function isHusk(def: { kind?: string } | null | undefined): boolean {
  return def?.kind === HUSK_KIND;
}

/** Seconds a lost Husk stays sealed. Other worlds stay open. */
export function lockSeconds(def: { kind?: string; cooldown?: number } | null | undefined): number {
  if (!isHusk(def)) return 0;
  const n = def?.cooldown;
  if (typeof n !== "number" || !Number.isFinite(n)) return DEFAULT_LOCK_S;
  return Math.max(0, n);
}

export const BASE_PLANET_SIZE = 16;

export const DEMO_DEFS: PlanetDef[] = TEMPLATES.map((t, i) => ({
  ...t,
  id: `demo-${i}`,
  orbit: 86 + i * 44,
  angle: 0.35 + i * 0.72,
  level: 1 as PlanetLevel,
  size: BASE_PLANET_SIZE,
}));

export function defaultSetup(): SetupConfig {
  return { planetCount: 9, aiCount: 2, skill: "even" };
}

/** The numbers on the setup screen are the numbers a generated sky uses. */
export function legalSetup(setup: SetupConfig): SetupConfig {
  const skill = setup?.skill === "cautious" || setup?.skill === "relentless" ? setup.skill : "even";
  const aiCount = Math.max(MIN_AI, Math.min(MAX_AI, Math.round(Number(setup?.aiCount)) || MIN_AI));
  let planetCount = Math.max(MIN_PLANETS, Math.min(MAX_PLANETS, Math.round(Number(setup?.planetCount)) || MIN_PLANETS));
  if (planetCount < aiCount + 1) planetCount = Math.min(MAX_PLANETS, aiCount + 1);
  return { planetCount, aiCount, skill };
}

function mulberry(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function jitterPalette(p: PlanetPalette, rand: () => number): PlanetPalette {
  const j = (c: [number, number, number]): [number, number, number] => [
    Math.max(8, Math.min(240, c[0] + (rand() - 0.5) * 22)),
    Math.max(8, Math.min(240, c[1] + (rand() - 0.5) * 22)),
    Math.max(8, Math.min(240, c[2] + (rand() - 0.5) * 22)),
  ];
  return {
    ocean: j(p.ocean),
    land: j(p.land),
    land2: j(p.land2),
    ice: j(p.ice),
    cloud: j(p.cloud),
    atmo: j(p.atmo),
    lava: p.lava ? j(p.lava) : undefined,
    threshold: p.threshold + (rand() - 0.5) * 0.06,
  };
}

function ringsFor(n: number): { orbit: number; count: number }[] {
  if (n <= 6) return [{ orbit: 236, count: 2 }, { orbit: 396, count: n - 2 }];
  if (n <= 9) return [{ orbit: 216, count: 3 }, { orbit: 376, count: 3 }, { orbit: 556, count: n - 6 }];
  if (n <= 12) {
    return [
      { orbit: 200, count: 3 },
      { orbit: 344, count: 3 },
      { orbit: 496, count: 3 },
      { orbit: 664, count: n - 9 },
    ];
  }
  if (n <= 16) {
    return [
      { orbit: 192, count: 4 },
      { orbit: 328, count: 4 },
      { orbit: 472, count: 4 },
      { orbit: 636, count: n - 12 },
    ];
  }
  const orbits = n <= 24 ? [180, 320, 460, 600, 740] : [150, 270, 390, 520, 650, 780];
  const base = Math.floor(n / orbits.length);
  const extra = n % orbits.length;
  return orbits.map((orbit, i) => ({
    orbit,
    count: base + (i >= orbits.length - extra ? 1 : 0),
  }));
}

function planetPos(orbit: number, angle: number) {
  return { x: Math.cos(angle) * orbit, y: Math.sin(angle) * orbit * ELLIPSE };
}

function pickSpread(defs: PlanetDef[], k: number, rand: () => number): string[] {
  if (defs.length === 0) return [];
  const chosen: string[] = [];
  const first = defs[Math.floor(rand() * Math.min(defs.length, 4 + Math.floor(defs.length / 4)))];
  chosen.push(first.id);
  while (chosen.length < k && chosen.length < defs.length) {
    let best = defs[0];
    let bestD = -1;
    for (const d of defs) {
      if (chosen.includes(d.id)) continue;
      const p = planetPos(d.orbit, d.angle);
      let min = 1e9;
      for (const id of chosen) {
        const o = defs.find((x) => x.id === id)!;
        const q = planetPos(o.orbit, o.angle);
        const dist = Math.hypot(p.x - q.x, p.y - q.y);
        if (dist < min) min = dist;
      }
      if (min > bestD) {
        bestD = min;
        best = d;
      }
    }
    chosen.push(best.id);
  }
  return chosen;
}

export function generateSystem(setup: SetupConfig, seed = Date.now()): {
  defs: PlanetDef[];
  planets: Record<string, ReturnType<typeof freshPlanet>>;
  factions: Faction[];
} {
  const legal = legalSetup(setup);
  const planetCount = legal.planetCount;
  const aiCount = legal.aiCount;
  const rand = mulberry(seed);
  const rings = ringsFor(planetCount);
  const defs: PlanetDef[] = [];
  let idx = 0;
  for (const ring of rings) {
    const base = rand() * Math.PI * 2;
    for (let j = 0; j < ring.count; j++) {
      const tmpl = TEMPLATES[idx % TEMPLATES.length];
      const angle = base + (j / ring.count) * Math.PI * 2 + (rand() - 0.5) * 0.28;
      const orbit = ring.orbit + (rand() - 0.5) * 10;
      defs.push({
        ...tmpl,
        id: `p${idx}`,
        name: NAMES[idx % NAMES.length],
        orbit,
        angle,
        level: 1,
        maxLevel: MAX_LEVEL,
        size: BASE_PLANET_SIZE,
        rate: tmpl.rate * (0.85 + rand() * 0.35),
        seed: Math.floor(rand() * 9000) + idx * 17,
        palette: jitterPalette(tmpl.palette, rand),
      });
      idx += 1;
    }
  }

  const factions: Faction[] = [PLAYER_FACTION, ...AI_FACTIONS.slice(0, aiCount)];
  const homes = pickSpread(defs, factions.length, rand);
  const skillBoost = legal.skill === "relentless" ? 12 : legal.skill === "even" ? 4 : 0;

  const planets: Record<string, ReturnType<typeof freshPlanet>> = {};
  for (const d of defs) {
    const homeIndex = homes.indexOf(d.id);
    if (homeIndex === 0) {
      planets[d.id] = freshPlanet(PLAYER_ID, 48);
    } else if (homeIndex > 0) {
      planets[d.id] = freshPlanet(factions[homeIndex].id, 36 + skillBoost);
    } else {
      planets[d.id] = freshPlanet(NEUTRAL_ID, 0);
    }
  }

  return { defs, planets, factions };
}

export function factionColor(id: number, _factions?: Faction[]): [number, number, number] {
  if (id === PLAYER_ID) return PLAYER_FACTION.color;
  if (id === NEUTRAL_ID) return NEUTRAL_COLOR;
  return AI_FACTIONS.find((f) => f.id === id)?.color ?? NEUTRAL_COLOR;
}

export function factionCss(color: [number, number, number]): string {
  return `rgb(${color[0] | 0} ${color[1] | 0} ${color[2] | 0})`;
}

export const MAX_LEVEL = 5;

export function clampLevel(level: number): PlanetLevel {
  return Math.max(1, Math.min(MAX_LEVEL, Math.round(level || 1))) as PlanetLevel;
}

export function planetLevelSize(level: number): number {
  return BASE_PLANET_SIZE * 1.3 ** (clampLevel(level) - 1);
}

export function planetSize(def: { level?: number }): number {
  return planetLevelSize(def.level ?? 1);
}

/** A few degrees off edge-on, so the disc reads as a shallow ellipse. */
export const DISC_OPEN = Math.sin((18 * Math.PI) / 180);

/** One thin ring. Each level stretches the radius; it does not add another circle. */
export function discRadius(size: number, level: number): number {
  const lv = clampLevel(level);
  const close = size + 12;
  return close * (1 + (lv - 1) * 0.22);
}

/** Outer reach of the satellite disc. One entry, kept for callers that want the rim. */
export function shellRadii(size: number, level: number): number[] {
  return [discRadius(size, level)];
}

/** Satellites to break or rise a world. Level 1 is 200, then 400, 600, 800, and 1000. */
export function captureCost(level: number): number {
  return 200 * clampLevel(level);
}

/** Same as a level-1 rise, so the opening spend is a choice between upgrade and claim. */
export const NEUTRAL_COST = captureCost(1);

/** Units forged each second. Level 1 forges 8, then 16, 24, 32, and level 5 forges 40. */
export function forgeRate(_base: number, level: number): number {
  return clampLevel(level) * 8;
}

export function worldForge(def: PlanetDef, level: number): number {
  const lv = clampLevel(level);
  return typeof def.tuneRate === "number" ? def.tuneRate * lv : forgeRate(0, lv);
}

export function worldHealth(def: PlanetDef, level: number): number {
  const lv = clampLevel(level);
  return typeof def.tuneHealth === "number" ? Math.max(1, Math.round(def.tuneHealth * lv)) : captureCost(lv);
}

export function worldRise(def: PlanetDef, level: number): number {
  const lv = clampLevel(level);
  return typeof def.tuneRise === "number" ? Math.max(1, Math.round(def.tuneRise * lv)) : captureCost(lv);
}

export function worldClaim(def: PlanetDef): number {
  return typeof def.tuneClaim === "number" ? Math.max(0, Math.round(def.tuneClaim)) : NEUTRAL_COST;
}

/** A hop inside this distance arrives intact. */
export const TRAVEL_GRACE = 200;
/** How fast a longer flight thins the swarm. */
const TRAVEL_K = 0.0035;
/** Distance alone never cuts a swarm below this fraction. */
export const TRAVEL_KEEP_MIN = 0.34;

/** Fraction of a swarm that survives a flight of this length. */
export function travelKeep(distance: number): number {
  const extra = Math.max(0, distance - TRAVEL_GRACE);
  if (extra <= 0) return 1;
  return Math.max(TRAVEL_KEEP_MIN, Math.exp(-TRAVEL_K * extra));
}

/** Seconds a world forges nothing after it is taken. */
export const SETTLE_S = 6;

/** Share of the satellites left over after a capture that stay. */
export function keptAfterCapture(surplus: number): number {
  if (surplus <= 0) return 0;
  return Math.ceil(surplus * 0.5);
}

/** Satellites this world actually mints per second right now. Garrison does not slow it. */
export function effectiveForge(def: PlanetDef, level: number, _garrison: number, quiet = 0): number {
  if (quiet > 0) return 0;
  return worldForge(def, level);
}

export function freshPlanet(owner: number, garrison: number): {
  owner: number;
  garrison: number;
  level: number;
  claim: number;
  claimOwner: number;
  release: number;
  releaseOwner: number;
  upgrade: number;
  quiet: number;
} {
  return {
    owner,
    garrison,
    level: 1,
    claim: 0,
    claimOwner: NEUTRAL_ID,
    release: 0,
    releaseOwner: NEUTRAL_ID,
    upgrade: 0,
    quiet: 0,
  };
}

export function visualSatellites(garrison: number): number {
  const g = Math.max(0, Math.floor(garrison));
  if (g <= 28) return g;
  return Math.min(48, 28 + Math.floor(Math.log2(1 + g - 28) * 6));
}

export function satWorld(
  def: PlanetDef,
  i: number,
  time: number,
  reduced: boolean,
): { x: number; y: number; near: number } {
  const wobble = (hash3(i + 3, def.seed, 8.2) - 0.5) * 2.2;
  const rad = discRadius(planetSize(def), def.level ?? 1) + wobble;
  const phase = hash3(1, def.seed, 3.1) * Math.PI * 2;
  const spin = reduced ? 0 : 1;
  const ang = phase + time * 0.4 * spin + i * 2.399963;
  const p = planetWorld(def, time, reduced);
  const near = Math.sin(ang);
  return {
    x: p.x + Math.cos(ang) * rad,
    y: p.y + near * rad * DISC_OPEN,
    near,
  };
}

export function cohortDelta(cohort: Cohort | null | undefined, time: number, reduced: boolean) {
  if (!cohort || cohort.radius < 1) return { x: 0, y: 0 };
  const spin = reduced ? 0 : 1;
  const ang = cohort.angle + time * cohort.spin * spin;
  const x = cohort.ox + Math.cos(ang) * cohort.radius;
  const y = cohort.oy + Math.sin(ang) * cohort.radius * ELLIPSE;
  const x0 = cohort.ox + Math.cos(cohort.angle) * cohort.radius;
  const y0 = cohort.oy + Math.sin(cohort.angle) * cohort.radius * ELLIPSE;
  return { x: x - x0, y: y - y0 };
}

type OrbitSun = { id: string; x: number; y: number; cohort?: Cohort | null; whirl?: { ox: number; oy: number; spin: number } | null };
const orbitFrame: { defs: Map<string, PlanetDef>; suns: Map<string, OrbitSun> } = {
  defs: new Map(),
  suns: new Map(),
};
const orbitStack = new Set<string>();
let whirlClock = 0;

export function setWhirlClock(time: number) {
  whirlClock = time;
}

export function whirlAngle(whirl: { spin: number } | null | undefined, reduced: boolean) {
  if (!whirl || reduced || !whirl.spin) return 0;
  return whirlClock * whirl.spin;
}

export function turnPoint(
  x: number,
  y: number,
  whirl: { ox: number; oy: number; spin: number } | null | undefined,
  reduced: boolean,
) {
  const ang = whirlAngle(whirl, reduced);
  if (!ang) return { x, y };
  const dx = x - whirl!.ox;
  const dy = y - whirl!.oy;
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return { x: whirl!.ox + dx * c - dy * s, y: whirl!.oy + dx * s + dy * c };
}

function bareAnchor(def: PlanetDef, time: number, reduced: boolean): { x: number; y: number } {
  const follow = def.follow;
  if (follow && !orbitStack.has(def.id)) {
    orbitStack.add(def.id);
    let host: { x: number; y: number } | null = null;
    if (follow.kind === "sun") {
      const sun = orbitFrame.suns.get(follow.id);
      if (sun) {
        const ride = cohortDelta(sun.cohort, time, reduced);
        host = { x: sun.x + ride.x, y: sun.y + ride.y };
      }
    } else {
      const other = orbitFrame.defs.get(follow.id);
      if (other) {
        const p = planetBare(other, time, reduced);
        host = { x: p.x, y: p.y };
      }
    }
    orbitStack.delete(def.id);
    if (host) return { x: host.x + follow.dx, y: host.y + follow.dy };
  }
  const ride = cohortDelta(def.cohort, time, reduced);
  return { x: (def.anchorX ?? 0) + ride.x, y: (def.anchorY ?? 0) + ride.y };
}

function planetBare(def: PlanetDef, time: number, reduced: boolean): { x: number; y: number; z: number } {
  const a = bareAnchor(def, time, reduced);
  if (def.still) return { x: a.x, y: a.y, z: 0 };
  const spin = reduced ? 0 : 1;
  const ang = def.angle + time * def.spin * spin;
  const flat = def.flat ?? 1;
  const tilt = def.tilt ?? 0;
  const lx = Math.cos(ang) * def.orbit;
  const ly = Math.sin(ang) * def.orbit * ELLIPSE * flat;
  return {
    x: a.x + Math.cos(tilt) * lx - Math.sin(tilt) * ly,
    y: a.y + Math.sin(tilt) * lx + Math.cos(tilt) * ly,
    z: Math.sin(ang),
  };
}

export function bindOrbitFrame(defs: PlanetDef[], suns: OrbitSun[]) {
  orbitFrame.defs = new Map(defs.map((def) => [def.id, def]));
  orbitFrame.suns = new Map(suns.map((sun) => [sun.id, sun]));
}

export function orbitAnchor(def: PlanetDef, time: number, reduced: boolean): { x: number; y: number } {
  const bare = bareAnchor(def, def.whirl ? 0 : time, reduced);
  return turnPoint(bare.x, bare.y, def.whirl, reduced);
}

export function planetWorld(def: PlanetDef, time: number, reduced: boolean): { x: number; y: number; z: number } {
  const bare = planetBare(def, def.whirl ? 0 : time, reduced);
  const p = turnPoint(bare.x, bare.y, def.whirl, reduced);
  return { x: p.x, y: p.y, z: bare.z };
}
