import { useEffect, useRef, useState } from "react";
import {
  resumeAudio,
  setMuted,
  syncAudioPrefs,
  armAudio,
  sfxAwaken,
  sfxBlocked,
  sfxCapture,
  sfxClash,
  sfxSend,
  sfxTap,
  startPad,
  unlockAudio,
} from "./audio";
import { defaultSetup, factionColor, legalSetup, PLAYER_FACTION, SPEED_SCALE } from "./catalog";
import { MapEditor } from "./editor";
import { loadLibrary, saveLibrary, mergeSourceMap, createCategory, createMap, loadGroups, loadLibraryRecord, saveGroups, MAX_MAPS, MAX_CATEGORIES, MAX_GROUPS, type CustomMap, type MapCategory, type MapLock, type RememberGroup, type RememberWorld } from "./maps";
import { flushLibraryNow, publishLibrary, readyLibrary, startLibrarySync, watchRemoteLibrary } from "./library-sync";
import {
  HelpSheet,
  Hud,
  PauseSheet,
  ResultOverlay,
  SettingsSheet,
  SetupOverlay,
  TitleOverlay,
  TutorialCard,
} from "./overlays";
import { rgb } from "./noise";
import { WorldView } from "./renderer";
import { hasSave } from "./save";
import {
  STEP,
  catchUp,
  hydrate,
  match,
  onJuice,
  persist,
  sendSelected,
  setPaused,
  setTutorial,
  sim,
  startCustomMatch,
  startMatch,
  restartMatch,
  step,
} from "./sim";
import type { GameSpeed, Panel, Screen, Selection, SetupConfig } from "./types";
import { PLAYER_ID } from "./types";

export function HelionApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<WorldView | null>(null);
  const screenRef = useRef<Screen>("title");
  const [ready, setReady] = useState(false);
  const [screen, setScreen] = useState<Screen>("title");
  const [panel, setPanel] = useState<Panel>(null);
  const [setup, setSetup] = useState<SetupConfig>(defaultSetup);
  const [selected, setSelected] = useState(0);
  const [, setTick] = useState(0);
  const [offline, setOffline] = useState(0);
  const [canContinue, setCanContinue] = useState(false);
  const [categories, setCategories] = useState<MapCategory[]>([]);
  const [groups, setGroups] = useState<RememberGroup[]>(() => loadGroups());
  const [pendingGroup, setPendingGroup] = useState<{ worlds: RememberWorld[]; suns: RememberGroup["suns"] } | null>(null);
  const [selectPulse, setSelectPulse] = useState(0);
  const rememberRef = useRef<(draft: { worlds: RememberWorld[]; suns: RememberGroup["suns"] }) => void>(() => {});
  rememberRef.current = (draft) => setPendingGroup(draft);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mapSelected, setMapSelected] = useState<string | null>(null);
  const [placing, setPlacing] = useState(true);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [groupLock, setGroupLock] = useState<MapLock | null>(null);
  const activeRef = useRef<string | null>(null);
  const categoriesRef = useRef<MapCategory[]>([]);
  const categoryRef = useRef<string | null>(null);
  screenRef.current = screen;
  activeRef.current = activeId;
  categoriesRef.current = categories;
  categoryRef.current = categoryId;

  const bump = () => setTick((n) => n + 1);

  function commit(next: MapCategory[]) {
    categoriesRef.current = next;
    saveLibrary(next);
    publishLibrary(next);
    void flushLibraryNow();
    setCategories(next);
  }

  useEffect(() => {
    const away = hydrate();
    syncAudioPrefs(sim.state.settings);
    armAudio();
    setCanContinue(hasSave());
    setSetup(legalSetup(sim.state.lastSetup ?? defaultSetup()));
    if (away > 20) setOffline(away);
    let saved = loadLibrary();
    const played = sim.state.match?.sourceMap;
    if (played && !saved.some((cat) => cat.maps.some((item) => item.id === played.id))) {
      saved = mergeSourceMap(saved, played);
      saveLibrary(saved);
    }
    if (saved.length) {
      categoriesRef.current = saved;
      setCategories(saved);
      const focus = typeof localStorage !== "undefined" ? localStorage.getItem("helion.library.focus") : null;
      const focused = focus ? saved.flatMap((cat) => cat.maps).find((item) => item.id === focus) : null;
      const cat = focused ? saved.find((item) => item.maps.some((map) => map.id === focused.id)) : saved[0];
      setCategoryId(cat?.id ?? saved[0].id);
      setActiveId(focused?.id ?? cat?.maps[0]?.id ?? saved[0].maps[0]?.id ?? null);
    }
    watchRemoteLibrary((cats) => {
      if (!cats.length) return;
      categoriesRef.current = cats;
      setCategories(cats);
      setCategoryId((cur) => cur && cats.some((cat) => cat.id === cur) ? cur : cats[0].id);
      setActiveId((cur) => (cur && cats.some((cat) => cat.maps.some((map) => map.id === cur)) ? cur : cats[0].maps[0]?.id ?? null));
    });
    void startLibrarySync();
    const flush = () => {
      if (!categoriesRef.current.length) return;
      saveLibrary(categoriesRef.current);
      publishLibrary(categoriesRef.current);
      void flushLibraryNow();
    };
    window.addEventListener("pagehide", flush);
    setReady(true);
    bump();
    return () => window.removeEventListener("pagehide", flush);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !ready) return;
    const view = new WorldView(canvas);
    view.resize();
    viewRef.current = view;
    view.onPicked = (_sel: Selection, isDrawing: boolean) => {
      unlockAudio();
      startPad();
      const n = view.selectedTotal();
      setSelected(n);
      if (n > 0 && !isDrawing) sfxTap();
      const m = match();
      if (m && n > 0 && m.tutorial <= 2) setTutorial(3);
      bump();
    };
    view.onSend = (sel, to, crafts, repeat) => {
      sendSelected(sel, to, crafts, Boolean(repeat));
      setSelected(0);
    };
    view.onEdit = (worlds, selectedId, suns, locks) => {
      const id = activeRef.current;
      if (!id) return;
      let hit = false;
      const next = categoriesRef.current.map((cat) => ({
        ...cat,
        maps: cat.maps.map((item) => {
          if (item.id !== id) return item;
          hit = true;
          return {
            ...item,
            worlds,
            ...(suns.length ? { suns } : { suns: undefined }),
            ...(locks.length ? { locks } : { locks: undefined }),
          };
        }),
      }));
      if (!hit) return;
      try {
        localStorage.setItem("helion.library.focus", id);
      } catch {
        /* ignore */
      }
      commit(next);
      setMapSelected(selectedId);
    };
    view.onHistory = (undo, redo) => {
      setCanUndo(undo);
      setCanRedo(redo);
    };
    view.onGroupLock = (lock) => setGroupLock(lock);
    view.onRemember = (draft) => rememberRef.current(draft);

    const onResize = () => view.resize();
    window.addEventListener("resize", onResize);
    const ro = new ResizeObserver(() => view.resize());
    ro.observe(canvas);

    let last = performance.now();
    let acc = 0;
    let hud = 0;
    let raf = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (t - last) / 1000);
      last = t;
      const pace = SPEED_SCALE[sim.state.settings.speed] ?? 1;
      const live =
        screenRef.current === "play" && !sim.state.match?.paused && sim.state.match?.result === "playing";
      acc += dt * pace;
      while (acc >= STEP) {
        if (live) step(STEP);
        acc -= STEP;
      }
      const alpha = live ? Math.min(1, acc / STEP) : 0;
      view.editing = screenRef.current === "atlas";
      view.interactive = live;
      view.followSim = screenRef.current === "play" && Boolean(sim.state.match);
      view.render(dt, alpha);
      hud += dt;
      if (hud > 0.2) {
        hud = 0;
        bump();
      }
    };
    raf = requestAnimationFrame(loop);

    const vis = () => {
      if (document.visibilityState === "hidden") persist();
      else {
        resumeAudio();
        const off = catchUp();
        if (off > 20) setOffline(off);
      }
    };
    document.addEventListener("visibilitychange", vis);
    window.addEventListener("pagehide", persist);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", vis);
      window.removeEventListener("pagehide", persist);
      ro.disconnect();
    };
  }, [ready]);

  useEffect(() => {
    return onJuice((e) => {
      const view = viewRef.current;
      const m = match();
      if (e.kind === "send") {
        if (e.owner === PLAYER_ID) sfxSend(Boolean(e.repeat));
        if (view) {
          const p = view.planetPos(e.from, view.time);
          const col = m ? factionColor(e.owner, m.factions) : PLAYER_FACTION.color;
          view.burst(p.x, p.y, rgb(col, 0.9), 14);
          if (e.owner === PLAYER_ID) view.addTrauma(0.16);
        }
      }
      if (e.kind === "capture") {
        sfxCapture();
        if (view) {
          const p = view.planetPos(e.id, view.time);
          const col = m ? factionColor(e.owner, m.factions) : PLAYER_FACTION.color;
          view.burst(p.x, p.y, rgb(col, 1), 36);
          view.addTrauma(e.owner === PLAYER_ID ? 0.5 : 0.32);
        }
      }
      if (e.kind === "result") {
        sfxAwaken();
        view?.addTrauma(0.8);
        setPanel("result");
        view?.clearPick();
        setSelected(0);
      }
      if (e.kind === "clash") {
        if (e.hostile) sfxClash(true);
        if (e.shake) view?.addTrauma(0.05);
      }
      if (e.kind === "blocked") sfxBlocked();
      bump();
    });
  }, []);

  const activeCategory =
    categories.find((cat) => cat.id === categoryId) ??
    categories.find((cat) => cat.maps.some((item) => item.id === activeId)) ??
    null;
  const activeMap = activeCategory?.maps.find((item) => item.id === activeId) ?? activeCategory?.maps[0] ?? null;

  useEffect(() => {
    const view = viewRef.current;
    if (!view || screen !== "atlas" || !activeMap) return;
    view.editing = true;
    view.setDraft(activeMap.worlds, mapSelected, placing, activeMap.suns ?? null, activeMap.locks ?? null);
  }, [screen, activeMap, mapSelected, placing]);

  useEffect(() => {
    if (screen !== "atlas") return;
    viewRef.current?.fit();
  }, [screen, activeId]);

  function goSetup() {
    unlockAudio();
    startPad();
    void readyLibrary().then((saved) => {
      categoriesRef.current = saved;
      setCategories(saved);
      if (saved.length) {
        setCategoryId((cur) => (cur && saved.some((cat) => cat.id === cur) ? cur : saved[0].id));
        setActiveId((cur) =>
          cur && saved.some((cat) => cat.maps.some((map) => map.id === cur)) ? cur : (saved[0].maps[0]?.id ?? null),
        );
      }
    });
    setSetup(legalSetup(sim.state.lastSetup ?? defaultSetup()));
    screenRef.current = "setup";
    if (viewRef.current) viewRef.current.editing = false;
    setScreen("setup");
    setPanel(null);
  }

  function playSaved(map: CustomMap, fallback: Screen = "setup") {
    unlockAudio();
    startPad();
    setMuted(sim.state.settings.muted);
    screenRef.current = "play";
    const view = viewRef.current;
    if (view) view.editing = false;
    if (!startCustomMatch(map)) {
      screenRef.current = fallback;
      if (fallback === "atlas" && view) view.editing = true;
      return;
    }
    view?.fit();
    view?.clearPick();
    setSelected(0);
    setScreen("play");
    setPanel(null);
    setCanContinue(true);
    bump();
  }

  function openAtlas() {
    unlockAudio();
    startPad();
    void readyLibrary().then((loaded) => {
      let cats = loaded.length ? loaded : categoriesRef.current;
      if (!cats.length) {
        cats = [createCategory(1)];
        commit(cats);
      } else {
        categoriesRef.current = cats;
        setCategories(cats);
      }
      const stored = loadGroups();
      const embedded = loadLibraryRecord().groups;
      if (stored.length || embedded.length) setGroups(stored.length ? stored : embedded);
      const cat =
        cats.find((item) => item.id === categoryRef.current) ??
        cats.find((item) => item.maps.some((map) => map.id === activeRef.current)) ??
        cats[0];
      const current = cat.maps.find((item) => item.id === activeRef.current) ?? cat.maps[0];
      setCategoryId(cat.id);
      setActiveId(current.id);
      setMapSelected(null);
      setPlacing(true);
      screenRef.current = "atlas";
      const view = viewRef.current;
      if (view) {
        view.editing = true;
        view.setPlacing(true);
        view.setDraft(current.worlds, null, true, current.suns ?? null, current.locks ?? null);
        view.fit();
      }
      setScreen("atlas");
      setPanel(null);
    });
  }

  function playMap() {
    const current = categoriesRef.current.flatMap((cat) => cat.maps).find((item) => item.id === activeRef.current);
    if (!current) return;
    saveLibrary(categoriesRef.current);
    publishLibrary(categoriesRef.current);
    void flushLibraryNow();
    playSaved(current, "atlas");
  }

  function closeAtlas() {
    screenRef.current = "title";
    if (viewRef.current) viewRef.current.editing = false;
    setScreen("title");
    setPanel(null);
  }

  function updateMap(next: CustomMap) {
    try {
      localStorage.setItem("helion.library.focus", next.id);
    } catch {
      /* ignore */
    }
    commit(
      categoriesRef.current.map((cat) => ({
        ...cat,
        maps: cat.maps.map((item) => (item.id === next.id ? next : item)),
      })),
    );
  }

  function renameCategory(name: string) {
    const id = categoryRef.current;
    if (!id) return;
    commit(categoriesRef.current.map((cat) => (cat.id === id ? { ...cat, name } : cat)));
  }

  function launch() {
    unlockAudio();
    startPad();
    setMuted(sim.state.settings.muted);
    startMatch(legalSetup(setup));
    viewRef.current?.fit();
    viewRef.current?.clearPick();
    setSelected(0);
    setScreen("play");
    setPanel(null);
    setCanContinue(true);
    bump();
  }

  function restartLevel() {
    unlockAudio();
    sfxTap();
    if (!restartMatch()) return;
    viewRef.current?.clearPick();
    viewRef.current?.fit();
    setSelected(0);
    setScreen("play");
    setPanel(null);
    setCanContinue(true);
    bump();
  }

  function continueMatch() {
    unlockAudio();
    startPad();
    setMuted(sim.state.settings.muted);
    if (sim.state.match?.paused) setPaused(false);
    viewRef.current?.fit();
    setScreen("play");
    setPanel(sim.state.match?.result === "playing" ? null : "result");
    bump();
  }

  function openPanel(p: Exclude<Panel, null>) {
    unlockAudio();
    sfxTap();
    if (p === "pause" || p === "settings" || p === "help") setPaused(true);
    setPanel(p);
  }

  function closePanel() {
    setPanel(null);
    if (screen === "play" && sim.state.match?.result === "playing") setPaused(false);
  }

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-bg text-fg">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ touchAction: "none" }}
      />
      {ready && screen === "title" && (
        <TitleOverlay
          visible
          hasContinue={canContinue}
          onBegin={goSetup}
          onContinue={continueMatch}
          onMaps={openAtlas}
          onHelp={() => {
            unlockAudio();
            startPad();
            setPanel("help");
          }}
        />
      )}
      {ready && screen === "setup" && (
        <SetupOverlay
          visible
          setup={setup}
          categories={categories}
          onChange={setSetup}
          onLaunch={launch}
          onPlayMap={playSaved}
          onBack={() => {
            setScreen("title");
            setPanel(null);
          }}
        />
      )}
      {ready && screen === "atlas" && activeMap && (
        <MapEditor
          key={activeMap.id}
          categories={categories}
          categoryId={activeCategory?.id ?? categoryId ?? ""}
          maps={activeCategory?.maps ?? []}
          map={activeMap}
          selectedId={mapSelected}
          placing={placing}
          onPlacing={(next) => {
            setPlacing(next);
            viewRef.current?.setPlacing(next);
          }}
          onSunPlace={(on) => viewRef.current?.setSunPlace(on)}
          onOrbitPlace={(on) => viewRef.current?.setPlaceOrbit(on)}
          onPlaceOwner={(owner) => viewRef.current?.setPlaceOwner(owner)}
          onPlaceKind={(index) => viewRef.current?.setPlaceTemplate(index)}
          onSelectTool={(on) => viewRef.current?.setSelectTool(on)}
          onChange={updateMap}
          onRenameCategory={renameCategory}
          onSelect={setMapSelected}
          onOpenCategory={(id) => {
            const cat = categoriesRef.current.find((item) => item.id === id);
            const map = cat?.maps[0];
            if (!cat || !map) return;
            setCategoryId(cat.id);
            setActiveId(map.id);
            setMapSelected(null);
            setPlacing(true);
            viewRef.current?.setPlacing(true);
          }}
          onOpen={(id) => {
            try {
              localStorage.setItem("helion.library.focus", id);
            } catch {
              /* ignore */
            }
            setActiveId(id);
            setMapSelected(null);
            setPlacing(true);
            viewRef.current?.setPlacing(true);
          }}
          onNewCategory={() => {
            const cats = categoriesRef.current;
            if (cats.length >= MAX_CATEGORIES) return;
            const cat = createCategory(cats.length + 1);
            commit([...cats, cat]);
            setCategoryId(cat.id);
            setActiveId(cat.maps[0].id);
            setMapSelected(null);
            setPlacing(true);
          }}
          onNew={() => {
            const id = categoryRef.current;
            const cat = categoriesRef.current.find((item) => item.id === id);
            if (!cat || cat.maps.length >= MAX_MAPS) return;
            const map = createMap(cat.maps.length + 1);
            commit(
              categoriesRef.current.map((item) => (item.id === id ? { ...item, maps: [...item.maps, map] } : item)),
            );
            setActiveId(map.id);
            setMapSelected(null);
            setPlacing(true);
          }}
          onDeleteCategory={() => {
            const rest = categoriesRef.current.filter((item) => item.id !== categoryRef.current);
            const next = rest.length ? rest : [createCategory(1)];
            commit(next);
            setCategoryId(next[0].id);
            setActiveId(next[0].maps[0].id);
            setMapSelected(null);
          }}
          onDeleteMap={() => {
            const id = categoryRef.current;
            const next = categoriesRef.current.map((cat) => {
              if (cat.id !== id) return cat;
              const rest = cat.maps.filter((item) => item.id !== activeRef.current);
              return { ...cat, maps: rest.length ? rest : [createMap(1)] };
            });
            commit(next);
            const cat = next.find((item) => item.id === id) ?? next[0];
            setActiveId(cat.maps[0].id);
            setMapSelected(null);
          }}
          onSnap={(on) => viewRef.current?.setSnap(on)}
          onPlay={playMap}
          onBack={closeAtlas}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={() => viewRef.current?.undo()}
          onRedo={() => viewRef.current?.redo()}
          groupLock={groupLock}
          onGroupSpin={(pspin) => viewRef.current?.setGroupSpin(pspin)}
          groups={groups}
          pendingGroup={pendingGroup}
          onCancelGroup={() => setPendingGroup(null)}
          onSaveGroup={(name) => {
            if (!pendingGroup) return;
            const next = [
              ...groups,
              {
                id: `g${Date.now().toString(36)}`,
                name: name.slice(0, 24),
                worlds: pendingGroup.worlds,
                suns: pendingGroup.suns,
              },
            ].slice(0, MAX_GROUPS);
            saveGroups(next);
            setGroups(next);
            setPendingGroup(null);
            if (categoriesRef.current.length) {
              saveLibrary(categoriesRef.current);
              publishLibrary(categoriesRef.current);
            }
          }}
          onPlaceGroup={(id) => {
            const group = groups.find((item) => item.id === id);
            if (!group) return;
            viewRef.current?.stampRemember(group);
            setPlacing(false);
            setSelectPulse((n) => n + 1);
          }}
          onForgetGroup={(id) => {
            const next = groups.filter((item) => item.id !== id);
            saveGroups(next);
            setGroups(next);
            if (categoriesRef.current.length) {
              saveLibrary(categoriesRef.current);
              publishLibrary(categoriesRef.current);
            }
          }}
          selectPulse={selectPulse}
        />
      )}
      {ready && screen === "play" && (
        <>
          <Hud
            selected={selected}
            speed={sim.state.settings.speed ?? "fast"}
            onSpeed={(speed: GameSpeed) => {
              unlockAudio();
              sfxTap();
              sim.state.settings.speed = speed;
              persist();
              bump();
            }}
            onOpen={openPanel}
          />
          <TutorialCard />
          {offline > 20 && (
            <button
              type="button"
              className="absolute left-1/2 top-24 z-10 -translate-x-1/2 rounded-full border border-border bg-surface px-4 py-2 text-xs text-muted"
              onClick={() => setOffline(0)}
            >
              Forged while away
            </button>
          )}
        </>
      )}
      <HelpSheet open={panel === "help"} onClose={closePanel} />
      <PauseSheet
        open={panel === "pause"}
        onClose={closePanel}
        onSettings={() => openPanel("settings")}
        onRestart={restartLevel}
        onTitle={() => {
          setPaused(true);
          persist();
          setScreen("title");
          setPanel(null);
          setCanContinue(hasSave());
        }}
      />
      <ResultOverlay
        visible={screen === "play" && (panel === "result" || sim.state.match?.result !== "playing")}
        onAgain={goSetup}
        onTitle={() => {
          persist();
          setScreen("title");
          setPanel(null);
          setCanContinue(hasSave());
        }}
      />
      <SettingsSheet
        open={panel === "settings"}
        onClose={closePanel}
        onReset={() => {
          setPanel(null);
          setScreen("title");
          setCanContinue(false);
          bump();
        }}
      />
    </main>
  );
}
