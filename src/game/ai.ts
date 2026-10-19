import { ELLIPSE, MAX_LEVEL, planetSize, planetWorld, travelKeep, worldClaim, worldForge, worldHealth, worldRise } from "./catalog";
import type { MatchState, Skill } from "./types";
import { NEUTRAL_ID, PLAYER_ID } from "./types";

export type Reach = "border" | "hunt" | "cut" | "open";
export type Phase = "early" | "mid" | "late";
export type Stance = "expand" | "fortify" | "punish" | "cut";
export type ChapterRule =
  | "finish"
  | "neighbors"
  | "bank"
  | "wounded-only"
  | "no-fresh"
  | "one-front"
  | "cut-only"
  | "cut-or-empty"
  | "probe"
  | "leader"
  | "grudge"
  | "nearest-empty";

export type Chapter = { stance: Stance; rule: ChapterRule; note: string };

export type BotVars = {
  efficiency_focus: number;
  reaction_delay_ms: number;
  horizon_depth: number;
  prestige_aggression: number;
  /** How hard they stick to whoever last took a world from them. */
  grudge: number;
  /** How strongly they refuse a healthy target. */
  vulture: number;
  /** How hard they stay on a capture until it falls. */
  commit: number;
  /** Share of a garrison they will not spend. */
  reserve: number;
  reach: Reach;
  /** How readily they probe, then punish the answer. */
  bait: number;
  /** How much the board's mood overrides the raw numbers. */
  mood: number;
  line: string;
};

export type ArchetypeId =
  | "the_min_maxer"
  | "the_casual"
  | "the_hoarder_pusher"
  | "the_hyperactive_goblin"
  | "the_steady_operator"
  | "the_stubborn_traditionalist"
  | "the_lucky_gambler"
  | "the_burst_prodigy";

export const ARCHETYPES: Record<ArchetypeId, BotVars> = {
  the_min_maxer: {
    efficiency_focus: 1,
    reaction_delay_ms: 50,
    horizon_depth: 12,
    prestige_aggression: 0.35,
    grudge: 0.85,
    vulture: 0,
    commit: 0.95,
    reserve: 0.12,
    reach: "hunt",
    bait: 0.15,
    mood: 0.15,
    line: "Finishes every capture it starts, and it does not forget who took a world.",
  },
  the_casual: {
    efficiency_focus: 0.7,
    reaction_delay_ms: 2200,
    horizon_depth: 4,
    prestige_aggression: 0.12,
    grudge: 0.25,
    vulture: 0.15,
    commit: 0.7,
    reserve: 0.8,
    reach: "border",
    bait: 0,
    mood: 0.75,
    line: "Only expands into neighboring worlds, and it will not empty a garrison to do it.",
  },
  the_hoarder_pusher: {
    efficiency_focus: 0.75,
    reaction_delay_ms: 1400,
    horizon_depth: 14,
    prestige_aggression: 0.05,
    grudge: 0.15,
    vulture: 0.1,
    commit: 0.45,
    reserve: 0.92,
    reach: "open",
    bait: 0,
    mood: 0.9,
    line: "Hoards a deep reserve, climbs its own worlds, and waits until growth stalls.",
  },
  the_hyperactive_goblin: {
    efficiency_focus: 0.55,
    reaction_delay_ms: 180,
    horizon_depth: 6,
    prestige_aggression: 0.7,
    grudge: 0.35,
    vulture: 0.95,
    commit: 0.85,
    reserve: 0.05,
    reach: "open",
    bait: 0.1,
    mood: 0.25,
    line: "Will not open a fresh fight, and only finishes worlds that are already bleeding.",
  },
  the_steady_operator: {
    efficiency_focus: 0.6,
    reaction_delay_ms: 700,
    horizon_depth: 6,
    prestige_aggression: 0.4,
    grudge: 0.45,
    vulture: 0.05,
    commit: 0.35,
    reserve: 0.3,
    reach: "hunt",
    bait: 0.95,
    mood: 0.4,
    line: "Sends a probe, then strikes the world you emptied to answer it.",
  },
  the_stubborn_traditionalist: {
    efficiency_focus: 0.5,
    reaction_delay_ms: 1800,
    horizon_depth: 3,
    prestige_aggression: 0.2,
    grudge: 0.5,
    vulture: 0,
    commit: 0.65,
    reserve: 0.4,
    reach: "cut",
    bait: 0,
    mood: 0.35,
    line: "Looks for the planet that sits between your worlds and cuts them apart.",
  },
  the_lucky_gambler: {
    efficiency_focus: 0.45,
    reaction_delay_ms: 500,
    horizon_depth: 7,
    prestige_aggression: 0.55,
    grudge: 0.3,
    vulture: 0.2,
    commit: 0.3,
    reserve: 0.22,
    reach: "hunt",
    bait: 0.2,
    mood: 0.95,
    line: "Fortifies while it is behind, then hunts whoever is leading.",
  },
  the_burst_prodigy: {
    efficiency_focus: 0.72,
    reaction_delay_ms: 90,
    horizon_depth: 5,
    prestige_aggression: 0.62,
    grudge: 1,
    vulture: 0,
    commit: 0.88,
    reserve: 0.08,
    reach: "hunt",
    bait: 0.3,
    mood: 0.1,
    line: "Drops the best prize to punish the last faction that hurt it.",
  },
};

const PLAYBOOKS: Record<ArchetypeId, Record<Phase, Chapter>> = {
  the_min_maxer: {
    early: { stance: "expand", rule: "finish", note: "Takes empty worlds and will not abandon a capture it has started." },
    mid: { stance: "punish", rule: "finish", note: "Presses the open capture and will not start a second one." },
    late: { stance: "punish", rule: "grudge", note: "Spends the endgame on whoever last took a world from it." },
  },
  the_casual: {
    early: { stance: "expand", rule: "neighbors", note: "Only claims empty worlds on its border." },
    mid: { stance: "expand", rule: "neighbors", note: "Still will not reach past a neighbor, even when a fight is open." },
    late: { stance: "fortify", rule: "neighbors", note: "Stops expanding and climbs the worlds it already has." },
  },
  the_hoarder_pusher: {
    early: { stance: "fortify", rule: "bank", note: "Climbs its own worlds and will not spend the pile." },
    mid: { stance: "fortify", rule: "bank", note: "Keeps banking until growth stalls." },
    late: { stance: "punish", rule: "leader", note: "Dumps the pile into whoever is leading." },
  },
  the_hyperactive_goblin: {
    early: { stance: "expand", rule: "no-fresh", note: "Takes empty worlds only. Will not open a fight." },
    mid: { stance: "punish", rule: "wounded-only", note: "Only finishes worlds that are already bleeding." },
    late: { stance: "punish", rule: "wounded-only", note: "Still refuses a healthy world. It only arrives to finish." },
  },
  the_steady_operator: {
    early: { stance: "expand", rule: "probe", note: "Probes a border world, then takes what the answer leaves thin." },
    mid: { stance: "punish", rule: "probe", note: "Probes the leader, then strikes the world they emptied to answer." },
    late: { stance: "cut", rule: "probe", note: "Probes the hinge between a rival's worlds, then takes it." },
  },
  the_stubborn_traditionalist: {
    early: { stance: "cut", rule: "cut-or-empty", note: "Claims an empty world only if it does not have a hinge to take." },
    mid: { stance: "cut", rule: "cut-only", note: "Ignores prizes that do not split a rival's worlds." },
    late: { stance: "cut", rule: "one-front", note: "Holds the hinge it took and will not open a second front." },
  },
  the_lucky_gambler: {
    early: { stance: "expand", rule: "leader", note: "Claims toward the leader, and banks if it falls behind." },
    mid: { stance: "punish", rule: "leader", note: "Hunts the leader once it is no longer trailing." },
    late: { stance: "punish", rule: "leader", note: "Spends the endgame on whoever holds the most worlds." },
  },
  the_burst_prodigy: {
    early: { stance: "expand", rule: "grudge", note: "Expands until someone hurts it, then drops the prize to punish them." },
    mid: { stance: "punish", rule: "grudge", note: "Abandons the best target to hit whoever last took a world." },
    late: { stance: "punish", rule: "grudge", note: "The endgame is the grudge. Nothing else is worth a send." },
  },
};

const BY_FACTION: ArchetypeId[] = [
  "the_min_maxer",
  "the_casual",
  "the_hoarder_pusher",
  "the_hyperactive_goblin",
  "the_steady_operator",
  "the_stubborn_traditionalist",
  "the_lucky_gambler",
  "the_burst_prodigy",
];

function archetypeId(factionId: number): ArchetypeId {
  return BY_FACTION[(Math.max(1, factionId) - 1) % BY_FACTION.length];
}

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

export function botVars(factionId: number, skill: Skill): BotVars {
  const id = archetypeId(factionId);
  const base = ARCHETYPES[id];
  const delayScale = skill === "cautious" ? 1.7 : skill === "relentless" ? 0.5 : 1;
  const effBias = skill === "cautious" ? -0.08 : skill === "relentless" ? 0.1 : 0;
  const aggBias = skill === "cautious" ? -0.1 : skill === "relentless" ? 0.1 : 0;
  return {
    ...base,
    efficiency_focus: clamp01(base.efficiency_focus + effBias),
    reaction_delay_ms: Math.max(50, Math.round(base.reaction_delay_ms * delayScale)),
    horizon_depth: Math.max(1, base.horizon_depth),
    prestige_aggression: clamp01(base.prestige_aggression + aggBias),
  };
}

export function botLine(factionId: number): string {
  return botVars(factionId, "even").line;
}

export const REPORT_BUILD = "1";

export type LossCard = {
  factionId: number;
  name: string;
  text: string;
  build: string;
  map: string;
};

type Blow = {
  killerId: number;
  killerChapter: string;
  world: string;
  level: number;
  flying: number;
  phase: Phase;
  stance: string;
  chapter: string;
  rule: ChapterRule;
  grudge: string;
  commit: string;
  bleeding: boolean;
  sent: number;
  cost: number;
  killerWorlds: number;
  victimWorlds: number;
};

const lossList: LossCard[] = [];
const blows = new Map<number, Blow>();
const sealed = new Set<number>();

type Lesson = { id: ArchetypeId; rule: ChapterRule; want: string; keeps: boolean; maps: Set<string> };
const lessons = new Map<string, Lesson>();
let headless = false;

/** Headless batches label a board "generated". A game you play is "played". */
export function setHeadless(on: boolean) {
  headless = on;
}

function boardName(match: MatchState): string {
  return match.sourceMap?.name || (headless ? "generated" : "played");
}

function noteLesson(id: ArchetypeId, rule: ChapterRule, map: string, want: string, keeps: boolean): void {
  const key = `${id}|${rule}`;
  let row = lessons.get(key);
  if (!row) {
    row = { id, rule, want, keeps, maps: new Set() };
    lessons.set(key, row);
  }
  row.maps.add(map);
}

function lessonReady(id: ArchetypeId): boolean {
  for (const row of lessons.values()) {
    if (row.id === id && row.keeps && row.want.startsWith("Take the nearest empty") && row.maps.size >= 2) return true;
  }
  return false;
}

noteLesson("the_hyperactive_goblin", "wounded-only", "played", "Take the nearest empty world, then go back to wounded-only.", true);
noteLesson("the_casual", "neighbors", "played", "Take the nearest empty world, then go back to neighbors.", true);
noteLesson("the_hoarder_pusher", "leader", "played", "Take the nearest empty world, then go back to leader.", true);

export function clearLossCards() {
  lossList.length = 0;
  blows.clear();
  sealed.clear();
}

export function lossCards(): readonly LossCard[] {
  return lossList;
}

export function lossCardText(): string {
  return lossList.map((card) => card.text).join("\n\n");
}

export type LossReport = { id: string; build: string; bot: string; map: string; card: string };

function reportId(card: LossCard): string {
  let h = 2166136261;
  const s = `${card.build}|${card.map}|${card.text}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function lossReports(): LossReport[] {
  return lossList.map((card) => ({
    id: reportId(card),
    build: card.build,
    bot: card.name,
    map: card.map,
    card: card.text,
  }));
}

function factionName(match: MatchState, id: number): string {
  return match.factions.find((f) => f.id === id)?.name ?? "Nobody";
}

function worldName(match: MatchState, id: string | null): string {
  if (!id) return "none";
  return match.defs.find((d) => d.id === id)?.name ?? id;
}

function flyingOf(match: MatchState, owner: number): number {
  let n = 0;
  for (const c of match.crafts ?? []) if (c.owner === owner && c.payload > 0) n += c.payload;
  return Math.floor(n);
}

function holdsWorld(match: MatchState, owner: number): boolean {
  return match.defs.some((d) => match.planets[d.id]?.owner === owner);
}

function phaseOf(match: MatchState): Blow["phase"] {
  const total = match.defs.length || 1;
  let neutral = 0;
  const alive = new Set<number>();
  for (const d of match.defs) {
    const owner = match.planets[d.id]?.owner ?? NEUTRAL_ID;
    if (owner === NEUTRAL_ID) neutral += 1;
    else alive.add(owner);
  }
  const rivals = [...alive].filter((id) => id !== PLAYER_ID).length;
  if (neutral / total >= 0.5) return "early";
  if (neutral === 0 || rivals <= 2) return "late";
  return "mid";
}

function stanceOf(match: MatchState, factionId: number): { stance: string; grudge: string; commit: string; chapter: string; phase: Phase; rule: ChapterRule } {
  const mem = minds.get(`${match.seed}:${factionId}`);
  if (!mem || mem.seed !== match.seed) {
    return { stance: "Expand", grudge: "none", commit: "none", chapter: "early / Expand", phase: "early", rule: "finish" };
  }
  const stance = mem.stance === "punish" ? "Punish" : mem.stance === "cut" ? "Cut" : mem.stance === "fortify" ? "Fortify" : "Expand";
  const grudge = mem.grudge > 0 ? factionName(match, mem.grudge) : "none";
  const commit = mem.commitTo ? worldName(match, mem.commitTo) : "none";
  const chapter = `${mem.phase} / ${stance} / ${mem.rule}. ${mem.note}`;
  return { stance, grudge, commit, chapter, phase: mem.phase, rule: mem.rule };
}

/** Called after a held world has already changed hands. Records the blow if it was their last world. */
export function noteLastWorld(
  match: MatchState,
  prev: number,
  killer: number,
  strike: { worldId: string; level: number; bleeding: boolean; sent: number; cost: number; killerWorlds: number; victimWorlds: number },
) {
  if (prev <= 0 || sealed.has(prev) || blows.has(prev)) return;
  if (holdsWorld(match, prev)) return;
  const snap = stanceOf(match, prev);
  const killerSnap = killer > 0 ? stanceOf(match, killer) : null;
  blows.set(prev, {
    killerId: killer,
    killerChapter: killerSnap ? killerSnap.chapter : "no chapter",
    world: worldName(match, strike.worldId),
    level: Math.max(1, Math.round(strike.level || 1)),
    flying: flyingOf(match, prev),
    phase: snap.phase,
    stance: snap.stance,
    chapter: snap.chapter,
    rule: snap.rule,
    grudge: snap.grudge,
    commit: snap.commit,
    bleeding: strike.bleeding,
    sent: Math.max(0, Math.floor(strike.sent)),
    cost: Math.max(0, Math.floor(strike.cost)),
    killerWorlds: Math.max(0, strike.killerWorlds),
    victimWorlds: Math.max(1, strike.victimWorlds),
  });
}

export function sealLosses(match: MatchState) {
  for (const f of match.factions) {
    if (!f.ai || sealed.has(f.id)) continue;
    if (holdsWorld(match, f.id)) {
      blows.delete(f.id);
      continue;
    }
    if (holdsWorld(match, f.id) || flyingOf(match, f.id) > 0) continue;
    const blow = blows.get(f.id);
    sealed.add(f.id);
    if (!blow) continue;
    const flight =
      blow.flying > 0
        ? `It still had ${blow.flying} satellites in flight when that world fell.`
        : "It had nothing in flight.";
    const winner = blow.killerId > 0 ? factionName(match, blow.killerId) : blow.killerId === 0 ? "Helion" : "Nobody";
    const map = boardName(match);
    const health = blow.bleeding ? "already bleeding" : "still healthy";
    const text = [
      "Loss card",
      `Build: ${REPORT_BUILD}`,
      `Map: ${map}`,
      `Bot: ${f.name}`,
      `Style: ${botLine(f.id)}`,
      `Phase: ${blow.phase}`,
      `Stance: ${blow.stance}`,
      `Chapter: ${blow.chapter}`,
      `Doing: ${blow.chapter}`,
      `Taken: ${blow.world}, level ${blow.level}, while it was ${health}.`,
      `Sent: ${blow.sent} satellites in the landing that took it. The world cost ${blow.cost}.`,
      `Worlds: ${winner} held ${blow.killerWorlds}. ${f.name} held ${blow.victimWorlds}.`,
      `Taken by: ${winner}.`,
      `Still held: no other worlds. ${flight}`,
      "Wiped out: no worlds and no satellites left.",
      `Grudge: ${blow.grudge}`,
      `Was finishing: ${blow.commit}`,
    ].join("\n");
    lossList.push({ factionId: f.id, name: f.name, text, build: REPORT_BUILD, map });
  }
}

export function nextThink(factionId: number, skill: Skill): number {
  return botVars(factionId, skill).reaction_delay_ms / 1000;
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, (a.y - b.y) / ELLIPSE);
}

function outgoing(match: MatchState, planetId: string): number {
  let n = 0;
  for (const c of match.crafts ?? []) {
    if (c.payload > 0 && c.from === planetId) n += c.payload;
  }
  return n;
}

function inbound(match: MatchState, planetId: string, owner: number): number {
  let n = 0;
  for (const c of match.crafts ?? []) {
    if (c.payload > 0 && c.to === planetId && c.owner === owner) n += c.payload;
  }
  return n;
}

function held(match: MatchState, owner: number): number {
  let n = 0;
  for (const d of match.defs) {
    const p = match.planets[d.id];
    if (p?.owner === owner) n += p.garrison;
  }
  for (const c of match.crafts ?? []) {
    if (c.owner === owner && c.payload > 0) n += c.payload;
  }
  return n;
}

type Sample = { t: number; sats: number };
const growth = new Map<string, Sample[]>();

function stalled(match: MatchState, factionId: number, time: number): boolean {
  const key = `${match.seed}:${factionId}`;
  const sats = held(match, factionId);
  const row = growth.get(key) ?? [];
  const last = row[row.length - 1];
  if (!last || time - last.t >= 1) row.push({ t: time, sats });
  while (row.length > 1 && time - row[0].t > 60) row.shift();
  growth.set(key, row);
  const old = row[0];
  if (!old || time - old.t < 60) return false;
  const delta = old.sats > 0 ? (sats - old.sats) / old.sats : 0;
  return delta < 0.01;
}

type Upgrade = {
  fromId: string;
  toId: string;
  cost: number;
  send: number;
  roi: number;
  affordable: boolean;
  kind: "home" | "aid" | "take";
  victim: number;
  wounded: boolean;
  near: number;
  cut: number;
  hop: number;
};

type Mood = "expand" | "fortify" | "hunt";

/** Kill switch. False skips the lump, the rival nudge, and the telegraph. */
export const botAdditions = { enabled: true };

type Wind = { fromId: string; to: string; amount: number; roi: number; left: number };

function windTicks(skill: Skill): number {
  if (!botAdditions.enabled) return 0;
  if (skill === "cautious") return 3;
  if (skill === "relentless") return 1;
  return 2;
}

/** Another rival already sits near you, and this bot has a legal hit on a rival. */
function nudgeRival(window: Upgrade[], match: MatchState, factionId: number, time: number) {
  if (!botAdditions.enabled) return;
  const yours: { x: number; y: number }[] = [];
  const theirs: { x: number; y: number }[] = [];
  for (const d of match.defs) {
    const owner = match.planets[d.id]?.owner;
    const at = planetWorld(d, time, false);
    if (owner === PLAYER_ID) yours.push(at);
    else if (owner != null && owner > 0 && owner !== factionId) theirs.push(at);
  }
  let near = false;
  for (const a of yours) {
    for (const b of theirs) {
      if (Math.hypot(a.x - b.x, a.y - b.y) < 560) near = true;
    }
  }
  if (!near) return;
  if (!window.some((u) => u.kind === "take" && u.victim > 0 && u.victim !== PLAYER_ID)) return;
  for (const u of window) {
    if (u.kind === "take" && u.victim === PLAYER_ID) u.roi *= 0.85;
  }
}

/**
 * After the old chooser has already picked. A partial take waits a little so it
 * leaves as a lump. A real take then waits a few bot ticks on the same target
 * before it launches. A heal, or a world that is already burning, still goes now.
 */
function present(
  match: MatchState,
  factionId: number,
  time: number,
  skill: Skill,
  mem: Mind,
  pool: Upgrade[],
  order: AiOrder | null,
): AiOrder | null {
  if (!botAdditions.enabled) {
    mem.wind = null;
    return order;
  }
  const fromId = order ? (Object.keys(order.from)[0] ?? "") : "";
  const amount = fromId && order ? order.from[fromId] : 0;
  const row = order ? pool.find((u) => u.fromId === fromId && u.toId === order.to) : undefined;
  const offensive = row?.kind === "take";
  if (mem.wind && match.planets[mem.wind.fromId]?.owner !== factionId) mem.wind = null;

  const probe = !!(offensive && row && mem.bait && mem.bait.to === order?.to && amount <= row.cost * 0.35);
  const trouble = !!(fromId && (match.planets[fromId]?.release || 0) > 0);
  const partial = !!(offensive && row && !row.affordable && amount < row.cost * 0.75 && !probe && !trouble);

  let proposal = order;
  if (partial) {
    if (mem.lumpUntil <= 0) mem.lumpUntil = time + 10;
    if (time < mem.lumpUntil) {
      mem.floorUntil = 0;
      proposal = null;
    }
  } else if (order) mem.lumpUntil = 0;

  const roi = row?.roi ?? 0;
  if (proposal && !offensive) {
    if (!mem.wind || trouble || roi > mem.wind.roi * 1.15) {
      mem.wind = null;
      return proposal;
    }
  } else if (proposal && offensive && fromId) {
    const ticks = windTicks(skill);
    if (ticks <= 0) {
      mem.wind = null;
      return proposal;
    }
    const wind = mem.wind;
    const same = !!wind && wind.fromId === fromId && wind.to === proposal.to;
    if (!same && (!wind || roi > wind.roi * 1.15)) {
      mem.wind = { fromId, to: proposal.to, amount, roi, left: ticks };
      return null;
    }
    if (same && wind) {
      wind.amount = amount;
      wind.roi = Math.max(wind.roi, roi);
    }
  }

  if (!mem.wind) return null;
  mem.wind.left -= 1;
  if (mem.wind.left > 0) return null;
  const fired = { from: { [mem.wind.fromId]: mem.wind.amount }, to: mem.wind.to };
  mem.wind = null;
  return fired;
}

type Mind = {
  seed: number;
  last: number;
  seen: Record<string, number>;
  grudge: number;
  grudgeLeft: number;
  commitTo: string | null;
  commitUntil: number;
  bait: { to: string; owner: number; garrison: number; until: number } | null;
  mood: Mood;
  phase: Phase;
  stance: Stance;
  rule: ChapterRule;
  note: string;
  lostRecently: boolean;
  grew: boolean;
  floorUntil: number;
  /** Holds a partial send until this time, then lets it go. 0 means not waiting. */
  lumpUntil: number;
  /** A take already chosen, waiting out its telegraph. */
  wind: Wind | null;
};

const minds = new Map<string, Mind>();

function blankMind(seed: number, time: number): Mind {
  return {
    seed,
    last: time,
    seen: {},
    grudge: 0,
    grudgeLeft: 0,
    commitTo: null,
    commitUntil: 0,
    bait: null,
    mood: "expand",
    phase: "early",
    stance: "expand",
    rule: "finish",
    note: "",
    lostRecently: false,
    grew: false,
    floorUntil: 0,
    lumpUntil: 0,
    wind: null,
  };
}

function worldCount(match: MatchState, owner: number) {
  let n = 0;
  for (const d of match.defs) if (match.planets[d.id]?.owner === owner) n += 1;
  return n;
}

function nearestOwn(match: MatchState, factionId: number, x: number, y: number, time: number) {
  let best = Infinity;
  for (const d of match.defs) {
    if (match.planets[d.id]?.owner !== factionId) continue;
    const p = planetWorld(d, time, false);
    best = Math.min(best, Math.hypot(p.x - x, p.y - y));
  }
  return best;
}

function isWounded(match: MatchState, dstId: string, factionId: number) {
  const dst = match.defs.find((d) => d.id === dstId);
  const dt = match.planets[dstId];
  if (!dst || !dt || dt.owner === factionId) return false;
  if ((dt.release || 0) > 0) return true;
  if (dt.owner === NEUTRAL_ID && (dt.claim || 0) > 0) return true;
  const bar = dt.owner === NEUTRAL_ID ? worldClaim(dst) : worldHealth(dst, dt.level || 1);
  if (dt.garrison < bar * 0.45) return true;
  if (outgoing(match, dstId) > Math.max(4, dt.garrison * 0.4)) return true;
  return false;
}

function cutScore(match: MatchState, dstId: string, victim: number, time: number) {
  const dst = match.defs.find((d) => d.id === dstId);
  if (!dst || victim === NEUTRAL_ID) return 0;
  const others = match.defs.filter((d) => d.id !== dstId && match.planets[d.id]?.owner === victim);
  if (others.length < 2) return 0;
  const target = planetWorld(dst, time, false);
  const pts = others.map((d) => planetWorld(d, time, false));
  let best = 0;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const span = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
      if (span < 80) continue;
      const via =
        Math.hypot(pts[i].x - target.x, pts[i].y - target.y) + Math.hypot(target.x - pts[j].x, target.y - pts[j].y);
      const slack = via - span;
      if (slack < span * 0.35) best = Math.max(best, 1 - slack / (span * 0.35));
    }
  }
  return best;
}

function preyOf(match: MatchState, factionId: number) {
  const counts = new Map<number, number>();
  for (const d of match.defs) {
    const owner = match.planets[d.id]?.owner;
    if (owner == null || owner === factionId || owner === NEUTRAL_ID) continue;
    counts.set(owner, (counts.get(owner) ?? 0) + 1);
  }
  let best = PLAYER_ID;
  let n = -1;
  for (const [id, count] of counts) {
    if (count > n || (count === n && id === PLAYER_ID)) {
      n = count;
      best = id;
    }
  }
  return best;
}

function openWorld(match: MatchState) {
  return match.defs.some((d) => {
    const p = match.planets[d.id];
    return !!p && p.owner === NEUTRAL_ID && (p.coolLeft ?? 0) <= 0;
  });
}

function trailing(match: MatchState, factionId: number) {
  const mine = worldCount(match, factionId);
  const best = worldCount(match, preyOf(match, factionId));
  return { mine, best, behind: mine <= 1 || (best > 0 && mine < best), ahead: best > 0 && mine > best };
}

/** Easy is only survival. Hard is only the close. Normal uses survival while behind. */
function survivalBook(match: MatchState, factionId: number): boolean {
  const skill = match.setup.skill;
  if (skill === "cautious") return true;
  if (skill === "relentless") return false;
  const spot = trailing(match, factionId);
  return !spot.ahead;
}

function activeChapter(factionId: number, match: MatchState, mem: Mind): Chapter & { phase: Phase } {
  const id = archetypeId(factionId);
  const phase = phaseOf(match);
  const survival = survivalBook(match, factionId);
  const spot = trailing(match, factionId);
  if (survival && spot.mine <= 1) {
    if (id === "the_steady_operator") {
      return { phase, stance: "expand", rule: "no-fresh", note: "Down to one world, so it takes an empty world in full before it probes again." };
    }
    if (id === "the_stubborn_traditionalist") {
      return { phase, stance: "cut", rule: "cut-or-empty", note: "Down to one world, so it takes an empty world when no hinge is open." };
    }
    if (id === "the_lucky_gambler") {
      return { phase, stance: "expand", rule: "no-fresh", note: "Down to one world, so it takes an empty world before it banks." };
    }
    if (id === "the_casual") {
      return { phase, stance: "expand", rule: "nearest-empty", note: "Down to one world, so it takes the nearest empty world instead of climbing." };
    }
    if (id === "the_hyperactive_goblin" || id === "the_burst_prodigy") {
      return {
        phase,
        stance: "expand",
        rule: "nearest-empty",
        note: "Down to one world, so it takes the nearest empty world before it goes back to the fight.",
      };
    }
    if (id === "the_min_maxer" || id === "the_hoarder_pusher") {
      if (id === "the_hoarder_pusher" && !openWorld(match)) {
        return { phase, stance: "fortify", rule: "bank", note: "One world and nothing empty, so it climbs instead of dumping the pile." };
      }
      return {
        phase,
        stance: "expand",
        rule: "nearest-empty",
        note: id === "the_min_maxer"
          ? "Takes the nearest empty world before it spends the pile on a grudge."
          : "Takes the nearest empty world before it dumps the pile on the leader.",
      };
    }
    if (lessonReady(id)) {
      return {
        phase,
        stance: "expand",
        rule: "nearest-empty",
        note: "A repeated loss on more than one map. Takes the nearest empty world, then goes back.",
      };
    }
  }
  if (id === "the_min_maxer" && mem.commitTo) {
    return { phase, stance: "punish", rule: "finish", note: "It is still finishing the capture it started." };
  }
  if (id === "the_lucky_gambler" && spot.mine > 1 && spot.best > 0 && spot.mine < spot.best) {
    return { phase, stance: "fortify", rule: "bank", note: "It is behind, so it banks until it is no longer trailing." };
  }
  if (survival && spot.ahead) {
    return { phase, stance: "fortify", rule: "bank", note: "Ahead, so it stops pressing and climbs what it holds." };
  }
  const chapter = PLAYBOOKS[id][phase];
  if (!survival && spot.ahead && (chapter.stance === "fortify" || chapter.rule === "bank")) {
    if (id === "the_casual") {
      return { phase, stance: "expand", rule: "neighbors", note: "Ahead, so it keeps taking neighbors instead of sitting." };
    }
    if (id === "the_hoarder_pusher") return { phase, ...PLAYBOOKS[id].late };
    return { phase, stance: "punish", rule: "leader", note: "Ahead, so it spends the lead instead of sitting on it." };
  }
  return { phase, ...chapter };
}

export function readChapter(match: MatchState, factionId: number): string {
  const mem = minds.get(`${match.seed}:${factionId}`);
  if (!mem || mem.seed !== match.seed) return "";
  return `${mem.phase} / ${mem.stance} / ${mem.rule}. ${mem.note}`;
}

function recall(match: MatchState, factionId: number, time: number, bot: BotVars): Mind {
  const key = `${match.seed}:${factionId}`;
  let mem = minds.get(key);
  if (!mem || mem.seed !== match.seed || time + 0.5 < mem.last) mem = blankMind(match.seed, time);
  const gap = Math.max(0, time - mem.last);
  mem.grudgeLeft -= gap;
  if (mem.grudgeLeft <= 0) mem.grudge = 0;
  let lost = false;
  for (const d of match.defs) {
    const owner = match.planets[d.id]?.owner ?? NEUTRAL_ID;
    const prev = mem.seen[d.id];
    if (prev === factionId && owner !== factionId && owner > 0) {
      lost = true;
      mem.grudge = owner;
      mem.grudgeLeft = 18 + 28 * bot.grudge;
    }
    mem.seen[d.id] = owner;
  }
  mem.lostRecently = mem.lostRecently || lost;
  if (mem.commitTo) {
    const heldBy = match.planets[mem.commitTo]?.owner;
    const inboundLeft = mem.commitTo ? inbound(match, mem.commitTo, factionId) : 0;
    const releaseOwner = match.planets[mem.commitTo]?.releaseOwner;
    if (heldBy == null || heldBy === factionId) mem.commitTo = null;
    else if (time > mem.commitUntil && inboundLeft < 1 && releaseOwner !== factionId) mem.commitTo = null;
  }
  if (worldCount(match, factionId) >= 2) mem.grew = true;
  const chapter = activeChapter(factionId, match, mem);
  mem.phase = chapter.phase;
  mem.stance = chapter.stance;
  mem.rule = chapter.rule;
  mem.note = chapter.note;
  mem.mood = chapter.stance === "fortify" ? "fortify" : chapter.stance === "expand" ? "expand" : "hunt";
  mem.lostRecently = false;
  mem.last = time;
  minds.set(key, mem);
  return mem;
}

function thinnestOther(match: MatchState, owner: number, skip: string) {
  let best: { id: string; garrison: number } | null = null;
  for (const d of match.defs) {
    if (d.id === skip) continue;
    const st = match.planets[d.id];
    if (!st || st.owner !== owner) continue;
    if (!best || st.garrison < best.garrison) best = { id: d.id, garrison: st.garrison };
  }
  return best?.id ?? null;
}

function orderOf(row: Upgrade, send = row.send): AiOrder {
  return { from: { [row.fromId]: Math.max(1, Math.floor(send)) }, to: row.toId };
}

function nearestRow(rows: Upgrade[]): Upgrade {
  return rows.reduce((a, b) => (a.near <= b.near ? a : b));
}

/** Floor under every chapter. Revert by deleting this and the call in thinkAi. */
function floorTake(pool: Upgrade[], mem: Mind, time: number): AiOrder | "save" | null {
  const takes = pool.filter((u) => u.kind === "take" && u.send >= 4);
  if (!takes.length) return null;
  const empty = takes.filter((u) => u.victim === NEUTRAL_ID);
  const bleeding = takes.filter((u) => u.wounded);
  if (empty.length) {
    const row = nearestRow(empty);
    if (row.affordable) return orderOf(row);
    if (row.send < 8 || time < mem.floorUntil) return "save";
    mem.floorUntil = time + 8;
    return orderOf(row);
  }
  if (bleeding.length) {
    const row = nearestRow(bleeding);
    if (row.affordable) return orderOf(row);
    if (row.send < 8 || time < mem.floorUntil) return "save";
    mem.floorUntil = time + 8;
    return orderOf(row);
  }
  if (time < mem.floorUntil) return null;
  const row = nearestRow(takes);
  const portion = botAdditions.enabled ? 0.75 : 0.4;
  const send = Math.max(4, Math.min(row.send, Math.ceil(row.cost * portion)));
  if (send > row.send) return "save";
  mem.floorUntil = time + 16;
  return orderOf(row, send);
}

function bestToward(window: Upgrade[], to: string): Upgrade | null {
  const rows = window.filter((u) => u.toId === to && u.send >= 1);
  rows.sort((a, b) => Number(b.affordable) - Number(a.affordable) || b.roi - a.roi);
  return rows[0] ?? null;
}

function weigh(window: Upgrade[], bot: BotVars, mem: Mind, prey: number) {
  const takes = window.filter((u) => u.kind === "take");
  const closest = takes.reduce((min, u) => Math.min(min, u.near), Infinity);
  const border = Math.max(480, Number.isFinite(closest) ? closest : 480);
  const mood = bot.mood;
  for (const u of window) {
    if (u.kind !== "take") {
      if (mem.mood === "fortify") u.roi *= 1 + 1.4 * mood;
      else if (mem.mood === "hunt") u.roi *= 1 - 0.45 * mood;
      continue;
    }
    if (mem.grudge > 0 && u.victim === mem.grudge) u.roi *= 1 + 2.4 * bot.grudge;
    if (u.wounded) u.roi *= 1 + 1.5 * bot.vulture;
    else u.roi *= Math.max(0.04, 1 - 0.94 * bot.vulture);
    if (bot.reach === "border" && u.near > border * 1.08) u.roi *= 0.12;
    if (bot.reach === "hunt" && u.victim === prey) u.roi *= 1.85;
    if (bot.reach === "cut" || mem.stance === "cut") u.roi *= 1 + 2.2 * u.cut;
    if (mem.mood === "expand") u.roi *= u.victim === NEUTRAL_ID ? 1 + 0.8 * mood : 1 - 0.55 * mood;
    else if (mem.mood === "fortify") u.roi *= 1 - 0.72 * mood;
    else if (u.victim === prey) u.roi *= 1 + 0.9 * mood;
  }
}

function borderOf(rows: Upgrade[]): number {
  let closest = Infinity;
  for (const u of rows) if (u.kind === "take") closest = Math.min(closest, u.near);
  return Math.max(480, Number.isFinite(closest) ? closest : 480);
}

function allowed(rows: Upgrade[], mem: Mind, match: MatchState, factionId: number, time: number, prey: number): Upgrade[] {
  const border = borderOf(rows);
  const open = stalled(match, factionId, time);
  let nearestEmpty = Infinity;
  for (const u of rows) if (u.kind === "take" && u.victim === NEUTRAL_ID) nearestEmpty = Math.min(nearestEmpty, u.near);
  return rows.filter((u) => {
    if (u.kind !== "take") return true;
    if (mem.stance === "fortify") return false;
    if ((mem.rule === "finish" || mem.rule === "one-front") && mem.commitTo && u.toId !== mem.commitTo) return false;
    if (mem.rule === "neighbors" && u.near > border * 1.08) return false;
    if (mem.rule === "nearest-empty" && (u.victim !== NEUTRAL_ID || u.near > nearestEmpty * 1.15)) return false;
    if (mem.rule === "bank" && !open) return false;
    if (mem.rule === "wounded-only" && !u.wounded) return false;
    if (mem.rule === "no-fresh" && u.victim !== NEUTRAL_ID && !u.wounded) return false;
    if (mem.rule === "cut-only" && u.cut <= 0.35) return false;
    if (mem.rule === "cut-or-empty" && u.victim !== NEUTRAL_ID && u.cut <= 0.35) return false;
    if (mem.rule === "leader" && u.victim !== prey && u.victim !== NEUTRAL_ID) return false;
    if (mem.rule === "grudge" && mem.grudge > 0 && u.victim !== mem.grudge) return false;
    return true;
  });
}

function addSeen(window: Upgrade[], pool: Upgrade[], pred: (u: Upgrade) => boolean) {
  const extra = pool.filter(pred).sort((a, b) => b.roi - a.roi)[0];
  if (extra && !window.includes(extra)) window.push(extra);
}

export function massingPlanet(seed: number, planetId: string): boolean {
  if (!botAdditions.enabled) return false;
  for (const mem of minds.values()) {
    if (mem.seed !== seed || !mem.wind || mem.wind.left <= 0) continue;
    if (mem.wind.fromId === planetId) return true;
  }
  return false;
}

export function thinkAi(match: MatchState, factionId: number, time: number, _rand: () => number = Math.random): AiOrder | null {
  const skill = match.setup.skill;
  const bot = botVars(factionId, skill);
  const mem = recall(match, factionId, time, bot);
  const prey = preyOf(match, factionId);
  const mine = match.defs.filter((d) => match.planets[d.id]?.owner === factionId);
  if (mine.length === 0) return present(match, factionId, time, skill, mem, [], null);

  const pool: Upgrade[] = [];
  for (const src of mine) {
    const st = match.planets[src.id];
    const spare = Math.floor(st.garrison) - outgoing(match, src.id);
    if (spare < 1) continue;
    const lv = st.level || 1;
    const cap = src.maxLevel ?? MAX_LEVEL;
    const wound = st.release || 0;
    const spending = mem.phase === "late" && mem.rule === "leader";
    const floor = wound > 0 || spending ? 0 : Math.round(bot.reserve * (8 + lv * 6));
    const available = Math.max(0, spare - floor);
    if (available < 1) continue;
    const home = (kind: Upgrade["kind"], toId: string, cost: number, roi: number, victim = factionId): Upgrade => ({
      fromId: src.id,
      toId,
      cost,
      send: Math.min(available, cost),
      roi,
      affordable: available >= cost,
      kind,
      victim,
      wounded: false,
      near: 0,
      cut: 0,
      hop: 0,
    });
    if (wound > 0) {
      pool.push(home("home", src.id, Math.ceil(wound), worldForge(src, lv) / Math.ceil(wound)));
    } else if (lv < cap && (st.quiet ?? 0) <= 0) {
      const cost = Math.max(1, Math.ceil(worldRise(src, lv) - (st.upgrade || 0)));
      const next = worldForge(src, lv + 1) - worldForge(src, lv);
      pool.push(home("home", src.id, cost, Math.max(0.01, next) / cost));
    }

    const fromPos = planetWorld(src, time, false);
    for (const dst of match.defs) {
      if (dst.id === src.id) continue;
      const dt = match.planets[dst.id];
      if (!dt || (dt.coolLeft ?? 0) > 0) continue;
      const toPos = planetWorld(dst, time, false);
      const hop = Math.max(0, Math.hypot(fromPos.x - toPos.x, fromPos.y - toPos.y) - planetSize(src) - planetSize(dst));
      const keep = travelKeep(hop);
      const near = nearestOwn(match, factionId, toPos.x, toPos.y, time);
      if (dt.owner === factionId) {
        const dlv = dt.level || 1;
        const dcap = dst.maxLevel ?? MAX_LEVEL;
        const hurt = dt.release || 0;
        if (hurt <= 0 && dlv >= dcap) continue;
        const cost = hurt > 0 ? Math.ceil(hurt) : Math.max(1, Math.ceil(worldRise(dst, dlv) - (dt.upgrade || 0)));
        const need = Math.ceil(cost / keep);
        const boost = hurt > 0 ? worldForge(dst, dlv) : Math.max(0.01, worldForge(dst, dlv + 1) - worldForge(dst, dlv));
        pool.push({
          ...home("aid", dst.id, need, (boost * keep) / need),
          hop,
          near,
        });
        continue;
      }
      const price = capturePrice(match, dst.id, factionId);
      const need = Math.max(4, Math.ceil(price / keep));
      let boost = worldForge(dst, dt.level || 1) * keep;
      if (dt.owner === NEUTRAL_ID) boost *= 1.15;
      else if (dt.owner === PLAYER_ID) boost *= skill === "relentless" ? 1.45 : skill === "cautious" ? 0.75 : 1.1;
      else boost *= 0.9;
      boost /= 1 + dist(fromPos, toPos) / 900;
      pool.push({
        ...home("take", dst.id, need, boost / need, dt.owner),
        wounded: isWounded(match, dst.id, factionId),
        near,
        cut: cutScore(match, dst.id, dt.owner, time),
        hop,
      });
    }
  }

  if (pool.length === 0) return present(match, factionId, time, skill, mem, pool, null);
  let legal = allowed(pool, mem, match, factionId, time, prey);
  if (legal.length === 0) return present(match, factionId, time, skill, mem, pool, null);
  if (mem.rule === "nearest-empty" || mem.rule === "no-fresh") {
    const empties = legal.filter((u) => u.kind === "take" && u.victim === NEUTRAL_ID);
    if (empties.length) legal = empties;
  }
  legal.sort((a, b) => a.cost - b.cost || b.roi - a.roi);
  const window = legal.slice(0, bot.horizon_depth);
  if (mem.grudge > 0) addSeen(window, legal, (u) => u.kind === "take" && u.victim === mem.grudge);
  if (bot.vulture > 0.5) addSeen(window, legal, (u) => u.kind === "take" && u.wounded);
  if (mem.stance === "cut" || bot.reach === "cut") addSeen(window, legal, (u) => u.kind === "take" && u.cut > 0.35);
  weigh(window, bot, mem, prey);
  nudgeRival(window, match, factionId, time);

  const chapterCanTake = legal.some((u) => u.kind === "take" && u.affordable);
  if (!chapterCanTake && !mem.commitTo) {
    const floored = floorTake(pool, mem, time);
    if (floored === "save") return present(match, factionId, time, skill, mem, pool, null);
    if (floored) return present(match, factionId, time, skill, mem, pool, floored);
  }

  const baited = mem.rule === "probe" ? resolveBait(match, time, bot, mem, window, legal) : null;
  if (baited) return present(match, factionId, time, skill, mem, pool, baited);

  if (mem.rule !== "probe" && (mem.mood !== "fortify" || stalled(match, factionId, time))) {
    const dumped = maybePrestige(match, factionId, time, bot, mem, window);
    if (dumped) return present(match, factionId, time, skill, mem, pool, dumped);
  }

  const stuck = mem.commitTo ? bestToward(window, mem.commitTo) : null;
  if (stuck && bot.commit >= 0.35 && (stuck.affordable || bot.commit >= 0.7)) {
    return present(match, factionId, time, skill, mem, pool, orderOf(stuck));
  }

  const picked = choose(window, bot);
  if (!picked) return present(match, factionId, time, skill, mem, pool, null);
  const row = window.find((u) => u.toId === picked.to && u.fromId in picked.from);
  if (row?.kind === "take" && bot.commit >= 0.4) {
    mem.commitTo = row.toId;
    mem.commitUntil = time + 12 + 10 * bot.commit;
  }
  return present(match, factionId, time, skill, mem, pool, picked);
}

function resolveBait(
  match: MatchState,
  time: number,
  bot: BotVars,
  mem: Mind,
  window: Upgrade[],
  pool: Upgrade[],
): AiOrder | null {
  if (mem.bait && time < mem.bait.until) return null;
  if (mem.bait) {
    const now = match.planets[mem.bait.to];
    const reinforced = !!now && now.owner === mem.bait.owner && now.garrison > mem.bait.garrison * 1.18;
    let to = mem.bait.to;
    if (reinforced) to = thinnestOther(match, mem.bait.owner, mem.bait.to) ?? mem.bait.to;
    mem.bait = null;
    const strike = bestToward(pool, to) ?? bestToward(window, to);
    if (!strike) return null;
    if (bot.commit >= 0.3) {
      mem.commitTo = to;
      mem.commitUntil = time + 16;
    }
    return orderOf(strike);
  }
  if (bot.bait < 0.45 || mem.mood === "fortify" || (mem.grudge > 0 && bot.grudge > 0.7)) return null;
  const prize = [...window]
    .filter((u) => u.kind === "take" && u.victim > 0 && u.send >= 4)
    .sort((a, b) => b.roi - a.roi)[0];
  if (!prize) return null;
  const probe = Math.max(4, Math.min(prize.send, Math.ceil(prize.cost * 0.28)));
  if (probe > prize.send) return null;
  mem.bait = {
    to: prize.toId,
    owner: prize.victim,
    garrison: match.planets[prize.toId]?.garrison ?? 0,
    until: time + prize.hop / 108 + 3.5,
  };
  return orderOf(prize, probe);
}

function choose(window: Upgrade[], bot: BotVars): AiOrder | null {
  const affordable = window.filter((u) => u.affordable && u.send >= 1);
  if (affordable.length === 0) return null;
  if (bot.efficiency_focus >= 0.85) {
    affordable.sort((a, b) => b.roi - a.roi);
    return orderOf(affordable[0]);
  }
  const keep = Math.max(1, Math.ceil(affordable.length * (1 - bot.efficiency_focus * 0.65)));
  const cheap = [...affordable].sort((a, b) => a.cost - b.cost).slice(0, keep);
  cheap.sort((a, b) => b.roi - a.roi);
  return orderOf(cheap[0]);
}

function maybePrestige(
  match: MatchState,
  factionId: number,
  time: number,
  bot: BotVars,
  mem: Mind,
  window: Upgrade[],
): AiOrder | null {
  let best: { id: string; send: number } | null = null;
  for (const src of match.defs) {
    const st = match.planets[src.id];
    if (!st || st.owner !== factionId) continue;
    const floor = Math.round(bot.reserve * (8 + (st.level || 1) * 6));
    const send = Math.floor(st.garrison) - outgoing(match, src.id) - floor;
    if (send < 8) continue;
    if (!best || send > best.send) best = { id: src.id, send };
  }
  if (!best) return null;
  const ratio = best.send / Math.max(1, held(match, factionId));
  const aggression = bot.prestige_aggression;
  const ready = aggression >= 0.999 ? true : aggression <= 0.001 ? stalled(match, factionId, time) : ratio >= 1.1 - aggression;
  if (!ready) return null;
  const grudge = window.filter((u) => u.kind === "take" && mem.grudge > 0 && u.victim === mem.grudge);
  const lead = mem.rule === "leader" ? window.filter((u) => u.kind === "take" && u.victim === preyOf(match, factionId)) : [];
  const target = (grudge.length ? grudge : lead.length ? lead : window.filter((u) => u.toId !== best.id && u.kind === "take")).sort(
    (a, b) => b.roi - a.roi,
  )[0];
  if (!target) return null;
  return { from: { [best.id]: best.send }, to: target.toId };
}

function capturePrice(match: MatchState, dstId: string, factionId: number): number {
  const dst = match.defs.find((d) => d.id === dstId);
  const dt = match.planets[dstId];
  if (!dst || !dt) return 1e9;
  const theirs =
    dt.owner === NEUTRAL_ID && dt.claimOwner !== factionId && dt.claimOwner !== NEUTRAL_ID ? (dt.claim ?? 0) : 0;
  const mineClaim = dt.owner === NEUTRAL_ID && dt.claimOwner === factionId ? (dt.claim ?? 0) : 0;
  const lv = dt.level || 1;
  const release = dt.release || 0;
  const releaseMine = dt.owner !== NEUTRAL_ID && dt.releaseOwner === factionId ? release : 0;
  const releaseTheirs =
    dt.owner !== NEUTRAL_ID && dt.releaseOwner !== factionId && dt.releaseOwner !== NEUTRAL_ID && dt.releaseOwner != null
      ? release
      : 0;
  const price =
    dt.owner === NEUTRAL_ID
      ? Math.max(0, worldClaim(dst) + theirs - mineClaim)
      : Math.max(0, dt.garrison + (dt.upgrade || 0) + worldHealth(dst, lv) + releaseTheirs - releaseMine + worldClaim(dst));
  const friendly = dt.owner === NEUTRAL_ID ? 0 : inbound(match, dst.id, dt.owner);
  return Math.max(1, price - inbound(match, dst.id, factionId) + friendly * 0.55);
}

export type AiOrder = { from: Record<string, number>; to: string };
