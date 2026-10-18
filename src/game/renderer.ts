import {
  AI_FACTIONS,
  DEMO_DEFS,
  ELLIPSE,
  HUSK_KIND,
  LOCK_WAKE_S,
  MAX_LEVEL,
  MAX_PLANETS,
  PLAYER_FACTION,
  TEMPLATES,
  TORTILLA,
  worldClaim,
  worldHealth,
  worldRise,
  factionColor,
  planetName,
  planetSize,
  planetWorld,
  orbitAnchor,
  bindOrbitFrame,
  cohortDelta,
  setWhirlClock,
  turnPoint,
  whirlAngle,
  satWorld,
  shellRadii,
  discRadius,
  DISC_OPEN,
  SETTLE_S,
  STEP,
  visualSatellites,
} from "./catalog";
import { defaultWorldStats, defsFromWorlds, newSunId, newWorldId, separate, snapFormation, cohortFor, turnFor, clusterCircle, MAX_SUNS, MAX_SUN_SCALE, sunIdFromKey, sunKey, type GroupAnchor, type MapLock, type MapSun, type MapWorld, type RememberGroup, type RememberWorld } from "./maps";
import { hash3, rgb } from "./noise";
import { drawAtmosphere, drawRings, planetTexture } from "./planets-draw";
import { craftDraw, match, satelliteOffset, setMotionReduced, sim, takeSparks } from "./sim";
import type { PlanetDef, Selection, SendTarget } from "./types";
import { NEUTRAL_ID, PLAYER_ID } from "./types";

type MapHist = {
  worlds: MapWorld[];
  suns: MapSun[];
  locks: MapLock[];
  selectedId: string | null;
  group: { x: number; y: number; r: number; worldIds: string[]; sunIds: string[] } | null;
};

const CAPTURE_GLOW: [number, number, number] = [214, 58, 52];
const RISE_GLOW: [number, number, number] = [236, 208, 150];
/** Old empty sky framed 840 units. The field is twice as wide and twice as tall. */
const FIELD = 1680;
const NEBULA_TONES: [number, number, number][] = [
  [64, 78, 138],
  [108, 64, 92],
  [46, 86, 98],
  [78, 68, 124],
];

function circleFromEnds(ax: number, ay: number, bx: number, by: number) {
  return {
    x: (ax + bx) / 2,
    y: (ay + by) / 2,
    r: Math.hypot(bx - ax, by - ay) / 2,
  };
}

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  r: number;
  color: string;
};

export class WorldView {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  w = 1;
  h = 1;
  camX = 0;
  camY = 12;
  scale = 1;
  targetScale = 1;
  time = 0;
  motion = 0;
  trauma = 0;
  reduced = false;
  interactive = false;
  followSim = false;
  editing = false;
  placing = true;
  placeSun = false;
  placeOrbit = false;
  placeOwner: number | null = null;
  placeTemplate = 0;
  selecting = false;
  suns: MapSun[] = [];
  locks: MapLock[] = [];
  snap = false;
  worlds: MapWorld[] = [];
  selectedId: string | null = null;
  onEdit: (worlds: MapWorld[], selectedId: string | null, suns: MapSun[], locks: MapLock[]) => void = () => {};
  onGroupLock: (lock: MapLock | null) => void = () => {};
  onHistory: (canUndo: boolean, canRedo: boolean) => void = () => {};
  onRemember: (draft: { worlds: RememberWorld[]; suns: RememberGroup["suns"] }) => void = () => {};
  picked: Selection = {};
  pickedCrafts: number[] = [];
  drawing = false;
  circle: { x: number; y: number; r: number } | null = null;
  onPicked: (sel: Selection, drawing: boolean) => void = () => {};
  onSend: (sel: Selection, to: SendTarget, crafts: number[], repeat?: boolean) => void = () => {};
  private particles: Particle[] = [];
  private skyTime = 0;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinch0 = 0;
  private scale0 = 1;
  private panLast: { x: number; y: number } | null = null;
  private pickSig = "";
  private pickMode: "planet" | "zone" | null = null;
  private armedZone: { x: number; y: number; r: number } | null = null;
  private lastMove:
    | { kind: "planet"; planetId: string; target: SendTarget }
    | { kind: "zone"; x: number; y: number; r: number; target: SendTarget }
    | null = null;
  private emptyTapAt = 0;
  private emptyTapX = 0;
  private emptyTapY = 0;
  private holdTimer: number | null = null;
  private repeatTimer: number | null = null;
  private spamUntil = 0;
  private holdingRepeat = false;
  private flash: { x: number; y: number; r: number; until: number } | null = null;
  private pings: { x: number; y: number; until: number }[] = [];
  private down: { id: number; sx: number; sy: number; wx: number; wy: number; lastX: number; lastY: number } | null = null;
  private moved = false;
  private pinching = false;
  private preview = 0;
  private snapMark: {
    x: number;
    y: number;
    kind: "axis" | "angle" | "grid";
    nx?: number;
    ny?: number;
    lock?: "x" | "y" | "both";
  } | null = null;
  private editDrag: {
    kind: "world" | "point" | "pan" | "sun" | "resize" | "hold" | "flat" | "marquee" | "gmove" | "gcopy" | "grotate" | "gspin" | "gcenter" | "gpivot";
    id?: string;
    pointer: number;
    lastX: number;
    lastY: number;
    sx: number;
    sy: number;
    moved: boolean;
    wx?: number;
    wy?: number;
    ang?: number;
  } | null = null;
  private group: { x: number; y: number; r: number; worldIds: string[]; sunIds: string[] } | null = null;
  private historyBase: MapHist | null = null;
  private undos: MapHist[] = [];
  private redos: MapHist[] = [];
  private groupBase: { worlds: MapWorld[]; suns: MapSun[]; cx: number; cy: number; gx?: number; gy?: number } | null = null;
  private spinOn = false;
  private spinPivot: { x: number; y: number } | null = null;
  private ghost: { dx: number; dy: number } | null = null;
  private marquee: { x: number; y: number; r: number } | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("canvas");
    this.ctx = ctx;
    this.reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setMotionReduced(this.reduced);
    this.bind();
    this.fit();
    (window as unknown as { __helionView?: WorldView }).__helionView = this;
  }

  defs(): PlanetDef[] {
    if (!this.editing) return match()?.defs ?? DEMO_DEFS;
    return defsFromWorlds(this.worlds, this.locks, this.suns).map((def) =>
      def.cohort ? { ...def, cohort: undefined } : def,
    );
  }

  setDraft(
    worlds: MapWorld[],
    selectedId: string | null,
    placing = this.placing,
    suns: MapSun[] | null = null,
    locks: MapLock[] | null = null,
  ) {
    this.placing = placing;
    if (this.editDrag) return;
    const incoming = JSON.stringify({ worlds, suns: suns ?? [], locks: locks ?? [] });
    const current = JSON.stringify({ worlds: this.worlds, suns: this.suns, locks: this.locks });
    if (incoming !== current) {
      this.undos = [];
      this.redos = [];
      this.historyBase = null;
      this.noteHistory();
    }
    this.worlds = worlds.map((w) => ({ ...w }));
    this.selectedId = selectedId;
    this.suns = (suns ?? []).map((s) => ({ ...s }));
    this.locks = (locks ?? []).map((lock) => ({
      ...lock,
      worldIds: lock.worldIds.slice(),
      sunIds: lock.sunIds.slice(),
    }));
  }

  setPlacing(placing: boolean) {
    this.placing = placing;
    if (placing) {
      this.placeSun = false;
      this.selecting = false;
      this.clearGroup();
    }
  }

  setSunPlace(on: boolean) {
    this.placeSun = on;
    if (on) {
      this.placing = false;
      this.selecting = false;
      this.clearGroup();
    }
  }

  setSelectTool(on: boolean) {
    this.selecting = on;
    if (on) {
      this.placing = false;
      this.placeSun = false;
    } else this.clearGroup();
  }

  setSnap(on: boolean) {
    this.snap = on;
    if (!on) this.snapMark = null;
  }

  setPlaceOrbit(on: boolean) {
    this.placeOrbit = on;
  }

  setPlaceOwner(owner: number | null) {
    this.placeOwner = owner;
  }

  setPlaceTemplate(index: number) {
    const n = Math.floor(index);
    this.placeTemplate = Number.isFinite(n) ? ((n % TEMPLATES.length) + TEMPLATES.length) % TEMPLATES.length : 0;
  }

  fit() {
    const defs = this.defs();
    const custom = this.editing || defs.some((d) => d.still || d.anchorX != null || d.anchorY != null);
    if (!custom) {
      const maxR = defs.reduce((m, d) => Math.max(m, d.orbit + planetSize(d)), 180);
      const pad = 80;
      const spanY = maxR * ELLIPSE * 2 + pad * 2;
      const spanX = maxR * 2 + pad * 2;
      this.targetScale = Math.min(this.w / spanX, this.h / spanY) * 0.92;
      this.scale = this.targetScale;
      this.camX = 0;
      this.camY = 0;
      return;
    }
    if (defs.length === 0) {
      this.targetScale = Math.min(this.w, this.h) / FIELD;
      this.scale = this.targetScale;
      this.camX = 0;
      this.camY = 36;
      return;
    }
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    const add = (x: number, y: number, pad: number) => {
      minX = Math.min(minX, x - pad);
      maxX = Math.max(maxX, x + pad);
      minY = Math.min(minY, y - pad);
      maxY = Math.max(maxY, y + pad);
    };
    for (const d of defs) {
      const rad = shellRadii(planetSize(d), d.level ?? 1).at(-1) ?? planetSize(d);
      if (d.still) add(d.anchorX ?? 0, d.anchorY ?? 0, rad + 10);
      else {
        const ax = d.anchorX ?? 0;
        const ay = d.anchorY ?? 0;
        const reach = Math.max(d.orbit, d.orbit * ELLIPSE * (d.flat ?? 1));
        add(ax, ay, reach + rad);
      }
      if (d.cohort && d.cohort.radius > 1) add(d.cohort.ox, d.cohort.oy, d.cohort.radius + rad);
    }
    const placed = this.editing ? this.suns : (match()?.sourceMap?.suns ?? []);
    for (const sun of placed) add(sun.x, sun.y, 48 * (sun.scale || 1));
    const spanX = Math.max(240, maxX - minX);
    const spanY = Math.max(180, maxY - minY);
    this.targetScale = Math.min(this.w / (spanX + 90), this.h / (spanY + 220));
    this.scale = this.targetScale;
    this.camX = (minX + maxX) / 2;
    this.camY = (minY + maxY) / 2 + (this.editing ? 24 : 0);
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.canvas.getBoundingClientRect();
    this.w = Math.max(1, rect.width);
    this.h = Math.max(1, rect.height);
    this.canvas.width = Math.floor(this.w * dpr);
    this.canvas.height = Math.floor(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.fit();
  }

  private zoomMin() {
    const field = Math.min(this.w, this.h) / FIELD;
    const room = this.editing && this.defs().length > 0 ? 0.65 / 1.5 : 0.65;
    return Math.min(this.targetScale * room, field);
  }

  private zoomMax() {
    return this.targetScale * 2.6;
  }

  private zoomAt(sx: number, sy: number, next: number) {
    const scale = Math.max(this.zoomMin(), Math.min(this.zoomMax(), next));
    if (scale === this.scale) return;
    const shake = this.shakeOffset();
    const ox = sx - this.w / 2 - shake.x;
    const oy = sy - this.h / 2 - shake.y;
    this.camX += ox * (1 / this.scale - 1 / scale);
    this.camY += oy * (1 / this.scale - 1 / scale);
    this.scale = scale;
  }

  worldFromEvent(e: { clientX: number; clientY: number }) {
    const rect = this.canvas.getBoundingClientRect();
    return this.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
  }

  screenToWorld(sx: number, sy: number) {
    const shake = this.shakeOffset();
    return {
      x: (sx - this.w / 2 - shake.x) / this.scale + this.camX,
      y: (sy - this.h / 2 - shake.y) / this.scale + this.camY,
    };
  }

  worldToScreen(x: number, y: number) {
    const shake = this.shakeOffset();
    return {
      x: (x - this.camX) * this.scale + this.w / 2 + shake.x,
      y: (y - this.camY) * this.scale + this.h / 2 + shake.y,
    };
  }

  planetPos(id: string, t: number) {
    const def = this.defs().find((d) => d.id === id);
    if (!def) return { x: 0, y: 0, z: 0 };
    return planetWorld(def, t, this.reduced);
  }

  hit(x: number, y: number): string | null {
    let best: string | null = null;
    let bestD = 1e9;
    for (const def of this.defs()) {
      const p = planetWorld(def, this.bodyTime(def.id), this.reduced);
      const dx = x - p.x;
      const dy = y - p.y;
      const rad = planetSize(def) + 20 / this.scale;
      const d = dx * dx + dy * dy;
      if (d < rad * rad && d < bestD) {
        bestD = d;
        best = def.id;
      }
    }
    return best;
  }

  addTrauma(v: number) {
    if (!sim.state.settings.shake || this.reduced) return;
    this.trauma = Math.min(1, this.trauma + v);
  }

  burst(x: number, y: number, color: string, n = 18) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 18 + Math.random() * 70;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s * ELLIPSE,
        life: 0,
        max: 0.45 + Math.random() * 0.4,
        r: 1.2 + Math.random() * 2.2,
        color,
      });
    }
  }

  clearPick() {
    this.clearHold();
    this.stopSpam();
    this.holdingRepeat = false;
    this.picked = {};
    this.pickedCrafts = [];
    this.pickSig = "";
    this.pickMode = null;
    this.armedZone = null;
    this.lastMove = null;
    this.drawing = false;
    this.circle = null;
    this.flash = null;
    this.onPicked(this.picked, false);
  }

  selectedTotal() {
    let n = 0;
    for (const v of Object.values(this.picked)) n += v;
    const m = match();
    if (m && this.pickedCrafts.length > 0) {
      const ids = new Set(this.pickedCrafts);
      for (const c of m.crafts) if (ids.has(c.id) && c.payload >= 1) n += c.payload;
    }
    return n;
  }

  private shakeOffset() {
    const s = this.trauma * this.trauma;
    if (s <= 0.001) return { x: 0, y: 0 };
    return {
      x: (hash3(this.time * 9.1, 1, 2) - 0.5) * 18 * s,
      y: (hash3(this.time * 8.2, 3, 4) - 0.5) * 14 * s,
    };
  }

  private scoop(cx: number, cy: number, r: number): Selection {
    const m = match();
    const out: Selection = {};
    if (!m) return out;
    for (const def of m.defs) {
      const st = m.planets[def.id];
      if (!st || st.owner !== PLAYER_ID || st.garrison < 1) continue;
      const n = visualSatellites(st.garrison);
      if (n < 1) continue;
      let hit = 0;
      for (let i = 0; i < n; i++) {
        const s = satWorld(def, i, this.bodyTime(def.id), this.reduced);
        const off = satelliteOffset(def.id, i);
        if (Math.hypot(s.x + off.x - cx, s.y + off.y - cy) <= r) hit += 1;
      }
      const pos = planetWorld(def, this.bodyTime(def.id), this.reduced);
      if (Math.hypot(pos.x - cx, pos.y - cy) <= r) {
        hit = Math.max(hit, Math.ceil(n * Math.min(1, r / (planetSize(def) + 18))));
      }
      const amount = Math.floor((st.garrison * hit) / n);
      if (amount >= 1) out[def.id] = amount;
    }
    return out;
  }

  private bind() {
    const el = this.canvas;
    el.addEventListener("pointerdown", (e) => {
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* pointer already gone */
      }
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size >= 2) {
        const pts = [...this.pointers.values()];
        this.pinch0 = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        this.scale0 = this.scale;
        this.panLast = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
        this.pinching = true;
        this.drawing = false;
        this.circle = null;
        this.down = null;
        this.clearHold();
        this.stopSpam();
        this.editDrag = null;
        return;
      }
      if (this.editing) {
        this.editDown(e);
        return;
      }
      if (!this.interactive) {
        this.down = null;
        return;
      }
      const w = this.worldFromEvent(e);
      const now = performance.now();
      const followUp =
        !this.hit(w.x, w.y) &&
        this.emptyTapAt > 0 &&
        now - this.emptyTapAt < 320 &&
        Math.hypot(e.clientX - this.emptyTapX, e.clientY - this.emptyTapY) < 28;
      this.down = {
        id: e.pointerId,
        sx: e.clientX,
        sy: e.clientY,
        wx: w.x,
        wy: w.y,
        lastX: e.clientX,
        lastY: e.clientY,
      };
      this.moved = false;
      this.pinching = false;
      if (followUp) this.armHold();
      else this.stopSpam();
    });
    el.addEventListener("pointermove", (e) => {
      if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size >= 2) {
        const pts = [...this.pointers.values()];
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (this.pinch0 > 8) {
          this.scale = Math.max(this.zoomMin(), Math.min(this.zoomMax(), this.scale0 * (dist / this.pinch0)));
        }
        const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
        if (this.panLast) {
          this.camX -= (mid.x - this.panLast.x) / this.scale;
          this.camY -= (mid.y - this.panLast.y) / this.scale;
        }
        this.panLast = mid;
        return;
      }
      if (this.editing) {
        this.editMove(e);
        return;
      }
      if (!this.down || this.down.id !== e.pointerId || !this.interactive) return;
      const dx = e.clientX - this.down.sx;
      const dy = e.clientY - this.down.sy;
      if (Math.hypot(dx, dy) > 10) {
        this.clearHold();
        this.stopSpam();
        if (this.holdingRepeat) return;
        this.moved = true;
      }
      if (!this.moved) return;
      const w = this.worldFromEvent(e);
      const circle = circleFromEnds(this.down.wx, this.down.wy, w.x, w.y);
      this.drawing = true;
      this.circle = circle;
      this.pickMode = "zone";
      this.armedZone = circle;
      this.refreshPick();
    });
    const up = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) {
        this.pinching = false;
        this.panLast = null;
      }
      if (this.editing) {
        this.editUp(e);
        return;
      }
      if (!this.down || this.down.id !== e.pointerId) return;
      const start = this.down;
      const repeating = this.holdingRepeat;
      this.down = null;
      this.clearHold();
      this.stopSpam();
      this.holdingRepeat = false;
      if (!this.interactive) return;
      if (repeating) return;
      if (this.pinching) {
        this.drawing = false;
        this.circle = null;
        return;
      }
      if (this.moved && this.drawing) {
        this.drawing = false;
        this.circle = null;
        if (this.selectedTotal() < 1) {
          this.clearSelection();
          return;
        }
        this.onPicked(this.picked, false);
        return;
      }
      if (this.moved) return;
      const w = this.worldFromEvent(e);
      const id = this.hit(w.x, w.y);
      if (!id && this.repeatIfDouble(e)) return;
      const kind = this.handleTap(id, start);
      if (!id && (kind === "idle" || kind === "send")) {
        this.emptyTapAt = performance.now();
        this.emptyTapX = e.clientX;
        this.emptyTapY = e.clientY;
      } else {
        this.emptyTapAt = 0;
      }
    };
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    el.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        const factor = e.deltaY > 0 ? 0.92 : 1.08;
        this.zoomAt(e.clientX - rect.left, e.clientY - rect.top, this.scale * factor);
      },
      { passive: false },
    );
  }

  private emitEdit() {
    this.onEdit(
      this.worlds.map((w) => ({ ...w })),
      this.selectedId,
      this.suns.map((s) => ({ ...s })),
      this.locks.map((lock) => ({ ...lock, worldIds: lock.worldIds.slice(), sunIds: lock.sunIds.slice() })),
    );
    this.onGroupLock(this.selectionLock());
  }

  private captureHistory(): MapHist {
    return {
      worlds: this.worlds.map((w) => ({ ...w })),
      suns: this.suns.map((s) => ({ ...s })),
      locks: this.locks.map((lock) => ({ ...lock, worldIds: lock.worldIds.slice(), sunIds: lock.sunIds.slice() })),
      selectedId: this.selectedId,
      group: this.group
        ? { x: this.group.x, y: this.group.y, r: this.group.r, worldIds: this.group.worldIds.slice(), sunIds: this.group.sunIds.slice() }
        : null,
    };
  }

  private sameLayout(a: MapHist, b: MapHist) {
    return JSON.stringify({ worlds: a.worlds, suns: a.suns, locks: a.locks }) === JSON.stringify({ worlds: b.worlds, suns: b.suns, locks: b.locks });
  }

  private noteHistory() {
    this.onHistory(this.undos.length > 0, this.redos.length > 0);
  }

  private beginHistory() {
    if (this.historyBase) return;
    this.historyBase = this.captureHistory();
  }

  private commitHistory() {
    const before = this.historyBase;
    this.historyBase = null;
    if (!before) return;
    const now = this.captureHistory();
    if (this.sameLayout(before, now)) return;
    this.undos.push(before);
    if (this.undos.length > 5) this.undos.shift();
    this.redos = [];
    this.noteHistory();
  }

  private applyHistory(snap: MapHist) {
    this.worlds = snap.worlds.map((w) => ({ ...w }));
    this.suns = snap.suns.map((s) => ({ ...s }));
    this.locks = snap.locks.map((lock) => ({ ...lock, worldIds: lock.worldIds.slice(), sunIds: lock.sunIds.slice() }));
    this.selectedId = snap.selectedId;
    this.group = snap.group
      ? { x: snap.group.x, y: snap.group.y, r: snap.group.r, worldIds: snap.group.worldIds.slice(), sunIds: snap.group.sunIds.slice() }
      : null;
    this.historyBase = null;
    this.emitEdit();
    this.noteHistory();
  }

  undo() {
    const snap = this.undos.pop();
    if (!snap) return;
    this.redos.push(this.captureHistory());
    if (this.redos.length > 5) this.redos.shift();
    this.applyHistory(snap);
  }

  redo() {
    const snap = this.redos.pop();
    if (!snap) return;
    this.undos.push(this.captureHistory());
    if (this.undos.length > 5) this.undos.shift();
    this.applyHistory(snap);
  }

  private hitHandle(x: number, y: number): { id: string; d: number } | null {
    let best: { id: string; d: number } | null = null;
    for (const w of this.worlds) {
      if (w.still) continue;
      const dx = x - w.ox;
      const dy = y - w.oy;
      const rad = 22 / this.scale + 8;
      const d = dx * dx + dy * dy;
      if (d < rad * rad && (!best || d < best.d)) best = { id: w.id, d };
    }
    return best;
  }

  private editDown(e: PointerEvent) {
    this.beginHistory();
    if (this.selecting) {
      this.editSelectDown(e);
      return;
    }
    const wpt = this.worldFromEvent(e);
    if (this.hitDelete(e)) {
      this.removeSelected();
      this.editDrag = {
        kind: "hold",
        pointer: e.pointerId,
        lastX: e.clientX,
        lastY: e.clientY,
        sx: e.clientX,
        sy: e.clientY,
        moved: true,
      };
      this.emitEdit();
      return;
    }
    const resize = this.hitSunResize(wpt.x, wpt.y);
    const stretch = this.hitEllipse(wpt.x, wpt.y);
    const worldId = this.hit(wpt.x, wpt.y);
    const handle = this.hitHandle(wpt.x, wpt.y);
    let kind: "world" | "point" | "pan" | "sun" | "resize" | "hold" | "flat" = "pan";
    let id: string | undefined;
    if (resize) {
      kind = "resize";
      id = resize;
    } else if (stretch) {
      kind = "flat";
      id = stretch;
    } else if (handle && worldId) {
      const def = this.defs().find((d) => d.id === worldId);
      const p = def ? planetWorld(def, this.bodyTime(def.id), this.reduced) : wpt;
      const worldD = (wpt.x - p.x) ** 2 + (wpt.y - p.y) ** 2;
      if (handle.d <= worldD) {
        kind = "point";
        id = handle.id;
      } else {
        kind = "world";
        id = worldId;
      }
    } else if (handle) {
      kind = "point";
      id = handle.id;
    } else if (worldId) {
      kind = "world";
      id = worldId;
    } else {
      const sunId = this.hitSun(wpt.x, wpt.y);
      if (sunId) {
        kind = "sun";
        id = sunId;
      }
    }
    this.editDrag = {
      kind,
      id,
      pointer: e.pointerId,
      lastX: e.clientX,
      lastY: e.clientY,
      sx: e.clientX,
      sy: e.clientY,
      moved: false,
    };
    if (id && kind !== "sun" && kind !== "resize") {
      this.selectedId = id;
      this.emitEdit();
    } else if (kind === "sun" || kind === "resize") {
      this.selectedId = sunKey(id!);
      this.emitEdit();
    }
  }

  private editMove(e: PointerEvent) {
    const drag = this.editDrag;
    if (!drag || drag.pointer !== e.pointerId) return;
    if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 8) drag.moved = true;
    if (
      drag.moved &&
      drag.id &&
      (drag.kind === "world" || drag.kind === "point" || drag.kind === "flat")
    ) {
      this.orbitEpoch.set(drag.id, this.preview);
    }
    if (!drag.moved) return;
    if (drag.kind === "hold") return;
    if (drag.kind === "marquee") {
      const p = this.worldFromEvent(e);
      this.marquee = circleFromEnds(drag.wx ?? p.x, drag.wy ?? p.y, p.x, p.y);
      return;
    }
    if (drag.kind === "gmove" || drag.kind === "gcopy" || drag.kind === "grotate" || drag.kind === "gspin") {
      this.dragGroup(drag.kind, e);
      return;
    }
    if (drag.kind === "gpivot") {
      const p = this.worldFromEvent(e);
      const snapped = this.snapPivot(p.x, p.y);
      this.spinPivot = { x: snapped.x, y: snapped.y };
      this.snapMark = snapped.mark;
      const lock = this.selectionLock();
      if (lock?.turn) {
        this.locks = this.locks.map((item) => (item.id === lock.id ? { ...item, cx: snapped.x, cy: snapped.y } : item));
        this.emitEdit();
      }
      return;
    }
    if (drag.kind === "gcenter") {
      const lock = this.selectionLock();
      if (!lock) return;
      const p = this.worldFromEvent(e);
      let x = p.x;
      let y = p.y;
      if (this.snap) {
        const onto = this.orbitLock(p.x, p.y, "");
        if (onto) {
          x = onto.x;
          y = onto.y;
        } else {
          const skipW = new Set(lock.worldIds);
          const skipS = new Set(lock.sunIds);
          const others = [
            ...this.worlds.filter((w) => !skipW.has(w.id)).map((w) => ({ x: w.x, y: w.y })),
            ...this.suns.filter((s) => !skipS.has(s.id)).map((s) => ({ x: s.x, y: s.y })),
          ];
          const reach = Math.max(24, Math.min(110, 42 / Math.max(0.25, this.scale)));
          const snapped = snapFormation(p.x, p.y, others, reach);
          x = snapped.x;
          y = snapped.y;
        }
      }
      this.locks = this.locks.map((item) => (item.id === lock.id ? { ...item, ox: x, oy: y } : item));
      this.emitEdit();
      return;
    }
    if (drag.kind === "pan") {
      this.camX -= (e.clientX - drag.lastX) / this.scale;
      this.camY -= (e.clientY - drag.lastY) / this.scale;
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;
      return;
    }
    if (drag.kind === "resize") {
      const sun = this.suns.find((item) => item.id === drag.id);
      if (!sun) return;
      const p = this.worldFromEvent(e);
      sun.scale = Math.max(0.45, Math.min(MAX_SUN_SCALE, Math.hypot(p.x - sun.x, p.y - sun.y) / 18));
      this.emitEdit();
      return;
    }
    if (drag.kind === "flat") {
      const w = this.worlds.find((item) => item.id === drag.id);
      const def = w ? this.defs().find((item) => item.id === w.id) : undefined;
      if (!w || !def || def.still) return;
      const p = this.worldFromEvent(e);
      const orbit = Math.max(1, def.orbit);
      const ax = def.anchorX ?? 0;
      const ay = def.anchorY ?? 0;
      const tilt = def.tilt ?? 0;
      const localX = Math.cos(tilt) * (p.x - ax) + Math.sin(tilt) * (p.y - ay);
      const localY = -Math.sin(tilt) * (p.x - ax) + Math.cos(tilt) * (p.y - ay);
      let flat = Math.abs(localY) / (orbit * ELLIPSE);
      flat = Math.max(0, Math.min(8, flat));
      const round = Math.abs(flat - 1) <= 0.1;
      if (this.snap && round) flat = 1;
      w.flat = flat;
      w.tilt = tilt;
      w.ox = ax;
      w.oy = ay;
      const lx = Math.cos(def.angle) * orbit;
      const ly = Math.sin(def.angle) * orbit * ELLIPSE * flat;
      w.x = ax + Math.cos(tilt) * lx - Math.sin(tilt) * ly;
      w.y = ay + Math.sin(tilt) * lx + Math.cos(tilt) * ly;
      this.snapMark =
        this.snap && flat === 1
          ? {
              x: ax + Math.sin(tilt) * orbit * ELLIPSE,
              y: ay - Math.cos(tilt) * orbit * ELLIPSE,
              kind: "axis",
              lock: "y",
            }
          : null;
      this.emitEdit();
      return;
    }
    if (drag.kind === "sun") {
      const sun = this.suns.find((item) => item.id === drag.id);
      if (!sun) return;
      const p = this.worldFromEvent(e);
      const others = this.worlds.map((item) => ({ x: item.x, y: item.y }));
      const reach = Math.max(24, Math.min(110, 42 / Math.max(0.25, this.scale)));
      const snapped = this.snap ? snapFormation(p.x, p.y, others, reach) : p;
      sun.x = snapped.x;
      sun.y = snapped.y;
      this.emitEdit();
      return;
    }
    const w = this.worlds.find((item) => item.id === drag.id);
    if (!w) return;
    const p = this.worldFromEvent(e);
    if (drag.kind === "world") {
      const others = this.worlds.filter((item) => item.id !== w.id).map((item) => ({ x: item.x, y: item.y }));
      const reach = Math.max(24, Math.min(110, 42 / Math.max(0.25, this.scale)));
      const free = { x: p.x, y: p.y, kind: null as null };
      const snapped = this.snap ? snapFormation(p.x, p.y, others, reach) : free;
      let fx = snapped.x;
      let fy = snapped.y;
      if (w.still) {
        w.x = fx;
        w.y = fy;
      } else {
        const next = separate(fx, fy, w.ox, w.oy, "world", w.flat ?? 1, w.tilt ?? 0);
        fx = next.x;
        fy = next.y;
        w.x = fx;
        w.y = fy;
      }
      const held = Math.hypot(fx - snapped.x, fy - snapped.y) < 1.5;
      this.snapMark =
        snapped.kind && held
          ? { x: fx, y: fy, kind: snapped.kind, nx: snapped.nx, ny: snapped.ny, lock: snapped.lock }
          : null;
    } else {
      let ox = p.x;
      let oy = p.y;
      const lock = this.snap ? this.orbitLock(p.x, p.y, w.id) : null;
      if (lock) {
        ox = lock.x;
        oy = lock.y;
        this.snapMark = { x: lock.x, y: lock.y, kind: "axis", lock: "both" };
      } else this.snapMark = null;
      const next = separate(w.x, w.y, ox, oy, "point", w.flat ?? 1, w.tilt ?? 0);
      w.ox = next.ox;
      w.oy = next.oy;
    }
    this.emitEdit();
  }

  private editUp(e: PointerEvent) {
    const drag = this.editDrag;
    if (!drag || drag.pointer !== e.pointerId) return;
    this.editDrag = null;
    this.snapMark = null;
    try {
    if (drag.id && (drag.kind === "world" || drag.kind === "point" || drag.kind === "flat")) {
      this.orbitEpoch.set(drag.id, this.preview);
    }
    if (drag.kind === "marquee") {
      this.finishMarquee(drag.moved);
      this.emitEdit();
      return;
    }
    if (drag.kind === "gmove" || drag.kind === "grotate" || drag.kind === "gspin" || drag.kind === "gcenter" || drag.kind === "gpivot") {
      if ((drag.kind === "grotate" || (drag.kind === "gspin" && drag.moved)) && this.group) {
        this.poseGroup(this.group.worldIds, this.group.sunIds);
      }
      if (drag.kind === "gspin") {
        if (!drag.moved) this.toggleTurn();
      }
      this.groupBase = null;
      this.emitEdit();
      return;
    }
    if (drag.kind === "gcopy") {
      if (drag.moved && this.ghost && Math.hypot(this.ghost.dx, this.ghost.dy) > 4) this.stampCopies(this.ghost.dx, this.ghost.dy);
      this.ghost = null;
      this.groupBase = null;
      this.emitEdit();
      return;
    }
    if (!drag.moved && drag.kind === "pan" && this.placeSun && this.suns.length < MAX_SUNS) {
      const raw = this.worldFromEvent(e);
      const others = this.worlds.map((item) => ({ x: item.x, y: item.y }));
      const reach = Math.max(24, Math.min(110, 42 / Math.max(0.25, this.scale)));
      const snapped = this.snap ? snapFormation(raw.x, raw.y, others, reach) : raw;
      const sun = { id: newSunId(), x: snapped.x, y: snapped.y, scale: 1 };
      this.suns = [...this.suns, sun];
      this.selectedId = sunKey(sun.id);
    } else if (!drag.moved && drag.kind === "pan" && this.placing && this.worlds.length < MAX_PLANETS) {
      const raw = this.worldFromEvent(e);
      const others = this.worlds.map((item) => ({ x: item.x, y: item.y }));
      const reach = Math.max(24, Math.min(110, 42 / Math.max(0.25, this.scale)));
      const snapped = this.snap ? snapFormation(raw.x, raw.y, others, reach) : raw;
      const index = this.worlds.length;
      const template = ((this.placeTemplate % TEMPLATES.length) + TEMPLATES.length) % TEMPLATES.length;
      const owner =
        this.placeOwner != null
          ? this.placeOwner
          : this.worlds.some((w) => w.owner === PLAYER_ID)
            ? NEUTRAL_ID
            : PLAYER_ID;
      const world: MapWorld = {
        id: newWorldId(),
        name: planetName(index),
        template,
        x: snapped.x,
        y: snapped.y,
        still: !this.placeOrbit,
        ox: snapped.x - 140,
        oy: snapped.y,
        owner,
        level: 1,
        ...defaultWorldStats(owner),
        ...(TEMPLATES[template]?.kind === HUSK_KIND ? { cooldown: 30 } : {}),
      };
      this.worlds = [...this.worlds, world];
      this.selectedId = world.id;
    } else if (!drag.moved && drag.kind === "pan") {
      this.selectedId = null;
    }
    this.emitEdit();
    } finally {
      this.commitHistory();
    }
  }

  private handleTap(id: string | null, start: { wx: number; wy: number }): "send" | "select" | "idle" | "clear" {
    const m = match();
    if (!m) return "idle";
    if (id) this.stopSpam();
    if (this.selectedTotal() > 0) {
      if (id) {
        if (!this.selfOnly(id) || this.canRise(id)) {
          this.commitSend(id);
          return "send";
        }
        this.clearSelection();
        return "clear";
      }
      this.commitSend({ x: start.wx, y: start.wy });
      return "send";
    }
    if (id && m.planets[id]?.owner === PLAYER_ID && m.planets[id].garrison >= 1) {
      this.pickMode = "planet";
      this.armedZone = null;
      this.picked = { [id]: Math.floor(m.planets[id].garrison) };
      this.pickedCrafts = [];
      this.pickSig = "";
      this.onPicked(this.picked, false);
      return "select";
    }
    if (!id) {
      const near = this.parkedNear(start.wx, start.wy);
      if (near.length > 0) {
        this.pickMode = null;
        this.armedZone = null;
        this.picked = {};
        this.pickedCrafts = near;
        this.pickSig = "";
        this.onPicked(this.picked, false);
        return "select";
      }
    }
    this.clearSelection();
    return "idle";
  }

  private selfOnly(id: string) {
    const sources = Object.keys(this.picked);
    return sources.length === 1 && sources[0] === id && this.pickedCrafts.length === 0;
  }

  private canRise(id: string) {
    const m = match();
    const st = m?.planets[id];
    const def = m?.defs.find((d) => d.id === id);
    if (!st || !def || st.owner !== PLAYER_ID) return false;
    return (st.level || 1) < (def.maxLevel ?? MAX_LEVEL);
  }

  private clearHold() {
    if (this.holdTimer != null) {
      window.clearTimeout(this.holdTimer);
      this.holdTimer = null;
    }
  }

  private stopSpam() {
    this.spamUntil = 0;
    if (this.repeatTimer != null) {
      window.clearInterval(this.repeatTimer);
      this.repeatTimer = null;
    }
  }

  private armHold() {
    this.clearHold();
    this.holdingRepeat = false;
    this.holdTimer = window.setTimeout(() => {
      this.holdTimer = null;
      if (!this.down || this.moved || this.pinching || !this.interactive) return;
      this.holdingRepeat = true;
      this.spamUntil = performance.now() + 10000;
      this.repeatMove(true);
      if (this.repeatTimer != null) return;
      this.repeatTimer = window.setInterval(() => {
        if (!this.down || this.moved || !this.interactive || performance.now() > this.spamUntil) {
          this.stopSpam();
          return;
        }
        this.repeatMove(true);
      }, 170);
    }, 340);
  }

  private repeatIfDouble(e: PointerEvent) {
    const now = performance.now();
    const near =
      this.emptyTapAt > 0 &&
      now - this.emptyTapAt < 320 &&
      Math.hypot(e.clientX - this.emptyTapX, e.clientY - this.emptyTapY) < 28;
    if (!near) return false;
    this.emptyTapAt = 0;
    this.repeatMove(false);
    return true;
  }

  private repeatMove(quiet: boolean) {
    const last = this.lastMove;
    if (!last || !this.targetLive(last.target)) {
      if (!quiet) this.onSend({}, last?.target ?? "", []);
      return;
    }
    if (last.kind === "planet") {
      const st = match()?.planets[last.planetId];
      if (!st || st.owner !== PLAYER_ID || st.garrison < 1) return;
      this.pickMode = "planet";
      this.armedZone = null;
      this.picked = { [last.planetId]: Math.floor(st.garrison) };
      this.pickedCrafts = [];
      this.commitSend(last.target, true);
      return;
    }
    this.pickMode = "zone";
    this.armedZone = { x: last.x, y: last.y, r: last.r };
    this.circle = { x: last.x, y: last.y, r: last.r };
    this.pickSig = "";
    this.refreshPick();
    this.flash = { x: last.x, y: last.y, r: last.r, until: this.time + 0.55 };
    this.circle = null;
    if (this.selectedTotal() < 1) {
      this.clearSelection();
      if (!quiet) this.onSend({}, last.target, []);
      return;
    }
    this.commitSend(last.target, true);
  }

  private targetLive(to: SendTarget): boolean {
    if (typeof to === "string") return Boolean(match()?.planets[to]);
    return Number.isFinite(to.x) && Number.isFinite(to.y);
  }

  private parkedNear(x: number, y: number): number[] {
    const m = match();
    if (!m) return [];
    const reach = Math.max(20, 32 / this.scale);
    let best: { x: number; y: number } | null = null;
    let bestD = reach * reach;
    for (const c of m.crafts) {
      if (!c.hold || c.owner !== PLAYER_ID || c.payload < 1) continue;
      const d = (c.x - x) ** 2 + (c.y - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    if (!best) return [];
    const out: number[] = [];
    for (const c of m.crafts) {
      if (!c.hold || c.owner !== PLAYER_ID || c.payload < 1) continue;
      if (Math.hypot(c.x - best.x, c.y - best.y) <= 72) out.push(c.id);
    }
    return out;
  }

  private commitSend(to: SendTarget, repeat = false) {
    if (this.pickMode === "planet") {
      const id = Object.keys(this.picked)[0];
      if (id) this.lastMove = { kind: "planet", planetId: id, target: to };
    } else if (this.armedZone && this.armedZone.r > 1) {
      this.lastMove = { kind: "zone", x: this.armedZone.x, y: this.armedZone.y, r: this.armedZone.r, target: to };
    }
    if (!repeat && typeof to !== "string") this.pings.push({ x: to.x, y: to.y, until: this.time + 0.85 });
    const crafts = this.pickedCrafts.slice();
    this.onSend({ ...this.picked }, to, crafts, repeat);
    this.picked = {};
    this.pickedCrafts = [];
    this.pickSig = "";
    this.pickMode = null;
    this.onPicked(this.picked, false);
  }

  private clearSelection() {
    this.picked = {};
    this.pickedCrafts = [];
    this.pickSig = "";
    this.onPicked(this.picked, false);
  }

  private refreshPick() {
    if (!this.circle) return;
    const scooped = this.scoop(this.circle.x, this.circle.y, this.circle.r);
    const crafts = this.scoopCrafts(this.circle.x, this.circle.y, this.circle.r);
    const sig = this.signature(scooped, crafts);
    if (sig === this.pickSig) return;
    this.pickSig = sig;
    this.picked = scooped;
    this.pickedCrafts = crafts;
    this.onPicked(this.picked, true);
  }

  private signature(sel: Selection, crafts: number[]) {
    let s = "";
    for (const k of Object.keys(sel).sort()) s += `${k}:${sel[k]},`;
    s += "|";
    for (const id of [...crafts].sort((a, b) => a - b)) s += `${id},`;
    return s;
  }

  private orbitEpoch = new Map<string, number>();

  /** Where a world is drawn. The editor clock runs so orbit speed is visible. */
  private bodyTime(id?: string) {
    if (!this.editing) return this.time;
    const drag = this.editDrag;
    if (id && drag?.moved && drag.id === id && (drag.kind === "world" || drag.kind === "point" || drag.kind === "flat")) return 0;
    return this.preview - (id ? (this.orbitEpoch.get(id) ?? 0) : 0);
  }

  private scoopCrafts(cx: number, cy: number, r: number): number[] {
    const m = match();
    if (!m) return [];
    const out: number[] = [];
    for (const c of m.crafts) {
      if (c.owner !== PLAYER_ID || c.payload < 1) continue;
      if (Math.hypot(c.x - cx, c.y - cy) <= r) out.push(c.id);
    }
    return out;
  }

  render(dt: number, alpha = 0) {
    const m = match();
    if (this.editing) this.time = 0;
    else if (m && this.followSim) {
      const live = !m.paused && m.result === "playing";
      this.time = live ? m.elapsed - (1 - alpha) * STEP : m.elapsed;
      this.motion = live ? alpha : 0;
    } else {
      this.time += dt;
      this.motion = 0;
    }
    setWhirlClock(this.editing ? this.bodyTime() : this.time);
    if (!this.editing && this.drawing && this.circle) this.refreshPick();
    this.preview += dt;
    if (!this.reduced) this.skyTime += dt;
    this.bindBodies();
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    for (const s of takeSparks()) {
      this.burst(s.x, s.y, s.hostile ? "rgba(255,176,156,0.95)" : "rgba(226,232,240,0.92)", s.hostile ? 12 : 6);
    }
    this.ctx.fillStyle = "#07070a";
    this.ctx.fillRect(0, 0, this.w, this.h);
    this.drawNebula();
    this.drawStars();
    this.drawDust();
    this.drawOrbits();
    if (this.editing) {
      for (const sun of this.suns) this.drawSun(sun, this.selectedId === sunKey(sun.id));
    } else if (!this.hasCustomLayout()) {
      this.drawSun({ id: "core", x: 0, y: 0, scale: 1 }, false);
    } else {
      for (const sun of m?.sourceMap?.suns ?? []) this.drawSun(sun, false);
    }
    const defs = this.defs();
    const order = defs.map((p) => ({ id: p.id, z: planetWorld(p, this.bodyTime(p.id), this.reduced).z })).sort((a, b) => a.z - b.z);
    for (const o of order) this.drawPlanet(o.id);
    if (!this.editing) this.drawCrafts();
    this.drawParticles(dt);
    this.drawEditorGuides();
    this.drawEditChrome();
    this.drawGroup();
    this.drawCircle();
  }

  private hasCustomLayout() {
    return this.editing || this.defs().some((d) => d.still || d.anchorX != null || d.anchorY != null);
  }

  private drawNebula() {
    const ctx = this.ctx;
    const cell = 980;
    const halfW = this.w / (2 * this.scale) + cell;
    const halfH = this.h / (2 * this.scale) + cell;
    const x0 = Math.floor((this.camX - halfW) / cell);
    const x1 = Math.floor((this.camX + halfW) / cell);
    const y0 = Math.floor((this.camY - halfH) / cell);
    const y1 = Math.floor((this.camY + halfH) / cell);
    const drift = this.reduced ? 0 : this.skyTime;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        for (let n = 0; n < 2; n++) {
          const hx = hash3(cx, cy, 3.2 + n);
          const hy = hash3(cx + 5, cy, 8.4 + n);
          const tone = NEBULA_TONES[Math.floor(hash3(cx, cy, 1.7 + n) * NEBULA_TONES.length) % NEBULA_TONES.length];
          const wobble = drift * (0.045 + hx * 0.03);
          const x = (cx + 0.18 + hx * 0.64) * cell + Math.sin(wobble + hx * 6) * 70;
          const y = (cy + 0.18 + hy * 0.64) * cell + Math.cos(wobble * 0.8 + hy * 5) * 54;
          const radius = 340 + hash3(cx, cy, 6 + n) * 280;
          const s = this.worldToScreen(x, y);
          const rr = radius * this.scale;
          if (s.x < -rr || s.y < -rr || s.x > this.w + rr || s.y > this.h + rr) continue;
          const g = ctx.createRadialGradient(s.x, s.y, rr * 0.08, s.x, s.y, rr);
          g.addColorStop(0, `rgba(${tone[0]},${tone[1]},${tone[2]},0.22)`);
          g.addColorStop(0.42, `rgba(${tone[0]},${tone[1]},${tone[2]},0.08)`);
          g.addColorStop(1, `rgba(${tone[0]},${tone[1]},${tone[2]},0)`);
          ctx.fillStyle = g;
          ctx.fillRect(s.x - rr, s.y - rr, rr * 2, rr * 2);
        }
      }
    }
  }

  private drawStars() {
    this.drawStarLayer(0.22, 320, 5, 0.85, 0.55);
    this.drawStarLayer(0.55, 220, 4, 1.35, 0.85);
  }

  private drawStarLayer(parallax: number, cell: number, per: number, size: number, gain: number) {
    const ctx = this.ctx;
    const halfW = this.w / (2 * this.scale);
    const halfH = this.h / (2 * this.scale);
    const spaceX = this.camX * parallax;
    const spaceY = this.camY * parallax;
    const x0 = Math.floor((spaceX - halfW) / cell) - 1;
    const x1 = Math.floor((spaceX + halfW) / cell) + 1;
    const y0 = Math.floor((spaceY - halfH) / cell) - 1;
    const y1 = Math.floor((spaceY + halfH) / cell) + 1;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        for (let i = 0; i < per; i++) {
          const hx = hash3(cx * 3 + i, cy * 5, parallax * 9 + 1);
          const hy = hash3(cx * 7, cy * 2 + i, parallax * 9 + 4);
          const x = (cx + hx) * cell;
          const y = (cy + hy) * cell;
          const sx = (x - spaceX) * this.scale + this.w / 2;
          const sy = (y - spaceY) * this.scale + this.h / 2;
          if (sx < -2 || sy < -2 || sx > this.w + 2 || sy > this.h + 2) continue;
          const tw = this.reduced ? 1 : 0.74 + 0.26 * Math.sin(this.skyTime * (0.55 + hx) + hy * 12);
          const a = Math.min(0.9, (0.2 + hash3(cx, cy, i + 2.2) * 0.55) * gain * tw);
          const r = 0.35 + hash3(i, cx, cy) * size;
          ctx.fillStyle = `rgba(230,232,236,${a})`;
          ctx.beginPath();
          ctx.arc(sx, sy, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  private bindBodies() {
    const worlds = this.editing ? this.worlds : (match()?.sourceMap?.worlds ?? []);
    const suns = this.editing ? this.suns : (match()?.sourceMap?.suns ?? []);
    const locks = this.editing ? this.locks : (match()?.sourceMap?.locks ?? []);
    bindOrbitFrame(
      this.defs(),
      suns.map((sun) => ({
        id: sun.id,
        x: sun.x,
        y: sun.y,
        cohort: this.editing ? null : cohortFor(locks, worlds, suns, "sun", sun.id),
        whirl: turnFor(locks, "sun", sun.id),
      })),
    );
  }

  private drawDust() {
    const ctx = this.ctx;
    const g = ctx.createRadialGradient(this.w * 0.5, this.h * 0.28, 20, this.w * 0.5, this.h * 0.35, this.w * 0.7);
    g.addColorStop(0, "rgba(40,48,62,0.18)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);
  }

  private drawOrbits() {
    const ctx = this.ctx;
    ctx.save();
    for (const def of this.defs()) {
      if (def.still || def.orbit < 1) continue;
      const c = this.worldToScreen(orbitAnchor(def, this.time, this.reduced).x, orbitAnchor(def, this.time, this.reduced).y);
      const selected = this.editing && def.id === this.selectedId;
      ctx.strokeStyle = selected ? "rgba(236,236,239,0.34)" : "rgba(236,236,239,0.07)";
      ctx.lineWidth = 1;
      const flat = def.flat ?? 1;
      const tilt = (def.tilt ?? 0) + whirlAngle(def.whirl, this.reduced);
      const rx = def.orbit * this.scale;
      const ry = def.orbit * ELLIPSE * flat * this.scale;
      ctx.beginPath();
      if (ry < 0.8) {
        const sx = Math.cos(tilt) * rx;
        const sy = Math.sin(tilt) * rx;
        ctx.moveTo(c.x - sx, c.y - sy);
        ctx.lineTo(c.x + sx, c.y + sy);
      } else {
        ctx.ellipse(c.x, c.y, rx, ry, tilt, 0, Math.PI * 2);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  private ellipseHandle(def: PlanetDef): { x: number; y: number } {
    const a = orbitAnchor(def, this.time, this.reduced);
    const tilt = (def.tilt ?? 0) + whirlAngle(def.whirl, this.reduced);
    const ry = def.orbit * ELLIPSE * (def.flat ?? 1);
    const gap = 28 / Math.max(0.35, this.scale);
    const ly = -Math.max(ry, gap);
    return {
      x: a.x - Math.sin(tilt) * ly,
      y: a.y + Math.cos(tilt) * ly,
    };
  }

  private hitEllipse(x: number, y: number): string | null {
    const def = this.defs().find((item) => item.id === this.selectedId);
    if (!def || def.still || def.orbit < 1) return null;
    const h = this.ellipseHandle(def);
    return Math.hypot(x - h.x, y - h.y) <= 16 / Math.max(0.35, this.scale) ? def.id : null;
  }

  private orbitLock(x: number, y: number, selfId: string): { x: number; y: number } | null {
    let best: { x: number; y: number; r: number; d: number } | null = null;
    const consider = (cx: number, cy: number, r: number) => {
      const d = Math.hypot(x - cx, y - cy);
      if (d > r) return;
      if (!best || r < best.r || (r === best.r && d < best.d)) best = { x: cx, y: cy, r, d };
    };
    for (const sun of this.suns) consider(sun.x, sun.y, this.sunRadius(sun));
    for (const def of this.defs()) {
      if (def.id === selfId) continue;
      const pos = planetWorld(def, this.bodyTime(def.id), this.reduced);
      consider(pos.x, pos.y, planetSize(def));
    }
    return best;
  }

  private sunRadius(sun: MapSun) {
    return 18 * Math.max(0.45, Math.min(MAX_SUN_SCALE, sun.scale || 1));
  }

  private hitSun(x: number, y: number): string | null {
    let best: { id: string; d: number } | null = null;
    for (const sun of this.suns) {
      const d = Math.hypot(x - sun.x, y - sun.y);
      if (d <= this.sunRadius(sun) + 6 && (!best || d < best.d)) best = { id: sun.id, d };
    }
    return best?.id ?? null;
  }

  private hitSunResize(x: number, y: number): string | null {
    const id = sunIdFromKey(this.selectedId);
    if (!id) return null;
    const sun = this.suns.find((item) => item.id === id);
    if (!sun) return null;
    const d = Math.hypot(x - (sun.x + this.sunRadius(sun)), y - sun.y);
    return d <= 14 / Math.max(0.35, this.scale) ? sun.id : null;
  }

  private selectionScreen(): { x: number; y: number; r: number } | null {
    const sunId = sunIdFromKey(this.selectedId);
    if (sunId) {
      const sun = this.suns.find((item) => item.id === sunId);
      if (!sun) return null;
      const s = this.worldToScreen(sun.x, sun.y);
      return { x: s.x, y: s.y, r: this.sunRadius(sun) * this.scale };
    }
    const def = this.defs().find((item) => item.id === this.selectedId);
    if (!def || !this.editing) return null;
    const pos = planetWorld(def, this.bodyTime(def.id), this.reduced);
    const s = this.worldToScreen(pos.x, pos.y);
    return { x: s.x, y: s.y, r: planetSize(def) * this.scale };
  }

  private deleteAt(body: { x: number; y: number; r: number }) {
    const reach = body.r + 8;
    return {
      x: body.x - Math.cos(Math.PI / 4) * reach,
      y: body.y - Math.sin(Math.PI / 4) * reach,
      r: 6.5,
    };
  }

  private hitDelete(e: PointerEvent) {
    if (!this.editing || !this.selectedId) return false;
    const body = this.selectionScreen();
    if (!body) return false;
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const btn = this.deleteAt(body);
    return Math.hypot(x - btn.x, y - btn.y) <= btn.r + 4;
  }

  private removeSelected() {
    const sunId = sunIdFromKey(this.selectedId);
    if (sunId) this.suns = this.suns.filter((item) => item.id !== sunId);
    else if (this.selectedId) this.worlds = this.worlds.filter((item) => item.id !== this.selectedId);
    if (sunId) this.dropLocks([], [sunId]);
    else if (this.selectedId) this.dropLocks([this.selectedId], []);
    this.selectedId = null;
  }

  private clearGroup() {
    this.group = null;
    this.groupBase = null;
    this.ghost = null;
    this.marquee = null;
    this.spinOn = false;
    this.spinPivot = null;
    this.onGroupLock(null);
  }

  private screenFromEvent(e: { clientX: number; clientY: number }) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private groupBody(): { x: number; y: number; r: number } | null {
    if (!this.group) return null;
    const ride = this.lockRide(this.selectionLock());
    const spun = this.turned(this.group.x, this.group.y);
    const s = this.worldToScreen(spun.x + ride.x, spun.y + ride.y);
    return { x: s.x, y: s.y, r: Math.max(28, this.group.r * this.scale) };
  }

  private groupHandles() {
    const names = ["delete", "move", "copy", "rotate", "save", "lock"] as const;
    return this.selectionLock() ? ([...names, "orbit", "spin"] as const) : names;
  }

  private groupSpots(body: { x: number; y: number; r: number }) {
    const names = this.groupHandles();
    const left = Math.PI;
    const right = 0;
    const spots = {} as Record<(typeof names)[number], { x: number; y: number; r: number }>;
    names.forEach((name, i) => {
      const t = i / (names.length - 1);
      const a = left + (right - left) * t;
      spots[name] = {
        x: body.x + Math.cos(a) * body.r,
        y: body.y + Math.sin(a) * body.r,
        r: 9.75,
      };
    });
    return spots;
  }

  private hitGroupHandle(e: PointerEvent): "delete" | "copy" | "move" | "rotate" | "save" | "lock" | "orbit" | "spin" | null {
    const body = this.groupBody();
    if (!body) return null;
    const p = this.screenFromEvent(e);
    const spots = this.groupSpots(body);
    let best: { kind: "delete" | "copy" | "move" | "rotate" | "save" | "lock" | "orbit" | "spin"; d: number } | null = null;
    for (const kind of this.groupHandles()) {
      const spot = spots[kind];
      if (!spot) continue;
      const d = Math.hypot(p.x - spot.x, p.y - spot.y);
      if (d <= spot.r + 6 && (!best || d < best.d)) best = { kind, d };
    }
    return best?.kind ?? null;
  }

  private selectionLock(): MapLock | null {
    if (!this.group) return null;
    const worlds = new Set(this.group.worldIds);
    const suns = new Set(this.group.sunIds);
    return (
      this.locks.find(
        (lock) =>
          lock.worldIds.length === worlds.size &&
          lock.sunIds.length === suns.size &&
          lock.worldIds.every((id) => worlds.has(id)) &&
          lock.sunIds.every((id) => suns.has(id)),
      ) ?? null
    );
  }

  private lockRide(lock: MapLock | null) {
    if (!lock?.orbit) return { x: 0, y: 0 };
    const id = lock.worldIds[0] || lock.sunIds[0] || "";
    const kind = lock.worldIds[0] ? "world" : "sun";
    return cohortDelta(cohortFor([lock], this.worlds, this.suns, kind, id), this.time, this.reduced);
  }

  private turned(x: number, y: number) {
    const lock = this.selectionLock();
    if (!lock?.turn) return { x, y };
    const kind = lock.worldIds[0] ? "world" : "sun";
    const id = lock.worldIds[0] || lock.sunIds[0] || "";
    return turnPoint(x, y, turnFor([lock], kind, id), this.reduced);
  }

  setGroupSpin(pspin: number) {
    const lock = this.selectionLock();
    if (!lock) return;
    this.locks = this.locks.map((item) => (item.id === lock.id ? { ...item, pspin } : item));
    this.emitEdit();
  }

  private toggleTurn() {
    const lock = this.selectionLock();
    if (!lock || !this.group) return;
    if (lock.turn) {
      this.spinOn = false;
      this.locks = this.locks.map((item) => (item.id === lock.id ? { ...item, turn: false } : item));
    } else {
      const pivot = this.spinPivot ?? { x: this.group.x, y: this.group.y };
      this.spinPivot = pivot;
      this.spinOn = true;
      this.locks = this.locks.map((item) =>
        item.id === lock.id ? { ...item, turn: true, cx: pivot.x, cy: pivot.y, pspin: item.pspin || 1 } : item,
      );
    }
    this.emitEdit();
  }

  private poseGroup(worldIds: string[], sunIds: string[]) {
    const circle = clusterCircle(this.worlds, this.suns, worldIds, sunIds);
    if (circle.r < 1) {
      this.group = null;
      return;
    }
    this.group = { x: circle.x, y: circle.y, r: circle.r, worldIds: worldIds.slice(), sunIds: sunIds.slice() };
    this.selectedId = null;
    const lock = this.selectionLock();
    this.spinOn = Boolean(lock?.turn);
    if (lock?.turn) this.spinPivot = { x: lock.cx, y: lock.cy };
  }

  private expandLocks(worldIds: string[], sunIds: string[]) {
    const worlds = new Set(worldIds);
    const suns = new Set(sunIds);
    let grew = true;
    while (grew) {
      grew = false;
      for (const lock of this.locks) {
        const hit = lock.worldIds.some((id) => worlds.has(id)) || lock.sunIds.some((id) => suns.has(id));
        if (!hit) continue;
        for (const id of lock.worldIds) {
          if (worlds.has(id)) continue;
          worlds.add(id);
          grew = true;
        }
        for (const id of lock.sunIds) {
          if (suns.has(id)) continue;
          suns.add(id);
          grew = true;
        }
      }
    }
    return { worldIds: [...worlds], sunIds: [...suns] };
  }

  private lockAt(x: number, y: number): MapLock | null {
    for (const lock of this.locks) {
      for (const id of lock.worldIds) {
        const def = this.defs().find((item) => item.id === id);
        const world = this.worlds.find((item) => item.id === id);
        if (!def || !world) continue;
        const pos = planetWorld(def, this.bodyTime(def.id), this.reduced);
        if (Math.hypot(pos.x - x, pos.y - y) <= planetSize(world) + 8) return lock;
      }
      const ride = this.lockRide(lock);
      for (const id of lock.sunIds) {
        const sun = this.suns.find((item) => item.id === id);
        if (!sun) continue;
        if (Math.hypot(sun.x + ride.x - x, sun.y + ride.y - y) <= this.sunRadius(sun) + 8) return lock;
      }
    }
    return null;
  }

  private dropLocks(worldIds: string[], sunIds: string[]) {
    const worlds = new Set(worldIds);
    const suns = new Set(sunIds);
    this.locks = this.locks
      .map((lock) => ({
        ...lock,
        worldIds: lock.worldIds.filter((id) => !worlds.has(id)),
        sunIds: lock.sunIds.filter((id) => !suns.has(id)),
      }))
      .filter((lock) => lock.worldIds.length + lock.sunIds.length > 0);
  }

  private toggleLock() {
    if (!this.group) return;
    const current = this.selectionLock();
    if (current) {
      this.locks = this.locks.filter((lock) => lock.id !== current.id);
      this.spinOn = false;
      this.spinPivot = null;
      this.emitEdit();
      return;
    }
    const worldIds = this.group.worldIds.filter((id) => this.worlds.some((w) => w.id === id));
    const sunIds = this.group.sunIds.filter((id) => this.suns.some((s) => s.id === id));
    if (!worldIds.length && !sunIds.length) return;
    this.dropLocks(worldIds, sunIds);
    const circle = clusterCircle(this.worlds, this.suns, worldIds, sunIds);
    this.locks = [
      ...this.locks,
      { id: `k${Date.now().toString(36)}`, worldIds, sunIds, orbit: false, ox: circle.x - 140, oy: circle.y, spin: 0.12, turn: false, cx: circle.x, cy: circle.y, pspin: 1 },
    ];
    this.poseGroup(worldIds, sunIds);
    this.emitEdit();
  }

  private toggleGroupOrbit() {
    const lock = this.selectionLock();
    if (!lock) return;
    this.locks = this.locks.map((item) => (item.id === lock.id ? { ...item, orbit: !item.orbit } : item));
    this.emitEdit();
  }

  private hitGroupCenter(x: number, y: number): boolean {
    const lock = this.selectionLock();
    if (!lock?.orbit) return false;
    return Math.hypot(x - lock.ox, y - lock.oy) <= 18 / Math.max(0.35, this.scale);
  }

  private editSelectDown(e: PointerEvent) {
    const hit = this.hitGroupHandle(e);
    if (hit === "delete") {
      this.removeGroup();
      this.editDrag = {
        kind: "hold",
        pointer: e.pointerId,
        lastX: e.clientX,
        lastY: e.clientY,
        sx: e.clientX,
        sy: e.clientY,
        moved: true,
      };
      this.emitEdit();
      return;
    }
    if (hit === "save") {
      const draft = this.captureRemember();
      if (draft) this.onRemember(draft);
      this.editDrag = {
        kind: "hold",
        pointer: e.pointerId,
        lastX: e.clientX,
        lastY: e.clientY,
        sx: e.clientX,
        sy: e.clientY,
        moved: true,
      };
      return;
    }
    if (hit === "lock" || hit === "orbit") {
      if (hit === "lock") this.toggleLock();
      else this.toggleGroupOrbit();
      this.editDrag = {
        kind: "hold",
        pointer: e.pointerId,
        lastX: e.clientX,
        lastY: e.clientY,
        sx: e.clientX,
        sy: e.clientY,
        moved: true,
      };
      return;
    }
    const point = this.worldFromEvent(e);
    if (this.hitGroupCenter(point.x, point.y)) {
      this.editDrag = {
        kind: "gcenter",
        pointer: e.pointerId,
        lastX: e.clientX,
        lastY: e.clientY,
        sx: e.clientX,
        sy: e.clientY,
        moved: false,
      };
      return;
    }
    if (hit === "copy" || hit === "move" || hit === "rotate" || hit === "spin") {
      const p = this.worldFromEvent(e);
      const around = hit === "spin" ? (this.spinPivot ?? { x: this.group?.x ?? p.x, y: this.group?.y ?? p.y }) : { x: this.group?.x ?? p.x, y: this.group?.y ?? p.y };
      if (hit === "spin" && !this.spinPivot) this.spinPivot = around;
      const cx = around.x;
      const cy = around.y;
      this.groupBase = {
        worlds: this.worlds.filter((w) => this.group?.worldIds.includes(w.id)).map((w) => ({ ...w })),
        suns: this.suns.filter((s) => this.group?.sunIds.includes(s.id)).map((s) => ({ ...s })),
        cx,
        cy,
        gx: this.group?.x ?? cx,
        gy: this.group?.y ?? cy,
      };
      this.ghost = null;
      this.editDrag = {
        kind: hit === "copy" ? "gcopy" : hit === "move" ? "gmove" : hit === "spin" ? "gspin" : "grotate",
        pointer: e.pointerId,
        lastX: e.clientX,
        lastY: e.clientY,
        sx: e.clientX,
        sy: e.clientY,
        wx: p.x,
        wy: p.y,
        ang: Math.atan2(p.y - cy, p.x - cx),
        moved: false,
      };
      return;
    }
    const wpt = this.worldFromEvent(e);
    if (this.spinOn && this.hitSpinCenter(wpt.x, wpt.y)) {
      this.editDrag = {
        kind: "gpivot",
        pointer: e.pointerId,
        lastX: e.clientX,
        lastY: e.clientY,
        sx: e.clientX,
        sy: e.clientY,
        moved: false,
      };
      return;
    }
    this.marquee = { x: wpt.x, y: wpt.y, r: 0 };
    this.editDrag = {
      kind: "marquee",
      pointer: e.pointerId,
      lastX: e.clientX,
      lastY: e.clientY,
      sx: e.clientX,
      sy: e.clientY,
      wx: wpt.x,
      wy: wpt.y,
      moved: false,
    };
  }

  private hitSpinCenter(x: number, y: number) {
    if (!this.spinPivot) return false;
    return Math.hypot(x - this.spinPivot.x, y - this.spinPivot.y) <= 18 / Math.max(0.35, this.scale);
  }

  private snapPivot(x: number, y: number) {
    if (!this.snap) return { x, y, mark: null as typeof this.snapMark };
    const onto = this.orbitLock(x, y, "");
    if (onto) return { x: onto.x, y: onto.y, mark: { x: onto.x, y: onto.y, kind: "axis" as const, lock: "both" as const } };
    const others = [...this.worlds.map((w) => ({ x: w.x, y: w.y })), ...this.suns.map((s) => ({ x: s.x, y: s.y }))];
    const reach = Math.max(24, Math.min(110, 42 / Math.max(0.25, this.scale)));
    const snapped = snapFormation(x, y, others, reach);
    return {
      x: snapped.x,
      y: snapped.y,
      mark: snapped.kind
        ? { x: snapped.x, y: snapped.y, kind: snapped.kind, nx: snapped.nx, ny: snapped.ny, lock: snapped.lock }
        : null,
    };
  }

  private snapShift(dx: number, dy: number) {
    const base = this.groupBase;
    if (!base) return { dx, dy, mark: null as typeof this.snapMark };
    let nx = base.cx + dx;
    let ny = base.cy + dy;
    if (!this.snap || !this.group) return { dx, dy, mark: null };
    const skipW = new Set(this.group.worldIds);
    const skipS = new Set(this.group.sunIds);
    const others = [
      ...this.worlds.filter((w) => !skipW.has(w.id)).map((w) => ({ x: w.x, y: w.y })),
      ...this.suns.filter((s) => !skipS.has(s.id)).map((s) => ({ x: s.x, y: s.y })),
    ];
    const reach = Math.max(24, Math.min(110, 42 / Math.max(0.25, this.scale)));
    const snapped = snapFormation(nx, ny, others, reach);
    return {
      dx: snapped.x - base.cx,
      dy: snapped.y - base.cy,
      mark: snapped.kind
        ? { x: snapped.x, y: snapped.y, kind: snapped.kind, nx: snapped.nx, ny: snapped.ny, lock: snapped.lock }
        : null,
    };
  }

  private dragGroup(kind: "gmove" | "gcopy" | "grotate" | "gspin", e: PointerEvent) {
    const drag = this.editDrag;
    const base = this.groupBase;
    if (!drag || !base || !this.group) return;
    const p = this.worldFromEvent(e);
    if (kind === "grotate" || kind === "gspin") {
      let ang = Math.atan2(p.y - base.cy, p.x - base.cx) - (drag.ang ?? 0);
      if (this.snap) {
        const step = Math.PI / 12;
        const nearest = Math.round(ang / step) * step;
        if (Math.abs(ang - nearest) < 0.12) ang = nearest;
      }
      this.applyGroupRotate(ang);
      if (kind === "gspin" && base.gx != null && base.gy != null) {
        const g = this.spinPoint(base.gx, base.gy, base.cx, base.cy, ang);
        this.group.x = g.x;
        this.group.y = g.y;
      }
      this.emitEdit();
      return;
    }
    const shift = this.snapShift(p.x - (drag.wx ?? p.x), p.y - (drag.wy ?? p.y));
    this.snapMark = shift.mark;
    if (kind === "gmove") {
      this.applyGroupShift(shift.dx, shift.dy);
      this.group.x = base.cx + shift.dx;
      this.group.y = base.cy + shift.dy;
      this.emitEdit();
      return;
    }
    this.ghost = { dx: shift.dx, dy: shift.dy };
  }

  private spinPoint(x: number, y: number, cx: number, cy: number, ang: number) {
    const dx = x - cx;
    const dy = y - cy;
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c };
  }

  private applyGroupRotate(ang: number) {
    const base = this.groupBase;
    if (!base) return;
    const worlds = new Map(base.worlds.map((w) => [w.id, w]));
    this.worlds = this.worlds.map((w) => {
      const src = worlds.get(w.id);
      if (!src) return w;
      const p = this.spinPoint(src.x, src.y, base.cx, base.cy, ang);
      const o = this.spinPoint(src.ox, src.oy, base.cx, base.cy, ang);
      return { ...w, x: p.x, y: p.y, ox: o.x, oy: o.y, tilt: (src.tilt ?? 0) + ang };
    });
    const suns = new Map(base.suns.map((s) => [s.id, s]));
    this.suns = this.suns.map((s) => {
      const src = suns.get(s.id);
      if (!src) return s;
      const p = this.spinPoint(src.x, src.y, base.cx, base.cy, ang);
      return { ...s, x: p.x, y: p.y };
    });
  }

  private applyGroupShift(dx: number, dy: number) {
    const base = this.groupBase;
    if (!base) return;
    const worlds = new Map(base.worlds.map((w) => [w.id, w]));
    this.worlds = this.worlds.map((w) => {
      const src = worlds.get(w.id);
      if (!src) return w;
      return { ...w, x: src.x + dx, y: src.y + dy, ox: src.ox + dx, oy: src.oy + dy };
    });
    const suns = new Map(base.suns.map((s) => [s.id, s]));
    this.suns = this.suns.map((s) => {
      const src = suns.get(s.id);
      if (!src) return s;
      return { ...s, x: src.x + dx, y: src.y + dy };
    });
  }

  private finishMarquee(moved: boolean) {
    const area = this.marquee;
    this.marquee = null;
    if (!area) {
      this.group = null;
      return;
    }
    if (!moved || area.r < 10) {
      const lock = this.lockAt(area.x, area.y);
      if (lock) this.poseGroup(lock.worldIds, lock.sunIds);
      else this.group = null;
      return;
    }
    const worldIds: string[] = [];
    for (const w of this.worlds) {
      const def = this.defs().find((item) => item.id === w.id);
      const pos = def ? planetWorld(def, this.bodyTime(def.id), this.reduced) : { x: w.x, y: w.y };
      if (Math.hypot(pos.x - area.x, pos.y - area.y) <= area.r) worldIds.push(w.id);
    }
    const sunIds = this.suns
      .filter((s) => {
        const lock = this.locks.find((item) => item.sunIds.includes(s.id));
        const ride = this.lockRide(lock ?? null);
        return Math.hypot(s.x + ride.x - area.x, s.y + ride.y - area.y) <= area.r;
      })
      .map((s) => s.id);
    if (!worldIds.length && !sunIds.length) {
      this.group = null;
      return;
    }
    const expanded = this.expandLocks(worldIds, sunIds);
    const grew = expanded.worldIds.length !== worldIds.length || expanded.sunIds.length !== sunIds.length;
    const matched = this.locks.some(
      (lock) =>
        lock.worldIds.length === expanded.worldIds.length &&
        lock.sunIds.length === expanded.sunIds.length &&
        lock.worldIds.every((id) => expanded.worldIds.includes(id)) &&
        lock.sunIds.every((id) => expanded.sunIds.includes(id)),
    );
    if (grew || matched) this.poseGroup(expanded.worldIds, expanded.sunIds);
    else this.group = { x: area.x, y: area.y, r: area.r, worldIds, sunIds };
    this.selectedId = null;
  }

  private removeGroup() {
    if (!this.group) return;
    const worlds = new Set(this.group.worldIds);
    const suns = new Set(this.group.sunIds);
    this.worlds = this.worlds.filter((w) => !worlds.has(w.id));
    this.suns = this.suns.filter((s) => !suns.has(s.id));
    this.dropLocks([...worlds], [...suns]);
    this.selectedId = null;
    this.clearGroup();
  }

  private captureRemember(): { worlds: RememberWorld[]; suns: RememberGroup["suns"] } | null {
    if (!this.group) return null;
    const worlds = this.worlds.filter((w) => this.group?.worldIds.includes(w.id));
    const suns = this.suns.filter((s) => this.group?.sunIds.includes(s.id));
    if (!worlds.length && !suns.length) return null;
    const pts = [...worlds.map((w) => ({ x: w.x, y: w.y })), ...suns.map((s) => ({ x: s.x, y: s.y }))];
    const ox = pts.reduce((sum, p) => sum + p.x, 0) / pts.length;
    const oy = pts.reduce((sum, p) => sum + p.y, 0) / pts.length;
    const bodies: { kind: "world" | "sun"; index: number; x: number; y: number; r: number }[] = [
      ...worlds.map((w, index) => ({ kind: "world" as const, index, x: w.x, y: w.y, r: planetSize(w) })),
      ...suns.map((s, index) => ({ kind: "sun" as const, index, x: s.x, y: s.y, r: this.sunRadius(s) })),
    ];
    const anchorAt = (x: number, y: number, self: { kind: "world" | "sun"; index: number }): GroupAnchor | null => {
      let best: { kind: "world" | "sun"; index: number; d: number } | null = null;
      for (const body of bodies) {
        if (body.kind === self.kind && body.index === self.index) continue;
        const d = Math.hypot(x - body.x, y - body.y);
        if (d <= body.r && (!best || d < best.d)) best = { kind: body.kind, index: body.index, d };
      }
      return best ? { kind: best.kind, index: best.index } : null;
    };
    return {
      worlds: worlds.map((w, index) => ({
        name: w.name,
        template: w.template,
        dx: w.x - ox,
        dy: w.y - oy,
        relOx: w.ox - ox,
        relOy: w.oy - oy,
        anchor: w.still ? null : anchorAt(w.ox, w.oy, { kind: "world", index }),
        still: w.still,
        owner: w.owner,
        level: w.level,
        start: w.start,
        rate: w.rate,
        health: w.health,
        rise: w.rise,
        claim: w.claim,
        cooldown: w.cooldown,
        spin: w.spin,
        flat: w.flat,
        tilt: w.tilt,
      })),
      suns: suns.map((s) => ({ dx: s.x - ox, dy: s.y - oy, scale: s.scale || 1 })),
    };
  }

  stampRemember(group: RememberGroup) {
    const roomW = Math.max(0, MAX_PLANETS - this.worlds.length);
    const roomS = Math.max(0, MAX_SUNS - this.suns.length);
    const worlds = group.worlds.slice(0, roomW);
    const suns = group.suns.slice(0, roomS);
    if (!worlds.length && !suns.length) return;
    this.beginHistory();
    const placedW = worlds.map((w) => ({
      id: newWorldId(),
      name: w.name,
      template: w.template,
      x: this.camX + w.dx,
      y: this.camY + w.dy,
      still: w.still,
      ox: this.camX + w.relOx,
      oy: this.camY + w.relOy,
      owner: w.owner,
      level: w.level,
      start: w.start,
      rate: w.rate,
      health: w.health,
      rise: w.rise,
      claim: w.claim,
      ...(typeof w.cooldown === "number" ? { cooldown: w.cooldown } : {}),
      spin: w.spin,
      ...(typeof w.flat === "number" ? { flat: w.flat } : {}),
      ...(typeof w.tilt === "number" ? { tilt: w.tilt } : {}),
    }));
    const placedS = suns.map((s) => ({
      id: newSunId(),
      x: this.camX + s.dx,
      y: this.camY + s.dy,
      scale: s.scale,
    }));
    placedW.forEach((world, index) => {
      const anchor = worlds[index]?.anchor;
      if (!anchor) return;
      const host = anchor.kind === "world" ? placedW[anchor.index] : placedS[anchor.index];
      if (!host) return;
      world.ox = host.x;
      world.oy = host.y;
    });
    this.worlds = [...this.worlds, ...placedW];
    this.suns = [...this.suns, ...placedS];
    let reach = 48;
    for (const world of placedW) {
      reach = Math.max(reach, Math.hypot(world.x - this.camX, world.y - this.camY) + planetSize(world) + 18);
    }
    for (const sun of placedS) {
      reach = Math.max(reach, Math.hypot(sun.x - this.camX, sun.y - this.camY) + this.sunRadius(sun) + 18);
    }
    this.group = {
      x: this.camX,
      y: this.camY,
      r: reach,
      worldIds: placedW.map((world) => world.id),
      sunIds: placedS.map((sun) => sun.id),
    };
    this.selectedId = null;
    this.selecting = true;
    this.placing = false;
    this.placeSun = false;
    this.emitEdit();
    this.commitHistory();
  }

  private stampCopies(dx: number, dy: number) {
    const base = this.groupBase;
    if (!base) return;
    const worlds = base.worlds.slice(0, Math.max(0, MAX_PLANETS - this.worlds.length)).map((w) => ({
      ...w,
      id: newWorldId(),
      x: w.x + dx,
      y: w.y + dy,
      ox: w.ox + dx,
      oy: w.oy + dy,
    }));
    const suns = base.suns.slice(0, Math.max(0, MAX_SUNS - this.suns.length)).map((s) => ({
      ...s,
      id: newSunId(),
      x: s.x + dx,
      y: s.y + dy,
    }));
    this.worlds = [...this.worlds, ...worlds];
    this.suns = [...this.suns, ...suns];
  }

  private drawHandle(
    x: number,
    y: number,
    mark: "copy" | "move" | "rotate" | "delete" | "save" | "lock" | "orbit" | "spin",
    on = false,
  ) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(x, y, 9.75, 0, Math.PI * 2);
    ctx.fillStyle = mark === "delete" ? "rgba(28, 28, 32, 0.94)" : on ? "rgba(236, 208, 150, 0.96)" : "rgba(248,248,250,0.95)";
    ctx.fill();
    ctx.lineWidth = 1.25;
    ctx.strokeStyle = mark === "delete" ? "rgba(236,236,239,0.85)" : "rgba(20,20,24,0.85)";
    ctx.stroke();
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1.5, 1.5);
    ctx.strokeStyle = mark === "delete" ? "rgba(248,248,250,0.95)" : "rgba(20,20,24,0.9)";
    ctx.fillStyle = "rgba(20,20,24,0.9)";
    ctx.lineWidth = 1.15;
    ctx.beginPath();
    if (mark === "delete") {
      ctx.moveTo(-2.4, -2.4);
      ctx.lineTo(2.4, 2.4);
      ctx.moveTo(2.4, -2.4);
      ctx.lineTo(-2.4, 2.4);
    } else if (mark === "copy") {
      ctx.strokeRect(-3.2, -1.2, 4.2, 4.2);
      ctx.strokeRect(-1.1, -3.2, 4.2, 4.2);
    } else if (mark === "rotate") {
      ctx.arc(0, 0, 3, 0.4, Math.PI * 1.65);
    } else if (mark === "save") {
      ctx.moveTo(-2.2, -3);
      ctx.lineTo(2.2, -3);
      ctx.lineTo(2.2, 3);
      ctx.lineTo(0, 1.1);
      ctx.lineTo(-2.2, 3);
      ctx.closePath();
    } else if (mark === "lock") {
      ctx.strokeRect(-2.1, -0.2, 4.2, 3.3);
      ctx.moveTo(-1.3, -0.2);
      ctx.arc(0, -0.6, 1.3, Math.PI, 0, on);
      ctx.lineTo(1.3, -0.2);
    } else if (mark === "orbit") {
      ctx.ellipse(0, 0, 3.1, 1.7, -0.4, 0, Math.PI * 2);
    } else if (mark === "spin") {
      ctx.moveTo(-1.15, 0);
      ctx.lineTo(1.15, 0);
      ctx.moveTo(0, -1.15);
      ctx.lineTo(0, 1.15);
      ctx.moveTo(3.15, 0.15);
      ctx.arc(0, 0, 3.15, 0.05, Math.PI * 1.15);
    } else {
      ctx.moveTo(-3.2, 0);
      ctx.lineTo(3.2, 0);
      ctx.moveTo(0, -3.2);
      ctx.lineTo(0, 3.2);
    }
    ctx.stroke();
    if (mark === "rotate" || mark === "spin") {
      const a = mark === "spin" ? Math.PI * 1.15 : Math.PI * 1.65;
      const radius = mark === "spin" ? 3.15 : 3;
      const tipX = Math.cos(a) * radius;
      const tipY = Math.sin(a) * radius;
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(tipX - 3.1, tipY - 0.2);
      ctx.lineTo(tipX - 0.4, tipY - 3);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  private drawGroup() {
    if (!this.editing) return;
    const ctx = this.ctx;
    const ring = (x: number, y: number, r: number) => {
      const s = this.worldToScreen(x, y);
      ctx.beginPath();
      ctx.arc(s.x, s.y, Math.max(3, r * this.scale), 0, Math.PI * 2);
      ctx.stroke();
    };
    if (this.marquee && this.marquee.r > 1) {
      const s = this.worldToScreen(this.marquee.x, this.marquee.y);
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = "rgba(197,205,216,0.9)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(s.x, s.y, this.marquee.r * this.scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    if (this.ghost && this.groupBase) {
      ctx.save();
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = "rgba(236,236,239,0.9)";
      ctx.lineWidth = 1.5;
      for (const w of this.groupBase.worlds) {
        const def = this.defs().find((item) => item.id === w.id);
        const pos = def ? planetWorld(def, this.bodyTime(def.id), this.reduced) : { x: w.x, y: w.y };
        ring(pos.x + this.ghost.dx, pos.y + this.ghost.dy, def ? planetSize(def) : 18);
      }
      for (const sun of this.groupBase.suns) ring(sun.x + this.ghost.dx, sun.y + this.ghost.dy, this.sunRadius(sun));
      if (this.group) ring(this.group.x + this.ghost.dx, this.group.y + this.ghost.dy, this.group.r);
      ctx.restore();
    }
    const body = this.groupBody();
    const locked = this.selectionLock();
    if (this.group && !this.ghost && !locked) {
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = "rgba(236,236,239,0.55)";
      ctx.lineWidth = 1.25;
      for (const id of this.group.worldIds) {
        const def = this.defs().find((item) => item.id === id);
        if (!def) continue;
        const pos = planetWorld(def, this.bodyTime(def.id), this.reduced);
        ring(pos.x, pos.y, planetSize(def) + 4);
      }
      for (const id of this.group.sunIds) {
        const sun = this.suns.find((item) => item.id === id);
        if (sun) ring(sun.x, sun.y, this.sunRadius(sun) + 4);
      }
      ctx.restore();
    }
    if (!body) return;
    ctx.save();
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = "rgba(197,205,216,0.95)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(body.x, body.y, body.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    const spots = this.groupSpots(body);
    this.drawHandle(spots.delete.x, spots.delete.y, "delete");
    this.drawHandle(spots.move.x, spots.move.y, "move");
    this.drawHandle(spots.copy.x, spots.copy.y, "copy");
    this.drawHandle(spots.rotate.x, spots.rotate.y, "rotate");
    this.drawHandle(spots.save.x, spots.save.y, "save");
    this.drawHandle(spots.lock.x, spots.lock.y, "lock", !!locked);
    if (locked && spots.orbit) this.drawHandle(spots.orbit.x, spots.orbit.y, "orbit", locked.orbit);
    if (locked && spots.spin) this.drawHandle(spots.spin.x, spots.spin.y, "spin", this.spinOn);
    if (locked?.orbit && this.group) {
      const ride = this.lockRide(locked);
      const home = this.worldToScreen(this.group.x + ride.x, this.group.y + ride.y);
      const center = this.worldToScreen(locked.ox, locked.oy);
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "rgba(236, 208, 150, 0.75)";
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(home.x, home.y);
      ctx.lineTo(center.x, center.y);
      ctx.stroke();
      const radius = Math.hypot(this.group.x - locked.ox, this.group.y - locked.oy);
      if (radius > 1) {
        ctx.beginPath();
        ctx.ellipse(center.x, center.y, radius * this.scale, radius * ELLIPSE * this.scale, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(center.x, center.y, 8, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(248,248,250,0.95)";
      ctx.fill();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = "rgba(20,20,24,0.85)";
      ctx.stroke();
      ctx.restore();
    }
    if (this.spinPivot && (this.spinOn || this.editDrag?.kind === "gspin" || this.editDrag?.kind === "gpivot") && this.group) {
      const ride = this.lockRide(this.selectionLock());
      const spun = this.turned(this.group.x, this.group.y);
      const home = this.worldToScreen(spun.x + ride.x, spun.y + ride.y);
      const center = this.worldToScreen(this.spinPivot.x, this.spinPivot.y);
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = "rgba(143, 175, 154, 0.9)";
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(home.x, home.y);
      ctx.lineTo(center.x, center.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(center.x, center.y, 8, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(248,248,250,0.95)";
      ctx.fill();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = "rgba(20,20,24,0.85)";
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(center.x - 4, center.y);
      ctx.lineTo(center.x + 4, center.y);
      ctx.moveTo(center.x, center.y - 4);
      ctx.lineTo(center.x, center.y + 4);
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawDeleteButton(body: { x: number; y: number; r: number }) {
    const ctx = this.ctx;
    const btn = this.deleteAt(body);
    ctx.beginPath();
    ctx.arc(btn.x, btn.y, btn.r, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(28, 28, 32, 0.94)";
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(236,236,239,0.85)";
    ctx.stroke();
    ctx.strokeStyle = "rgba(248,248,250,0.95)";
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(btn.x - 2, btn.y - 2);
    ctx.lineTo(btn.x + 2, btn.y + 2);
    ctx.moveTo(btn.x + 2, btn.y - 2);
    ctx.lineTo(btn.x - 2, btn.y + 2);
    ctx.stroke();
  }

  private drawEditChrome() {
    if (!this.editing) return;
    const body = this.selectionScreen();
    if (!body) return;
    this.drawDeleteButton(body);
    const sunId = sunIdFromKey(this.selectedId);
    if (!sunId) return;
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(body.x + body.r, body.y, 7, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(248,248,250,0.95)";
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(20,20,24,0.85)";
    ctx.stroke();
  }

  private drawSun(sun: MapSun, selected: boolean) {
    const worlds = this.editing ? this.worlds : (match()?.sourceMap?.worlds ?? []);
    const suns = this.editing ? this.suns : (match()?.sourceMap?.suns ?? []);
    const locks = this.editing ? this.locks : (match()?.sourceMap?.locks ?? []);
    const whirl = turnFor(locks, "sun", sun.id);
    const spun = turnPoint(sun.x, sun.y, whirl, this.reduced);
    const ride = cohortDelta(cohortFor(locks, worlds, suns, "sun", sun.id), this.time, this.reduced);
    const s = this.worldToScreen(spun.x + ride.x, spun.y + ride.y);
    const ctx = this.ctx;
    const r = this.sunRadius(sun) * this.scale;
    const glow = ctx.createRadialGradient(s.x, s.y, r * 0.2, s.x, s.y, r * 6);
    glow.addColorStop(0, "rgba(255,248,230,0.85)");
    glow.addColorStop(0.12, "rgba(255,236,200,0.35)");
    glow.addColorStop(0.4, "rgba(180,190,210,0.08)");
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r * 6, 0, Math.PI * 2);
    ctx.fill();
    const core = ctx.createRadialGradient(s.x - r * 0.2, s.y - r * 0.2, r * 0.1, s.x, s.y, r);
    core.addColorStop(0, "#fffaf0");
    core.addColorStop(0.55, "#e8e4d8");
    core.addColorStop(1, "#b8b4a8");
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.fill();
    if (selected) {
      ctx.beginPath();
      ctx.arc(s.x, s.y, r + 8, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(236,236,239,0.92)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  private drawPlanet(id: string) {
    const def = this.defs().find((d) => d.id === id);
    if (!def) return;
    const m = match();
    const st = m?.planets[id];
    const owner = this.editing
      ? (this.worlds.find((w) => w.id === id)?.owner ?? NEUTRAL_ID)
      : (st?.owner ?? (def.id === "demo-0" || def.id === "demo-1" ? PLAYER_ID : NEUTRAL_ID));
    const garrison = this.editing ? 0 : (st?.garrison ?? Math.floor(10 + def.rate * 8));
    const body = planetSize(def);
    const pos = planetWorld(def, this.bodyTime(def.id), this.reduced);
    const s = this.worldToScreen(pos.x, pos.y);
    const r = body * this.scale;
    const ctx = this.ctx;
    const tex = planetTexture(def, body > 28 ? 192 : 160);
    const factions = this.editing ? [PLAYER_FACTION, ...AI_FACTIONS] : (m?.factions ?? []);
    const col = factionColor(owner, factions);
    const owned = owner !== NEUTRAL_ID;
    const showDisc = this.editing || garrison > 0;

    if (showDisc) {
      this.drawDisc(def, s.x, s.y, false);
      this.drawSatellites(def, owner, garrison, col, false);
    }

    if (def.rings) drawRings(ctx, s.x, s.y, r, this.time, false);
    drawAtmosphere(ctx, s.x, s.y, r, def.palette.atmo, owned, owned ? col : undefined);

    ctx.save();
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(tex, s.x - r, s.y - r, r * 2, r * 2);
    if (!this.editing && owned) {
      ctx.fillStyle = rgb(col, 0.5);
      ctx.fillRect(s.x - r, s.y - r, r * 2, r * 2);
    } else if (this.editing && owned) {
      ctx.fillStyle = rgb(col, 0.42);
      ctx.fillRect(s.x - r, s.y - r, r * 2, r * 2);
    }
    ctx.restore();

    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.strokeStyle = owned ? rgb(col, 1) : "rgba(236,236,239,0.22)";
    ctx.lineWidth = owned ? 2.75 : 1;
    ctx.stroke();

    const cooling = !this.editing && (st?.coolLeft ?? 0) > 0;
    if (cooling && st) {
      const left = st.coolLeft ?? 0;
      const wake = left <= LOCK_WAKE_S;
      const pulse = wake ? 0.5 + 0.5 * Math.sin(this.time * Math.PI * 2 * 1.5) : 1;
      ctx.save();
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = rgb(TORTILLA, wake ? 0.62 + 0.3 * pulse : 0.9);
      ctx.fillRect(s.x - r, s.y - r, r * 2, r * 2);
      ctx.restore();
      ctx.beginPath();
      ctx.arc(s.x, s.y, r + (wake ? (1 - pulse) * 8 : 0), 0, Math.PI * 2);
      ctx.strokeStyle = wake ? `rgba(236, 206, 150, ${0.45 + 0.5 * pulse})` : "rgba(140, 96, 52, 0.95)";
      ctx.lineWidth = wake ? 2 + pulse * 2.2 : 2.5;
      ctx.stroke();
    }

    if (!this.editing && st && (st.quiet ?? 0) > 0 && !cooling) {
      const q = Math.min(1, (st.quiet ?? 0) / SETTLE_S);
      ctx.beginPath();
      ctx.arc(s.x, s.y, r + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * q);
      ctx.strokeStyle = `rgba(220, 226, 232, ${0.35 + 0.5 * q})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    if (!this.editing && st) {
      const lv = st.level || 1;
      const rising = owned && (st.upgrade ?? 0) > 0 && lv < (def.maxLevel ?? MAX_LEVEL);
      const claiming = owner === NEUTRAL_ID && (st.claim ?? 0) > 0 && (st.coolLeft ?? 0) <= 0;
      const falling = owned && (st.release ?? 0) > 0;
      if (rising) {
        this.drawCorona(s.x, s.y, r, RISE_GLOW, (st.upgrade ?? 0) / worldRise(def, lv));
      }
      if (claiming || falling) {
        const cost = claiming ? worldClaim(def) : worldHealth(def, lv);
        const paid = claiming ? (st.claim ?? 0) : (st.release ?? 0);
        const remain = 1 - Math.min(1, paid / cost);
        const lift = rising ? Math.max(7, 5 * this.scale) : 0;
        this.drawCorona(s.x, s.y, r + lift, CAPTURE_GLOW, remain);
      }
    }

    const ready =
      !this.editing &&
      !!st &&
      owner !== NEUTRAL_ID &&
      (st.level || 1) < (def.maxLevel ?? MAX_LEVEL) &&
      (st.release ?? 0) <= 0 &&
      st.garrison >= Math.max(1, worldRise(def, st.level || 1) - (st.upgrade ?? 0));

    if (this.picked[id]) {
      ctx.beginPath();
      ctx.arc(s.x, s.y, r + 9 + Math.sin(this.time * 3) * 1.4, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(197,205,216,0.9)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (this.editing && def.id === this.selectedId) {
      ctx.beginPath();
      ctx.arc(s.x, s.y, r + 8, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(236,236,239,0.92)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    if (def.rings) drawRings(ctx, s.x, s.y, r, this.time, true);
    const cap = this.editing ? (def.level ?? 1) : (def.maxLevel ?? def.level ?? MAX_LEVEL);
    const current = this.editing ? 1 : (st?.level || def.level || 1);
    const steps = Math.max(0, cap - current);
    this.drawUpgradeRings(s.x, s.y, r, steps);
    if (ready) this.drawReadyGlow(s.x, s.y, this.upgradeOuter(r, Math.max(1, steps)));
    if (showDisc) {
      this.drawDisc(def, s.x, s.y, true);
      this.drawSatellites(def, owner, garrison, col, true);
    }
  }

  private drawCorona(
    x: number,
    y: number,
    r: number,
    color: [number, number, number],
    fill: number,
  ) {
    if (fill <= 0.004) return;
    const ctx = this.ctx;
    const amount = Math.max(0, Math.min(1, fill));
    const band = Math.max(8, 6.4 * this.scale);
    const outer = r + band;
    const inner = Math.max(2, r - band * 0.12);
    const bottom = y + outer + 1;
    const span = outer * 2 + 2;
    const top = bottom - span * amount;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x - outer - 4, top, outer * 2 + 8, bottom - top + 2);
    ctx.clip();
    const g = ctx.createRadialGradient(x, y, inner, x, y, outer);
    g.addColorStop(0, rgb(color, 0));
    g.addColorStop(0.42, rgb(color, 0.22));
    g.addColorStop(0.74, rgb(color, 0.95));
    g.addColorStop(1, rgb(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, outer, 0, Math.PI * 2);
    ctx.arc(x, y, inner, 0, Math.PI * 2, true);
    ctx.fill();
    ctx.strokeStyle = rgb(color, 0.85);
    ctx.lineWidth = Math.max(1.25, 1.1 * this.scale);
    ctx.beginPath();
    ctx.arc(x, y, r + band * 0.42, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawDisc(def: PlanetDef, x: number, y: number, front: boolean) {
    const ctx = this.ctx;
    const rad = discRadius(planetSize(def), def.level ?? 1) * this.scale;
    const ry = Math.max(0.75, rad * DISC_OPEN);
    ctx.beginPath();
    ctx.ellipse(x, y, rad, ry, 0, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2);
    ctx.strokeStyle = front ? "rgba(236,236,239,0.28)" : "rgba(236,236,239,0.1)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  private upgradeOuter(r: number, count: number) {
    const hug = 7;
    const gap = 5;
    return r + hug + Math.max(0, count - 1) * gap;
  }

  private drawUpgradeRings(x: number, y: number, r: number, count: number) {
    if (count < 1) return;
    const ctx = this.ctx;
    ctx.save();
    for (let i = 0; i < count; i++) {
      ctx.beginPath();
      ctx.arc(x, y, this.upgradeOuter(r, i + 1), 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(236, 214, 170, ${0.95 - i * 0.1})`;
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawReadyGlow(x: number, y: number, edge: number) {
    const ctx = this.ctx;
    const wave = 0.5 + 0.5 * Math.sin(this.preview * ((2 * Math.PI * 50) / 60));
    const inner = edge + 2;
    const outer = edge + 14 + 6 * wave;
    const g = ctx.createRadialGradient(x, y, inner, x, y, outer);
    g.addColorStop(0, `rgba(255, 214, 150, ${0.2 + 0.16 * wave})`);
    g.addColorStop(1, "rgba(255, 214, 150, 0)");
    ctx.beginPath();
    ctx.arc(x, y, outer, 0, Math.PI * 2);
    ctx.arc(x, y, inner, 0, Math.PI * 2, true);
    ctx.fillStyle = g;
    ctx.fill();
  }

  private drawSatellites(def: PlanetDef, owner: number, garrison: number, col: [number, number, number], front: boolean) {
    const ctx = this.ctx;
    const n = visualSatellites(garrison);
    const picked = this.picked[def.id] ?? 0;
    const pickedDots = n < 1 || garrison < 1 ? 0 : Math.round((picked / garrison) * n);
    const dots: { i: number; x: number; y: number; near: number }[] = [];
    for (let i = 0; i < n; i++) {
      const w = satWorld(def, i, this.bodyTime(def.id), this.reduced);
      if ((w.near >= 0) !== front) continue;
      const off = satelliteOffset(def.id, i);
      const p = this.worldToScreen(w.x + off.x, w.y + off.y);
      dots.push({ i, x: p.x, y: p.y, near: w.near });
    }
    dots.sort((a, b) => a.near - b.near);
    for (const dot of dots) {
      const selected = dot.i < pickedDots;
      const size = selected ? 2.7 : 2.15;
      ctx.beginPath();
      ctx.arc(dot.x, dot.y, size, 0, Math.PI * 2);
      ctx.fillStyle = selected ? "rgba(248,250,252,0.98)" : rgb(col, front ? 1 : 0.55);
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(6,8,12,0.8)";
      ctx.stroke();
    }
  }

  private drawCrafts() {
    const m = match();
    if (!m?.crafts) return;
    const ctx = this.ctx;
    for (const c of m.crafts) {
      if (c.payload < 1) continue;
      const pos = craftDraw(c, this.motion);
      const s = this.worldToScreen(pos.x, pos.y);
      const col = factionColor(c.owner, m.factions);
      const sp = Math.hypot(c.vx, c.vy) || 1;
      const len = 9 + Math.min(8, c.payload);
      const hot = this.pickedCrafts.includes(c.id);
      if (!c.hold && (c.vx !== 0 || c.vy !== 0)) {
        ctx.strokeStyle = hot ? "rgba(236,236,239,0.9)" : rgb(col, 0.4);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - (c.vx / sp) * len, s.y - (c.vy / sp) * len);
        ctx.stroke();
      }
      if (c.hold) {
        ctx.beginPath();
        ctx.arc(s.x, s.y, hot ? 5.2 : 4.2, 0, Math.PI * 2);
        ctx.strokeStyle = hot ? "rgba(248,250,252,0.92)" : rgb(col, 0.7);
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.fillStyle = hot ? "rgba(248,250,252,0.98)" : rgb(col, 1);
      ctx.beginPath();
      ctx.arc(s.x, s.y, hot ? 3.1 : c.payload > 3 ? 2.6 : 2.05, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(6,8,12,0.8)";
      ctx.stroke();
    }
  }

  private drawParticles(dt: number) {
    const ctx = this.ctx;
    const next: Particle[] = [];
    for (const p of this.particles) {
      p.life += dt;
      if (p.life >= p.max) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.92;
      p.vy *= 0.92;
      const a = 1 - p.life / p.max;
      const s = this.worldToScreen(p.x, p.y);
      ctx.fillStyle = p.color.replace(/[\d.]+\)$/, `${a})`);
      ctx.beginPath();
      ctx.arc(s.x, s.y, p.r * a, 0, Math.PI * 2);
      ctx.fill();
      next.push(p);
    }
    this.particles = next;
  }

  private drawEditorGuides() {
    if (!this.editing) return;
    const ctx = this.ctx;
    if (this.snapMark) {
      const mark = this.snapMark;
      const s = this.worldToScreen(mark.x, mark.y);
      ctx.save();
      ctx.strokeStyle = "rgba(232, 220, 188, 0.72)";
      ctx.lineWidth = 1.25;
      ctx.setLineDash([5, 6]);
      if (mark.kind === "angle" && mark.nx != null && mark.ny != null) {
        const n = this.worldToScreen(mark.nx, mark.ny);
        ctx.beginPath();
        ctx.moveTo(n.x, n.y);
        ctx.lineTo(s.x, s.y);
        ctx.stroke();
      } else {
        ctx.beginPath();
        if (mark.lock !== "x") {
          ctx.moveTo(0, s.y);
          ctx.lineTo(this.w, s.y);
        }
        if (mark.lock !== "y") {
          ctx.moveTo(s.x, 0);
          ctx.lineTo(s.x, this.h);
        }
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(s.x, s.y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(232, 220, 188, 0.95)";
      ctx.fill();
      ctx.restore();
    }
    for (const def of this.defs()) {
      if (def.still || def.orbit < 1) continue;
      const selected = def.id === this.selectedId;
      const a = orbitAnchor(def, this.time, this.reduced);
      const here = planetWorld(def, this.bodyTime(def.id), this.reduced);
      if (selected) {
        const from = this.worldToScreen(here.x, here.y);
        const to = this.worldToScreen(a.x, a.y);
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.strokeStyle = "rgba(236,236,239,0.4)";
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (!this.editing) {
        const ghost = planetWorld(def, this.preview, this.reduced);
        if (Math.hypot(ghost.x - here.x, ghost.y - here.y) > 12) {
          const g = this.worldToScreen(ghost.x, ghost.y);
          ctx.beginPath();
          ctx.arc(g.x, g.y, selected ? 3.4 : 2.2, 0, Math.PI * 2);
          ctx.fillStyle = selected ? "rgba(236,236,239,0.9)" : "rgba(236,236,239,0.38)";
          ctx.fill();
        }
      }
      if (selected) {
        const hs = this.worldToScreen(this.ellipseHandle(def).x, this.ellipseHandle(def).y);
        ctx.save();
        ctx.translate(hs.x, hs.y);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = "rgba(248,248,250,0.95)";
        ctx.strokeStyle = "rgba(20,20,24,0.85)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.rect(-5, -5, 10, 10);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
      const h = this.worldToScreen(a.x, a.y);
      ctx.beginPath();
      ctx.arc(h.x, h.y, selected ? 8 : 4.5, 0, Math.PI * 2);
      ctx.strokeStyle = selected ? "rgba(236,236,239,0.95)" : "rgba(236,236,239,0.4)";
      ctx.lineWidth = selected ? 1.5 : 1;
      ctx.stroke();
      if (selected) {
        ctx.beginPath();
        ctx.arc(h.x, h.y, 2.2, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(236,236,239,0.95)";
        ctx.fill();
      }
    }
  }

  private drawCircle() {
    const ctx = this.ctx;
    const rings: { x: number; y: number; r: number; a: number }[] = [];
    if (this.circle && this.drawing) rings.push({ ...this.circle, a: 0.85 });
    if (this.flash && this.time < this.flash.until) rings.push({ ...this.flash, a: 0.55 });
    for (const ring of rings) {
      const c = this.worldToScreen(ring.x, ring.y);
      const rx = ring.r * this.scale;
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, rx, rx, 0, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(197,205,216,${0.08 * ring.a})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(197,205,216,${ring.a})`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    this.pings = this.pings.filter((ping) => this.time < ping.until);
    for (const ping of this.pings) {
      const life = Math.max(0, ping.until - this.time) / 0.85;
      const s = this.worldToScreen(ping.x, ping.y);
      ctx.beginPath();
      ctx.arc(s.x, s.y, 7 + (1 - life) * 10, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(236, 236, 239, ${0.85 * life})`;
      ctx.lineWidth = 1.25;
      ctx.stroke();
    }
  }
}
