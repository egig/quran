import { useRef, type KeyboardEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { useRootIndex } from "../data.ts";
import type { JuzListEntry, SurahListEntry } from "../types.ts";

const PLACE = { makkah: "Makkiyah", madinah: "Madaniyah" } as const;

const TABS = [
  { id: "surah", label: "Surah" },
  { id: "juz", label: "Juz" },
] as const;
type Tab = (typeof TABS)[number]["id"];

const pageSpan = ([from, to]: [number, number]) => `hlm. ${from === to ? from : `${from}–${to}`}`;

/**
 * Table of contents, by surah or by juz (tabs; the choice is kept in the URL
 * as ?daftar=juz). Built entries link to the mushaf page they start on.
 */
export function SurahList() {
  const index = useRootIndex();
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get("daftar") === "juz" ? "juz" : "surah";
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ surah: null, juz: null });

  const select = (t: Tab, focus = false) => {
    setParams(t === "surah" ? {} : { daftar: t }, { replace: true });
    if (focus) tabRefs.current[t]?.focus();
  };
  const onKey = (e: KeyboardEvent) => {
    const i = TABS.findIndex((t) => t.id === tab);
    const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: TABS.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    select(TABS[(to + TABS.length) % TABS.length].id, true);
  };

  if (index.status === "loading") return <p className="status">Memuat…</p>;
  if (index.status === "error") return <p className="status">Gagal memuat daftar isi: {index.error}</p>;

  const { surahs, juz } = index.data;
  const note =
    tab === "surah"
      ? `${surahs.filter((s) => s.available).length} dari 114 surah sudah tersedia. Surah lain menyusul.`
      : `${juz.filter((j) => j.available).length} dari 30 juz sudah tersedia. Juz lain menyusul.`;
  return (
    <main>
      <header className="surah-head">
        <h1>Daftar Isi</h1>
        <div className="tabs" role="tablist" aria-label="Daftar isi menurut" onKeyDown={onKey}>
          {TABS.map((t) => (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[t.id] = el;
              }}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`panel-${t.id}`}
              tabIndex={tab === t.id ? 0 : -1}
              className="tab"
              onClick={() => select(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <p className="list-note">{note}</p>
      </header>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "surah" ? (
          <ol className="surah-list">
            {surahs.map((s) => (
              <li key={s.surah}>
                {s.available ? (
                  <Link to={`/${s.pages[0]}#s${s.surah}`}>
                    <SurahRow s={s} />
                  </Link>
                ) : (
                  <SurahRow s={s} muted />
                )}
              </li>
            ))}
          </ol>
        ) : (
          <ol className="surah-list">
            {juz.map((j) => (
              <li key={j.juz}>
                {j.available && j.pages ? (
                  <Link to={`/${j.pages[0]}${j.start[1] === 1 ? `#s${j.start[0]}` : ""}`}>
                    <JuzRow j={j} surahs={surahs} />
                  </Link>
                ) : (
                  <JuzRow j={j} surahs={surahs} muted />
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </main>
  );
}

function SurahRow({ s, muted = false }: { s: SurahListEntry; muted?: boolean }) {
  return (
    <div className={muted ? "surah-row muted" : "surah-row"}>
      <span className="surah-no">{s.surah}</span>
      <span className="surah-main">
        <span className="surah-name">{s.name.latin}</span>
        <span className="surah-meta">
          {s.ayahs} ayat · {PLACE[s.place]} · {pageSpan(s.pages)}
          {muted && <span className="sr-only"> · belum tersedia</span>}
        </span>
      </span>
      <span className="surah-name-ar" lang="ar" dir="rtl">
        {s.name.ar}
      </span>
    </div>
  );
}

function JuzRow({ j, surahs, muted = false }: { j: JuzListEntry; surahs: SurahListEntry[]; muted?: boolean }) {
  const at = ([s, a]: [number, number]) => `${surahs[s - 1].name.latin} ${a}`;
  return (
    <div className={muted ? "surah-row juz-row muted" : "surah-row juz-row"}>
      <span className="surah-no" aria-hidden="true">
        {j.juz}
      </span>
      <span className="surah-main">
        <span className="surah-name">
          <span className="sr-only">Juz {j.juz}: </span>
          {at(j.start)} – {at(j.end)}
        </span>
        <span className="surah-meta">
          {j.pages ? pageSpan(j.pages) : "Halaman menyusul"}
          {muted && <span className="sr-only"> · belum tersedia</span>}
        </span>
      </span>
    </div>
  );
}
