import { useEffect, useState } from "react";
import { Link, Route, Routes, useLocation, useParams } from "react-router";
import { useAyahs, useSurahIndex } from "./data.ts";
import { MushafPage } from "./components/MushafPage.tsx";
import { SurahList } from "./components/SurahList.tsx";

export function App() {
  const home = useLocation().pathname === "/";
  return (
    <div className="page">
      <nav className="topbar">
        {!home && (
          <Link className="home-link" to="/">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" />
            </svg>
            Daftar surah
          </Link>
        )}
        <ThemeToggle />
      </nav>
      <Routes>
        <Route path="/" element={<SurahList />} />
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
  const draft = ayahs.status === "ok" && ayahs.data.some((a) => a.phrases.length && !a.reviewed);
  return (
    <main>
      <header className="surah-head">
        <h1>
          <span className="surah-ar" lang="ar">
            {name.ar}
          </span>
          <span className="surah-latin">{name.latin}</span>
        </h1>
        {(draft || only !== null) && (
          <div className="surah-tools">
            {draft && (
              <span className="draft" title="Terjemahan per frasa belum diperiksa">
                Draf
              </span>
            )}
            {only !== null && (
              <Link className="back" to={`/${surah}`}>
                Lihat seluruh surah
              </Link>
            )}
          </div>
        )}
      </header>
      {wanted?.length === 0 && <p className="status">Ayat {only} belum tersedia.</p>}
      {ayahs.status === "error" && <p className="status">Gagal memuat: {ayahs.error}</p>}
      {ayahs.status === "ok" && (
        <MushafPage layout={index.data.layout} ayahs={ayahs.data} basmalah={only === null} />
      )}
    </main>
  );
}

type Theme = "light" | "dark";

const systemTheme = (): Theme => (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

/**
 * Light/dark switch. Follows the system until the reader picks one; the
 * choice is remembered in this browser and stamped as data-theme on <html>
 * (index.html applies it before first paint).
 */
function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => {
    const stamped = document.documentElement.dataset.theme;
    return stamped === "light" || stamped === "dark" ? stamped : systemTheme();
  });

  useEffect(() => {
    // Track the system setting while the reader has not chosen.
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (!document.documentElement.dataset.theme) setTheme(systemTheme());
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* storage unavailable: keep for this visit only */
    }
  };

  const dark = theme === "dark";
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={dark ? "Ganti ke mode terang" : "Ganti ke mode gelap"}
      title={dark ? "Mode terang" : "Mode gelap"}
    >
      {dark ? (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="4.5" />
          <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
        </svg>
      )}
    </button>
  );
}
