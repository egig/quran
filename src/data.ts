import { useEffect, useState } from "react";
import type { AyahData, RootIndex, SurahIndex } from "./types.ts";

/** Generated data, under the site's base path (/ locally, /<repo>/ on GitHub Pages). */
const DATA = `${import.meta.env.BASE_URL}data`;

type State<T> = { status: "loading" } | { status: "error"; error: string } | { status: "ok"; data: T };

function useJson<T>(url: string | null): State<T> {
  const [state, setState] = useState<State<T>>({ status: "loading" });
  useEffect(() => {
    if (!url) return;
    let alive = true;
    setState({ status: "loading" });
    fetch(url)
      .then((r) => (r.ok ? (r.json() as Promise<T>) : Promise.reject(new Error(`${r.status}`))))
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

const getJson = <T,>(url: string): Promise<T> =>
  fetch(url).then((r) => (r.ok ? (r.json() as Promise<T>) : Promise.reject(new Error(`${url.slice(DATA.length + 1)} ${r.status}`))));

/** Everything printed on one mushaf page: each surah on it with its ayahs there. */
export function usePage(page: number, surahs: number[] | null): State<PageSection[]> {
  const [state, setState] = useState<State<PageSection[]>>({ status: "loading" });
  const key = surahs?.join(",") ?? null;
  useEffect(() => {
    if (key === null) return;
    let alive = true;
    setState({ status: "loading" });
    Promise.all(
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
    )
      .then((data) => alive && setState({ status: "ok", data }))
      .catch((e: Error) => alive && setState({ status: "error", error: e.message }));
    return () => {
      alive = false;
    };
  }, [page, key]);
  return state;
}
