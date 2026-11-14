import { useLayoutEffect, useRef } from "react";
import type { AyahData, Glyph } from "../types.ts";
import type { PageSection } from "../data.ts";
import { fitRow } from "./fitRow.ts";

const LANG = "id";

/**
 * A translation wraps only between words. Words with a hyphen ("Al-Qur’an",
 * "kekuning-kuningan") are kept on one line, so no line ends in a dash.
 */
function wholeWords(text: string) {
  return text.split(/(\s+)/).map((t, i) =>
    t.includes("-") ? (
      <span key={i} className="nw">
        {t}
      </span>
    ) : (
      t
    ),
  );
}

/**
 * Width of a full printed line, in artwork units of a regular page (pages
 * 602–604 measure 325–327.5), and the width of the ayah-end ornament on such
 * a page. The API draws pages 1–2 at another scale (ornament 12.48 instead of
 * 18.31 units), so each page's frame is scaled by its own ornament width.
 * Every page then shows the Arabic at the same size. The pixel cap is the
 * container's max-width.
 */
const FRAME_WIDTH = 328;
const REF_MARK = 18.31;
/**
 * Vertical extent of every printed line around its centre, in the same
 * units, on every page. It covers the ink of every built page (measured over
 * all 604 pages: highest ink -28.0, lowest 24.7), so line spacing is the same
 * on every page instead of following each surah's own ink.
 */
const BAND = { top: -29, bottom: 25 };

interface Segment {
  x0: number;
  x1: number;
  /** null: continuation of a phrase whose translation sits on an earlier line or page. */
  text: string | null;
}

interface Line {
  n: number;
  glyphs: Glyph[];
  segments: Segment[];
}

/**
 * Redraws one printed Madinah mushaf page line by line. Every word keeps its
 * printed position; the whole page scales with its container, at one fixed
 * scale for every page (see FRAME_WIDTH). Each surah is
 * cropped to its own ink, so its artwork is moved by its `left` offset into
 * the page's shared frame. Each phrase's translation sits under its words. A
 * phrase that runs onto the next printed line (or comes from the previous
 * page) shows its translation under its first part and "…" under the rest,
 * unless the content splits its translation per line (`parts`).
 */
export function MushafPage({
  page,
  sections,
  anchors = true,
}: {
  page: number;
  sections: PageSection[];
  /** Give each surah its #s{n} id. Off for neighbouring pages drawn beside the current one. */
  anchors?: boolean;
}) {
  const scale = markWidth(page, sections) / REF_MARK;
  // Ink of the page, in the shared frame. A regular page uses each surah's
  // ink, the same on all its pages. A page drawn at another scale (pages 1–2)
  // uses its own ink: the surah's ink comes from its regular pages.
  const [inkLeft, inkRight] = Math.abs(scale - 1) < 0.01 ? surahInk(sections) : pageInk(page, sections);
  const width = Math.max(FRAME_WIDTH * scale, inkRight - inkLeft);
  const left = (inkLeft + inkRight - width) / 2;
  const top = BAND.top * scale;
  const bottom = BAND.bottom * scale;
  const pct = (v: number) => `${(v / width) * 100}%`;

  // Translations that do not fit their slot get room from their neighbours
  // (see fitRow). Re-run when the width changes and once the font has loaded.
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => el.querySelectorAll<HTMLElement>(".mtr").forEach(fitRow);
    fit();
    let alive = true;
    document.fonts.ready.then(() => alive && fit());
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => {
      alive = false;
      ro.disconnect();
    };
  }, [page, sections]);

  return (
    <div className="mushaf-page" lang="ar" ref={ref}>
      {sections.map(({ surah, ayahs }) => {
        const { layout } = surah;
        const dx = layout.left - left;
        const starts = layout.pages[0].page === page;
        return (
          <section key={surah.surah} className="surah-section" id={anchors ? `s${surah.surah}` : undefined}>
            {starts && (
              <h2 className="surah-title">
                <span className="surah-ar" lang="ar">
                  {surah.name.ar}
                </span>
                <span className="surah-latin" lang="id">
                  {surah.surah}. {surah.name.latin}
                </span>
              </h2>
            )}
            {linesOf(page, ayahs, layout.basmalah?.page === page ? layout.basmalah : null).map((line) => {
              let edge = width; // left edge of the previous segment; RTL starts at the right
              // Neighbouring phrases split the space between them at the midpoint:
              // printed words can overlap (a tail running under the next word), and
              // gaps give narrow phrases more room for their translation.
              const segments = line.segments
                .map((s) => ({ ...s, x0: s.x0 + dx, x1: s.x1 + dx }))
                .sort((a, b) => b.x1 - a.x1)
                .map((s, i, all) => ({
                  ...s,
                  x1: i > 0 ? (all[i - 1].x0 + s.x1) / 2 : s.x1,
                  x0: i < all.length - 1 ? (s.x0 + all[i + 1].x1) / 2 : s.x0,
                }));
              return (
                <div className="mline" key={line.n}>
                  <svg viewBox={`0 ${top} ${width} ${bottom - top}`} fill="currentColor" aria-hidden="true">
                    <g transform={`translate(${dx} 0)`}>
                      {line.glyphs.flatMap((g) => g.paths).map((p, i) => (
                        <path key={i} d={p.d} fillRule={p.rule} />
                      ))}
                    </g>
                  </svg>
                  <div className="mtr" dir="rtl">
                    {segments.map((s) => {
                      const style = { width: pct(s.x1 - s.x0), marginRight: pct(edge - s.x1) };
                      const slot = { "data-l": s.x0 / width, "data-w": (s.x1 - s.x0) / width };
                      edge = s.x0;
                      return s.text === null ? (
                        <span key={s.x1} className="seg cont" style={style} {...slot} aria-hidden="true">
                          …
                        </span>
                      ) : (
                        <span key={s.x1} className="seg" style={style} {...slot} lang={LANG} dir="ltr">
                          <span>{wholeWords(s.text)}</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            <p className="sr-only" lang="ar">
              {ayahs
                .map((a) => `${a.words.filter((w) => w.page === page).map((w) => w.text).join(" ")} (${a.ayah})`)
                .join(" ")}
            </p>
          </section>
        );
      })}
    </div>
  );
}

/** Left and right edge of the surahs' ink over all their pages. */
function surahInk(sections: PageSection[]): [number, number] {
  const layouts = sections.map((s) => s.surah.layout);
  return [Math.min(...layouts.map((l) => l.left)), Math.max(...layouts.map((l) => l.left + l.width))];
}

/** Left and right edge of the ink printed on `page`. */
function pageInk(page: number, sections: PageSection[]): [number, number] {
  let x0 = Infinity;
  let x1 = -Infinity;
  for (const { surah, ayahs } of sections) {
    const { left, basmalah } = surah.layout;
    const glyphs = ayahs.flatMap((a) => [...a.words, a.mark]);
    if (basmalah) glyphs.push(basmalah);
    for (const g of glyphs) {
      if (g.page !== page) continue;
      x0 = Math.min(x0, left + g.x0);
      x1 = Math.max(x1, left + g.x1);
    }
  }
  return x0 < x1 ? [x0, x1] : surahInk(sections);
}

/** Median ayah-end ornament width on `page` (or of any loaded ayah, if none ends there). */
function markWidth(page: number, sections: PageSection[]): number {
  const marks = sections.flatMap((s) => s.ayahs.map((a) => a.mark));
  const here = marks.filter((m) => m.page === page);
  const w = (here.length ? here : marks).map((m) => m.x1 - m.x0).sort((a, b) => a - b);
  return w[Math.floor(w.length / 2)] ?? REF_MARK;
}

/** The surah's printed lines on `page`, in order, with their glyphs and phrase segments. */
function linesOf(page: number, ayahs: AyahData[], basmalah: Glyph | null): Line[] {
  const lines = new Map<number, Line>();
  const lineAt = (n: number) => {
    let l = lines.get(n);
    if (!l) lines.set(n, (l = { n, glyphs: [], segments: [] }));
    return l;
  };
  if (basmalah) lineAt(basmalah.line).glyphs.push(basmalah);
  for (const a of ayahs) {
    for (const g of [...a.words, a.mark]) if (g.page === page) lineAt(g.line).glyphs.push(g);
    for (const p of a.phrases) {
      const words = a.words.slice(p.from - 1, p.to);
      const keys = [...new Set(words.map((w) => `${w.page}:${w.line}`))];
      keys.forEach((key, i) => {
        const part = words.filter((w) => `${w.page}:${w.line}` === key);
        if (part[0].page !== page) return;
        lineAt(part[0].line).segments.push({
          x0: Math.min(...part.map((w) => w.x0)),
          x1: Math.max(...part.map((w) => w.x1)),
          text: p.parts?.[LANG]?.[i] ?? (i === 0 ? p.text[LANG] : null),
        });
      });
    }
  }
  return [...lines.values()].sort((a, b) => a.n - b.n);
}
