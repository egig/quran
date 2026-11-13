// Build per-ayah data from authored content + png.quran.ws mushaf artwork.
//
//   node scripts/build-data.ts            build every surah in content/*.json
//   node scripts/build-data.ts 1          build surah 1 only
//
// For each surah we fetch the whole surah once as SVG in the mushaf layout
// (cached in cache/), which reproduces the Madinah printed plate: every word
// keeps its printed x and its printed line. A surah that spans pages comes
// back with the pages stacked. Each word group (data-word-key), ayah-end
// ornament and the basmalah is flattened, assigned to its page and printed
// line, and stored with y relative to that line's centre. The page redraws the plate
// line by line with translations in between. The artwork is only moved
// (vertically, per line), never scaled or restyled.

import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { DOMParser, type Element } from "@xmldom/xmldom";
import svgpath from "svgpath";
import { svgPathBbox } from "svg-path-bbox";
import { VECTOR_PAGES, vectorArtwork } from "./vector-pages.ts";
import type {
  AyahData,
  AyahSource,
  Glyph,
  GlyphPath,
  JuzListEntry,
  LocalizedText,
  MushafLayout,
  Phrase,
  RootIndex,
  SurahListEntry,
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
/** Ayahs per API request; the API refuses very large ranges. */
const CHUNK = 10;
/** A glyph this much higher than the previous one starts a new page. */
const PAGE_JUMP = 20;
/**
 * Page spans where png.quran.ws's surah list disagrees with its own artwork.
 * The artwork is what we reproduce, so it wins, but only for surahs listed
 * here after checking; any other mismatch still stops the build.
 * Checked for Juz 30: with the artwork's breaks, every page 582-604 holds
 * exactly 15 printed lines (surah header + basmalah + text); with the list's,
 * pages would hold 14 or 16. In each case the last ayahs run onto the top of
 * the next page (e.g. 80:41-42 is line 1 of page 586, drawn with even-page
 * margins).
 * Surahs 7-77 (pages 151-581) need no override: with the
 * list's spans every page already holds 15 lines.
 */
const PAGE_SPAN_OVERRIDES: Record<number, [number, number]> = {
  80: [585, 586],
  84: [589, 590],
  88: [592, 593],
  90: [594, 595],
  94: [596, 597],
  96: [597, 598],
};

/**
 * First ayah of each juz (Ḥafṣ), as [surah, ayah]. Source: quran-meta 7.0.0,
 * HafsLists.JuzList (global ayah numbers, converted with the API's ayah
 * counts). Ayah boundaries only: page numbers come from the artwork.
 */
const JUZ_STARTS: [number, number][] = [
  [1, 1], [2, 142], [2, 253], [3, 93], [4, 24], [4, 148], [5, 82], [6, 111], [7, 88], [8, 41],
  [9, 93], [11, 6], [12, 53], [15, 1], [17, 1], [18, 75], [21, 1], [23, 1], [25, 21], [27, 56],
  [29, 46], [33, 31], [36, 28], [39, 32], [41, 47], [46, 1], [51, 31], [58, 1], [67, 1], [78, 1],
];

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

interface SurahListMeta extends SurahMeta {
  name_ar: string;
  name_latin: string;
  place: string;
}

async function allSurahs(): Promise<SurahListMeta[]> {
  const body = await cached("surahs.json", `${API}/surahs`, (b) => b.trimStart().startsWith("{"));
  const list = (JSON.parse(body) as { surahs: SurahListMeta[] }).surahs;
  if (list.length !== 114) throw new Error(`surah list has ${list.length} entries, expected 114`);
  return list;
}

/**
 * The API's Latin names use stand-in letters (ĥ for ḥ, ` for ʿain, ' for
 * hamza, á for alif maqṣūrah). Map them to the usual transliteration.
 */
function latinName(raw: string): string {
  const map: Record<string, string> = { ĥ: "ḥ", Ĥ: "Ḥ", ş: "ṣ", Ş: "Ṣ", ţ: "ṭ", Ţ: "Ṭ", đ: "ḍ", Đ: "Ḍ", "`": "ʿ" };
  return raw
    .replace(/-'/g, "-") // hamza opening a word after the article is not written
    .replace(/'/g, "ʾ")
    .replace(/a?á/g, "ā")
    .replace(/[ĥĤşŞţŢđĐ`]/g, (c) => map[c]);
}

/** Juz boundaries with their pages, read from the built surahs' artwork. */
function juzList(surahs: SurahListEntry[], built: (SurahIndex | null)[]): JuzListEntry[] {
  // The mushaf page an ayah starts on (first) or ends on (last), or null if
  // its surah is not built. An ayah can run over a page break.
  const pageOf = ([s, a]: [number, number], which: "first" | "last"): number | null => {
    const pages = built[s - 1]?.layout.pages.filter((p) => p.ayahs[0] <= a && a <= p.ayahs[1]);
    if (!pages) return null;
    if (!pages.length) throw new Error(`juz: ${s}:${a} is on no page of surah ${s}`);
    return (which === "first" ? pages[0] : pages[pages.length - 1]).page;
  };
  return JUZ_STARTS.map((start, i) => {
    const next = JUZ_STARTS[i + 1];
    const end: [number, number] = !next ? [114, surahs[113].ayahs] : next[1] > 1 ? [next[0], next[1] - 1] : [next[0] - 1, surahs[next[0] - 2].ayahs];
    if (start[1] > surahs[start[0] - 1].ayahs) throw new Error(`juz ${i + 1}: ${start.join(":")} does not exist`);
    const from = pageOf(start, "first");
    const to = pageOf(end, "last");
    const touched = surahs.slice(start[0] - 1, end[0]);
    return {
      juz: i + 1,
      start,
      end,
      pages: from !== null && to !== null ? [from, to] : null,
      available: touched.every((s) => s.available),
    };
  });
}

async function writeRootIndex() {
  const surahs = (await allSurahs()).map((s) => {
    const built = join(OUT_DIR, String(s.number), "index.json");
    return { s, built: existsSync(built) ? built : null };
  });
  const entries = await Promise.all(
      surahs.map(async ({ s, built }) => {
        // A built surah keeps the hand-authored name from content/, and its
        // page span from the artwork (see PAGE_SPAN_OVERRIDES).
        const index = built ? (JSON.parse(await readFile(built, "utf8")) as SurahIndex) : null;
        const name = index ? index.name : { ar: s.name_ar, latin: latinName(s.name_latin) };
        const pages: [number, number] = index
          ? [index.layout.pages[0].page, index.layout.pages[index.layout.pages.length - 1].page]
          : s.pages;
        if (s.place !== "makkah" && s.place !== "madinah") throw new Error(`surah ${s.number}: place "${s.place}"`);
        const entry: SurahListEntry = { surah: s.number, name, ayahs: s.ayahs, place: s.place, pages, available: !!built };
        return { entry, index };
      }),
  );
  const root: RootIndex = {
    version: 5,
    surahs: entries.map((e) => e.entry),
    juz: juzList(entries.map((e) => e.entry), entries.map((e) => e.index)),
  };
  await writeFile(join(OUT_DIR, "index.json"), JSON.stringify(root));
}

async function surahMeta(surah: number): Promise<SurahMeta> {
  const body = await cached(`surah_${surah}.json`, `${API}/surahs/${surah}`, (b) => b.trimStart().startsWith("{"));
  return JSON.parse(body) as SurahMeta;
}

/**
 * The surah as mushaf-layout SVG, in chunks of ayahs: the API refuses very
 * large ranges, and a chunk keeps each file a few pages at most.
 */
async function surahSvgs(surah: number, ayahs: number): Promise<string[]> {
  const out: string[] = [];
  for (let from = 1; from <= ayahs; from += CHUNK) {
    const to = Math.min(from + CHUNK - 1, ayahs);
    const url = `${API}/image/${surah}/${from}-${to}.svg?layout=mushaf&padding=0&v=${RENDERER}`;
    out.push(await cached(`mushaf_${surah}_${from}-${to}.svg`, url, (b) => b.trimStart().startsWith("<svg")));
  }
  return out;
}

const isPageMatrix = (el: Element) => (el.getAttribute("transform") ?? "").startsWith("matrix(");

/**
 * Transform list from the page-placement matrix down to (and including) `el`.
 * Everything above that matrix only crops the image and stacks pages, so the
 * result is in the coordinates of the printed page itself, the same for any
 * requested range.
 */
function pageTransform(el: Element, key: string): string {
  const parts: string[] = [];
  let node: Element | null = el;
  while (node && node.nodeType === 1) {
    const t = node.getAttribute("transform");
    if (t) parts.unshift(t);
    if (isPageMatrix(node)) return parts.join(" ");
    node = node.parentNode as Element | null;
  }
  throw new Error(`${key}: no page matrix above the glyph`);
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
  /** Ayah number, or 0 for the basmalah. */
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
    const flat = svgpath(d).transform(pageTransform(el, key)).round(PRECISION).toString();
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

/** Line pitch from known [line, centre] pairs, or null with fewer than two. */
function pitchOf(known: (readonly [number, number])[]): number | null {
  if (known.length < 2) return null;
  const [a, b] = [known[0], known[known.length - 1]];
  return (b[1] - a[1]) / (b[0] - a[0]);
}

/**
 * Glyphs of one chunk in reading order, in printed-page coordinates. Marks
 * where the chunk itself moves to a new page: each glyph sits under a
 * page-placement matrix whose parent stacks that page, so the transform chain
 * above the matrix changes exactly at a page break.
 */
type ChunkGlyph = RawGlyph & { stackBreak: boolean; matrix: string };

function parseChunk(svg: string, surah: number): ChunkGlyph[] {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = doc.documentElement;
  if (!root || root.tagName !== "svg") throw new Error(`${surah}: not an SVG document`);

  const glyphs: ChunkGlyph[] = [];
  let lastStack: string | null = null;
  // The page-placement matrix differs between odd and even pages (their
  // margins differ), so it changes at every page break, also between chunks.
  const placement = (g: Element) => {
    let m: Element | null = g;
    while (m && m.nodeType === 1 && !isPageMatrix(m)) m = m.parentNode as Element | null;
    const parts: string[] = [];
    for (let n = m?.parentNode as Element | null; n && n.nodeType === 1; n = n.parentNode as Element | null)
      parts.unshift(n.getAttribute("transform") ?? "");
    const stack = parts.join(" ");
    const stackBreak = lastStack !== null && stack !== lastStack;
    lastStack = stack;
    return { stackBreak, matrix: m?.getAttribute("transform") ?? "" };
  };
  for (const g of Array.from(root.getElementsByTagName("g"))) {
    const cls = g.getAttribute("class");
    if (cls === "word") {
      const key = g.getAttribute("data-word-key") ?? "";
      const [s, a, n] = key.split(":").map(Number);
      if (s !== surah || !a || !n) throw new Error(`unexpected word key "${key}"`);
      const text = g.getAttribute("data-rasm-uthmani") ?? "";
      glyphs.push({ key, ayah: a, n, text, ...placement(g), ...flatten(g, key) });
    } else if (cls === "ayah-mark") {
      const key = g.getAttribute("data-ayah-key") ?? "";
      const [s, a] = key.split(":").map(Number);
      if (s !== surah || !a) throw new Error(`unexpected ayah key "${key}"`);
      glyphs.push({ key: `${key}:mark`, ayah: a, n: 0, text: "", ...placement(g), ...flatten(g, key) });
    } else if (cls === "basmalah") {
      if (glyphs.length) throw new Error(`${surah}: basmalah after the first glyph`);
      const key = `${surah}:basmalah`;
      glyphs.push({ key, ayah: 0, n: 0, text: "", ...placement(g), ...flatten(g, key) });
    }
  }
  return glyphs;
}

const midY = (g: RawGlyph) => (g.y0 + g.y1) / 2;

async function parsePlate(svgs: string[], surah: number, firstPage: number, pageCount: number) {
  const chunks = svgs.map((svg) => parseChunk(svg, surah));
  const glyphs = chunks.flat();

  // Pages: the API stacks the pages of a chunk, and places odd and even
  // pages with different matrices, so a page starts where the stacking
  // changes (inside a chunk) or the placement matrix changes (between
  // chunks). Reading order runs down a page, so a glyph that sits clearly
  // higher than the previous one must also be the start of a page.
  const pageIdx: number[] = [];
  glyphs.forEach((g, i) => {
    const prev = glyphs[i - 1];
    const firstOfChunk = chunks.some((c) => c[0] === g);
    const brk = !!prev && (firstOfChunk ? g.matrix !== prev.matrix : g.stackBreak);
    if (brk && !firstOfChunk && g.matrix === prev.matrix)
      throw new Error(`${g.key}: new page in the stacking but the same page matrix`);
    pageIdx.push(prev ? pageIdx[i - 1] + (brk ? 1 : 0) : 0);
  });
  const pageTotal = pageIdx[pageIdx.length - 1] + 1;
  if (pageTotal !== pageCount)
    throw new Error(`${surah}: found ${pageTotal} pages in the artwork, expected ${pageCount}`);

  // Pages png.quran.ws draws broken take their artwork from the vector
  // edition it was cut from (scripts/vector-pages.ts); from here on they are
  // checked like any other page.
  for (let p = 0; p < pageTotal; p++) {
    if (!VECTOR_PAGES[firstPage + p]) continue;
    const idx = glyphs.flatMap((_, i) => (pageIdx[i] === p ? [i] : []));
    if (idx.some((i) => glyphs[i].ayah === 0)) throw new Error(`${surah}: vector page ${firstPage + p} holds the basmalah`);
    const m = glyphs[idx[0]].matrix.match(/^matrix\(([^)]+)\)$/)?.[1].split(/[\s,]+/).map(Number);
    if (!m || m.length !== 6 || idx.some((i) => glyphs[i].matrix !== glyphs[idx[0]].matrix))
      throw new Error(`${surah}: page ${firstPage + p} has no single page matrix`);
    const art = await vectorArtwork(
      firstPage + p,
      idx.map((i) => ({ key: glyphs[i].key, mark: glyphs[i].n === 0, paths: glyphs[i].paths })),
      m as [number, number, number, number, number, number],
      CACHE_DIR,
      (msg) => console.log(msg),
    );
    for (const i of idx) {
      const a = art.get(glyphs[i].key)!;
      Object.assign(glyphs[i], { paths: a.paths, x0: a.bb[0], y0: a.bb[1], x1: a.bb[2], y1: a.bb[3] });
    }
  }

  glyphs.forEach((g, i) => {
    const prev = glyphs[i - 1];
    if (!prev) return;
    const jump = midY(g) < midY(prev) - PAGE_JUMP;
    if (jump !== (pageIdx[i] !== pageIdx[i - 1]))
      throw new Error(
        `${g.key}: page break detection disagrees with the artwork ` +
          `(y ${round(midY(g))} after ${prev.key} at y ${round(midY(prev))}); ` +
          `the source artwork may be misplaced, check it at png.quran.ws`,
      );
  });

  // Lines, per page: within a printed line x decreases (RTL), though
  // neighbouring words may overlap; a glyph entirely right of the previous
  // one starts a new line. The basmalah is always a line of its own: on page
  // 305 (Maryam) its ink reaches past the right edge of 19:1's first word.
  const lineOf: number[] = [];
  glyphs.forEach((g, i) => {
    const prev = glyphs[i - 1];
    if (!prev || pageIdx[i - 1] !== pageIdx[i]) lineOf.push(0);
    else lineOf.push(lineOf[i - 1] + (g.x0 > prev.x1 || prev.ayah === 0 ? 1 : 0));
  });

  const pages = Array.from({ length: pageTotal }, (_, p) => {
    const idx = glyphs.flatMap((_, i) => (pageIdx[i] === p ? [i] : []));
    const lines = lineOf[idx[idx.length - 1]] + 1;
    // Sanity: every glyph's vertical centre sits near its line's median, or
    // at least inside the ink of the line's other glyphs. A word with no
    // ascender and a mark below has its centre low (14:25 حِينٍۭ, page 259,
    // 12 units under the median while sitting on the baseline); a glyph from
    // a neighbouring line falls outside its line's ink.
    for (let l = 0; l < lines; l++) {
      const own = idx.filter((i) => lineOf[i] === l);
      const ys = own.map((i) => (glyphs[i].y0 + glyphs[i].y1) / 2).sort((a, b) => a - b);
      const median = ys[Math.floor(ys.length / 2)];
      for (const i of own) {
        const mid = (glyphs[i].y0 + glyphs[i].y1) / 2;
        if (Math.abs(mid - median) <= 12) continue;
        const others = own.filter((j) => j !== i);
        const inside =
          others.length > 0 &&
          mid > Math.min(...others.map((j) => glyphs[j].y0)) &&
          mid < Math.max(...others.map((j) => glyphs[j].y1));
        if (!inside) throw new Error(`${glyphs[i].key}: off its detected line ${l + 1}; line detection failed`);
      }
    }
    // Line centres from the ayah-end ornaments (same glyph, same height on every line).
    const centres: (number | null)[] = Array.from({ length: lines }, () => null);
    for (const i of idx) if (glyphs[i].ayah && glyphs[i].n === 0) centres[lineOf[i]] = (glyphs[i].y0 + glyphs[i].y1) / 2;
    const known = centres.flatMap((c, i) => (c === null ? [] : [[i, c] as const]));
    return { lines, centres, known };
  });

  // Pitch for pages with fewer than two ornaments (page 48 holds only 2:282):
  // borrow the median pitch of the surah's other pages. Not the first page
  // found: the API draws pages 1-2 at another scale (page 2: 28.35 units
  // against ~35.8), which put page 48's first line 104 units too high.
  const pitches = pages.flatMap((p) => pitchOf(p.known) ?? []).sort((a, b) => a - b);
  const fallbackPitch = pitches.length ? pitches[Math.floor(pitches.length / 2)] : null;
  const centre = (p: number, line: number) => {
    const { centres, known } = pages[p];
    const c = centres[line];
    if (c !== null) return c;
    const pitch = pitchOf(known) ?? fallbackPitch;
    if (!known.length || pitch === null)
      throw new Error(`${surah}: cannot place line ${line + 1} of page ${p + 1} without line pitch`);
    // Interpolate from the nearest line with an ornament.
    const [j, k] = known.reduce((best, k) => (Math.abs(k[0] - line) < Math.abs(best[0] - line) ? k : best));
    return k + (line - j) * pitch;
  };

  // Crop to the ink of the whole surah, so x starts at 0 on every page.
  const left = Math.min(...glyphs.map((g) => g.x0));
  const width = Math.max(...glyphs.map((g) => g.x1)) - left;
  let top = 0;
  let bottom = 0;
  const placed = glyphs.map((g, i) => {
    const dy = centre(pageIdx[i], lineOf[i]);
    top = Math.min(top, g.y0 - dy);
    bottom = Math.max(bottom, g.y1 - dy);
    return {
      ...g,
      pageIdx: pageIdx[i],
      line: lineOf[i] + 1,
      x0: g.x0 - left,
      x1: g.x1 - left,
      paths: g.paths.map((p) => ({ ...p, d: svgpath(p.d).translate(-left, -dy).round(PRECISION).toString() })),
    };
  });

  // A page strictly inside the surah holds 15 printed lines of its text.
  // Fewer means the artwork piled words on each other (png.quran.ws draws
  // page 144, 6:125-130, that way in every renderer version) without any
  // glyph leaving its line, so the check above cannot see it.
  pages.forEach((p, i) => {
    if (i > 0 && i < pages.length - 1 && p.lines !== 15)
      throw new Error(
        `${surah}: mushaf page ${firstPage + i} has ${p.lines} printed lines, expected 15; ` +
          `the source artwork may be broken, check it at png.quran.ws`,
      );
  });

  return {
    left: round(left),
    width: round(width),
    band: { top: Math.floor(top - BAND_PAD), bottom: Math.ceil(bottom + BAND_PAD) },
    pageLines: pages.map((p) => p.lines),
    glyphs: placed,
  };
}

function validatePhrases(key: string, src: AyahSource, words: Word[]): Phrase[] {
  const wordCount = words.length;
  let next = 1;
  const phrases = src.phrases.map((p, i) => {
    const [from, to] = p.words;
    if (from !== next || to < from)
      throw new Error(`${key}: phrase ${i + 1} words [${from}, ${to}], expected to start at ${next}`);
    next = to + 1;
    const lines = new Set(words.slice(from - 1, to).map((w) => `${w.page}:${w.line}`)).size;
    const text: LocalizedText = {};
    const parts: Record<string, string[]> = {};
    for (const lang of LANGS) {
      const t = p[lang];
      if (Array.isArray(t) && t.every((s) => typeof s === "string")) {
        // One part per printed line the phrase spans, in reading order.
        const ps = (t as string[]).map((s) => s.trim());
        if (ps.length !== lines || ps.some((s) => !s))
          throw new Error(
            `${key}: phrase ${i + 1} "${lang}" has ${ps.length} parts, its words span ${lines} printed lines`,
          );
        parts[lang] = ps;
        text[lang] = ps.join(" ");
      } else if (typeof t === "string" && t.trim()) {
        text[lang] = t.trim();
      } else throw new Error(`${key}: phrase ${i + 1} missing "${lang}"`);
    }
    return Object.keys(parts).length ? { from, to, text, parts } : { from, to, text };
  });
  if (next !== wordCount + 1)
    throw new Error(`${key}: phrases cover words 1-${next - 1}, ayah has ${wordCount} words`);
  for (const lang of LANGS)
    if (!src.full?.[lang]?.trim()) throw new Error(`${key}: full translation missing "${lang}"`);
  return phrases;
}

async function buildSurah(file: string): Promise<void> {
  const src = JSON.parse(await readFile(join(CONTENT_DIR, file), "utf8")) as SurahSource;
  const meta = await surahMeta(src.surah);
  const [firstPage, lastPage] = PAGE_SPAN_OVERRIDES[src.surah] ?? meta.pages;
  const plate = await parsePlate(await surahSvgs(src.surah, meta.ayahs), src.surah, firstPage, lastPage - firstPage + 1);
  const outDir = join(OUT_DIR, String(src.surah));
  await mkdir(outDir, { recursive: true });

  const toGlyph = (g: (typeof plate.glyphs)[number]): Glyph => ({
    page: firstPage + g.pageIdx,
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
      version: 4,
      key,
      surah: src.surah,
      ayah,
      surahName: src.name,
      words,
      mark: toGlyph(markRaw),
      phrases: ayahSrc ? validatePhrases(key, ayahSrc, words) : [],
      full: ayahSrc?.full ?? {},
      source: ayahSrc?.source ?? "",
      reviewed: ayahSrc?.reviewed === true,
    };
    await writeFile(join(outDir, `${ayah}.json`), JSON.stringify(data));
    const lines = [...new Set(words.map((w) => `${w.page}/${w.line}`))].join(",");
    console.log(
      `${key}  ${words.length} words, ${data.phrases.length} phrases, page/line ${lines}${ayahSrc ? (data.reviewed ? "" : "  [draft]") : "  [no translation]"}`,
    );
  }

  const basmalah = plate.glyphs.find((g) => g.ayah === 0);
  const pageAyahs = (page: number): [number, number] => {
    const on = plate.glyphs.filter((g) => g.ayah > 0 && firstPage + g.pageIdx === page).map((g) => g.ayah);
    if (!on.length) throw new Error(`${src.surah}: no ayah on page ${page}`);
    return [Math.min(...on), Math.max(...on)];
  };
  const layout: MushafLayout = {
    left: plate.left,
    width: plate.width,
    band: plate.band,
    pages: plate.pageLines.map((lines, i) => ({ page: firstPage + i, lines, ayahs: pageAyahs(firstPage + i) })),
    basmalah: basmalah ? toGlyph(basmalah) : null,
  };
  const index: SurahIndex = {
    version: 4,
    surah: src.surah,
    name: src.name,
    ayahs: Array.from({ length: meta.ayahs }, (_, i) => i + 1),
    layout,
  };
  await writeFile(join(outDir, "index.json"), JSON.stringify(index, null, 2));
}

async function main() {
  const only = process.argv[2];
  const files = (await readdir(CONTENT_DIR))
    .filter((f) => /^\d+\.json$/.test(f))
    .filter((f) => !only || f === `${only}.json`)
    .sort((a, b) => parseInt(a) - parseInt(b));
  if (!files.length) throw new Error("no content files found");

  for (const f of files) await buildSurah(f);
  await writeRootIndex();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
