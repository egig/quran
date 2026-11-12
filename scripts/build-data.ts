// Build per-ayah data from authored content + png.quran.ws mushaf artwork.
//
//   node scripts/build-data.ts            build every surah in content/*.json
//   node scripts/build-data.ts 1          build surah 1 only
//
// For each surah we fetch the whole surah once as SVG in the mushaf layout
// (cached in cache/), which reproduces the Madinah printed plate: every word
// keeps its printed x and its printed line. Each word group (data-word-key)
// and ayah-end ornament is flattened, assigned to its printed line, and
// stored with y relative to that line's centre. The page redraws the plate
// line by line with translations in between. The artwork is only moved
// (vertically, per line), never scaled or restyled.

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
  MushafLayout,
  Phrase,
  RootIndex,
  SurahIndex,
  SurahSource,
  Word,
} from "../src/types.ts";

const API = "https://png.quran.ws/api/v1";
const RENDERER = 3; // pinned renderer: URL output is immutable
const CONTENT_DIR = "content";
const CACHE_DIR = "cache";
const OUT_DIR = "public/data";
const LANGS = ["id"];
const PRECISION = 2;
/** Extra room above/below the tallest ink, in artwork units. */
const BAND_PAD = 1;

interface SurahMeta {
  number: number;
  ayahs: number;
  pages: [number, number];
}

async function cached(file: string, url: string, check: (body: string) => boolean): Promise<string> {
  const path = join(CACHE_DIR, file);
  if (existsSync(path)) return readFile(path, "utf8");
  const res = await fetch(url);
  const body = await res.text();
  if (!res.ok) throw new Error(`${url} -> ${res.status}: ${body.slice(0, 200)}`);
  if (!check(body)) throw new Error(`${url} returned unexpected content`);
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(path, body);
  return body;
}

async function surahMeta(surah: number): Promise<SurahMeta> {
  const body = await cached(`surah_${surah}.json`, `${API}/surahs/${surah}`, (b) => b.trimStart().startsWith("{"));
  return JSON.parse(body) as SurahMeta;
}

function surahSvg(surah: number, last: number): Promise<string> {
  const url = `${API}/image/${surah}/1-${last}.svg?layout=mushaf&padding=0&v=${RENDERER}`;
  return cached(`mushaf_${surah}.svg`, url, (b) => b.trimStart().startsWith("<svg"));
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

const round = (n: number) => Math.round(n * 10 ** PRECISION) / 10 ** PRECISION;

/** A glyph flattened into page coordinates, before line assignment. */
interface RawGlyph {
  key: string;
  ayah: number;
  /** Word number, or 0 for the ayah-end ornament. */
  n: number;
  text: string;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  paths: GlyphPath[];
}

function flatten(group: Element, key: string): Omit<RawGlyph, "key" | "ayah" | "n" | "text"> {
  const paths: GlyphPath[] = [];
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const el of elementsOf(group)) {
    if (el.tagName === "g") continue;
    if (el.tagName !== "path") throw new Error(`${key}: unexpected <${el.tagName}>`);
    const d = el.getAttribute("d");
    if (!d) continue;
    const flat = svgpath(d).transform(transformChain(el)).round(PRECISION).toString();
    const [a, b, c, e] = svgPathBbox(flat);
    x0 = Math.min(x0, a);
    y0 = Math.min(y0, b);
    x1 = Math.max(x1, c);
    y1 = Math.max(y1, e);
    const p: GlyphPath = { d: flat };
    if (el.getAttribute("fill-rule") === "evenodd") p.rule = "evenodd";
    paths.push(p);
  }
  if (!paths.length) throw new Error(`${key}: no paths`);
  return { x0, x1, y0, y1, paths };
}

function parsePlate(svg: string, surah: number) {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = doc.documentElement;
  if (!root || root.tagName !== "svg") throw new Error(`${surah}: not an SVG document`);
  const viewBox = (root.getAttribute("viewBox") ?? "").split(/\s+/).map(Number);
  if (viewBox.length !== 4 || viewBox.some(Number.isNaN)) throw new Error(`${surah}: bad viewBox`);
  const width = viewBox[2];

  // Collect glyphs in document order, which is reading order.
  const glyphs: RawGlyph[] = [];
  for (const g of Array.from(root.getElementsByTagName("g"))) {
    const cls = g.getAttribute("class");
    if (cls === "word") {
      const key = g.getAttribute("data-word-key") ?? "";
      const [s, a, n] = key.split(":").map(Number);
      if (s !== surah || !a || !n) throw new Error(`unexpected word key "${key}"`);
      glyphs.push({ key, ayah: a, n, text: g.getAttribute("data-rasm-uthmani") ?? "", ...flatten(g, key) });
    } else if (cls === "ayah-mark") {
      const key = g.getAttribute("data-ayah-key") ?? "";
      const [s, a] = key.split(":").map(Number);
      if (s !== surah || !a) throw new Error(`unexpected ayah key "${key}"`);
      glyphs.push({ key: `${key}:mark`, ayah: a, n: 0, text: "", ...flatten(g, key) });
    }
  }

  // Lines: within a printed line x decreases (RTL), though neighbouring words
  // may overlap; a glyph entirely right of the previous one starts a new line.
  const lineOf: number[] = [];
  let line = 0;
  glyphs.forEach((g, i) => {
    if (i > 0 && g.x0 > glyphs[i - 1].x1) line++;
    lineOf.push(line);
  });
  const lineCount = line + 1;
  // Sanity: every glyph's vertical centre sits near its line's median.
  for (let l = 0; l < lineCount; l++) {
    const ys = glyphs.filter((_, i) => lineOf[i] === l).map((g) => (g.y0 + g.y1) / 2);
    const median = [...ys].sort((a, b) => a - b)[Math.floor(ys.length / 2)];
    glyphs.forEach((g, i) => {
      if (lineOf[i] === l && Math.abs((g.y0 + g.y1) / 2 - median) > 12)
        throw new Error(`${g.key}: off its detected line ${l + 1}; line detection failed`);
    });
  }

  // Line centres from the ayah-end ornaments (same glyph, same height on every line).
  const centres: (number | null)[] = Array.from({ length: lineCount }, () => null);
  glyphs.forEach((g, i) => {
    if (g.n === 0) centres[lineOf[i]] = (g.y0 + g.y1) / 2;
  });
  const known = centres.flatMap((c, i) => (c === null ? [] : [[i, c] as const]));
  if (!known.length) throw new Error(`${surah}: no ayah marks to find line positions`);
  const pitch =
    known.length > 1 ? (known[known.length - 1][1] - known[0][1]) / (known[known.length - 1][0] - known[0][0]) : 0;
  const centre = (i: number) => {
    if (centres[i] !== null) return centres[i];
    // Interpolate from the nearest line with an ornament.
    const [j, c] = known.reduce((best, k) => (Math.abs(k[0] - i) < Math.abs(best[0] - i) ? k : best));
    if (!pitch) throw new Error(`${surah}: cannot place line ${i + 1} without line pitch`);
    return c + (i - j) * pitch;
  };

  let top = 0;
  let bottom = 0;
  const placed = glyphs.map((g, i) => {
    const dy = centre(lineOf[i]);
    top = Math.min(top, g.y0 - dy);
    bottom = Math.max(bottom, g.y1 - dy);
    return {
      ...g,
      line: lineOf[i] + 1,
      paths: g.paths.map((p) => ({ ...p, d: svgpath(p.d).translate(0, -dy).round(PRECISION).toString() })),
    };
  });

  const layout: Omit<MushafLayout, "page"> = {
    width: round(width),
    lines: lineCount,
    band: { top: Math.floor(top - BAND_PAD), bottom: Math.ceil(bottom + BAND_PAD) },
  };
  return { layout, glyphs: placed };
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
  const meta = await surahMeta(src.surah);
  if (meta.pages[0] !== meta.pages[1])
    throw new Error(`surah ${src.surah} spans pages ${meta.pages.join("-")}; multi-page layout not supported yet`);

  const plate = parsePlate(await surahSvg(src.surah, meta.ayahs), src.surah);
  const outDir = join(OUT_DIR, String(src.surah));
  await mkdir(outDir, { recursive: true });

  const toGlyph = (g: (typeof plate.glyphs)[number]): Glyph => ({
    line: g.line,
    x0: round(g.x0),
    x1: round(g.x1),
    paths: g.paths,
  });

  for (let ayah = 1; ayah <= meta.ayahs; ayah++) {
    const key = `${src.surah}:${ayah}`;
    const own = plate.glyphs.filter((g) => g.ayah === ayah);
    const words: Word[] = own.filter((g) => g.n > 0).map((g) => ({ n: g.n, text: g.text, ...toGlyph(g) }));
    words.forEach((w, i) => {
      if (w.n !== i + 1) throw new Error(`${key}: word numbers not contiguous at ${w.n}`);
    });
    const markRaw = own.find((g) => g.n === 0);
    if (!markRaw) throw new Error(`${key}: ayah mark not found`);

    const ayahSrc = src.ayahs[String(ayah)];
    const data: AyahData = {
      version: 2,
      key,
      surah: src.surah,
      ayah,
      surahName: src.name,
      words,
      mark: toGlyph(markRaw),
      phrases: ayahSrc ? validatePhrases(key, ayahSrc, words.length) : [],
      full: ayahSrc?.full ?? {},
      source: ayahSrc?.source ?? "",
      reviewed: ayahSrc?.reviewed === true,
    };
    await writeFile(join(outDir, `${ayah}.json`), JSON.stringify(data));
    const lines = [...new Set(words.map((w) => w.line))].join(",");
    console.log(
      `${key}  ${words.length} words, ${data.phrases.length} phrases, line ${lines}${ayahSrc ? (data.reviewed ? "" : "  [draft]") : "  [no translation]"}`,
    );
  }

  const index: SurahIndex = {
    version: 2,
    surah: src.surah,
    name: src.name,
    ayahs: Array.from({ length: meta.ayahs }, (_, i) => i + 1),
    layout: { page: meta.pages[0], ...plate.layout },
  };
  await writeFile(join(outDir, "index.json"), JSON.stringify(index, null, 2));
  return { surah: src.surah, name: src.name, ayahs: meta.ayahs };
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
    const root: RootIndex = { version: 2, surahs };
    await writeFile(join(OUT_DIR, "index.json"), JSON.stringify(root, null, 2));
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
