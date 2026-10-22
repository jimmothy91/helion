import { Bell, Home, Minus, Music, Pause, Play, Plus, RotateCcw, Settings, Volume2, VolumeX, X } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { setChimes, setMusic, setMuted, setVolume, startPad, unlockAudio } from "./audio";
import { lossCardText, lossCards, lossReports } from "./ai";
import {
  MAX_AI,
  MAX_PLANETS,
  MIN_AI,
  MIN_PLANETS,
  SKILL_META,
  factionColor,
  factionCss,
  legalSetup,
} from "./catalog";
import { fmt, fmtRate, fmtTime } from "./format";
import { canLaunch, type CustomMap, type MapCategory } from "./maps";
import { importSave } from "./save";
import {
  abandonMatch,
  garrisonOf,
  persist,
  productionOf,
  replaceState,
  setTutorial,
  sim,
} from "./sim";
import type { GameSpeed, MatchState, Panel, SetupConfig, Skill } from "./types";
import { NEUTRAL_ID, PLAYER_ID } from "./types";

function Sheet({
  open,
  onClose,
  children,
  title,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title: string;
}) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 z-40 flex flex-col justify-end",
        open && "pointer-events-auto",
      )}
      aria-hidden={!open}
      inert={!open}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className={cn(
          "absolute inset-0 bg-bg/50 transition-opacity duration-150 ease-[var(--ease-out)]",
          open ? "opacity-100" : "opacity-0",
        )}
      />
      <section
        className={cn(
          "relative mx-auto w-full max-w-lg origin-bottom rounded-t-[28px] border border-border bg-surface px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 shadow-[0_-12px_40px_rgba(0,0,0,0.35)] transition-transform duration-[400ms] ease-[var(--ease-out)]",
          open ? "translate-y-0" : "translate-y-[110%]",
        )}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border-strong" />
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="font-display text-xl font-semibold tracking-[-0.03em] text-fg">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex size-11 items-center justify-center rounded-md text-muted transition-colors hover:text-fg"
            aria-label="Close panel"
          >
            <X className="size-5" strokeWidth={1.75} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function PrimaryButton({
  children,
  disabled,
  onClick,
  className,
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "h-12 w-full rounded-md bg-accent px-4 font-medium text-accent-fg transition-transform duration-150 ease-[var(--ease-out)] active:scale-[0.98] disabled:opacity-40",
        className,
      )}
    >
      {children}
    </button>
  );
}

function GhostButton({
  children,
  onClick,
  className,
}: {
  children: ReactNode;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-12 w-full rounded-md border border-border bg-surface-2 px-4 font-medium text-fg transition-colors active:scale-[0.98]",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function TitleOverlay({
  visible,
  hasContinue,
  onBegin,
  onContinue,
  onMaps,
  onHelp,
}: {
  visible: boolean;
  hasContinue: boolean;
  onBegin: () => void;
  onContinue: () => void;
  onMaps: () => void;
  onHelp: () => void;
}) {
  const s = sim.state.settings;
  const [, bump] = useState(0);
  const [volOpen, setVolOpen] = useState(false);
  if (!visible) return null;
  const applyVolume = (v: number) => {
    s.volume = v;
    setVolume(v);
    persist();
    bump((n) => n + 1);
  };
  return (
    <div
      className="absolute inset-0 z-30 flex flex-col justify-end bg-gradient-to-b from-transparent via-bg/55 to-bg px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(3rem,env(safe-area-inset-top))]"
      onPointerDown={() => {
        unlockAudio();
        if (s.music) startPad();
      }}
    >
      <div className="absolute right-5 top-[max(0.75rem,env(safe-area-inset-top))] flex items-center">
        <button
          type="button"
          onClick={() => {
            s.music = !s.music;
            s.musicChosen = true;
            unlockAudio();
            setMusic(s.music);
            if (!s.music) setVolOpen(false);
            persist();
            bump((n) => n + 1);
          }}
          className="h-11 rounded-full border border-border bg-surface/80 px-4 text-sm font-medium text-fg"
        >
          Music {s.music ? "On" : "Off"}
        </button>
        <button
          type="button"
          aria-label="Music volume"
          aria-expanded={volOpen}
          onClick={() => {
            unlockAudio();
            if (s.music) startPad();
            setVolOpen((open) => !open);
          }}
          className="ml-1 flex h-11 w-8 items-center justify-center rounded-full text-sm text-muted"
        >
          {volOpen ? "–" : "+"}
        </button>
        <div
          className={cn(
            "overflow-hidden transition-all duration-200",
            volOpen ? "ml-2 w-32 opacity-100" : "pointer-events-none w-0 opacity-0",
          )}
        >
          <VolumeSlider value={s.volume} onChange={applyVolume} />
        </div>
      </div>
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-end">
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted">Idle conquest</p>
        <h1 className="mt-2 font-display text-5xl font-semibold tracking-[-0.04em] text-fg">Helion</h1>
        <p className="mt-3 max-w-sm text-base leading-relaxed text-muted">
          Worlds forge satellites. Gather them with a circle. Send them until every other team is gone.
        </p>
        <div className="mt-8 flex flex-col gap-3">
          {hasContinue ? (
            <>
              <PrimaryButton onClick={onContinue}>Continue</PrimaryButton>
              <GhostButton onClick={onBegin}>New system</GhostButton>
            </>
          ) : (
            <PrimaryButton onClick={onBegin}>Begin</PrimaryButton>
          )}
          <button type="button" onClick={onMaps} className="h-11 text-sm font-medium text-muted hover:text-fg">
            Maps
          </button>
          <button type="button" onClick={onHelp} className="h-11 text-sm font-medium text-muted hover:text-fg">
            How it works
          </button>
        </div>
      </div>
    </div>
  );
}

function VolumeSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input
      type="range"
      min={0}
      max={100}
      step={1}
      aria-label="Volume"
      value={Math.round((value ?? 1) * 100)}
      onChange={(e) => onChange(Number(e.target.value) / 100)}
      onPointerDown={(e) => e.stopPropagation()}
      className="h-8 w-full min-w-0 accent-fg"
    />
  );
}

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex h-14 items-center justify-between rounded-xl border border-border bg-surface-2 px-3">
      <span className="text-sm text-fg">{label}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`Fewer ${label}`}
          disabled={value <= min}
          onClick={() => onChange(value - 1)}
          className="flex size-11 items-center justify-center rounded-md text-fg disabled:opacity-30"
        >
          <Minus className="size-4" strokeWidth={1.75} />
        </button>
        <span className="w-8 text-center font-display text-lg font-semibold tabular-nums">{value}</span>
        <button
          type="button"
          aria-label={`More ${label}`}
          disabled={value >= max}
          onClick={() => onChange(value + 1)}
          className="flex size-11 items-center justify-center rounded-md text-fg disabled:opacity-30"
        >
          <Plus className="size-4" strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}

export function SetupOverlay({
  visible,
  setup,
  categories,
  onChange,
  onLaunch,
  onPlayMap,
  onBack,
}: {
  visible: boolean;
  setup: SetupConfig;
  categories: MapCategory[];
  onChange: (s: SetupConfig) => void;
  onLaunch: () => void;
  onPlayMap: (map: CustomMap) => void;
  onBack: () => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  if (!visible) return null;
  const shown = legalSetup(setup);
  const maxAi = Math.min(MAX_AI, shown.planetCount - 1);
  const skills: Skill[] = ["cautious", "even", "relentless"];
  const open = categories.find((cat) => cat.id === openId) ?? null;
  return (
    <div className="absolute inset-0 z-30 overflow-y-auto bg-gradient-to-b from-transparent via-bg/60 to-bg px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(3rem,env(safe-area-inset-top))]">
      <div className="mx-auto flex min-h-full w-full max-w-lg flex-col justify-end">
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted">New system</p>
        <h2 className="mt-2 font-display text-3xl font-semibold tracking-[-0.04em] text-fg">Shape the map</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Start from a saved map, or generate a new sky.
        </p>
        {categories.length > 0 && (
          <div className="mt-5">
            <div className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-subtle">Saved maps</div>
            <div className="flex max-h-52 flex-col gap-2 overflow-y-auto">
              {categories.map((cat) => {
                const shown = open?.id === cat.id;
                return (
                  <div key={cat.id} className="rounded-xl border border-border bg-surface-2">
                    <button
                      type="button"
                      aria-expanded={shown}
                      onClick={() => setOpenId(shown ? null : cat.id)}
                      className="flex min-h-12 w-full items-center justify-between gap-3 px-4 text-left"
                    >
                      <span className="truncate text-sm font-medium text-fg">{cat.name || "Untitled"}</span>
                      <span className="shrink-0 text-xs tabular-nums text-muted">{cat.maps.length}</span>
                    </button>
                    {shown && (
                      <div className="flex flex-col gap-1 px-2 pb-2">
                        {cat.maps.map((map) => {
                          const ready = canLaunch(map);
                          const worlds = map.worlds.length;
                          const rivals = new Set(map.worlds.filter((w) => w.owner > 0).map((w) => w.owner)).size;
                          return (
                            <button
                              key={map.id}
                              type="button"
                              disabled={!ready}
                              onClick={() => onPlayMap(map)}
                              className="flex min-h-11 w-full flex-col justify-center gap-0.5 rounded-lg px-3 py-1.5 text-left hover:bg-surface disabled:opacity-40"
                            >
                              <span className="truncate text-sm text-fg">{map.name || "Untitled"}</span>
                              <span className="truncate text-xs text-muted">
                                {ready
                                  ? `${worlds} ${worlds === 1 ? "world" : "worlds"} · ${rivals} ${rivals === 1 ? "rival" : "rivals"}`
                                  : "Needs you and a rival"}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <div className="mt-6 flex flex-col gap-2">
          <Stepper
            label="Worlds"
            value={shown.planetCount}
            min={MIN_PLANETS}
            max={MAX_PLANETS}
            onChange={(n) => {
              const planetCount = n;
              const aiCount = Math.min(setup.aiCount, Math.min(MAX_AI, planetCount - 1));
              onChange({ ...setup, planetCount, aiCount });
            }}
          />
          <Stepper
            label="Rivals"
            value={shown.aiCount}
            min={MIN_AI}
            max={maxAi}
            onChange={(n) => onChange({ ...setup, aiCount: n })}
          />
        </div>
        <div className="mt-4">
          <div className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-subtle">Difficulty</div>
          <div className="grid grid-cols-3 gap-2 rounded-xl border border-border bg-surface-2 p-1">
            {skills.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => onChange({ ...setup, skill: id })}
                className={cn(
                  "h-11 rounded-lg text-sm font-medium transition-colors",
                  setup.skill === id ? "bg-accent text-accent-fg" : "text-muted hover:text-fg",
                )}
              >
                {SKILL_META[id].label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted">{SKILL_META[setup.skill].blurb}</p>
        </div>
        <div className="mt-8 flex flex-col gap-3 pb-1">
          <PrimaryButton onClick={onLaunch}>Launch</PrimaryButton>
          <button type="button" onClick={onBack} className="h-11 text-sm font-medium text-muted hover:text-fg">
            Back
          </button>
        </div>
      </div>
    </div>
  );
}

export function Hud({
  selected,
  speed,
  onSpeed,
  onOpen,
}: {
  selected: number;
  speed: GameSpeed;
  onSpeed: (speed: GameSpeed) => void;
  onOpen: (p: Exclude<Panel, null>) => void;
}) {
  const m = sim.state.match;
  if (!m) return null;
  const swarm = garrisonOf(PLAYER_ID, m);
  const rate = productionOf(PLAYER_ID, m);
  const sides = m.factions.map((f) => ({ faction: f, rate: productionOf(f.id, m) }));
  const peak = Math.max(1, ...sides.map((s) => s.rate));
  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <div className="pointer-events-none absolute inset-x-0 top-[max(0.4rem,env(safe-area-inset-top))] flex items-center justify-between px-3">
        <div className="flex h-6 max-w-[calc(50vw-5.25rem)] items-center rounded-full border border-border/80 bg-surface/80 px-2 backdrop-blur-sm">
          <p className="truncate text-[11px] font-medium tabular-nums leading-none text-fg">
            {fmt(swarm)}
            <span className="text-muted"> · {fmtRate(rate)}</span>
            {selected > 0 && <span className="text-subtle"> · {fmt(selected)}</span>}
          </p>
        </div>
        <div
          className={cn(
            "flex w-20 flex-col justify-center gap-px overflow-hidden rounded-full border border-border/80 bg-surface/80 px-2 py-1 backdrop-blur-sm",
            sides.length > 5 ? "h-11" : "h-6",
          )}
          role="img"
          aria-label={sides.map((s) => `${s.faction.name} ${fmtRate(s.rate)}`).join(", ")}
        >
          {sides.map((s) => (
            <div key={s.faction.id} className="min-h-px flex-1 overflow-hidden rounded-full bg-white/10" title={`${s.faction.name} ${fmtRate(s.rate)}`}>
              <div
                className="h-full rounded-full"
                style={{
                  width: s.rate > 0 ? `${Math.max(8, (s.rate / peak) * 100)}%` : "0%",
                  background: factionCss(factionColor(s.faction.id)),
                }}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="pointer-events-auto absolute left-1/2 top-[max(0.4rem,env(safe-area-inset-top))] flex -translate-x-1/2 items-center gap-0.5 rounded-full border border-border/80 bg-surface/80 p-0.5 backdrop-blur-sm">
        <div role="group" aria-label="Game speed" className="flex items-center">
          {(
            [
              ["slow", "Slow"],
              ["medium", "Med"],
              ["fast", "Fast"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-label={id === "medium" ? "Medium" : label}
              aria-pressed={speed === id}
              onClick={() => onSpeed(id)}
              className={cn(
                "h-5 rounded-full px-1.5 text-[10px] font-medium leading-none",
                speed === id ? "bg-accent text-accent-fg" : "text-muted",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-label="Pause"
          onClick={() => onOpen("pause")}
          className="flex size-5 items-center justify-center rounded-full text-muted"
        >
          <Pause className="size-2.5" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

export function TutorialCard() {
  const t = sim.state.match?.tutorial ?? 0;
  if (t < 1 || t > 4) return null;
  const copy = [
    "",
    "Your world forges satellites into orbit. The total you hold is in the corner.",
    "Tap your world to gather all of them. Drag anywhere — even empty sky. The first touch is one edge of the circle, and the drag is the opposite edge. Lift, then tap a world or any open sky to send. Double-tap empty sky, or hold, to repeat the last send.",
    "Empty worlds cost 200, the same as raising your first world. A short hop arrives whole. A long flight arrives smaller.",
    "Rivals expand on their own. A world you just took stays quiet, and only half the leftover satellites stay. Wipe out every other team.",
  ][t];
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[max(2.4rem,calc(env(safe-area-inset-top)+2rem))] z-10 px-4">
      <div className="pointer-events-auto mx-auto flex max-w-lg items-start gap-3 rounded-[20px] border border-border bg-surface px-4 py-3">
        <p className="flex-1 text-sm leading-relaxed text-fg">{copy}</p>
        {t >= 3 && (
          <button type="button" className="h-11 px-2 text-xs font-medium text-muted" onClick={() => setTutorial(5)}>
            Close
          </button>
        )}
      </div>
    </div>
  );
}

export function HelpSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="How it works">
      <ol className="flex flex-col gap-4 pb-2 text-sm leading-relaxed text-muted">
        <li>
          <span className="font-medium text-fg">1. Forge.</span> Owned worlds mint satellites into orbit. Level 1 forges 8 each
          second, then 16, 24, 32, and level 5 forges 40. A world you just took forges nothing for a few seconds, and only
          half the satellites left over stay. Higher levels are 30% larger and add another ring.
        </li>
        <li>
          <span className="font-medium text-fg">2. Gather.</span> Tap a world you hold to take every satellite. Drag anywhere,
          even empty sky. The first touch is one edge of the circle and the drag is the opposite edge. Satellites inside it are gathered. Lift, then tap a world or any open sky to send. A flight sent into open sky waits there. Double-tap
          empty sky, or press and hold, to repeat the last send: a circle sends whatever is in it now, and a tapped world sends all of its
          satellites. Two fingers move the sky. Pinch to zoom.
        </li>
        <li>
          <span className="font-medium text-fg">3. Send.</span> An empty world costs 200, the same as raising a level 1 world, even though it forges nothing yet.
          On a world you hold, attack clears the satellites, then burns the pale rise corona down to nothing. Only then
          does a red corona start full and burn down. Fill 200 times its level that way and it falls, then 200 more claims
          it. A short hop leaves whole. A long flight leaves thinner and lands smaller, down to about a third.
          Satellites you send home heal that red corona back to full before any of them count toward a rise.
        </li>
        <li>
          <span className="font-medium text-fg">4. Rise.</span> Forging does not level a world. Once it is healthy, a pale
          corona fills from empty to full as you pay 200 times its level — 200, 400, 600, and 800, then 1000 to hold
          level 5 — by tapping it again or sending satellites from your other worlds. An attack spends that corona first. It clears
          when the world rises. Yours pass through yours. Another side's destroy each other. A patch of rocks leaks:
          some satellites get through, and a stack that keeps hitting the same spot clears a lane for the rest of the
          match. Satellites in orbit ignore the rocks. The match ends when
          only one team is left.
        </li>
      </ol>
    </Sheet>
  );
}

function LossCards() {
  const list = lossCards();
  const [sent, setSent] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  if (list.length < 1) return null;
  const text = lossCardText();
  return (
    <div className="flex w-full flex-col gap-2">
      <p className="text-left text-[11px] leading-snug text-muted">
        Sending this reports the loss card only: who fell, what they were doing, and what you did. It is marked with this
        version. Cards from an older version are kept and not used.
      </p>
      <button
        type="button"
        disabled={sent === "sending" || sent === "sent"}
        onClick={() => {
          setSent("sending");
          void import("./loss.functions")
            .then(({ putLossReports }) => putLossReports({ data: { reports: lossReports() } }))
            .then(() => setSent("sent"))
            .catch(() => setSent("failed"));
        }}
        className="h-8 rounded-lg border border-border px-3 text-xs text-fg disabled:opacity-60"
      >
        {sent === "sending" ? "Sending" : sent === "sent" ? "Sent" : sent === "failed" ? "Try again" : "Send report"}
      </button>
      <pre className="max-h-36 overflow-auto whitespace-pre-wrap text-left text-[11px] leading-snug text-muted">{text}</pre>
    </div>
  );
}

export function PauseSheet({
  open,
  onClose,
  onTitle,
  onSettings,
  onRestart,
}: {
  open: boolean;
  onClose: () => void;
  onTitle: () => void;
  onSettings: () => void;
  onRestart: () => void;
}) {
  const s = sim.state.settings;
  const [, bump] = useState(0);
  const [volOpen, setVolOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (!open) setConfirm(false);
  }, [open]);
  if (!open) return null;
  const toggle = (key: "chimes" | "music") => {
    s[key] = !s[key];
    if (key === "music") s.musicChosen = true;
    unlockAudio();
    if (key === "chimes") setChimes(s.chimes);
    else {
      setMusic(s.music);
      if (s.music) startPad();
    }
    persist();
    bump((n) => n + 1);
  };
  const icon =
    "flex items-center justify-center rounded-lg border border-border bg-surface-2 text-muted hover:text-fg";
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center">
      <button type="button" aria-label="Resume" className="absolute inset-0" onClick={onClose} />
      <div
        role="dialog"
        aria-label="Paused"
        className="relative flex min-h-[33vh] w-[33vw] min-w-56 flex-col items-center justify-center gap-4 rounded-2xl border border-border bg-surface/95 px-3 py-4 shadow-lg"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button type="button" aria-label="Resume" onClick={onClose} className={cn(icon, "size-16 text-fg")}>
          <Play className="size-7" strokeWidth={2} />
        </button>
        <div className="flex items-center gap-1.5">
          <button type="button" aria-label="Settings" onClick={onSettings} className={cn(icon, "size-8")}>
            <Settings className="size-4" strokeWidth={2} />
          </button>
          <button type="button" aria-label="Title" onClick={onTitle} className={cn(icon, "size-8")}>
            <Home className="size-4" strokeWidth={2} />
          </button>
          <button
            type="button"
            aria-label="Volume"
            aria-expanded={volOpen}
            onClick={() => setVolOpen((open) => !open)}
            className={cn(icon, "size-8", volOpen && "border-accent bg-accent text-accent-fg")}
          >
            <Volume2 className="size-4" strokeWidth={2} />
          </button>
          <button
            type="button"
            aria-label="Music"
            aria-pressed={s.music}
            onClick={() => toggle("music")}
            className={cn(icon, "size-8", s.music && "border-accent bg-accent text-accent-fg")}
          >
            <Music className="size-4" strokeWidth={2} />
          </button>
          <button
            type="button"
            aria-label="Chimes"
            aria-pressed={s.chimes}
            onClick={() => toggle("chimes")}
            className={cn(icon, "size-8", s.chimes && "border-accent bg-accent text-accent-fg")}
          >
            <Bell className="size-4" strokeWidth={2} />
          </button>
          <button
            type="button"
            aria-label="Restart level"
            onClick={() => setConfirm(true)}
            className={cn(icon, "size-8")}
          >
            <RotateCcw className="size-4" strokeWidth={2} />
          </button>
        </div>
        {confirm && (
          <div className="flex flex-col items-center gap-2">
            <p className="text-center text-xs text-fg">Restart this level?</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setConfirm(false)}
                className="h-8 rounded-lg border border-border px-3 text-xs text-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onRestart}
                className="h-8 rounded-lg bg-accent px-3 text-xs font-medium text-accent-fg"
              >
                Restart
              </button>
            </div>
          </div>
        )}
        {volOpen && !confirm && (
          <div className="w-full max-w-40">
            <VolumeSlider
              value={s.volume}
              onChange={(v) => {
                s.volume = v;
                setVolume(v);
                persist();
                bump((n) => n + 1);
              }}
            />
          </div>
        )}
        {!confirm && <LossCards />}
      </div>
    </div>
  );
}

function ReportChart({ m }: { m: MatchState }) {
  const samples = (m.hold ?? []).filter((s) => s && Number.isFinite(s.t) && Array.isArray(s.n));
  const boards = (m.board ?? []).filter((s) => s && Number.isFinite(s.t) && Array.isArray(s.o) && s.o.length > 0);
  if (samples.length < 1 && boards.length < 1) return null;
  const w = 300;
  const h = 132;
  const padX = 8;
  const padY = 8;
  const planets = Math.max(1, m.defs.length, ...boards.map((b) => b.o.length));
  const maxT = Math.max(m.elapsed, samples[samples.length - 1]?.t ?? 0, boards[boards.length - 1]?.t ?? 0, 1);
  let peak = 1;
  for (const s of samples) for (const v of s.n) if (v > peak) peak = v;
  const inner = w - padX * 2;
  const bw = Math.max(3.5, Math.min(12, (inner / Math.max(boards.length, 1)) * 0.62));
  const xOf = (t: number) => padX + bw / 2 + (t / maxT) * (inner - bw);
  const yOf = (v: number) => h - padY - (Math.max(0, v) / peak) * (h - padY * 2);
  const drawn: { x: number; o: number[] }[] = [];
  for (const b of boards) {
    const x = xOf(b.t);
    const prev = drawn[drawn.length - 1];
    if (prev && x - prev.x < bw + 1.25) drawn[drawn.length - 1] = { x, o: b.o };
    else drawn.push({ x, o: b.o });
  }
  const slice = (h - padY * 2) / planets;
  const gap = slice > 3.2 ? 0.7 : 0;
  const empty = boards.some((b) => b.o.some((id) => id === NEUTRAL_ID));
  const sides = [...m.factions].sort((a, b) => (a.id === PLAYER_ID ? 1 : 0) - (b.id === PLAYER_ID ? 1 : 0));
  return (
    <div className="mt-4">
      <div className="mb-1 flex items-baseline justify-between">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-subtle">Satellites held</p>
        <p className="text-[10px] tabular-nums text-muted">{fmt(peak)}</p>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-36 w-full" role="img" aria-label="Satellites held over time, and who held each planet at each capture">
        <line x1={padX} y1={yOf(0)} x2={w - padX} y2={yOf(0)} stroke="rgba(197,205,216,0.22)" strokeWidth="1" />
        {drawn.map((bar, bi) =>
          Array.from({ length: planets }, (_, i) => {
            const owner = bar.o[i] ?? NEUTRAL_ID;
            const sh = Math.max(0.8, slice - gap);
            const y = h - padY - (i + 1) * slice + (slice - sh) / 2;
            return (
              <rect
                key={`${bi}-${i}`}
                x={bar.x - bw / 2}
                y={y}
                width={bw}
                height={sh}
                rx={0.6}
                fill={factionCss(factionColor(owner))}
                fillOpacity={owner === NEUTRAL_ID ? 0.28 : 0.72}
              />
            );
          }),
        )}
        {sides.map((f) => {
          const fi = m.factions.findIndex((side) => side.id === f.id);
          const pts = samples.map((s) => ({ x: xOf(s.t), y: yOf(s.n[fi] ?? 0) }));
          if (pts.length < 1) return null;
          const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
          const you = f.id === PLAYER_ID;
          return (
            <g key={f.id}>
              <path
                d={d}
                fill="none"
                stroke={factionCss(factionColor(f.id))}
                strokeWidth={you ? 2.4 : 1.6}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {pts.length === 1 && (
                <circle cx={pts[0].x} cy={pts[0].y} r={you ? 2.4 : 1.8} fill={factionCss(factionColor(f.id))} />
              )}
            </g>
          );
        })}
      </svg>
      <p className="mt-1 text-[10px] leading-snug text-muted">Each bar is the board at a capture. Every slice is one planet.</p>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
        {m.factions.map((f) => (
          <span key={f.id} className="inline-flex items-center gap-1 text-[11px] text-muted">
            <span className="size-1.5 rounded-full" style={{ background: factionCss(factionColor(f.id)) }} />
            {f.name}
          </span>
        ))}
        {empty && (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted">
            <span className="size-1.5 rounded-full" style={{ background: factionCss(factionColor(NEUTRAL_ID)) }} />
            Empty
          </span>
        )}
      </div>
    </div>
  );
}

export function ResultOverlay({
  visible,
  onAgain,
  onTitle,
}: {
  visible: boolean;
  onAgain: () => void;
  onTitle: () => void;
}) {
  const m = sim.state.match;
  if (!visible || !m || m.result === "playing") return null;
  const won = m.result === "won";
  return (
    <div className="absolute inset-0 z-30 overflow-y-auto bg-gradient-to-b from-transparent via-bg/55 to-bg">
      <div className="mx-auto flex min-h-full w-full max-w-lg flex-col justify-end px-6 pt-24 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted">{won ? "Rivals eliminated" : "Last world fell"}</p>
        <h2 className="mt-2 font-display text-4xl font-semibold tracking-[-0.04em] text-fg">
          {won ? "You are the last team" : "The swarm went dark"}
        </h2>
        <p className="mt-3 text-sm text-fg">
          {won ? "Won in " : "Lasted "}
          <span className="font-medium tabular-nums">{fmtTime(m.elapsed)}</span>
        </p>
        <ReportChart m={m} />
        <p className="mt-3 text-sm leading-relaxed text-muted">
          {won
            ? "Every other team is gone. Empty worlds can stay dark. Shape another system, or rest here."
            : "No worlds and no satellites left. Try fewer rivals, or a quieter stance."}
        </p>
        <div className="mt-4">
          <LossCards />
        </div>
        <div className="mt-8 flex flex-col gap-3">
          <PrimaryButton onClick={onAgain}>New system</PrimaryButton>
          <GhostButton onClick={onTitle}>Title</GhostButton>
        </div>
      </div>
    </div>
  );
}

export function SettingsSheet({
  open,
  onClose,
  onReset,
}: {
  open: boolean;
  onClose: () => void;
  onReset: () => void;
}) {
  const s = sim.state.settings;
  const [confirm, setConfirm] = useState(false);
  const [, bump] = useState(0);
  return (
    <Sheet open={open} onClose={onClose} title="Settings">
      <div className="flex flex-col gap-2">
        <button
          type="button"
          className="flex h-14 items-center justify-between rounded-xl border border-border bg-surface-2 px-4"
          onClick={() => {
            s.muted = !s.muted;
            setMuted(s.muted);
            persist();
            bump((n) => n + 1);
          }}
        >
          <span className="flex items-center gap-2 text-sm text-fg">
            {s.muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
            Sound
          </span>
          <span className="text-sm text-muted">{s.muted ? "Off" : "On"}</span>
        </button>
        <button
          type="button"
          className="flex h-14 items-center justify-between rounded-xl border border-border bg-surface-2 px-4"
          onClick={() => {
            s.shake = !s.shake;
            persist();
            bump((n) => n + 1);
          }}
        >
          <span className="text-sm text-fg">Camera shake</span>
          <span className="text-sm text-muted">{s.shake ? "On" : "Off"}</span>
        </button>
        <div>
          <div className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-subtle">Difficulty</div>
          <div className="grid grid-cols-3 gap-2 rounded-xl border border-border bg-surface-2 p-1">
            {(["cautious", "even", "relentless"] as Skill[]).map((id) => {
              const current = sim.state.match?.setup.skill ?? sim.state.lastSetup.skill;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    sim.state.lastSetup = { ...sim.state.lastSetup, skill: id };
                    if (sim.state.match) sim.state.match.setup = { ...sim.state.match.setup, skill: id };
                    persist();
                    bump((n) => n + 1);
                  }}
                  className={cn(
                    "h-11 rounded-lg text-sm font-medium transition-colors",
                    current === id ? "bg-accent text-accent-fg" : "text-muted hover:text-fg",
                  )}
                >
                  {SKILL_META[id].label}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            {SKILL_META[sim.state.match?.setup.skill ?? sim.state.lastSetup.skill].blurb} Each rival keeps its own temperament.
          </p>
        </div>
        <button
          type="button"
          className="flex h-14 items-center justify-between rounded-xl border border-border bg-surface-2 px-4"
          onClick={() => {
            const blob = new Blob([JSON.stringify(sim.state, null, 2)], { type: "application/json" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = "helion-save.json";
            a.click();
          }}
        >
          <span className="text-sm text-fg">Export save</span>
          <span className="text-sm text-muted">File</span>
        </button>
        <GhostButton
          onClick={() => {
            const inp = document.createElement("input");
            inp.type = "file";
            inp.accept = "application/json";
            inp.onchange = async () => {
              const file = inp.files?.[0];
              if (!file) return;
              try {
                replaceState(importSave(await file.text()));
              } catch {
                /* ignore */
              }
            };
            inp.click();
          }}
        >
          Import save
        </GhostButton>
        {!confirm ? (
          <button
            type="button"
            onClick={() => setConfirm(true)}
            className="mt-2 flex h-12 items-center justify-center gap-2 rounded-md text-sm text-hostile"
          >
            Abandon this system
          </button>
        ) : (
          <PrimaryButton
            onClick={() => {
              setConfirm(false);
              abandonMatch();
              onReset();
            }}
          >
            Confirm abandon
          </PrimaryButton>
        )}
      </div>
    </Sheet>
  );
}
