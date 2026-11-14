import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import { Link, Route, Routes, useLocation, useParams } from "react-router";
import { usePage, useRootIndex } from "./data.ts";
import type { PageSection } from "./data.ts";
import { MushafPage } from "./components/MushafPage.tsx";
import { SurahList } from "./components/SurahList.tsx";
import { usePager } from "./components/usePager.ts";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/:page" element={<PageView />} />
      <Route
        path="*"
        element={
          <div className="page">
            <nav className="topbar">
              <HomeLink />
              <ThemeToggle />
            </nav>
            <p className="status">Halaman tidak ditemukan.</p>
          </div>
        }
      />
    </Routes>
  );
}

/** Table of contents, with the attribution footer. */
function Home() {
  return (
    <div className="page">
      <nav className="topbar">
        <ThemeToggle />
      </nav>
      <SurahList />
      <footer className="credits">
        Teks Al-Qur'an: Mushaf Madinah V4 (1441H), Kompleks Percetakan Al-Qur'an Raja Fahd. Gambar per kata dari{" "}
        <a href="https://png.quran.ws/about/">png.quran.ws</a> (CC BY 4.0). Terjemahan disadur dari Terjemahan
        Kemenag RI 2019.
      </footer>
    </div>
  );
}

function HomeLink() {
  return (
    <Link className="home-link" to="/">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M15 5l-7 7 7 7" />
      </svg>
      Daftar isi
    </Link>
  );
}

const PAGES = 604;

/**
 * One printed mushaf page, with every surah (or part of one) printed on it.
 * A fixed header (back to the contents, theme) and footer (page turning) sit
 * over it; a tap on the page shows or hides them. The neighbouring pages lie
 * beside it (next on the left), so a swipe drags the next page in with it.
 */
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
  const prev = valid && page > 1 && ready(page - 1) ? page - 1 : null;
  const next = valid && page < PAGES && ready(page + 1) ? page + 1 : null;
  const sections = usePage(page, shown ? on(page).map((s) => s.surah) : null);
  const nextSections = usePage(next ?? 0, next ? on(next).map((s) => s.surah) : null);
  const prevSections = usePage(prev ?? 0, prev ? on(prev).map((s) => s.surah) : null);
  const { hash } = useLocation();
  const pager = usePager({ page, next, prev });
  const [bars, setBars] = useState(true);

  useEffect(() => {
    if (sections.status === "ok" && hash) document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [sections.status, hash, page]);

  // Keyboard users always see the bars.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Tab" && setBars(true);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onTap = (e: MouseEvent) => {
    if ((e.target as Element).closest("a, button") || pager.wasDrag()) return;
    if (window.getSelection()?.toString()) return;
    setBars((b) => !b);
  };

  const turn = (dir: 1 | -1) => (e: MouseEvent) => {
    e.preventDefault();
    pager.go(dir);
  };

  let body;
  if (!valid) body = <p className="status">Halaman tidak valid.</p>;
  else if (root.status === "error") body = <p className="status">Gagal memuat: {root.error}</p>;
  else if (root.status === "loading") body = <p className="status">Memuat…</p>;
  else if (!shown) body = <p className="status">Halaman {page} belum tersedia.</p>;
  else if (sections.status === "error") body = <p className="status">Gagal memuat: {sections.error}</p>;
  else if (sections.status === "loading") body = <p className="status">Memuat…</p>;
  else body = <MushafPage page={page} sections={sections.data} />;

  // Panels are keyed by page, so the neighbour that slides in stays mounted as the new page.
  const juzOf = (data: PageSection[]) => {
    const [s, a] = [data[0].surah.surah, data[0].ayahs[0].ayah];
    const at = (p: [number, number]) => p[0] * 1000 + p[1];
    return root.status === "ok" ? root.data.juz.find((j) => at(j.start) <= at([s, a]) && at([s, a]) <= at(j.end))?.juz : undefined;
  };
  const headOf = (s: typeof sections) =>
    s.status === "ok" ? { names: s.data.map((x) => x.surah.name.latin).join(" · "), juz: juzOf(s.data) } : undefined;
  const panels = [
    { n: valid ? page : 0, offset: 0, ready: sections.status === "ok", head: headOf(sections), content: body },
  ];
  for (const [n, s, offset] of [
    [next, nextSections, -1],
    [prev, prevSections, 1],
  ] as const) {
    if (n)
      panels.push({
        n,
        offset,
        ready: s.status === "ok",
        head: headOf(s),
        content: s.status === "ok" ? <MushafPage page={n} sections={s.data} anchors={false} /> : <p className="status">Memuat…</p>,
      });
  }

  const draft = sections.status === "ok" && sections.data.some((s) => s.ayahs.some((a) => a.phrases.length && !a.reviewed));
  const names = sections.status === "ok" ? sections.data.map((s) => s.surah.name.latin).join(" · ") : "";
  return (
    <div className="reader">
      <header className="bar bar-top" data-hidden={!bars || undefined}>
        <div className="bar-inner">
          <HomeLink />
          <div className="bar-title">
            {names && <span className="bar-names">{names}</span>}
            {draft && (
              <span className="draft" title="Terjemahan per frasa belum diperiksa">
                Draf
              </span>
            )}
          </div>
          <ThemeToggle />
        </div>
      </header>
      <div className="reader-track" ref={pager.ref} onClick={onTap} {...pager.touch}>
        {panels.map(({ n, offset, ready, head, content }) => (
          <Panel key={n} n={n} offset={offset} ready={ready} head={head}>
            {offset === 0 && <h1 className="sr-only">Halaman {page}</h1>}
            {content}
          </Panel>
        ))}
      </div>
      <footer className="bar bar-bottom" data-hidden={!bars || undefined}>
        {/* Mushaf order: the next page lies to the left. */}
        <nav className="bar-inner" aria-label="Halaman lain">
          {next ? (
            <Link className="turn" to={`/${next}`} rel="next" onClick={turn(1)} aria-label={`Halaman berikutnya, ${next}`}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M15 5l-7 7 7 7" />
              </svg>
              {next}
            </Link>
          ) : (
            <span className="turn" />
          )}
          <span className="bar-page">Halaman {valid ? page : "–"}</span>
          {prev ? (
            <Link className="turn" to={`/${prev}`} rel="prev" onClick={turn(-1)} aria-label={`Halaman sebelumnya, ${prev}`}>
              {prev}
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          ) : (
            <span className="turn" />
          )}
        </nav>
      </footer>
    </div>
  );
}

/** Scroll position of each page read during this visit, so turning back shows it where it was left. */
const scrolls = new Map<number, number>();

/**
 * One page in the swipe strip, `offset` screens from the centre (-1: next,
 * on the left; 1: previous). It scrolls on its own and remembers where: a
 * page comes back at that position once its content is drawn.
 *
 * Like a printed page it has its own header (surah names, juz) and footer
 * (a thin rule and the page number), in the space the fixed bars cover, so
 * hiding the bars shows them instead of blank space.
 */
function Panel({
  n,
  offset,
  ready,
  head,
  children,
}: {
  n: number;
  offset: number;
  ready: boolean;
  head?: { names: string; juz?: number };
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && ready) el.scrollTop = scrolls.get(n) ?? 0;
  }, [n, ready]);
  return (
    <main
      ref={ref}
      className="reader-page"
      style={offset ? { transform: `translateX(${offset * 100}%)` } : undefined}
      data-current={offset === 0 || undefined}
      aria-hidden={offset !== 0 || undefined}
      inert={offset !== 0}
      onScroll={(e) => scrolls.set(n, e.currentTarget.scrollTop)}
    >
      <div className="page-head" aria-hidden="true">
        {head && (
          <>
            <span className="page-head-names">{head.names}</span>
            {head.juz && <span>Juz {head.juz}</span>}
          </>
        )}
      </div>
      {children}
      {n > 0 && (
        <footer className="page-foot">
          <p className="page-no" lang="id">
            <span className="sr-only">Halaman </span>
            {n}
          </p>
        </footer>
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
