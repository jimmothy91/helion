type Bus = { master: GainNode; sfx: GainNode; music: GainNode };

let ctx: AudioContext | null = null;
let bus: Bus | null = null;
let muted = false;
let chimesOn = true;
let musicOn = false;
let level = 1;
let padTimer = 0;
let padStarting = false;
let stepIndex = 0;
let nextNoteTime = 0;

const beatSlot = globalThis as typeof globalThis & { __helionBeat?: number };
if (beatSlot.__helionBeat) {
  clearInterval(beatSlot.__helionBeat);
  beatSlot.__helionBeat = 0;
}
let primed = false;
let armed = false;
let poke: HTMLAudioElement | null = null;
let speaker: HTMLAudioElement | null = null;

function pokeSpeaker() {
  if (typeof Audio === "undefined") return;
  if (!poke) {
    poke = new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=");
    poke.setAttribute("playsinline", "true");
    poke.volume = 1;
  }
  const pending = poke.play();
  if (pending) void pending.catch(() => {});
}

function bindSpeaker(c: AudioContext) {
  if (speaker || !bus || typeof document === "undefined") return;
  try {
    const dest = c.createMediaStreamDestination();
    bus.master.connect(dest);
    const el = document.createElement("audio");
    el.setAttribute("playsinline", "true");
    el.autoplay = true;
    el.volume = 1;
    el.style.cssText = "position:fixed;width:0;height:0;opacity:0;pointer-events:none";
    document.body.appendChild(el);
    el.srcObject = dest.stream;
    speaker = el;
    const pending = el.play();
    if (pending) void pending.catch(() => {});
  } catch {
    speaker = null;
  }
}

function ensure(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    const master = ctx.createGain();
    const sfx = ctx.createGain();
    const music = ctx.createGain();
    sfx.gain.value = muted ? 0 : level;
    music.gain.value = musicLevel();
    master.gain.value = muted ? 0 : 1;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 8;
    comp.ratio.value = 6;
    comp.attack.value = 0.003;
    comp.release.value = 0.16;
    sfx.connect(master);
    music.connect(comp);
    comp.connect(master);
    master.connect(ctx.destination);
    bus = { master, sfx, music };
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function unlockAudio(): void {
  const c = ensure();
  if (!c) return;
  bindSpeaker(c);
  if (c.state !== "running") {
    void c.resume().then(() => {
      const pending = speaker?.play();
      if (pending) void pending.catch(() => {});
    });
  }
  pokeSpeaker();
  if (speaker) {
    const pending = speaker.play();
    if (pending) void pending.catch(() => {});
  }
  if (primed || muted || !musicOn || level <= 0.001) return;
  const strike = () => {
    if (!ctx || ctx.state !== "running" || !bus) return;
    primed = true;
    for (const freq of [110, 220, 261.6, 329.6]) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const now = ctx.currentTime;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.28 * Math.max(level, 0.5), now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
      osc.connect(g);
      g.connect(bus.sfx);
      osc.start(now);
      osc.stop(now + 0.75);
    }
  };
  if (c.state === "running") strike();
  else void c.resume().then(strike);
}

/** First tap, touch, or key anywhere starts the context. Phones ignore audio begun without that. */
export function armAudio(): void {
  if (armed || typeof window === "undefined") return;
  armed = true;
  const kick = () => {
    unlockAudio();
    if (musicOn && !muted) startPad();
  };
  window.addEventListener("pointerdown", kick, true);
  window.addEventListener("touchstart", kick, true);
  window.addEventListener("keydown", kick, true);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && ctx && ctx.state === "suspended") void ctx.resume();
  });
}

export function setMuted(next: boolean): void {
  muted = next;
  if (bus && ctx) {
    const now = ctx.currentTime;
    bus.master.gain.cancelScheduledValues(now);
    bus.sfx.gain.cancelScheduledValues(now);
    bus.master.gain.setValueAtTime(next ? 0 : 1, now);
    bus.sfx.gain.setValueAtTime(next ? 0 : level, now);
    bus.music.gain.setValueAtTime(musicLevel(), now);
  }
  if (next) stopPad();
  else if (musicOn) startPad();
}

const MUSIC_BUS = 1.35;

function musicLevel(): number {
  return musicOn && !muted ? MUSIC_BUS * level : 0;
}

export function setChimes(next: boolean): void {
  chimesOn = next;
}

export function setMusic(next: boolean): void {
  musicOn = next;
  if (bus && ctx) bus.music.gain.setTargetAtTime(musicLevel(), ctx.currentTime, 0.15);
  if (!next) stopPad();
  else if (ctx && !muted) startPad();
}

export function setVolume(next: number): void {
  level = Math.min(1, Math.max(0, next));
  if (bus && ctx) {
    const now = ctx.currentTime;
    bus.sfx.gain.cancelScheduledValues(now);
    bus.sfx.gain.setValueAtTime(muted ? 0 : level, now);
    bus.music.gain.setValueAtTime(musicLevel(), now);
  }
}

/** Apply saved prefs without starting audio. Safe before a user gesture. */
export function syncAudioPrefs(s: { muted: boolean; chimes?: boolean; music?: boolean; volume?: number }): void {
  muted = s.muted;
  chimesOn = s.chimes !== false;
  musicOn = s.music === true;
  level = typeof s.volume === "number" && Number.isFinite(s.volume) ? Math.min(1, Math.max(0, s.volume)) : 1;
  if (bus && ctx) {
    const now = ctx.currentTime;
    bus.master.gain.cancelScheduledValues(now);
    bus.sfx.gain.cancelScheduledValues(now);
    bus.master.gain.setValueAtTime(muted ? 0 : 1, now);
    bus.sfx.gain.setValueAtTime(muted ? 0 : level, now);
    bus.music.gain.setValueAtTime(musicLevel(), now);
  }
  if (muted || !musicOn) stopPad();
}

function beep(freq: number, dur: number, type: OscillatorType, gain: number, slide = 0) {
  const c = ensure();
  if (!c || !bus || muted || level <= 0.001) return;
  const t0 = c.currentTime;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.001, gain * 3 * level), t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(bus.sfx);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export function sfxTap() {
  beep(420, 0.06, "sine", 0.08);
}

export function sfxSend(repeat = false) {
  if (repeat || !chimesOn) return;
  beep(220, 0.22, "sine", 0.12, 480);
  beep(880, 0.12, "triangle", 0.05, -200);
}

export function sfxCapture() {
  beep(330, 0.18, "sine", 0.14, 220);
  beep(495, 0.28, "triangle", 0.1, 330);
  beep(660, 0.4, "sine", 0.07, 80);
}

export function sfxUpgrade() {
  beep(520, 0.1, "triangle", 0.1);
  beep(780, 0.16, "sine", 0.08, 40);
}

export function sfxAwaken() {
  beep(110, 0.5, "sine", 0.16, 40);
  beep(330, 0.6, "triangle", 0.1, 220);
}

export function sfxBlocked() {
  beep(140, 0.12, "square", 0.05, -40);
}

/** Just pentatonic on A, spread across octaves. Any two notes in the set stay consonant. */
const GARDEN = [110, 164.81, 220, 261.63, 329.63, 440, 523.25, 659.25, 880];

let lastClash = 0;
let gardenAt = 0;

function bell(freq: number, delay: number, dur: number, peak: number) {
  const c = ensure();
  if (!c || !bus) return;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = "sine";
  const t0 = c.currentTime + delay;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.001, peak * level), t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(bus.sfx);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

export function sfxClash(hostile: boolean) {
  if (!hostile || !chimesOn) return;
  const now = performance.now();
  if (now - lastClash < 55) return;
  lastClash = now;
  const c = ensure();
  if (!c || !bus || muted || level <= 0.001) return;
  const root = GARDEN[gardenAt % GARDEN.length];
  const octave = root * 2 <= 880 ? root * 2 : root / 2;
  bell(root, 0, 0.5 + (gardenAt % 3) * 0.08, 0.2);
  bell(octave, 0.018, 0.34, 0.06);
  if (gardenAt % 4 === 0) bell(Math.min(880, root * 1.5), 0.03, 0.28, 0.035);
  gardenAt = (gardenAt + 1 + (Math.random() < 0.45 ? 2 : 0)) % GARDEN.length;
}

/** Dark club techno, 132 BPM, four on the floor. A minor so it stays with the chimes. */
const BPM = 132;
const STEP = 60 / BPM / 4;
const BASS_A = [55, 0, 55, 55, 0, 55, 55, 0, 55, 0, 41.2, 55, 0, 49, 55, 0];
const BASS_B = [55, 0, 55, 41.2, 0, 55, 49, 0, 55, 0, 55, 41.2, 0, 55, 36.7, 0];
const ARP = [220, 0, 261.6, 0, 329.6, 0, 261.6, 0, 220, 0, 196, 0, 164.8, 0, 196, 0];

function envHit(t: number, peak: number, dur: number, dest: AudioNode) {
  const g = ctx!.createGain();
  g.gain.setValueAtTime(Math.max(0.0001, peak), t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  g.connect(dest);
  return g;
}

function kick(t: number) {
  if (!ctx || !bus) return;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(120, t);
  osc.frequency.exponentialRampToValueAtTime(40, t + 0.12);
  const g = envHit(t, 0.7, 0.26, bus.music);
  osc.connect(g);
  osc.start(t);
  osc.stop(t + 0.28);
}

function voice(t: number, freq: number, type: OscillatorType, peak: number, dur: number, cutoff: number, q = 1) {
  if (!ctx || !bus) return;
  const osc = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = q;
  filter.frequency.setValueAtTime(cutoff, t);
  filter.frequency.exponentialRampToValueAtTime(Math.max(80, cutoff * 0.35), t + dur * 0.8);
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(filter);
  filter.connect(g);
  g.connect(bus.music);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function bassNote(t: number, freq: number) {
  voice(t, freq, "sine", 0.55, 0.22, 200, 0.5);
  voice(t, freq * 2, "sawtooth", 0.28, 0.2, 480, 8);
  voice(t, freq * 2 * 1.012, "sawtooth", 0.22, 0.2, 480, 8);
  voice(t, freq * 4, "square", 0.08, 0.14, 700, 2);
}

function arp(t: number, freq: number) {
  voice(t, freq, "sawtooth", 0.2, 0.18, 1400, 4);
  voice(t, freq * 1.007, "sawtooth", 0.16, 0.18, 1400, 4);
  voice(t, freq / 2, "triangle", 0.1, 0.2, 800, 1);
}

function pad(t: number) {
  const chord = [110, 130.8, 164.8, 220];
  for (const freq of chord) {
    voice(t, freq, "sawtooth", 0.11, 1.7, 900, 3);
    voice(t, freq * 1.008, "sawtooth", 0.09, 1.7, 900, 3);
    voice(t, freq * 2, "triangle", 0.04, 1.6, 1200, 1);
  }
}

function lead(t: number, freq: number) {
  voice(t, freq, "sawtooth", 0.16, 0.32, 2200, 2);
  voice(t, freq * 0.995, "square", 0.1, 0.3, 1600, 1);
}

function scheduleStep(step: number, t: number) {
  const local = step % 16;
  if (local % 4 === 0) kick(t);
  const line = step % 32 < 16 ? BASS_A : BASS_B;
  const note = line[local];
  if (note) bassNote(t, note);
  const tone = ARP[local];
  if (tone) arp(t, tone);
  if (local === 0) pad(t);
  if (local === 0 || local === 8) lead(t, local === 0 ? 440 : 329.6);
}

function pump() {
  if (!ctx || !bus || muted || !musicOn || ctx.state !== "running") return;
  const horizon = ctx.currentTime + 0.12;
  while (nextNoteTime < horizon) {
    scheduleStep(stepIndex, nextNoteTime);
    nextNoteTime += STEP;
    stepIndex += 1;
  }
}

export function startPad() {
  if (muted || !musicOn || padTimer || padStarting) return;
  const c = ensure();
  if (!c) return;
  const begin = () => {
    padStarting = false;
    if (muted || !musicOn || padTimer || !ctx || ctx.state !== "running") return;
    nextNoteTime = ctx.currentTime + 0.05;
    stepIndex = 0;
    pump();
    padTimer = window.setInterval(pump, 25);
    (globalThis as typeof globalThis & { __helionBeat?: number }).__helionBeat = padTimer;
  };
  if (c.state === "running") {
    begin();
    return;
  }
  padStarting = true;
  void c.resume().then(begin).catch(() => {
    padStarting = false;
  });
}

export function stopPad() {
  const g = globalThis as typeof globalThis & { __helionBeat?: number };
  if (g.__helionBeat) {
    clearInterval(g.__helionBeat);
    g.__helionBeat = 0;
  }
  if (padTimer) {
    clearInterval(padTimer);
    padTimer = 0;
  }
}

export function resumeAudio() {
  const c = ensure();
  if (c && c.state === "suspended") void c.resume();
}
