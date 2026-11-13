import { useEffect, useState } from "react";
import { Link, Route, Routes, useLocation, useParams } from "react-router";
import { usePage, useRootIndex } from "./data.ts";
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
            Daftar isi
          </Link>
        )}
        <ThemeToggle />
      </nav>
      <Routes>
        <Route path="/" element={<SurahList />} />
        <Route path="/:page" element={<PageView />} />
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

const PAGES = 604;

/** One printed mushaf page, with every surah (or part of one) printed on it. */
function PageView() {
  const page = Number(useParams().page);
  const valid = Number.isInteger(page) && page >= 1 && page <= PAGES;
  const root = useRootIndex();
  const on = (n: number) => (root.status === "ok" ? root.data.surahs.filter((s) => s.pages[0] <= n && n <= s.pages[1]) : []);
  // A page is shown only when every surah printed on it has been built.
  const ready = (n: number) => {
    const surahs = on(n);
    return surahs.length > 0 && surahs.every((s) => s.available);
  };
  const shown = valid && ready(page);
  const sections = usePage(page, shown ? on(page).map((s) => s.surah) : null);
  const { hash } = useLocation();

  useEffect(() => {
    if (sections.status === "ok" && hash) document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [sections.status, hash]);

  if (!valid) return <p className="status">Halaman tidak valid.</p>;
  if (root.status === "error") return <p className="status">Gagal memuat: {root.error}</p>;
  if (root.status === "loading") return <p className="status">Memuat…</p>;
  if (!shown) return <p className="status">Halaman {page} belum tersedia.</p>;
  if (sections.status === "error") return <p className="status">Gagal memuat: {sections.error}</p>;
  if (sections.status === "loading") return <p className="status">Memuat…</p>;

  const draft = sections.data.some((s) => s.ayahs.some((a) => a.phrases.length && !a.reviewed));
  const prev = page > 1 && ready(page - 1) ? page - 1 : null;
  const next = page < PAGES && ready(page + 1) ? page + 1 : null;
  return (
    <main>
      <h1 className="sr-only">Halaman {page}</h1>
      {draft && (
        <div className="page-tools">
          <span className="draft" title="Terjemahan per frasa belum diperiksa">
            Draf
          </span>
        </div>
      )}
      <MushafPage page={page} sections={sections.data} />
      {(prev || next) && (
        // Mushaf order: the next page lies to the left.
        <nav className="page-nav" aria-label="Halaman lain">
          {next ? <Link to={`/${next}`} rel="next">‹ Halaman {next}</Link> : <span />}
          {prev ? <Link to={`/${prev}`} rel="prev">Halaman {prev} ›</Link> : <span />}
        </nav>
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
