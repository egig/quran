// Build per-ayah data from authored content + png.quran.ws word artwork.
//
//   node scripts/build-data.ts            build every ayah in content/*.json
//   node scripts/build-data.ts 1          build surah 1 only
//
// For each ayah we fetch the SVG once (cached in cache/svg), laid out as a
// single line (layout=fit with an extreme aspect), so every word shares the
// printed baseline. Each word group (data-word-key) is flattened into line
// coordinates and stored with its horizontal extent. The page then draws any
// contiguous run of words with one viewBox. The artwork is only moved, never
// scaled or restyled.

import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { DOMParser, type Element } from "@xmldom/xmldom";
import svgpath from "svgpath";
import { svgPathBbox } from "svg-path-bbox";
import type {
  AyahData,
  AyahSource,
  Glyph,
  GlyphPath,
  LocalizedText,
  Phrase,
  RootIndex,
  SurahIndex,
  SurahSource,
  Word,
} from "../src/types.ts";

const API = "https://png.quran.ws/api/v1/image";
const RENDERER = 3; // pinned renderer: URL output is immutable
const CONTENT_DIR = "content";
const CACHE_DIR = "cache/svg";
const OUT_DIR = "public/data";
const LANGS = ["id"];
const PRECISION = 2;
/**
 * Shared vertical band for every ayah, in artwork units. y = 0 is the centre
 * of the ayah-end ornament, which sits at the same height relative to the
 * printed baseline in every ayah, so all ayahs line up when they flow together.
 */
const BAND = { top: -18, bottom: 13 };

async function fetchAyahSvg(surah: number, ayah: number): Promise<string> {
  const file = join(CACHE_DIR, `${surah}_${ayah}.svg`);
  if (existsSync(file)) return readFile(file, "utf8");
  const url =
    `${API}/${surah}/${ayah}.svg?layout=fit&aspect=400:1&padding=0&justify=0&basmalah=0&v=${RENDERER}`;
  const res = await fetch(url);
  const body = await res.text();
  if (!res.ok) throw new Error(`${url} -> ${res.status}: ${body.slice(0, 200)}`);
  if (!body.trimStart().startsWith("<svg")) throw new Error(`${url} did not return SVG`);
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(file, body);
  return body;
}

/** Transform list from the root down to (and including) `el`. */
function transformChain(el: Element): string {
  const parts: string[] = [];
  let node: Element | null = el;
  while (node && node.nodeType === 1) {
    const t = node.getAttribute("transform");
    if (t) parts.unshift(t);
    node = node.parentNode as Element | null;
  }
  return parts.join(" ");
}

function elementsOf(root: Element): Element[] {
  const out: Element[] = [];
  const walk = (el: Element) => {
    for (let c = el.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 1) {
        out.push(c as Element);
        walk(c as Element);
      }
    }
  };
  walk(root);
  return out;
}

type MeasuredGlyph = Glyph & { y0: number; y1: number };

/** Flatten every path under `group` into root coordinates. */
function toGlyph(group: Element, key: string): MeasuredGlyph {
  const paths: GlyphPath[] = [];
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const el of elementsOf(group)) {
    if (el.tagName === "g") continue;
    if (el.tagName !== "path") throw new Error(`${key}: unexpected <${el.tagName}>`);
    const d = el.getAttribute("d");
    if (!d) continue;
    const flat = svgpath(d).transform(transformChain(el)).round(PRECISION).toString();
    const [minX, minY, maxX, maxY] = svgPathBbox(flat);
    x0 = Math.min(x0, minX);
    x1 = Math.max(x1, maxX);
    y0 = Math.min(y0, minY);
    y1 = Math.max(y1, maxY);
    const p: GlyphPath = { d: flat };
    if (el.getAttribute("fill-rule") === "evenodd") p.rule = "evenodd";
    paths.push(p);
  }
  if (!paths.length) throw new Error(`${key}: no paths`);
  return { x0: round(x0), x1: round(x1), y0, y1, paths };
}

/** Move a glyph up by `dy` and drop the measuring fields. */
function shiftGlyph(g: MeasuredGlyph, dy: number, key: string): Glyph {
  const top = g.y0 - dy;
  const bottom = g.y1 - dy;
  if (top < BAND.top || bottom > BAND.bottom)
    throw new Error(
      `${key}: glyph spans y ${top.toFixed(2)}..${bottom.toFixed(2)}, outside band ${BAND.top}..${BAND.bottom}; widen BAND`,
    );
  return {
    x0: g.x0,
    x1: g.x1,
    paths: g.paths.map((p) => ({ ...p, d: svgpath(p.d).translate(0, -dy).round(PRECISION).toString() })),
  };
}

function round(n: number): number {
  const f = 10 ** PRECISION;
  return Math.round(n * f) / f;
}

function parseArtwork(svg: string, key: string) {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = doc.documentElement;
  if (!root || root.tagName !== "svg") throw new Error(`${key}: not an SVG document`);
  const groups = Array.from(root.getElementsByTagName("g"));
  const measured = groups
    .filter((g) => g.getAttribute("class") === "word")
    .map((g) => {
      const wk = g.getAttribute("data-word-key") ?? "";
      const [s, a, n] = wk.split(":").map(Number);
      if (`${s}:${a}` !== key || !n) throw new Error(`${key}: unexpected word key "${wk}"`);
      return { n, text: g.getAttribute("data-rasm-uthmani") ?? "", glyph: toGlyph(g, wk) };
    })
    .sort((a, b) => a.n - b.n);

  const markGroup = groups.find(
    (g) => g.getAttribute("class") === "ayah-mark" && g.getAttribute("data-ayah-key") === key,
  );
  if (!markGroup) throw new Error(`${key}: ayah mark not found`);
  const rawMark = toGlyph(markGroup, `${key}:mark`);
  const centre = (rawMark.y0 + rawMark.y1) / 2;
  const mark = shiftGlyph(rawMark, centre, `${key}:mark`);
  const words: Word[] = measured.map(({ n, text, glyph }) => ({
    n,
    text,
    ...shiftGlyph(glyph, centre, `${key}:${n}`),
  }));

  // Single-line check: reading order runs right to left without wrapping.
  words.forEach((w, i) => {
    if (w.n !== i + 1) throw new Error(`${key}: word numbers not contiguous at ${w.n}`);
    if (i > 0 && w.x1 > words[i - 1].x0 + 0.5)
      throw new Error(`${key}: word ${w.n} not left of word ${w.n - 1}; line wrapped?`);
  });
  if (mark.x1 > words[words.length - 1].x0 + 0.5) throw new Error(`${key}: mark not after last word`);

  return { words, mark };
}

function validatePhrases(key: string, src: AyahSource, wordCount: number): Phrase[] {
  let next = 1;
  const phrases = src.phrases.map((p, i) => {
    const [from, to] = p.words;
    if (from !== next || to < from)
      throw new Error(`${key}: phrase ${i + 1} words [${from}, ${to}], expected to start at ${next}`);
    next = to + 1;
    const text: LocalizedText = {};
    for (const lang of LANGS) {
      const t = p[lang];
      if (typeof t !== "string" || !t.trim()) throw new Error(`${key}: phrase ${i + 1} missing "${lang}"`);
      text[lang] = t.trim();
    }
    return { from, to, text };
  });
  if (next !== wordCount + 1)
    throw new Error(`${key}: phrases cover words 1-${next - 1}, ayah has ${wordCount} words`);
  for (const lang of LANGS)
    if (!src.full?.[lang]?.trim()) throw new Error(`${key}: full translation missing "${lang}"`);
  return phrases;
}

async function buildSurah(file: string): Promise<RootIndex["surahs"][number]> {
  const src = JSON.parse(await readFile(join(CONTENT_DIR, file), "utf8")) as SurahSource;
  const outDir = join(OUT_DIR, String(src.surah));
  await mkdir(outDir, { recursive: true });
  const built: number[] = [];

  for (const [ayahStr, ayahSrc] of Object.entries(src.ayahs)) {
    const ayah = Number(ayahStr);
    const key = `${src.surah}:${ayah}`;
    const art = parseArtwork(await fetchAyahSvg(src.surah, ayah), key);
    const data: AyahData = {
      version: 1,
      key,
      surah: src.surah,
      ayah,
      surahName: src.name,
      line: { ...BAND },
      words: art.words,
      mark: art.mark,
      phrases: validatePhrases(key, ayahSrc, art.words.length),
      full: ayahSrc.full,
      source: ayahSrc.source,
      reviewed: ayahSrc.reviewed === true,
    };
    await writeFile(join(outDir, `${ayah}.json`), JSON.stringify(data));
    built.push(ayah);
    console.log(`${key}  ${art.words.length} words, ${data.phrases.length} phrases${data.reviewed ? "" : "  [draft]"}`);
  }

  built.sort((a, b) => a - b);
  const index: SurahIndex = { version: 1, surah: src.surah, name: src.name, ayahs: built };
  await writeFile(join(outDir, "index.json"), JSON.stringify(index, null, 2));
  return { surah: src.surah, name: src.name, ayahs: built.length };
}

async function main() {
  const only = process.argv[2];
  const files = (await readdir(CONTENT_DIR))
    .filter((f) => /^\d+\.json$/.test(f))
    .filter((f) => !only || f === `${only}.json`)
    .sort((a, b) => parseInt(a) - parseInt(b));
  if (!files.length) throw new Error("no content files found");

  const surahs = [];
  for (const f of files) surahs.push(await buildSurah(f));

  if (!only) {
    const root: RootIndex = { version: 1, surahs };
    await writeFile(join(OUT_DIR, "index.json"), JSON.stringify(root, null, 2));
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
