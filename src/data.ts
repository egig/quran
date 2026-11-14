import { useEffect, useState } from "react";
import type { AyahData, RootIndex, SurahIndex } from "./types.ts";

/** Generated data, under the site's base path (/ locally, /<repo>/ on GitHub Pages). */
const DATA = `${import.meta.env.BASE_URL}data`;

type State<T> = { status: "loading" } | { status: "error"; error: string } | { status: "ok"; data: T };

/** Every JSON file is fetched once per visit; a failed fetch is retried next time. */
const jsonCache = new Map<string, Promise<unknown>>();

const getJson = <T,>(url: string): Promise<T> => {
  let p = jsonCache.get(url);
  if (!p) {
    p = fetch(url).then((r) =>
      r.ok ? (r.json() as Promise<T>) : Promise.reject(new Error(`${url.slice(DATA.length + 1)} ${r.status}`)),
    );
    p.catch(() => jsonCache.delete(url));
    jsonCache.set(url, p);
  }
  return p as Promise<T>;
};

function useJson<T>(url: string | null): State<T> {
  const [state, setState] = useState<State<T>>({ status: "loading" });
  useEffect(() => {
    if (!url) return;
    let alive = true;
    getJson<T>(url)
      .then((data) => alive && setState({ status: "ok", data }))
      .catch((e: Error) => alive && setState({ status: "error", error: e.message }));
    return () => {
      alive = false;
    };
  }, [url]);
  return state;
}

export const useRootIndex = () => useJson<RootIndex>(`${DATA}/index.json`);

export interface PageSection {
  surah: SurahIndex;
  /** The surah's ayahs with artwork on this page, in order. */
  ayahs: AyahData[];
}

/** Pages already loaded, by `${page}:${surahs}`, so turning back to one shows it at once. */
const loaded = new Map<string, PageSection[]>();

function loadPage(page: number, key: string): Promise<PageSection[]> {
  return Promise.all(
    key.split(",").map(async (s) => {
      const surah = await getJson<SurahIndex>(`${DATA}/${s}/index.json`);
      const info = surah.layout.pages.find((p) => p.page === page);
      if (!info) throw new Error(`surah ${s} has no page ${page}`);
      const [from, to] = info.ayahs;
      const ayahs = await Promise.all(
        Array.from({ length: to - from + 1 }, (_, i) => getJson<AyahData>(`${DATA}/${s}/${from + i}.json`)),
      );
      return { surah, ayahs };
    }),
  ).then((data) => {
    loaded.set(`${page}:${key}`, data);
    return data;
  });
}

/** Everything printed on one mushaf page: each surah on it with its ayahs there. */
export function usePage(page: number, surahs: number[] | null): State<PageSection[]> {
  const key = surahs === null ? null : `${page}:${surahs.join(",")}`;
  // The state remembers which page it is for, so a new page never shows the old page's data.
  const [state, setState] = useState<{ key: string | null } & State<PageSection[]>>({ key: null, status: "loading" });
  useEffect(() => {
    if (key === null || loaded.has(key)) return;
    let alive = true;
    loadPage(page, key.slice(key.indexOf(":") + 1))
      .then((data) => alive && setState({ key, status: "ok", data }))
      .catch((e: Error) => alive && setState({ key, status: "error", error: e.message }));
    return () => {
      alive = false;
    };
  }, [page, key]);
  const cached = key === null ? undefined : loaded.get(key);
  if (cached) return { status: "ok", data: cached };
  return state.key === key ? state : { status: "loading" };
}
