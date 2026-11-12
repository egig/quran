import { Link, Navigate, Route, Routes, useParams } from "react-router";
import { useAyahs, useSurahIndex } from "./data.ts";
import { AyahView } from "./components/AyahView.tsx";

export function App() {
  return (
    <div className="page">
      <Routes>
        <Route path="/" element={<Navigate to="/1" replace />} />
        <Route path="/:surah" element={<SurahPage />} />
        <Route path="/:surah/:ayah" element={<SurahPage />} />
        <Route path="*" element={<p className="status">Halaman tidak ditemukan.</p>} />
      </Routes>
      <footer className="credits">
        Teks Al-Qur'an: Mushaf Madinah V4 (1441H), Kompleks Percetakan Al-Qur'an Raja Fahd. Gambar per kata dari{" "}
        <a href="https://png.quran.ws/about/">png.quran.ws</a> (CC BY 4.0). Terjemahan disadur dari Terjemahan
        Kemenag RI 2019.
      </footer>
    </div>
  );
}

function SurahPage() {
  const params = useParams();
  const surah = Number(params.surah);
  const only = params.ayah ? Number(params.ayah) : null;
  const index = useSurahIndex(surah);
  const wanted =
    index.status === "ok" ? index.data.ayahs.filter((a) => only === null || a === only) : null;
  const ayahs = useAyahs(surah, wanted);

  if (!Number.isInteger(surah)) return <p className="status">Surah tidak valid.</p>;
  if (index.status === "error") return <p className="status">Surah {surah} belum tersedia.</p>;
  if (index.status === "loading") return <p className="status">Memuat…</p>;

  const { name } = index.data;
  return (
    <main>
      <header className="surah-head">
        <h1>
          <span className="surah-ar" lang="ar">
            {name.ar}
          </span>
          <span className="surah-latin">{name.latin}</span>
        </h1>
        {only !== null && (
          <Link className="back" to={`/${surah}`}>
            Lihat seluruh surah
          </Link>
        )}
      </header>
      {wanted?.length === 0 && <p className="status">Ayat {only} belum tersedia.</p>}
      {ayahs.status === "error" && <p className="status">Gagal memuat: {ayahs.error}</p>}
      {ayahs.status === "ok" && ayahs.data.map((a) => <AyahView key={a.key} data={a} />)}
    </main>
  );
}
