export const SAVE_VERSION = 2;
export const SAVE_KEY = "helion.save.v2";
export const SAVE_BACKUP_KEY = "helion.save.v2.backup";

export const PLAYER_ID = 0;
export const NEUTRAL_ID = -1;

export type FactionId = number;
export type Skill = "cautious" | "even" | "relentless";
export type Screen = "title" | "setup" | "play" | "atlas";
export type Panel = "help" | "settings" | "pause" | "result" | null;
export type MatchResult = "playing" | "won" | "lost";

export type SetupConfig = {
  planetCount: number;
  aiCount: number;
  skill: Skill;
};

export type Faction = {
  id: FactionId;
  name: string;
  color: [number, number, number];
  ai: boolean;
};

/** A shared slide around one point. Every member gets the same shift, so the layout stays put. */
export type Cohort = {
  ox: number;
  oy: number;
  angle: number;
  radius: number;
  spin: number;
};

export type PlanetPalette = {
  ocean: [number, number, number];
  land: [number, number, number];
  land2: [number, number, number];
  ice: [number, number, number];
  cloud: [number, number, number];
  atmo: [number, number, number];
  lava?: [number, number, number];
  threshold: number;
};

export type PlanetLevel = 1 | 2 | 3 | 4 | 5;

export type PlanetDef = {
  id: string;
  name: string;
  kind: string;
  blurb: string;
  orbit: number;
  angle: number;
  size: number;
  /** 1 is the small world every match starts on. Each step is 30% larger and adds a satellite ring. */
  level?: PlanetLevel;
  rate: number;
  spin: number;
  /** Vertical orbit radius relative to the circular one. 1 is a circle. */
  flat?: number;
  /** Rotation of the orbit ellipse, in radians. */
  tilt?: number;
  seed: number;
  palette: PlanetPalette;
  /** Orbit center. Omitted worlds circle the sun. */
  anchorX?: number;
  anchorY?: number;
  /** Stays on its gameplay position instead of traveling an orbit. */
  still?: boolean;
  /** Shared orbit of a locked cluster. The shift is the same for every member. */
  cohort?: Cohort;
  /** Rigid spin of a locked cluster around one center. */
  whirl?: { ox: number; oy: number; spin: number };
  /** Orbit center sticks to another locked body, plus a small offset. */
  follow?: { kind: "world" | "sun"; id: string; dx: number; dy: number };
  /** Assigned ceiling in the editor. A match starts at level 1 and can rise to this. */
  maxLevel?: PlanetLevel;
  /** Forges this many per second at level 1. Higher levels multiply it. Omitted worlds forge 8 × level. */
  tuneRate?: number;
  /** Satellites to break a held world at level 1. Omitted worlds use 200 × level. */
  tuneHealth?: number;
  /** Satellites to rise one level, priced at the level being left. Omitted worlds use 200 × level. */
  tuneRise?: number;
  /** Satellites to claim an empty world. Omitted worlds cost the same as a level-1 rise. */
  tuneClaim?: number;
  /** Seconds a Husk stays sealed after it is lost. Omitted husks use 30. */
  cooldown?: number;
  gas?: boolean;
  rings?: boolean;
  clouds?: boolean;
};

export type PlanetState = {
  owner: FactionId;
  garrison: number;
  level: number;
  /** Satellites the current claimant has poured into an uncaptured world. */
  claim: number;
  claimOwner: number;
  /** Satellites paid toward knocking a held world back to neutral. */
  release: number;
  releaseOwner: number;
  /** Satellites already paid toward the next level. Not filled by forging. */
  upgrade: number;
  /** Seconds left before a newly taken world forges again. */
  quiet?: number;
  /** Seconds left before a lost Husk can be taken again. */
  coolLeft?: number;
};

export type Wave = {
  id: number;
  from: string;
  to: string;
  amount: number;
  owner: FactionId;
  t: number;
  duration: number;
};

export type Craft = {
  id: number;
  owner: FactionId;
  from: string;
  to: string;
  payload: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  bump: number;
  cool: number;
  /** Distance already paid for. Further flight still costs satellites. */
  flown?: number;
  /** Flight already charged at launch, so it is not billed twice. */
  credit?: number;
  /** Fractional satellite already owed to the flight. */
  tax?: number;
  /** Distance already traveled, whether or not the hop has been prepaid. */
  gone?: number;
  /** Payload to drop once `gone` reaches `thinAt`. */
  thin?: number;
  thinAt?: number;
  /** Open-sky order. Used when `to` is empty. */
  tx?: number;
  ty?: number;
  /** Slot around that point so a flight does not collapse into one dot. */
  ox?: number;
  oy?: number;
  /** Sitting on the open-sky order. */
  hold?: boolean;
};

export type GameSpeed = "slow" | "medium" | "fast";

export type Settings = {
  muted: boolean;
  chimes: boolean;
  music: boolean;
  /** True after the player has chosen music on or off. Until then it stays off. */
  musicChosen?: boolean;
  /** 0–1. 1 is the louder default. */
  volume: number;
  shake: boolean;
  speed: GameSpeed;
};

export type MatchState = {
  seed: number;
  defs: PlanetDef[];
  planets: Record<string, PlanetState>;
  factions: Faction[];
  crafts: Craft[];
  /** Older saves only. Converted into crafts on load. */
  waves?: Wave[];
  setup: SetupConfig;
  lastTick: number;
  elapsed: number;
  tutorial: number;
  result: MatchResult;
  totalSent: number;
  paused: boolean;
  aiWait: Record<number, number>;
  /** Saved map this match was launched from, if it was not a generated sky. */
  mapId?: string;
  /** Full editor copy of that map, so a reload can put it back in the library. */
  sourceMap?: import("./maps").CustomMap;
};

export type GameState = {
  version: number;
  settings: Settings;
  match: MatchState | null;
  lastSetup: SetupConfig;
};

export type JuiceEvent =
  | { kind: "send"; from: string; to: string; amount: number; owner: FactionId; repeat?: boolean }
  | { kind: "capture"; id: string; owner: FactionId; from: FactionId }
  | { kind: "clash"; x: number; y: number; hostile: boolean; shake?: boolean }
  | { kind: "blocked" }
  | { kind: "result"; result: MatchResult };

export type Selection = Record<string, number>;

/** A world id, or any point on the field. */
export type SendTarget = string | { x: number; y: number };
