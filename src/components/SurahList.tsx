import { Link } from "react-router";
import { useRootIndex } from "../data.ts";
import type { SurahListEntry } from "../types.ts";

const PLACE = { makkah: "Makkiyah", madinah: "Madaniyah" } as const;

/** Table of contents: all 114 surahs. Surahs with generated data link to their page. */
export function SurahList() {
  const index = useRootIndex();
  if (index.status === "loading") return <p className="status">Memuat…</p>;
  if (index.status === "error") return <p className="status">Gagal memuat daftar surah: {index.error}</p>;

  const ready = index.data.surahs.filter((s) => s.available).length;
  return (
    <main>
      <header className="surah-head">
        <h1>Daftar Surah</h1>
        <p className="list-note">
          {ready} dari 114 surah sudah tersedia. Surah lain menyusul.
        </p>
      </header>
      <ol className="surah-list">
        {index.data.surahs.map((s) => (
          <li key={s.surah}>{s.available ? <Link to={`/${s.surah}`}><Row s={s} /></Link> : <Row s={s} muted />}</li>
        ))}
      </ol>
    </main>
  );
}

function Row({ s, muted = false }: { s: SurahListEntry; muted?: boolean }) {
  const [from, to] = s.pages;
  return (
    <div className={muted ? "surah-row muted" : "surah-row"}>
      <span className="surah-no">{s.surah}</span>
      <span className="surah-main">
        <span className="surah-name">{s.name.latin}</span>
        <span className="surah-meta">
          {s.ayahs} ayat · {PLACE[s.place]} · hlm. {from === to ? from : `${from}–${to}`}
          {muted && <span className="sr-only"> · belum tersedia</span>}
        </span>
      </span>
      <span className="surah-name-ar" lang="ar" dir="rtl">
        {s.name.ar}
      </span>
    </div>
  );
}
