import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  AI_FACTIONS,
  DEFAULT_LOCK_S,
  HUSK_KIND,
  MAX_PLANETS,
  PLAYER_FACTION,
  SKILL_META,
  TEMPLATES,
  factionCss,
} from "./catalog";
import { MAX_CATEGORIES, MAX_MAPS, MAX_SUNS, sunIdFromKey, canLaunch, type CustomMap, type MapCategory, type MapLock, type MapWorld, type RememberGroup, type RememberWorld } from "./maps";
import { botLine } from "./ai";
import type { Skill } from "./types";
import { NEUTRAL_ID, PLAYER_ID } from "./types";

function RailButton({
  on,
  children,
  onClick,
  label,
}: {
  on: boolean;
  children: ReactNode;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "h-10 w-full rounded-lg border text-xs font-medium",
        on ? "border-accent bg-accent text-accent-fg" : "border-border bg-surface/95 text-muted",
      )}
    >
      {children}
    </button>
  );
}

function Chip({
  on,
  children,
  onClick,
  label,
  className,
}: {
  on: boolean;
  children: ReactNode;
  onClick: () => void;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "h-11 shrink-0 rounded-lg px-3 text-sm font-medium transition-colors",
        on ? "bg-accent text-accent-fg" : "bg-surface-2 text-muted hover:text-fg",
        className,
      )}
    >
      {children}
    </button>
  );
}

function Stat({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (next: number) => void;
}) {
  const clamp = (n: number) => Math.max(min, Math.min(max, Math.round(n)));
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <div className="flex h-10 items-center justify-between gap-2">
      <span className="text-xs text-muted">{label}</span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={`Less ${label}`}
          className="size-8 rounded-md bg-surface-2 text-sm text-fg"
          onClick={() => onChange(clamp(value - step))}
        >
          −
        </button>
        <input
          aria-label={label}
          inputMode="numeric"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const n = Number(e.target.value);
            if (e.target.value.trim() !== "" && Number.isFinite(n)) onChange(clamp(n));
          }}
          className="h-8 w-14 rounded-md border border-border bg-surface-2 text-center text-sm tabular-nums text-fg outline-none"
        />
        <button
          type="button"
          aria-label={`More ${label}`}
          className="size-8 rounded-md bg-surface-2 text-sm text-fg"
          onClick={() => onChange(clamp(value + step))}
        >
          +
        </button>
      </div>
    </div>
  );
}

export function MapEditor({
  categories,
  categoryId,
  maps,
  map,
  selectedId,
  placing,
  onPlacing,
  onSunPlace,
  onOrbitPlace,
  onPlaceOwner,
  onPlaceKind,
  onSelectTool,
  onChange,
  onRenameCategory,
  onSelect,
  onOpenCategory,
  onOpen,
  onNewCategory,
  onNew,
  onDeleteCategory,
  onDeleteMap,
  onSnap,
  onPlay,
  onBack,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  groupLock,
  onGroupSpin,
  groups,
  pendingGroup,
  onCancelGroup,
  onSaveGroup,
  onPlaceGroup,
  onForgetGroup,
  selectPulse,
}: {
  categories: MapCategory[];
  categoryId: string;
  maps: CustomMap[];
  map: CustomMap;
  selectedId: string | null;
  placing: boolean;
  onPlacing: (next: boolean) => void;
  onSunPlace: (on: boolean) => void;
  onOrbitPlace: (on: boolean) => void;
  onPlaceOwner: (owner: number | null) => void;
  onPlaceKind: (index: number) => void;
  onSelectTool: (on: boolean) => void;
  onChange: (next: CustomMap) => void;
  onRenameCategory: (name: string) => void;
  onSelect: (id: string | null) => void;
  onOpenCategory: (id: string) => void;
  onOpen: (id: string) => void;
  onNewCategory: () => void;
  onNew: () => void;
  onDeleteCategory: () => void;
  onDeleteMap: () => void;
  onSnap: (on: boolean) => void;
  onPlay: () => void;
  onBack: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  groupLock: MapLock | null;
  onGroupSpin: (pspin: number) => void;
  groups: RememberGroup[];
  pendingGroup: { worlds: RememberWorld[]; suns: RememberGroup["suns"] } | null;
  onCancelGroup: () => void;
  onSaveGroup: (name: string) => void;
  onPlaceGroup: (id: string) => void;
  onForgetGroup: (id: string) => void;
  selectPulse: number;
}) {
  const [armedDelete, setArmedDelete] = useState(false);
  const [armedCategory, setArmedCategory] = useState(false);
  const [snap, setSnap] = useState(false);
  const [placeSun, setPlaceSun] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [placeOrbit, setPlaceOrbit] = useState(false);
  const [placeOwner, setPlaceOwner] = useState<number | null>(null);
  const [placeKind, setPlaceKind] = useState(0);
  const [kindOpen, setKindOpen] = useState(false);
  const [sideOpen, setSideOpen] = useState(false);
  const [sideTip, setSideTip] = useState<{ id: number; top: number; text: string } | null>(null);
  const [groupName, setGroupName] = useState("");
  const [hidden, setHidden] = useState(false);
  const [dragY, setDragY] = useState(0);
  const drag = useRef<{ y: number; hidden: boolean } | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const category = categories.find((item) => item.id === categoryId) ?? categories[0];
  const selected = map.worlds.find((w) => w.id === selectedId) ?? null;
  const tmpl = selected ? TEMPLATES[Math.abs(selected.template) % TEMPLATES.length] : null;
  const ready = canLaunch(map);
  const suns = map.suns ?? [];
  const thisSunsFull = suns.length >= MAX_SUNS;
  useEffect(() => {
    if (pendingGroup) setGroupName(`Group ${groups.length + 1}`);
  }, [pendingGroup]);
  useEffect(() => {
    if (!selectPulse) return;
    setSelecting(true);
    onSelectTool(true);
    setPlaceSun(false);
    onSunPlace(false);
    onPlacing(false);
    // Placement turns the select tool on so the new group can be moved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectPulse]);
  useEffect(() => {
    onSnap(snap);
    return () => onSnap(false);
    // The canvas snap flag follows this control, including when the editor unmounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap]);
  useEffect(() => {
    if (!selectedId || hidden) return;
    const scroller = scrollerRef.current;
    const world = worldRef.current;
    if (!scroller || !world) return;
    const top = world.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
    scroller.scrollTop = Math.max(0, top - 4);
  }, [selectedId, hidden]);
  const skills: Skill[] = ["cautious", "even", "relentless"];

  function chooseKind(index: number) {
    const i = ((index % TEMPLATES.length) + TEMPLATES.length) % TEMPLATES.length;
    setPlaceKind(i);
    onPlaceKind(i);
    setKindOpen(false);
  }

  function patchWorld(id: string, partial: Partial<MapWorld>) {
    onChange({
      ...map,
      worlds: map.worlds.map((w) => (w.id === id ? { ...w, ...partial } : w)),
    });
  }

  function setMotion(still: boolean) {
    if (!selected) return;
    if (!still && selected.still) {
      const dx = selected.x - selected.ox;
      const dy = selected.y - selected.oy;
      const far = Math.hypot(dx, dy) >= 80;
      patchWorld(selected.id, {
        still: false,
        ox: far ? selected.ox : selected.x - 140,
        oy: far ? selected.oy : selected.y,
      });
      return;
    }
    patchWorld(selected.id, { still });
  }

  const orbitOn = selected ? !selected.still : placeOrbit;
  const effectiveOwner =
    selected?.owner ??
    placeOwner ??
    (map.worlds.some((w) => w.owner === PLAYER_ID) ? NEUTRAL_ID : PLAYER_ID);
  const sideRows = [
    { id: PLAYER_ID, name: "Me", color: PLAYER_FACTION.color, blurb: "" },
    ...AI_FACTIONS.map((f) => ({ id: f.id, name: f.name, color: f.color, blurb: botLine(f.id) })),
    { id: NEUTRAL_ID, name: "Blank", color: [118, 116, 114] as [number, number, number], blurb: "" },
  ];
  const sideRow = sideRows.find((row) => row.id === effectiveOwner) ?? sideRows[2];

  function chooseOwner(owner: number) {
    setPlaceOwner(owner);
    onPlaceOwner(owner);
    if (selected) patchWorld(selected.id, { owner });
    setSideOpen(false);
  }

  function toggleOrbit() {
    const next = !orbitOn;
    setPlaceOrbit(next);
    onOrbitPlace(next);
    if (selected) setMotion(!next);
  }

  const hint = !ready
    ? "Mark one world as yours and one as a rival. Empty worlds can stay dark."
    : selecting
      ? "Drag a circle around worlds and suns. The handles along the bottom delete, move, copy, rotate, save, and lock. A locked cluster can be grabbed again as one piece. Lock, then orbit, and drag the center ring."
      : snap
      ? "Snap is on. Worlds lock to lines. An orbit center inside a sun or world locks to that center. Stretching an orbit snaps back to a circle."
      : selected?.still
        ? "Drag the world to set the position it holds when the match starts."
        : selected
          ? "Drag the world for its start. Drag the center ring to move the orbit. Drag the diamond to flatten it, all the way to a line."
          : selectedId && sunIdFromKey(selectedId)
            ? "Drag the sun to move it. Drag the white dot on its rim to change its size."
            : placeSun
              ? thisSunsFull
                ? "Five suns is the limit. Select one and use the corner mark to remove it."
                : "Tap the sky to place a sun. Up to five."
              : placing
            ? "Tap the sky to place a world. Drag empty sky to pan."
            : "Turn on Place, then tap the sky. Drag a world to move it.";

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {selected && !selected.still && (
        <div
          className={cn(
            "pointer-events-auto absolute left-1/2 z-40 flex -translate-x-1/2 items-center gap-1.5 rounded-xl border border-border bg-surface/95 p-1.5 shadow-lg",
            hidden ? "bottom-[3.1rem]" : "bottom-[min(62dvh,30rem)]",
          )}
        >
          <span className="px-1 text-[10px] font-medium uppercase tracking-[0.14em] text-subtle">Speed</span>
          <button
            type="button"
            aria-label="Orbit counterclockwise"
            aria-pressed={(selected.spin ?? 1) < 0}
            onClick={() => {
              const mag = Math.abs(selected.spin ?? 1) || 1;
              patchWorld(selected.id, { spin: -mag });
            }}
            className={cn(
              "h-8 rounded-lg px-2 text-xs font-medium",
              (selected.spin ?? 1) < 0 ? "bg-accent text-accent-fg" : "bg-surface-2 text-muted",
            )}
          >
            CCW
          </button>
          <button
            type="button"
            aria-label="Orbit clockwise"
            aria-pressed={(selected.spin ?? 1) >= 0}
            onClick={() => {
              const mag = Math.abs(selected.spin ?? 1) || 1;
              patchWorld(selected.id, { spin: mag });
            }}
            className={cn(
              "h-8 rounded-lg px-2 text-xs font-medium",
              (selected.spin ?? 1) >= 0 ? "bg-accent text-accent-fg" : "bg-surface-2 text-muted",
            )}
          >
            CW
          </button>
          <input
            aria-label="Orbit speed"
            type="range"
            min={0}
            max={2000}
            step={10}
            value={Math.round(Math.abs(selected.spin ?? 1) * 100)}
            onChange={(e) => {
              const mag = Number(e.target.value) / 100;
              const dir = (selected.spin ?? 1) < 0 ? -1 : 1;
              patchWorld(selected.id, { spin: mag === 0 ? 0 : dir * mag });
            }}
            className="h-8 w-28 cursor-pointer"
          />
          <span className="w-14 text-right text-xs tabular-nums text-fg">
            {Math.round(Math.abs(selected.spin ?? 1) * 100)}%
          </span>
        </div>
      )}
      {groupLock?.turn && (
        <div
          className={cn(
            "pointer-events-auto absolute left-1/2 z-40 flex -translate-x-1/2 items-center gap-1.5 rounded-xl border border-border bg-surface/95 p-1.5 shadow-lg",
            hidden ? "bottom-[6.4rem]" : "bottom-[min(68dvh,33rem)]",
          )}
        >
          <span className="px-1 text-[10px] font-medium uppercase tracking-[0.14em] text-subtle">Spin</span>
          <button
            type="button"
            aria-label="Spin counterclockwise"
            aria-pressed={(groupLock.pspin ?? 1) < 0}
            onClick={() => onGroupSpin(-Math.abs(groupLock.pspin ?? 1) || -1)}
            className={cn(
              "h-8 rounded-lg px-2 text-xs font-medium",
              (groupLock.pspin ?? 1) < 0 ? "bg-accent text-accent-fg" : "bg-surface-2 text-muted",
            )}
          >
            CCW
          </button>
          <button
            type="button"
            aria-label="Spin clockwise"
            aria-pressed={(groupLock.pspin ?? 1) >= 0}
            onClick={() => onGroupSpin(Math.abs(groupLock.pspin ?? 1) || 1)}
            className={cn(
              "h-8 rounded-lg px-2 text-xs font-medium",
              (groupLock.pspin ?? 1) >= 0 ? "bg-accent text-accent-fg" : "bg-surface-2 text-muted",
            )}
          >
            CW
          </button>
          <input
            aria-label="Spin speed"
            type="range"
            min={0}
            max={2000}
            step={10}
            value={Math.round(Math.abs(groupLock.pspin ?? 1) * 100)}
            onChange={(e) => {
              const mag = Number(e.target.value) / 100;
              const dir = (groupLock.pspin ?? 1) < 0 ? -1 : 1;
              onGroupSpin(mag === 0 ? 0 : dir * mag);
            }}
            className="h-8 w-28 cursor-pointer"
          />
          <span className="w-14 text-right text-xs tabular-nums text-fg">
            {Math.round(Math.abs(groupLock.pspin ?? 1) * 100)}%
          </span>
        </div>
      )}
      {groups.length > 0 && (
        <div className="pointer-events-auto absolute right-2 top-[max(4.5rem,calc(env(safe-area-inset-top)+3.5rem))] z-30 flex max-h-[calc(100dvh-8rem)] w-36 flex-col gap-1 overflow-y-auto rounded-xl border border-border bg-surface/95 p-1.5 shadow-lg [scrollbar-width:thin]">
          {groups.map((group) => (
            <div key={group.id} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onPlaceGroup(group.id)}
                className="h-9 min-w-0 flex-1 truncate rounded-lg px-2 text-left text-xs font-medium text-fg hover:bg-surface-2"
              >
                {group.name}
              </button>
              <button
                type="button"
                aria-label={`Remove ${group.name}`}
                onClick={() => onForgetGroup(group.id)}
                className="size-7 shrink-0 rounded-md text-sm text-muted hover:text-fg"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      {pendingGroup && (
        <div className="pointer-events-auto absolute inset-0 z-50 flex items-center justify-center">
          <button type="button" aria-label="Cancel group name" className="absolute inset-0" onClick={onCancelGroup} />
          <form
            className="relative w-64 rounded-2xl border border-border bg-surface p-4 shadow-lg"
            onSubmit={(e) => {
              e.preventDefault();
              const name = groupName.trim();
              if (!name) return;
              onSaveGroup(name);
            }}
          >
            <p className="text-sm text-fg">Name this group</p>
            <input
              aria-label="Group name"
              autoFocus
              maxLength={24}
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="mt-3 h-10 w-full rounded-lg border border-border bg-surface-2 px-3 text-sm text-fg outline-none select-text"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={onCancelGroup} className="h-9 rounded-lg px-3 text-xs text-muted">
                Cancel
              </button>
              <button type="submit" className="h-9 rounded-lg bg-accent px-3 text-xs font-medium text-accent-fg">
                Save
              </button>
            </div>
          </form>
        </div>
      )}
      <div className="pointer-events-auto absolute inset-x-0 top-0 flex items-center gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button type="button" onClick={onBack} className="h-11 shrink-0 px-2 text-sm font-medium text-muted hover:text-fg">
          Back
        </button>
        <input
          aria-label="Map name"
          value={map.name}
          maxLength={24}
          onChange={(e) => onChange({ ...map, name: e.target.value })}
          className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 text-base text-fg outline-none select-text"
        />
        <button
          type="button"
          disabled={!ready}
          onClick={onPlay}
          className="h-11 shrink-0 rounded-xl bg-accent px-4 text-sm font-medium text-accent-fg disabled:opacity-35"
        >
          Play
        </button>
      </div>

      <div className="pointer-events-auto absolute left-2 top-[max(4.5rem,calc(env(safe-area-inset-top)+3.5rem))] z-30 flex w-[4.75rem] flex-col gap-1.5">
        <div className="flex gap-1">
          <button
            type="button"
            aria-label="Undo"
            disabled={!canUndo}
            onClick={onUndo}
            className="h-10 flex-1 rounded-lg border border-border bg-surface/95 text-base text-fg disabled:opacity-35"
          >
            ←
          </button>
          <button
            type="button"
            aria-label="Redo"
            disabled={!canRedo}
            onClick={onRedo}
            className="h-10 flex-1 rounded-lg border border-border bg-surface/95 text-base text-fg disabled:opacity-35"
          >
            →
          </button>
        </div>
        <RailButton
          on={placing}
          label="Place worlds"
          onClick={() => {
            const next = !placing;
            if (next) {
              setPlaceSun(false);
              onSunPlace(false);
              setSelecting(false);
              onSelectTool(false);
            } else setKindOpen(false);
            onPlacing(next);
          }}
        >
          Place
        </RailButton>
        {placing && (
          <div className="relative">
            <button
              type="button"
              aria-label="Planet type"
              aria-expanded={kindOpen}
              onClick={() => setKindOpen((open) => !open)}
              className="h-10 w-full truncate rounded-lg border border-border bg-surface/95 px-1 text-[10px] font-medium text-fg"
            >
              {TEMPLATES[placeKind % TEMPLATES.length]?.kind ?? "Type"}
            </button>
            {kindOpen && (
              <div className="absolute top-0 left-full z-40 ml-2 max-h-64 w-36 overflow-y-auto rounded-xl border border-border bg-surface/95 shadow-lg">
                {TEMPLATES.map((item, index) => (
                  <button
                    key={item.kind}
                    type="button"
                    onClick={() => chooseKind(index)}
                    className={cn(
                      "block h-10 w-full px-3 text-left text-sm",
                      index === placeKind ? "bg-surface-2 text-fg" : "text-muted hover:bg-surface-2 hover:text-fg",
                    )}
                  >
                    {item.kind}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <RailButton on={snap} label="Snap" onClick={() => setSnap((on) => !on)}>
          Snap
        </RailButton>
        <RailButton
          on={selecting}
          label="Select area"
          onClick={() => {
            const next = !selecting;
            setSelecting(next);
            onSelectTool(next);
            if (next) {
              setPlaceSun(false);
              onSunPlace(false);
              onPlacing(false);
            }
          }}
        >
          Select
        </RailButton>
        <RailButton
          on={placeSun}
          label="Place sun"
          onClick={() => {
            const next = !placeSun;
            setPlaceSun(next);
            onSunPlace(next);
            if (next) {
              onPlacing(false);
              setSelecting(false);
              onSelectTool(false);
            }
          }}
        >
          Sun
        </RailButton>
        <RailButton on={orbitOn} label="Orbit" onClick={toggleOrbit}>
          Orbit
        </RailButton>
        <div className="relative">
          <button
            type="button"
            aria-label="Assign planet"
            aria-expanded={sideOpen}
            onClick={() => setSideOpen((open) => !open)}
            className="h-10 w-full truncate rounded-lg border border-border bg-surface/95 px-1 text-xs font-medium"
            style={{ color: factionCss(sideRow.color) }}
          >
            {sideRow.name}
          </button>
        </div>
        {selected && (
          <div className="flex flex-col gap-1">
            {([1, 2, 3, 4, 5] as const).map((lv) => (
              <button
                key={lv}
                type="button"
                aria-label={`Level ${lv}`}
                aria-pressed={(selected.level ?? 1) === lv}
                onClick={() => patchWorld(selected.id, { level: lv })}
                className={cn(
                  "h-8 w-full rounded-lg border text-xs font-medium",
                  (selected.level ?? 1) === lv
                    ? "border-accent bg-accent text-accent-fg"
                    : "border-border bg-surface/95 text-muted",
                )}
              >
                {lv}
              </button>
            ))}
          </div>
        )}
        {sideOpen && (
          <div className="absolute top-0 left-full z-40 ml-2">
            <div
              className="max-h-[calc(100dvh-max(4.5rem,env(safe-area-inset-top)+3.5rem)-0.75rem)] w-36 overflow-y-scroll overscroll-contain rounded-xl border border-border bg-surface/95 shadow-lg [scrollbar-width:thin] [scrollbar-color:rgba(197,205,216,0.85)_rgba(255,255,255,0.06)] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[rgba(197,205,216,0.85)] [&::-webkit-scrollbar-track]:bg-white/5"
            >
              {sideRows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => chooseOwner(row.id)}
                  onPointerEnter={(e) => {
                    if (!row.blurb) {
                      setSideTip(null);
                      return;
                    }
                    const scroller = e.currentTarget.parentElement;
                    const top = e.currentTarget.offsetTop - (scroller?.scrollTop ?? 0);
                    setSideTip({ id: row.id, top, text: row.blurb });
                  }}
                  onPointerLeave={() => setSideTip((tip) => (tip?.id === row.id ? null : tip))}
                  className={cn(
                    "block h-10 w-full shrink-0 px-3 text-left text-sm",
                    row.id === effectiveOwner ? "bg-surface-2" : "hover:bg-surface-2",
                  )}
                  style={{ color: factionCss(row.color) }}
                >
                  {row.name}
                </button>
              ))}
            </div>
            {sideTip && (
              <p
                className="pointer-events-none absolute left-full ml-2 w-56 rounded-lg border border-border bg-surface/95 px-2.5 py-2 text-xs leading-snug text-fg shadow-lg"
                style={{ top: sideTip.top }}
              >
                {sideTip.text}
              </p>
            )}
          </div>
        )}
      </div>

      <div
        className={cn(
          "pointer-events-auto absolute inset-x-0 bottom-0 px-3 pb-[max(0.4rem,env(safe-area-inset-bottom))]",
          dragY === 0 && "transition-transform duration-200 ease-out",
        )}
        style={{
          transform: hidden
            ? `translateY(calc(100% - 2.25rem + ${dragY}px))`
            : `translateY(${dragY}px)`,
        }}
      >
        <div className="mx-auto w-full max-w-lg rounded-t-2xl border border-border bg-surface/95 backdrop-blur-md">
          <div
            className="flex h-9 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
            aria-label={hidden ? "Show map tools" : "Hide map tools"}
            onPointerDown={(e) => {
              drag.current = { y: e.clientY, hidden };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              const start = drag.current;
              if (!start) return;
              const dy = e.clientY - start.y;
              setDragY(start.hidden ? Math.min(36, Math.max(-360, dy)) : Math.max(-36, Math.min(360, dy)));
            }}
            onPointerUp={(e) => {
              const start = drag.current;
              drag.current = null;
              if (!start) return;
              const dy = e.clientY - start.y;
              setDragY(0);
              if (dy > 28) setHidden(true);
              else if (dy < -28) setHidden(false);
              else if (Math.abs(dy) < 8) setHidden((v) => !v);
            }}
            onPointerCancel={() => {
              drag.current = null;
              setDragY(0);
            }}
          >
            <span className="h-1 w-10 rounded-full bg-border-strong" />
          </div>
          <div ref={scrollerRef} className={cn("overflow-y-auto px-3 pb-3", selected ? "max-h-[54dvh]" : "max-h-[30dvh]")}>
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-subtle">Level map</p>
            <p className="text-xs tabular-nums text-muted">
              {map.worlds.length}/{MAX_PLANETS}
            </p>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted">{hint}</p>

          <div className="mt-3">
            <div className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-subtle">Categories</div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {categories.map((item) => (
                <Chip
                  key={item.id}
                  on={item.id === category?.id}
                  onClick={() => {
                    if (item.id !== category?.id) onOpenCategory(item.id);
                  }}
                  label={item.name}
                >
                  <span className="block max-w-28 truncate">{item.name || "Untitled"}</span>
                </Chip>
              ))}
              <Chip on={false} onClick={() => categories.length < MAX_CATEGORIES && onNewCategory()} label="New category">
                {categories.length >= MAX_CATEGORIES ? "Full" : "New"}
              </Chip>
            </div>
            {category && (
              <input
                aria-label="Category name"
                value={category.name}
                maxLength={24}
                onChange={(e) => onRenameCategory(e.target.value)}
                className="mt-2 h-10 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm text-fg outline-none select-text"
              />
            )}
          </div>

          <div className="mt-3">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-subtle">Maps</p>
              <p className="text-xs tabular-nums text-muted">
                {maps.length}/{MAX_MAPS}
              </p>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {maps.map((item) => (
                <Chip
                  key={item.id}
                  on={item.id === map.id}
                  onClick={() => {
                    if (item.id !== map.id) onOpen(item.id);
                  }}
                  label={item.name}
                >
                  <span className="block max-w-28 truncate">{item.name || "Untitled"}</span>
                </Chip>
              ))}
              <Chip on={false} onClick={() => maps.length < MAX_MAPS && onNew()} label="New map">
                {maps.length >= MAX_MAPS ? "Full" : "New"}
              </Chip>
            </div>
          </div>

          {selectedId && sunIdFromKey(selectedId) && (
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Drag the white dot on the rim to resize. The mark at the corner removes it.
            </p>
          )}

          {selected && tmpl && (
            <div ref={worldRef} className="mt-3 flex flex-col gap-3 border-t border-border pt-3">
              <input
                aria-label="World name"
                value={selected.name}
                maxLength={18}
                onChange={(e) => patchWorld(selected.id, { name: e.target.value })}
                className="h-11 w-full rounded-xl border border-border bg-surface-2 px-3 text-base text-fg outline-none select-text"
              />
              <div>
                <div className="mb-1 text-xs font-medium uppercase tracking-[0.14em] text-subtle">Numbers</div>
                <Stat
                  label="Starts with"
                  value={selected.start ?? 0}
                  min={0}
                  max={999}
                  step={1}
                  onChange={(start) => patchWorld(selected.id, { start })}
                />
                <Stat
                  label="Forges /s at level 1"
                  value={selected.rate ?? 8}
                  min={0}
                  max={40}
                  step={1}
                  onChange={(rate) => patchWorld(selected.id, { rate })}
                />
                <Stat
                  label="Health at level 1"
                  value={selected.health ?? 200}
                  min={1}
                  max={9999}
                  step={10}
                  onChange={(health) => patchWorld(selected.id, { health })}
                />
                <Stat
                  label="Rise cost at level 1"
                  value={selected.rise ?? 200}
                  min={1}
                  max={9999}
                  step={10}
                  onChange={(rise) => patchWorld(selected.id, { rise })}
                />
                <Stat
                  label="Claim cost"
                  value={selected.claim ?? 200}
                  min={0}
                  max={9999}
                  step={10}
                  onChange={(claim) => patchWorld(selected.id, { claim })}
                />
                {tmpl.kind === HUSK_KIND && (
                  <Stat
                    label="Lock after loss (s)"
                    value={selected.cooldown ?? DEFAULT_LOCK_S}
                    min={1}
                    max={300}
                    step={5}
                    onChange={(cooldown) => patchWorld(selected.id, { cooldown })}
                  />
                )}
              </div>
            </div>
          )}

          <div className="mt-3 border-t border-border pt-3">
            <div className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-subtle">Difficulty</div>
            <div className="grid grid-cols-3 gap-2 rounded-xl border border-border bg-surface-2 p-1">
              {skills.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => onChange({ ...map, skill: id })}
                  className={cn(
                    "h-11 rounded-lg text-sm font-medium",
                    map.skill === id ? "bg-accent text-accent-fg" : "text-muted hover:text-fg",
                  )}
                >
                  {SKILL_META[id].label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted">{SKILL_META[map.skill].blurb}</p>
            <button
              type="button"
              onClick={() => {
                if (!armedDelete) {
                  setArmedDelete(true);
                  return;
                }
                setArmedDelete(false);
                onDeleteMap();
              }}
              className="mt-2 h-11 text-sm font-medium text-muted hover:text-fg"
            >
              {armedDelete ? "Confirm delete map" : "Delete map"}
            </button>
            <button
              type="button"
              onClick={() => {
                if (!armedCategory) {
                  setArmedCategory(true);
                  return;
                }
                setArmedCategory(false);
                onDeleteCategory();
              }}
              className="h-11 text-sm font-medium text-muted hover:text-fg"
            >
              {armedCategory ? "Confirm delete category" : "Delete category"}
            </button>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}
