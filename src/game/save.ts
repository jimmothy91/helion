import { defaultSetup } from "./catalog";
import {
  SAVE_BACKUP_KEY,
  SAVE_KEY,
  SAVE_VERSION,
  type GameState,
  type MatchState,
  type Settings,
} from "./types";

const LEGACY_KEY = "helion.save.v1";

export function defaultState(): GameState {
  return {
    version: SAVE_VERSION,
    settings: { muted: false, chimes: true, music: false, musicChosen: false, volume: 1, shake: true, speed: "fast" },
    match: null,
    lastSetup: defaultSetup(),
  };
}

function migrate(raw: unknown): GameState {
  const base = defaultState();
  if (!raw || typeof raw !== "object") return base;
  const s = raw as Partial<GameState> & { settings?: Partial<Settings>; version?: number };
  const settings: Settings = {
    muted: Boolean(s.settings?.muted),
    chimes: s.settings?.chimes !== false,
    music: s.settings?.musicChosen === true && s.settings?.music === true,
    musicChosen: s.settings?.musicChosen === true,
    volume:
      typeof s.settings?.volume === "number" && Number.isFinite(s.settings.volume)
        ? Math.min(1, Math.max(0, s.settings.volume))
        : 1,
    shake: s.settings?.shake !== false,
    speed: s.settings?.speed === "slow" || s.settings?.speed === "medium" ? s.settings.speed : "fast",
  };
  let match: MatchState | null = null;
  if (s.version === SAVE_VERSION && s.match && typeof s.match === "object") {
    const m = s.match as MatchState;
    if (Array.isArray(m.defs) && m.planets && Array.isArray(m.factions)) {
      match = {
        ...m,
        crafts: Array.isArray(m.crafts) ? m.crafts : [],
        waves: Array.isArray(m.waves) ? m.waves : [],
        paused: Boolean(m.paused),
        result: m.result === "won" || m.result === "lost" ? m.result : "playing",
        aiWait: m.aiWait ?? {},
      };
    }
  }
  const lastSetup = s.lastSetup
    ? {
        planetCount: s.lastSetup.planetCount ?? 9,
        aiCount: s.lastSetup.aiCount ?? 2,
        skill: s.lastSetup.skill ?? "even",
      }
    : defaultSetup();
  return { version: SAVE_VERSION, settings, match, lastSetup };
}

export function loadSave(): GameState {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return migrate(JSON.parse(raw));
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const old = JSON.parse(legacy) as { settings?: Settings };
      const next = defaultState();
      if (old?.settings) next.settings = { ...next.settings, ...old.settings };
      return next;
    }
    return defaultState();
  } catch {
    try {
      const bak = localStorage.getItem(SAVE_BACKUP_KEY);
      if (bak) return migrate(JSON.parse(bak));
    } catch {
      /* ignore */
    }
    return defaultState();
  }
}

export function writeSave(state: GameState): void {
  try {
    const prev = localStorage.getItem(SAVE_KEY);
    if (prev) localStorage.setItem(SAVE_BACKUP_KEY, prev);
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...state, match: state.match }));
  } catch {
    /* private mode / quota */
  }
}

export function hasSave(): boolean {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as GameState;
    return Boolean(parsed?.match && parsed.match.result === "playing");
  } catch {
    return false;
  }
}

export function exportSave(state: GameState): string {
  return JSON.stringify(state, null, 2);
}

export function importSave(json: string): GameState {
  return migrate(JSON.parse(json));
}
