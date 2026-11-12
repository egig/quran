import { Fragment } from "react";
import type { AyahData, Glyph, MushafLayout } from "../types.ts";

const LANG = "id";

interface Segment {
  x0: number;
  x1: number;
  /** null: continuation of a phrase whose translation sits on an earlier line. */
  text: string | null;
}

interface Line {
  page: number;
  n: number;
  glyphs: Glyph[];
  segments: Segment[];
}

/**
 * Redraws the printed Madinah mushaf pages line by line. Every word keeps its
 * printed position; the whole page scales with its container. Each phrase's
 * translation sits under its words. A phrase that runs onto the next printed
 * line (or page) shows its translation under the first part and "…" under
 * the rest. Each page ends with its printed page number.
 */
export function MushafPage({
  layout,
  ayahs,
  basmalah,
}: {
  layout: MushafLayout;
  ayahs: AyahData[];
  /** Draw the surah's opening basmalah line, if it has one. */
  basmalah: boolean;
}) {
  const lines = new Map<string, Line>();
  const lineAt = (page: number, n: number) => {
    const key = `${page}:${n}`;
    let l = lines.get(key);
    if (!l) lines.set(key, (l = { page, n, glyphs: [], segments: [] }));
    return l;
  };

  if (basmalah && layout.basmalah) lineAt(layout.basmalah.page, layout.basmalah.line).glyphs.push(layout.basmalah);
  for (const a of ayahs) {
    for (const g of [...a.words, a.mark]) lineAt(g.page, g.line).glyphs.push(g);
    for (const p of a.phrases) {
      const words = a.words.slice(p.from - 1, p.to);
      let first = true;
      for (const key of [...new Set(words.map((w) => `${w.page}:${w.line}`))]) {
        const part = words.filter((w) => `${w.page}:${w.line}` === key);
        lineAt(part[0].page, part[0].line).segments.push({
          x0: Math.min(...part.map((w) => w.x0)),
          x1: Math.max(...part.map((w) => w.x1)),
          text: first ? p.text[LANG] : null,
        });
        first = false;
      }
    }
  }

  const { width, band } = layout;
  const pct = (v: number) => `${(v / width) * 100}%`;
  const sorted = [...lines.values()].sort((a, b) => a.page - b.page || a.n - b.n);
  const pages = [...new Set(sorted.map((l) => l.page))];

  return (
    <div className="mushaf-page" lang="ar">
      {pages.map((page) => (
        <Fragment key={page}>
          {sorted
            .filter((l) => l.page === page)
            .map((line) => {
              let edge = width; // left edge of the previous segment; RTL starts at the right
              // Neighbouring phrases split the space between them at the midpoint:
              // printed words can overlap (a tail running under the next word), and
              // gaps give narrow phrases more room for their translation.
              const segments = [...line.segments]
                .sort((a, b) => b.x1 - a.x1)
                .map((s, i, all) => ({
                  ...s,
                  x1: i > 0 ? (all[i - 1].x0 + s.x1) / 2 : s.x1,
                  x0: i < all.length - 1 ? (s.x0 + all[i + 1].x1) / 2 : s.x0,
                }));
              return (
                <div className="mline" key={line.n}>
                  <svg
                    viewBox={`0 ${band.top} ${width} ${band.bottom - band.top}`}
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    {line.glyphs.flatMap((g) => g.paths).map((p, i) => (
                      <path key={i} d={p.d} fillRule={p.rule} />
                    ))}
                  </svg>
                  <div className="mtr" dir="rtl">
                    {segments.map((s) => {
                      const style = { width: pct(s.x1 - s.x0), marginRight: pct(edge - s.x1) };
                      edge = s.x0;
                      return s.text === null ? (
                        <span key={s.x1} className="seg cont" style={style} aria-hidden="true">
                          …
                        </span>
                      ) : (
                        <span key={s.x1} className="seg" style={style} lang={LANG} dir="ltr">
                          {s.text}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          <p className="page-no" lang="id">
            <span className="sr-only">Halaman </span>
            {page}
          </p>
        </Fragment>
      ))}
      <p className="sr-only" lang="ar">
        {ayahs.map((a) => `${a.words.map((w) => w.text).join(" ")} (${a.ayah})`).join(" ")}
      </p>
    </div>
  );
}
