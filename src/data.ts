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

export const useSurahIndex = (surah: number) => useJson<SurahIndex>(`${DATA}/${surah}/index.json`);

export function useAyahs(surah: number, ayahs: number[] | null): State<AyahData[]> {
  const [state, setState] = useState<State<AyahData[]>>({ status: "loading" });
  const key = ayahs?.join(",") ?? null;
  useEffect(() => {
    if (key === null) return;
    let alive = true;
    setState({ status: "loading" });
    Promise.all(
      key.split(",").filter(Boolean).map((a) =>
        fetch(`${DATA}/${surah}/${a}.json`).then((r) =>
          r.ok ? (r.json() as Promise<AyahData>) : Promise.reject(new Error(`${surah}:${a} ${r.status}`)),
        ),
      ),
    )
      .then((data) => alive && setState({ status: "ok", data }))
      .catch((e: Error) => alive && setState({ status: "error", error: e.message }));
    return () => {
      alive = false;
    };
  }, [surah, key]);
  return state;
}
