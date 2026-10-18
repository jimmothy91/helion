import { fetchMapLibrary, putMapLibrary } from "./library.functions";
import {
  categoriesFromPayload,
  countWorlds,
  loadGroups,
  loadLibrary,
  loadLibraryRecord,
  saveGroups,
  saveLibrary,
  type LibraryRecord,
  type MapCategory,
} from "./maps";

const ID_KEY = "helion.library.id";
const SHADOW_ID = "helion";
const SHIPPED_STAMP = "helion.shipped.at";

type Sync = {
  v: number;
  pullPromise: Promise<void> | null;
  pending: MapCategory[] | null;
  onRemote: ((categories: MapCategory[]) => void) | null;
  pushing: boolean;
  dirty: boolean;
  timer: ReturnType<typeof setTimeout> | null;
};

const SYNC_VERSION = 2;
const syncHost = globalThis as typeof globalThis & { __helionLibrarySync?: Sync };
const sync: Sync =
  syncHost.__helionLibrarySync?.v === SYNC_VERSION
    ? syncHost.__helionLibrarySync
    : (syncHost.__helionLibrarySync = {
        v: SYNC_VERSION,
        pullPromise: null,
        pending: null,
        onRemote: null,
        pushing: false,
        dirty: false,
        timer: null,
      });

function worldCount(categories: MapCategory[]): number {
  return countWorlds(categories);
}

function readId(store: Storage): string {
  try {
    return store.getItem(ID_KEY) || "";
  } catch {
    return "";
  }
}

function cookieId(): string {
  if (typeof document === "undefined") return "";
  const hit = document.cookie.split("; ").find((part) => part.startsWith(`${ID_KEY}=`));
  if (!hit) return "";
  try {
    return decodeURIComponent(hit.slice(ID_KEY.length + 1));
  } catch {
    return "";
  }
}

export function libraryId(): string {
  const existing =
    (typeof localStorage !== "undefined" ? readId(localStorage) : "") ||
    (typeof sessionStorage !== "undefined" ? readId(sessionStorage) : "") ||
    cookieId();
  const id = /^[a-zA-Z0-9_-]{4,80}$/.test(existing) ? existing : `lib-${crypto.randomUUID()}`;
  try {
    localStorage.setItem(ID_KEY, id);
  } catch {
    /* ignore */
  }
  try {
    sessionStorage.setItem(ID_KEY, id);
  } catch {
    /* ignore */
  }
  try {
    document.cookie = `${ID_KEY}=${encodeURIComponent(id)}; Max-Age=31536000; Path=/; SameSite=Lax`;
  } catch {
    /* ignore */
  }
  return id;
}

async function push(categories: MapCategory[]) {
  const payload = JSON.stringify({ v: 2, savedAt: Date.now(), categories });
  const id = libraryId();
  await putMapLibrary({ data: { id, payload } });
  if (import.meta.env.DEV && id !== SHADOW_ID) {
    await putMapLibrary({ data: { id: SHADOW_ID, payload } });
  }
}

async function flush(): Promise<void> {
  if (sync.pushing) {
    sync.dirty = true;
    return;
  }
  const categories = sync.pending;
  if (!categories?.length) return;
  sync.pushing = true;
  sync.dirty = false;
  try {
    await push(categories);
  } catch {
    /* the browser copy is already written */
  } finally {
    sync.pushing = false;
  }
  if (sync.dirty && sync.pending) await flush();
}

export function publishLibrary(categories: MapCategory[]) {
  sync.pending = categories;
  if (typeof window === "undefined") return;
  if (sync.timer) clearTimeout(sync.timer);
  sync.timer = setTimeout(() => {
    sync.timer = null;
    void flush();
  }, 350);
}

/** Write the latest map to the server immediately (play, hide, reload). */
export function flushLibraryNow(): Promise<void> {
  if (sync.timer) {
    clearTimeout(sync.timer);
    sync.timer = null;
  }
  return flush();
}

export function watchRemoteLibrary(cb: (categories: MapCategory[]) => void) {
  sync.onRemote = cb;
}

async function readShared(): Promise<LibraryRecord | null> {
  const shadow = await fetchMapLibrary({ data: { id: SHADOW_ID } }).catch(() => null);
  return shadow ? categoriesFromPayload(shadow) : null;
}

async function readBundled(): Promise<LibraryRecord | null> {
  if (typeof fetch === "undefined") return null;
  try {
    const res = await fetch("/shipped-library.json", { cache: "no-store" });
    if (!res.ok) return null;
    return categoriesFromPayload(await res.text());
  } catch {
    return null;
  }
}

function newerPack(a: LibraryRecord | null, b: LibraryRecord | null): LibraryRecord | null {
  const aw = a ? worldCount(a.categories) : 0;
  const bw = b ? worldCount(b.categories) : 0;
  if (aw === 0) return bw > 0 ? b : a;
  if (bw === 0) return a;
  if (a!.savedAt !== b!.savedAt) return a!.savedAt > b!.savedAt ? a : b;
  return aw >= bw ? a : b;
}

function appliedStamp(): number {
  if (typeof localStorage === "undefined") return 0;
  const n = Number(localStorage.getItem(SHIPPED_STAMP) || 0);
  return Number.isFinite(n) ? n : 0;
}

function adoptPack(rec: LibraryRecord) {
  saveLibrary(rec.categories);
  if (rec.groups.length > 0 && loadGroups().length === 0) saveGroups(rec.groups);
  try {
    localStorage.setItem(SHIPPED_STAMP, String(rec.savedAt));
  } catch {
    /* ignore */
  }
  sync.pending = rec.categories;
  sync.onRemote?.(rec.categories);
}

async function readRemote(): Promise<LibraryRecord | null> {
  const id = libraryId();
  const own = await fetchMapLibrary({ data: { id } }).catch(() => null);
  const ownRec = own ? categoriesFromPayload(own) : null;
  if (ownRec && worldCount(ownRec.categories) > 0) return ownRec;
  const shadowRec = await readShared();
  return shadowRec && worldCount(shadowRec.categories) > 0 ? shadowRec : ownRec;
}

export function startLibrarySync(): Promise<void> {
  if (sync.pullPromise) return sync.pullPromise;
  sync.pullPromise = (async () => {
    const local = loadLibraryRecord();
    const localWorlds = worldCount(local.categories);
    // The shared link carries the author's maps. A visitor with none, or an
    // older copy from a previous publish, takes the pack that shipped with this link.
    if (!import.meta.env.DEV) {
      const pack = newerPack(await readBundled(), await readShared());
      if (pack && worldCount(pack.categories) > 0 && (localWorlds === 0 || pack.savedAt > appliedStamp())) {
        adoptPack(pack);
        return;
      }
    }
    let remote: LibraryRecord | null = null;
    try {
      remote = await readRemote();
    } catch {
      remote = null;
    }
    const pending = sync.pending && worldCount(sync.pending) > 0 ? sync.pending : null;
    const remoteWorlds = remote ? worldCount(remote.categories) : 0;
    const chosen = pending ?? (localWorlds > 0 ? local.categories : remoteWorlds > 0 ? remote!.categories : null);
    if (remote && remote.groups.length > 0 && loadGroups().length === 0) saveGroups(remote.groups);
    if (chosen && !pending && localWorlds === 0) {
      saveLibrary(chosen);
      sync.pending = chosen;
      sync.onRemote?.(chosen);
    }
    const toPush = pending ?? (localWorlds > 0 ? local.categories : chosen);
    if (toPush && worldCount(toPush) > 0) {
      sync.pending = toPush;
      await flush();
    }
  })().catch(() => {});
  return sync.pullPromise;
}

/** Local maps come back immediately. A wiped browser waits for the server copy before inventing a blank map. */
export async function readyLibrary(): Promise<MapCategory[]> {
  const local = loadLibraryRecord();
  const needsPack = !import.meta.env.DEV && (worldCount(local.categories) === 0 || appliedStamp() === 0);
  if (worldCount(local.categories) > 0 && !needsPack) {
    void startLibrarySync();
    return local.categories;
  }
  await startLibrarySync();
  return loadLibrary();
}
