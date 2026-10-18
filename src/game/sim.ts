import { clearLossCards, nextThink, noteLastWorld, sealLosses, setHeadless, thinkAi } from "./ai";
import { MAX_LEVEL, SETTLE_S, effectiveForge, keptAfterCapture, lockSeconds, travelKeep, worldClaim, worldHealth, worldRise, generateSystem, OFFLINE_CAP_S, planetSize, planetWorld, satWorld, shellRadii, SPEED_SCALE, STEP, visualSatellites, bindOrbitFrame, setWhirlClock } from "./catalog";
import { canLaunch, compileMap, loadMaps, cohortFor, turnFor, type CustomMap } from "./maps";
import { defaultState, loadSave, writeSave } from "./save";
import type { Craft, GameState, JuiceEvent, MatchState, PlanetLevel, Selection, SendTarget, SetupConfig } from "./types";
import { NEUTRAL_ID, PLAYER_ID } from "./types";

const listeners = new Set<(e: JuiceEvent) => void>();
let craftSeq = 1;
let saveAcc = 0;
let clashSoundAt = 0;
export let motionReduced = false;

const craftPrev = new Map<number, { x: number; y: number }>();

function rememberCrafts(m: MatchState) {
  for (const c of m.crafts) {
    if (c.payload < 1) continue;
    craftPrev.set(c.id, { x: c.x, y: c.y });
  }
}

export function craftDraw(c: { id: number; x: number; y: number }, alpha: number) {
  const prev = craftPrev.get(c.id);
  if (!prev) return { x: c.x, y: c.y };
  const a = Math.min(1, Math.max(0, alpha));
  return { x: prev.x + (c.x - prev.x) * a, y: prev.y + (c.y - prev.y) * a };
}

function at(def: Parameters<typeof planetWorld>[0], time: number) {
  return planetWorld(def, time, motionReduced);
}

const CRUISE = 108;
const HIT = 6.2;
const MAX_BODIES = 40;
const MAX_CRAFTS = 450;

type Nudge = { ox: number; oy: number; vx: number; vy: number };
const nudges = new Map<string, Nudge>();
const sparks: { x: number; y: number; hostile: boolean }[] = [];

export const sim = {
  state: defaultState(),
  hydrated: false,
};

export function setMotionReduced(v: boolean) {
  motionReduced = v;
}

export function satelliteOffset(planet: string, index: number): { x: number; y: number } {
  const n = nudges.get(`${planet}#${index}`);
  return n ? { x: n.ox, y: n.oy } : { x: 0, y: 0 };
}

export function takeSparks(): { x: number; y: number; hostile: boolean }[] {
  if (sparks.length === 0) return [];
  const out = sparks.slice();
  sparks.length = 0;
  return out;
}

export function onJuice(fn: (e: JuiceEvent) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(e: JuiceEvent) {
  for (const fn of listeners) fn(e);
}

export function match(): MatchState | null {
  return sim.state.match;
}

export function travelDuration(fromId: string, toId: string, m: MatchState, time = 0): number {
  const a = m.defs.find((d) => d.id === fromId);
  const b = m.defs.find((d) => d.id === toId);
  if (!a || !b) return 1;
  const pa = planetWorld(a, time, false);
  const pb = planetWorld(b, time, false);
  const dist = Math.hypot(pa.x - pb.x, pa.y - pb.y);
  return Math.max(0.6, dist / 128);
}

export function worldsOf(owner: number, m = match()): number {
  if (!m) return 0;
  let n = 0;
  for (const d of m.defs) if (m.planets[d.id]?.owner === owner) n += 1;
  return n;
}

export function garrisonOf(owner: number, m = match()): number {
  if (!m) return 0;
  let n = 0;
  for (const d of m.defs) {
    const p = m.planets[d.id];
    if (p?.owner === owner) n += p.garrison;
  }
  for (const c of m.crafts) if (c.owner === owner && c.payload > 0) n += c.payload;
  return n;
}

export function productionOf(owner: number, m = match()): number {
  if (!m) return 0;
  let r = 0;
  for (const d of m.defs) {
    const p = m.planets[d.id];
    if (p?.owner === owner) r += effectiveForge(d, p.level || 1, p.garrison, p.quiet ?? 0);
  }
  return r;
}

function tune(m: MatchState) {
  for (const d of m.defs) {
    const p = m.planets[d.id];
    if (!p) continue;
    if (d.maxLevel == null) d.maxLevel = (d.level ?? 1) > 1 ? (d.level as PlanetLevel) : MAX_LEVEL;
    if (!p.level) p.level = 1;
    if (typeof p.claim !== "number") p.claim = 0;
    if (typeof p.claimOwner !== "number") p.claimOwner = NEUTRAL_ID;
    if (typeof p.release !== "number") p.release = 0;
    if (typeof p.releaseOwner !== "number") p.releaseOwner = NEUTRAL_ID;
    if (typeof p.upgrade !== "number") p.upgrade = 0;
    if (typeof p.quiet !== "number" || p.quiet < 0) p.quiet = 0;
    if (typeof p.coolLeft !== "number" || p.coolLeft < 0 || p.owner !== NEUTRAL_ID) p.coolLeft = 0;
    const banked = p.upgrade || 0;
    const wound = p.release || 0;
    if (banked > 0 && wound > 0) {
      const cancel = Math.min(banked, wound);
      p.upgrade = banked - cancel;
      p.release = wound - cancel;
      if (p.release <= 0) p.releaseOwner = NEUTRAL_ID;
    }
    d.level = Math.max(1, Math.min(MAX_LEVEL, Math.round(p.level))) as PlanetLevel;
  }
}

function reinforce(def: MatchState["defs"][number], p: MatchState["planets"][string], amount: number) {
  if (amount < 1) return;
  const wound = p.release || 0;
  if (wound > 0) {
    if (amount < wound) {
      p.release = wound - amount;
      return;
    }
    amount -= wound;
    p.release = 0;
    p.releaseOwner = NEUTRAL_ID;
  }
  if (amount > 0) investUpgrade(def, p, amount);
}

function investUpgrade(def: MatchState["defs"][number], p: MatchState["planets"][string], amount: number) {
  if (amount < 1) return;
  const cap = def.maxLevel ?? MAX_LEVEL;
  if ((p.level || 1) >= cap) {
    p.garrison = Math.min(9999, p.garrison + amount);
    return;
  }
  p.upgrade = (p.upgrade || 0) + amount;
  grow(def, p);
  if ((p.level || 1) >= cap && p.upgrade > 0) {
    p.garrison = Math.min(9999, p.garrison + p.upgrade);
    p.upgrade = 0;
  }
}

function grow(def: MatchState["defs"][number], p: MatchState["planets"][string]) {
  const cap = def.maxLevel ?? MAX_LEVEL;
  let guard = 0;
  while (p.level < cap && guard++ < 5) {
    const cost = worldRise(def, p.level || 1);
    if (p.upgrade < cost) break;
    p.upgrade -= cost;
    p.level += 1;
  }
  def.level = Math.max(1, Math.min(MAX_LEVEL, Math.round(p.level))) as PlanetLevel;
}

let ignorePlayerLoss = false;
let quietPersist = false;

/** Headless batches only. A real match still ends when the player is wiped out. */
export function setIgnorePlayerLoss(on: boolean) {
  ignorePlayerLoss = on;
}

/** Headless batches only. Skips writing the save on every tick. */
export function setQuiet(on: boolean) {
  quietPersist = on;
  setHeadless(on);
}

function teamAlive(id: number, m: MatchState) {
  return worldsOf(id, m) > 0 || garrisonOf(id, m) > 0;
}

function checkResult(m: MatchState) {
  sealLosses(m);
  if (m.result !== "playing") return;
  const rivals = m.factions.filter((f) => f.ai);
  const rivalAlive = rivals.some((f) => teamAlive(f.id, m));
  const playerAlive = teamAlive(PLAYER_ID, m);
  if (!playerAlive && !ignorePlayerLoss) {
    m.result = "lost";
    emit({ kind: "result", result: "lost" });
    persist();
    return;
  }
  if (!rivalAlive && playerAlive) {
    m.result = "won";
    emit({ kind: "result", result: "won" });
    persist();
  }
}

function produce(m: MatchState, dt: number) {
  for (const p of Object.values(m.planets)) {
    if ((p.coolLeft ?? 0) > 0) p.coolLeft = Math.max(0, (p.coolLeft ?? 0) - dt);
  }
  for (const d of m.defs) {
    const p = m.planets[d.id];
    if (!p || p.owner === NEUTRAL_ID) continue;
    let window = dt;
    const quiet = p.quiet ?? 0;
    if (quiet > 0) {
      if (quiet >= window) {
        p.quiet = quiet - window;
        continue;
      }
      window -= quiet;
      p.quiet = 0;
    }
    const rate = effectiveForge(d, p.level || 1, p.garrison, 0);
    if (rate <= 0 || window <= 0) continue;
    p.garrison = Math.min(9999, p.garrison + rate * window);
  }
}

function stepCrafts(m: MatchState, dt: number, time: number) {
  decayNudges(dt);
  integrateCrafts(m, dt, time);
  if (dt <= 0.06) {
    collideCrafts(m, time);
    collideOrbits(m, time);
  }
  arriveCrafts(m, time);
  if (m.crafts.some((c) => c.payload < 1)) m.crafts = m.crafts.filter((c) => c.payload >= 1);
}

function decayNudges(dt: number) {
  const damp = Math.exp(-2.2 * dt);
  const pull = Math.exp(-1.5 * dt);
  for (const [k, n] of nudges) {
    n.ox += n.vx * dt;
    n.oy += n.vy * dt;
    n.vx *= damp;
    n.vy *= damp;
    n.ox *= pull;
    n.oy *= pull;
    if (n.ox * n.ox + n.oy * n.oy < 0.05 && n.vx * n.vx + n.vy * n.vy < 0.25) nudges.delete(k);
  }
}

function shedTravel(c: Craft, moved: number) {
  if (moved <= 0 || c.payload < 1) return;
  c.gone = (c.gone ?? 0) + moved;
  if ((c.thin ?? 0) >= 1 && (c.gone ?? 0) >= (c.thinAt ?? Infinity)) {
    const drop = Math.min(Math.floor(c.payload), Math.floor(c.thin ?? 0));
    c.payload -= drop;
    c.thin = 0;
    if (c.payload < 1) return;
  }
  let billable = moved;
  if ((c.credit ?? 0) > 0) {
    const used = Math.min(c.credit ?? 0, billable);
    c.credit = (c.credit ?? 0) - used;
    billable -= used;
  }
  if (billable <= 0) return;
  const before = c.flown ?? 0;
  const after = before + billable;
  c.flown = after;
  const keepBefore = travelKeep(before);
  const keepAfter = travelKeep(after);
  if (keepAfter >= keepBefore - 1e-9) return;
  const slice = 1 - keepAfter / keepBefore;
  c.tax = (c.tax ?? 0) + c.payload * slice;
  const shed = Math.floor(c.tax);
  if (shed < 1) return;
  const take = Math.min(Math.floor(c.payload), shed);
  c.payload -= take;
  c.tax -= take;
}

function cruiseOf(id: number) {
  return CRUISE * (0.76 + hashRand(id * 2.13) * 0.48);
}

function nestOffset(id: number) {
  const ang = hashRand(id * 1.31) * Math.PI * 2;
  const rad = 1.2 + hashRand(id * 2.77) * 5.2;
  return { x: Math.cos(ang) * rad, y: Math.sin(ang) * rad };
}

/** Loose while far, then a tight uneven clump. Never a grid. */
function aimPoint(id: number, destX: number, destY: number, x: number, y: number, pack: boolean) {
  const dx = destX - x;
  const dy = destY - y;
  const dist = Math.hypot(dx, dy) || 0.0001;
  if (pack && dist < 36) {
    const nest = nestOffset(id);
    return { x: destX + nest.x, y: destY + nest.y };
  }
  const loosen = Math.min(22, dist * 0.16);
  const ang = hashRand(id * 4.17) * Math.PI * 2;
  return { x: destX + Math.cos(ang) * loosen, y: destY + Math.sin(ang) * loosen };
}

function integrateCrafts(m: MatchState, dt: number, time: number) {
  const steerK = (bump: number) => 1 - Math.exp(-(bump > 0 ? 0.42 : 2.6) * dt);
  for (const c of m.crafts) {
    if (c.payload < 1) continue;
    if (c.hold) {
      c.vx = 0;
      c.vy = 0;
      continue;
    }
    const parked = !c.to && c.tx != null && c.ty != null;
    let destX: number;
    let destY: number;
    if (parked) {
      const aim = aimPoint(c.id, c.tx!, c.ty!, c.x, c.y, true);
      destX = aim.x;
      destY = aim.y;
    } else {
      const to = m.defs.find((d) => d.id === c.to);
      if (!to) {
        c.payload = 0;
        continue;
      }
      const dest = at(to, time);
      const aim = aimPoint(c.id, dest.x, dest.y, c.x, c.y, false);
      destX = aim.x;
      destY = aim.y;
    }
    const dx = destX - c.x;
    const dy = destY - c.y;
    const dist = Math.hypot(dx, dy) || 0.0001;
    if (parked && dist < 6) {
      c.x += dx;
      c.y += dy;
      c.vx = 0;
      c.vy = 0;
      c.hold = true;
      shedTravel(c, dist);
      continue;
    }
    const k = steerK(c.bump);
    const pace = cruiseOf(c.id);
    c.vx += ((dx / dist) * pace - c.vx) * k;
    c.vy += ((dy / dist) * pace - c.vy) * k;
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    shedTravel(c, Math.hypot(c.vx, c.vy) * dt);
    if (c.bump > 0) c.bump = Math.max(0, c.bump - dt);
    if (c.cool > 0) c.cool = Math.max(0, c.cool - dt);
  }
}

function noteClash(x: number, y: number, hostile: boolean, time: number, a: number, b: number) {
  if (sparks.length < 36) sparks.push({ x, y, hostile });
  if (!hostile || time < clashSoundAt) return;
  clashSoundAt = time + 0.09;
  emit({ kind: "clash", x, y, hostile: true, shake: a === PLAYER_ID || b === PLAYER_ID });
}

function collideCrafts(m: MatchState, time: number) {
  const list = m.crafts;
  const cell = 14;
  const buckets = new Map<string, number[]>();
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (c.payload < 1) continue;
    const key = `${Math.floor(c.x / cell)},${Math.floor(c.y / cell)}`;
    const arr = buckets.get(key);
    if (arr) arr.push(i);
    else buckets.set(key, [i]);
  }
  for (const [key, idxs] of buckets) {
    const comma = key.indexOf(",");
    const ix = Number(key.slice(0, comma));
    const iy = Number(key.slice(comma + 1));
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const other = buckets.get(`${ix + ox},${iy + oy}`);
        if (!other) continue;
        for (const i of idxs) {
          const a = list[i];
          if (a.payload < 1) continue;
          for (const j of other) {
            if (j <= i) continue;
            const b = list[j];
            if (b.payload < 1) continue;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            if (dx * dx + dy * dy > (HIT * 2) * (HIT * 2)) continue;
            if (a.owner === b.owner) continue;
            a.payload -= 1;
            b.payload -= 1;
            noteClash((a.x + b.x) / 2, (a.y + b.y) / 2, true, time, a.owner, b.owner);
            if (a.payload < 1) break;
          }
        }
      }
    }
  }
}

function orbiterAt(m: MatchState, planetId: string, index: number, time: number) {
  const def = m.defs.find((d) => d.id === planetId);
  if (!def) return null;
  const s = satWorld(def, index, time, motionReduced);
  const off = satelliteOffset(planetId, index);
  return { x: s.x + off.x, y: s.y + off.y };
}

function collideOrbits(m: MatchState, time: number) {
  const reach = HIT + 1.6;
  for (const c of m.crafts) {
    if (c.payload < 1 || c.cool > 0) continue;
    let best: { planet: string; index: number; d: number; x: number; y: number; owner: number } | null = null;
    for (const def of m.defs) {
      if (def.id === c.to && c.owner === (m.planets[def.id]?.owner ?? -1)) continue;
      const st = m.planets[def.id];
      if (!st || st.garrison < 1) continue;
      const p = planetWorld(def, time, motionReduced);
      const d0 = Math.hypot(c.x - p.x, c.y - p.y);
      const outer = shellRadii(planetSize(def), def.level ?? 1).at(-1) ?? planetSize(def) + 8;
      if (d0 > outer + 10) continue;
      const n = visualSatellites(st.garrison);
      for (let i = 0; i < n; i++) {
        const s = orbiterAt(m, def.id, i, time);
        if (!s) continue;
        const d = Math.hypot(c.x - s.x, c.y - s.y);
        if (d < reach && (!best || d < best.d)) {
          best = { planet: def.id, index: i, d, x: s.x, y: s.y, owner: st.owner };
        }
      }
    }
    if (!best || c.owner === best.owner) continue;
    c.payload -= 1;
    const st = m.planets[best.planet];
    st.garrison = Math.max(0, st.garrison - 1);
    nudges.delete(`${best.planet}#${best.index}`);
    c.cool = 0.55;
    noteClash(best.x, best.y, true, time, c.owner, best.owner);
  }
}

function foldInbound(m: MatchState, id: string, owner: number): number {
  let extra = 0;
  for (const c of m.crafts) {
    if (c.payload < 1 || c.to !== id || c.owner !== owner) continue;
    extra += c.payload;
    c.payload = 0;
  }
  return extra;
}

function pourCapture(m: MatchState, id: string, attacker: number, amount: number) {
  const def = m.defs.find((d) => d.id === id);
  const dest = m.planets[id];
  if (!def || !dest || (dest.coolLeft ?? 0) > 0) return;
  const cost = worldClaim(def);
  let who = dest.claimOwner;
  let paid = dest.claim || 0;
  if (who == null || who === NEUTRAL_ID || paid <= 0) {
    who = attacker;
    paid = 0;
  }
  if (attacker === who) paid += amount;
  else paid -= amount;
  if (paid < 0) {
    who = attacker;
    paid = -paid;
  }
  if (paid >= cost) {
    const prev = dest.owner;
    const surplus = paid - cost + foldInbound(m, id, who);
    dest.owner = who;
    dest.garrison = keptAfterCapture(surplus);
    dest.quiet = SETTLE_S;
    dest.level = 1;
    dest.claim = 0;
    dest.claimOwner = NEUTRAL_ID;
    dest.release = 0;
    dest.releaseOwner = NEUTRAL_ID;
    dest.upgrade = 0;
    dest.coolLeft = 0;
    def.level = 1;
    emit({ kind: "capture", id, owner: who, from: prev });
    if (m.tutorial >= 3 && m.tutorial < 5 && who === PLAYER_ID) m.tutorial = 4;
    return;
  }
  dest.claim = paid;
  dest.claimOwner = paid > 0 ? who : NEUTRAL_ID;
}

function prise(m: MatchState, id: string, attacker: number, amount: number) {
  const def = m.defs.find((d) => d.id === id);
  const dest = m.planets[id];
  if (!def || !dest || amount < 1) return;
  let left = amount;
  if (left <= dest.garrison) {
    dest.garrison -= left;
    return;
  }
  left -= dest.garrison;
  dest.garrison = 0;
  const banked = dest.upgrade || 0;
  if (left <= banked) {
    dest.upgrade = banked - left;
    return;
  }
  left -= banked;
  dest.upgrade = 0;
  const cost = worldHealth(def, dest.level || 1);
  let who = dest.releaseOwner;
  let paid = dest.release || 0;
  if (who == null || who === NEUTRAL_ID || paid <= 0) {
    who = attacker;
    paid = 0;
  }
  if (attacker === who) paid += left;
  else paid -= left;
  if (paid < 0) {
    who = attacker;
    paid = -paid;
  }
  if (paid >= cost) {
    const prev = dest.owner;
    const prevLevel = dest.level || 1;
    const bleeding = (dest.release || 0) > 0;
    const victimWorlds = worldsOf(prev, m);
    const killerWorlds = worldsOf(who, m);
    const surplus = paid - cost;
    dest.owner = NEUTRAL_ID;
    dest.level = 1;
    dest.garrison = 0;
    dest.upgrade = 0;
    dest.release = 0;
    dest.releaseOwner = NEUTRAL_ID;
    dest.claim = 0;
    dest.claimOwner = NEUTRAL_ID;
    dest.quiet = 0;
    def.level = 1;
    noteLastWorld(m, prev, who, {
      worldId: id,
      level: prevLevel,
      bleeding,
      sent: amount,
      cost,
      killerWorlds,
      victimWorlds,
    });
    const lock = lockSeconds(def);
    if (lock > 0) {
      dest.coolLeft = lock;
      return;
    }
    dest.coolLeft = 0;
    if (surplus > 0) pourCapture(m, id, who, surplus);
    return;
  }
  dest.release = paid;
  dest.releaseOwner = paid > 0 ? who : NEUTRAL_ID;
}

function arriveCrafts(m: MatchState, time: number) {
  for (const c of m.crafts) {
    if (c.payload < 1 || c.hold || !c.to) continue;
    const to = m.defs.find((d) => d.id === c.to);
    const dest = m.planets[c.to];
    if (!to || !dest) {
      c.payload = 0;
      continue;
    }
    const p = at(to, time);
    if (Math.hypot(c.x - p.x, c.y - p.y) > planetSize(to) + 12) continue;
    const amount = c.payload;
    c.payload = 0;
    if ((dest.coolLeft ?? 0) > 0) continue;
    if (dest.owner === c.owner) {
      reinforce(to, dest, amount);
      continue;
    }
    if (dest.owner === NEUTRAL_ID) {
      pourCapture(m, c.to, c.owner, amount);
      continue;
    }
    prise(m, c.to, c.owner, amount);
  }
}

const travelBank = new Map<string, number>();
let travelMark = 0;

function launchCrafts(
  m: MatchState,
  fromId: string,
  toId: string,
  owner: number,
  amt: number,
  progress = 0,
  point?: { x: number; y: number },
): number {
  const from = m.defs.find((d) => d.id === fromId);
  const to = point ? undefined : m.defs.find((d) => d.id === toId);
  if (!from || (!to && !point) || amt < 1) return 0;
  const time = m.elapsed;
  const a = at(from, time);
  const b = point ?? at(to!, time);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const gap = Math.max(0, len - planetSize(from) - (to ? planetSize(to) : 0));
  const keep = travelKeep(gap);
  let kill = 0;
  if (progress <= 0) {
    if (travelMark !== m.seed) {
      travelBank.clear();
      travelMark = m.seed;
    }
    const key = point ? `${fromId}@${Math.round(point.x)}:${Math.round(point.y)}` : `${fromId}>${toId}`;
    let bank = (travelBank.get(key) ?? 0) + amt * (1 - keep);
    kill = Math.min(amt, Math.floor(bank + 1e-6));
    bank -= kill;
    travelBank.set(key, bank);
  }
  const flying = progress > 0 ? amt : amt;
  if (flying < 1) return 0;
  const room = Math.max(1, MAX_CRAFTS - m.crafts.length);
  const n = Math.min(flying, MAX_BODIES, room);
  let left = flying;
  const shown = Math.max(n, visualSatellites((m.planets[fromId]?.garrison ?? 0) + amt));
  const made: Craft[] = [];
  for (let i = 0; i < n; i++) {
    const share = Math.ceil(left / (n - i));
    left -= share;
    const idx = Math.floor(((i + 0.5) * shown) / n);
    const spot = satWorld(from, idx, time, motionReduced);
    const sx = spot.x;
    const sy = spot.y;
    const x = sx + (b.x - sx) * progress;
    const y = sy + (b.y - sy) * progress;
    const id = craftSeq++;
    const pace = cruiseOf(id);
    const adx = b.x - x;
    const ady = b.y - y;
    const alen = Math.hypot(adx, ady) || 1;
    const craft: Craft = {
      id,
      owner,
      from: fromId,
      to: point ? "" : toId,
      payload: share,
      x,
      y,
      vx: (adx / alen) * pace,
      vy: (ady / alen) * pace,
      bump: 0,
      cool: 0,
      flown: progress > 0 ? 0 : gap,
      credit: progress > 0 ? 0 : gap,
      tax: 0,
      ...(point ? { tx: point.x, ty: point.y, hold: false } : {}),
    };
    m.crafts.push(craft);
    made.push(craft);
  }
  let debt = kill;
  const thinAt = Math.max(36, gap * 0.45);
  for (const c of made) {
    if (debt < 1) break;
    const take = Math.min(Math.floor(c.payload), debt);
    if (take < 1) continue;
    c.thin = take;
    c.thinAt = thinAt;
    debt -= take;
  }
  return flying;
}

function adoptLegacyWaves(m: MatchState) {
  const legacy = m.waves;
  if (!legacy || legacy.length === 0) return;
  for (const w of legacy) {
    if (w.amount < 1 || w.t >= w.duration) continue;
    const k = w.duration > 0 ? Math.min(0.92, w.t / w.duration) : 0;
    launchCrafts(m, w.from, w.to, w.owner, Math.floor(w.amount), k);
  }
  m.waves = [];
}

function hashRand(n: number) {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function stepAi(m: MatchState, dt: number, time: number) {
  for (const f of m.factions) {
    if (!f.ai) continue;
    if (worldsOf(f.id, m) === 0) continue;
    m.aiWait[f.id] = (m.aiWait[f.id] ?? 0.4) - dt;
    if (m.aiWait[f.id] > 0) continue;
    m.aiWait[f.id] = nextThink(f.id, m.setup.skill);
    const order = thinkAi(m, f.id, time, () => hashRand(m.elapsed * 13 + f.id * 7.1 + m.seed));
    if (!order) continue;
    dispatch(m, order.from, order.to, f.id);
  }
}

function pointOf(to: SendTarget): { x: number; y: number } | null {
  if (typeof to === "string") return null;
  if (!Number.isFinite(to.x) || !Number.isFinite(to.y)) return null;
  return { x: to.x, y: to.y };
}

function dispatch(m: MatchState, picks: Selection, to: SendTarget, owner: number, repeat = false): number {
  ensureCrafts(m);
  const point = pointOf(to);
  const planetId = typeof to === "string" ? to : "";
  if (!point && planetId && (m.planets[planetId]?.coolLeft ?? 0) > 0 && !Object.keys(picks).every((from) => from === planetId)) return 0;
  let sent = 0;
  for (const [from, raw] of Object.entries(picks)) {
    const src = m.planets[from];
    const def = m.defs.find((d) => d.id === from);
    if (!src || !def || src.owner !== owner) continue;
    const amt = Math.min(Math.floor(raw), Math.floor(src.garrison));
    if (amt < 1) continue;
    src.garrison -= amt;
    if (!point && from === planetId) reinforce(def, src, amt);
    else if (point) launchCrafts(m, from, "", owner, amt, 0, point);
    else launchCrafts(m, from, planetId, owner, amt, 0);
    sent += amt;
    emit({ kind: "send", from, to: planetId, amount: amt, owner, repeat });
  }
  return sent;
}

function redirectCrafts(m: MatchState, ids: number[], to: SendTarget, owner: number): number {
  const point = pointOf(to);
  const planetId = typeof to === "string" ? to : "";
  if (ids.length < 1) return 0;
  if (!point && !m.defs.some((d) => d.id === planetId)) return 0;
  if (!point && (m.planets[planetId]?.coolLeft ?? 0) > 0) return 0;
  const want = new Set(ids);
  const chosen = m.crafts.filter((c) => want.has(c.id) && c.owner === owner && c.payload >= 1);
  let n = 0;
  chosen.forEach((c) => {
    if (point) {
      c.to = "";
      c.tx = point.x;
      c.ty = point.y;
      c.ox = undefined;
      c.oy = undefined;
      c.hold = false;
    } else if (c.to !== planetId || c.hold || c.tx != null) {
      c.to = planetId;
      c.tx = undefined;
      c.ty = undefined;
      c.ox = undefined;
      c.oy = undefined;
      c.hold = false;
    }
    n += c.payload;
  });
  return n;
}

function ensureCrafts(m: MatchState) {
  if (!Array.isArray(m.crafts)) m.crafts = [];
  for (const c of m.crafts) {
    if (typeof c.cool !== "number") c.cool = 0;
    if (typeof c.flown !== "number") c.flown = 0;
    if (typeof c.tax !== "number") c.tax = 0;
  }
  adoptLegacyWaves(m);
}

function bindMatch(m: MatchState) {
  const worlds = m.sourceMap?.worlds ?? [];
  const suns = m.sourceMap?.suns ?? [];
  const locks = m.sourceMap?.locks ?? [];
  bindOrbitFrame(
    m.defs,
    suns.map((sun) => ({
      id: sun.id,
      x: sun.x,
      y: sun.y,
      cohort: cohortFor(locks, worlds, suns, "sun", sun.id),
      whirl: turnFor(locks, "sun", sun.id),
    })),
  );
}

export function step(dt: number, opts?: { ai?: boolean }) {
  const m = sim.state.match;
  if (!m || m.paused || m.result !== "playing") return;
  ensureCrafts(m);
  tune(m);
  rememberCrafts(m);
  const capped = Math.min(dt, 0.1);
  produce(m, capped);
  m.elapsed += capped;
  setWhirlClock(m.elapsed);
  bindMatch(m);
  stepCrafts(m, capped, m.elapsed);
  if (opts?.ai !== false) stepAi(m, capped, m.elapsed);
  checkResult(m);
  saveAcc += capped;
  if (saveAcc >= 4) {
    saveAcc = 0;
    persist();
  }
}

export function catchUp() {
  const m = sim.state.match;
  if (!m || m.result !== "playing") return 0;
  ensureCrafts(m);
  tune(m);
  const now = Date.now();
  const pace = SPEED_SCALE[sim.state.settings.speed] ?? 1;
  const elapsed = Math.min(OFFLINE_CAP_S, Math.max(0, (now - m.lastTick) / 1000)) * pace;
  m.lastTick = now;
  if (elapsed < 0.5) return elapsed;
  const slice = STEP * 4;
  let left = elapsed;
  while (left > 0) {
    const d = Math.min(slice, left);
    produce(m, d);
    m.elapsed += d;
    bindMatch(m);
    stepCrafts(m, d, m.elapsed);
    left -= d;
  }
  checkResult(m);
  persist();
  return elapsed;
}

export function sendSelected(picks: Selection, to: SendTarget, craftIds: number[] = [], repeat = false): boolean {
  const m = sim.state.match;
  if (!m || m.result !== "playing") {
    emit({ kind: "blocked" });
    return false;
  }
  const sent = dispatch(m, picks, to, PLAYER_ID, repeat);
  const redirected = redirectCrafts(m, craftIds, to, PLAYER_ID);
  if (sent < 1 && redirected < 1) {
    emit({ kind: "blocked" });
    return false;
  }
  if (sent < 1) emit({ kind: "send", from: "", to: typeof to === "string" ? to : "", amount: redirected, owner: PLAYER_ID, repeat });
  m.totalSent += sent + redirected;
  if (m.tutorial === 2 || m.tutorial === 3) m.tutorial = Math.max(m.tutorial, 3);
  if (m.tutorial === 3) m.tutorial = 4;
  persist();
  return true;
}

export function startMatch(setup: SetupConfig, seed = (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0) {
  const gen = generateSystem(setup, seed);
  const aiWait: Record<number, number> = {};
  for (const f of gen.factions) if (f.ai) aiWait[f.id] = 1.2 + f.id * 0.35;
  nudges.clear();
  sparks.length = 0;
  travelBank.clear();
  travelMark = 0;
  clearLossCards();
  sim.state.lastSetup = setup;
  sim.state.match = {
    seed,
    defs: gen.defs,
    planets: gen.planets,
    factions: gen.factions,
    crafts: [],
    setup,
    lastTick: Date.now(),
    elapsed: 0,
    tutorial: 1,
    result: "playing",
    totalSent: 0,
    paused: false,
    aiWait,
  };
  persist();
}

export function startCustomMatch(map: CustomMap) {
  if (!canLaunch(map)) return false;
  const gen = compileMap(map);
  const aiWait: Record<number, number> = {};
  for (const f of gen.factions) if (f.ai) aiWait[f.id] = 1.2 + f.id * 0.35;
  nudges.clear();
  sparks.length = 0;
  travelBank.clear();
  travelMark = 0;
  clearLossCards();
  sim.state.lastSetup = gen.setup;
  sim.state.match = {
    seed: (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0,
    defs: gen.defs,
    planets: gen.planets,
    factions: gen.factions,
    crafts: [],
    setup: gen.setup,
    lastTick: Date.now(),
    elapsed: 0,
    tutorial: 5,
    result: "playing",
    totalSent: 0,
    paused: false,
    aiWait,
    mapId: map.id,
    sourceMap: {
      id: map.id,
      name: map.name,
      skill: map.skill,
      worlds: map.worlds.map((w) => ({ ...w })),
      ...(map.suns?.length ? { suns: map.suns.map((s) => ({ ...s })) } : {}),
      ...(map.locks?.length
        ? { locks: map.locks.map((lock) => ({ ...lock, worldIds: lock.worldIds.slice(), sunIds: lock.sunIds.slice() })) }
        : {}),
    },
  };
  persist();
  return true;
}

/** Replay the match that is running: same generated sky, or the saved map it came from. */
export function restartMatch(): boolean {
  const prev = sim.state.match;
  if (!prev) return false;
  const seenTutorial = (prev.tutorial ?? 0) >= 5;
  if (prev.mapId) {
    const map = loadMaps().find((item) => item.id === prev.mapId) ?? prev.sourceMap ?? null;
    if (map && startCustomMatch(map)) return true;
  }
  startMatch(prev.setup, prev.seed >>> 0);
  if (seenTutorial && sim.state.match) {
    sim.state.match.tutorial = 5;
    persist();
  }
  return true;
}

export function persist() {
  if (quietPersist) {
    if (sim.state.match) sim.state.match.lastTick = Date.now();
    return;
  }
  if (sim.state.match) sim.state.match.lastTick = Date.now();
  writeSave(sim.state);
}

export function hydrate() {
  sim.state = loadSave();
  sim.hydrated = true;
  return catchUp();
}

export function abandonMatch() {
  sim.state.match = null;
  persist();
}

export function setPaused(v: boolean) {
  if (sim.state.match) sim.state.match.paused = v;
  persist();
}

export function setTutorial(n: number) {
  if (sim.state.match) sim.state.match.tutorial = n;
}

export function replaceState(next: GameState) {
  sim.state = next;
  persist();
}

export { STEP };
