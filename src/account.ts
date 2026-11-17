import { useEffect, useSyncExternalStore } from "react";
import { createAuthClient } from "better-auth/react";
import { magicLinkClient } from "better-auth/client/plugins";

/** better-auth client for the Worker's /api/auth (same origin). */
export const authClient = createAuthClient({
  baseURL: location.origin,
  basePath: `${import.meta.env.BASE_URL}api/auth`,
  plugins: [magicLinkClient()],
});

/** The signed-in reader, or null. `pending` while the session is being checked. */
export function useAccount() {
  const { data, isPending } = authClient.useSession();
  return { user: data?.user ?? null, pending: isPending };
}

export async function signOut() {
  await authClient.signOut();
  loadingFor = null;
  setBookmarks(null);
}

// ---------- Bookmarks ----------

export interface Bookmark {
  surah: number;
  ayah: number;
  /** Mushaf page the ayah starts on. */
  page: number;
  createdAt: number;
}

const API = `${import.meta.env.BASE_URL}api/bookmarks`;

/** The reader's bookmarks, newest first; null until loaded (or when signed out). */
let bookmarks: Bookmark[] | null = null;
let loadingFor: string | null = null;
const listeners = new Set<() => void>();
const setBookmarks = (b: Bookmark[] | null) => {
  bookmarks = b;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

async function load(userId: string) {
  if (loadingFor === userId) return;
  loadingFor = userId;
  try {
    const r = await fetch(API, { credentials: "same-origin" });
    if (!r.ok) throw new Error(`bookmarks ${r.status}`);
    setBookmarks(((await r.json()) as { bookmarks: Bookmark[] }).bookmarks);
  } catch {
    loadingFor = null; // retried on the next mount
  }
}

/** The signed-in reader's bookmarks (loaded once per visit), or null. */
export function useBookmarks(): Bookmark[] | null {
  const { user } = useAccount();
  const list = useSyncExternalStore(subscribe, () => bookmarks);
  useEffect(() => {
    if (user) void load(user.id);
    else if (bookmarks !== null) {
      loadingFor = null;
      setBookmarks(null);
    }
  }, [user]);
  return user ? list : null;
}

export const isBookmarked = (list: Bookmark[] | null, surah: number, ayah: number) =>
  !!list?.some((b) => b.surah === surah && b.ayah === ayah);

/** Adds or removes a bookmark; the list updates at once and rolls back if the server refuses. */
export async function toggleBookmark(surah: number, ayah: number, page: number) {
  const before = bookmarks ?? [];
  const on = isBookmarked(before, surah, ayah);
  setBookmarks(
    on ? before.filter((b) => !(b.surah === surah && b.ayah === ayah)) : [{ surah, ayah, page, createdAt: Date.now() }, ...before],
  );
  const r = await fetch(`${API}/${surah}/${ayah}`, {
    method: on ? "DELETE" : "PUT",
    credentials: "same-origin",
    headers: on ? undefined : { "content-type": "application/json" },
    body: on ? undefined : JSON.stringify({ page }),
  }).catch(() => null);
  if (!r?.ok) {
    setBookmarks(before);
    throw new Error("Gagal menyimpan tanda.");
  }
}
