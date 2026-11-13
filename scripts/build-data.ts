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
 * Juz 27-29 (pages 522-581, with all of surah 51 from page 520) need no
 * override: with the list's spans every page already holds 15 lines.
 */
const PAGE_SPAN_OVERRIDES: Record<number, [number, number]> = {
  80: [585, 586],
  84: [589, 590],
  88: [592, 593],
  90: [594, 595],
  94: [596, 597],
  96: [597, 598],
};

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

async function writeRootIndex() {
  const surahs = (await allSurahs()).map((s) => {
    const built = join(OUT_DIR, String(s.number), "index.json");
    return { s, built: existsSync(built) ? built : null };
  });
  const root: RootIndex = {
    version: 4,
    surahs: await Promise.all(
      surahs.map(async ({ s, built }) => {
        // A built surah keeps the hand-authored name from content/, and its
        // page span from the artwork (see PAGE_SPAN_OVERRIDES).
        const index = built ? (JSON.parse(await readFile(built, "utf8")) as SurahIndex) : null;
        const name = index ? index.name : { ar: s.name_ar, latin: latinName(s.name_latin) };
        const pages: [number, number] = index
          ? [index.layout.pages[0].page, index.layout.pages[index.layout.pages.length - 1].page]
          : s.pages;
        if (s.place !== "makkah" && s.place !== "madinah") throw new Error(`surah ${s.number}: place "${s.place}"`);
        return { surah: s.number, name, ayahs: s.ayahs, place: s.place, pages, available: !!built };
      }),
    ),
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
function parseChunk(svg: string, surah: number): (RawGlyph & { stackBreak: boolean })[] {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = doc.documentElement;
  if (!root || root.tagName !== "svg") throw new Error(`${surah}: not an SVG document`);

  const glyphs: (RawGlyph & { stackBreak: boolean })[] = [];
  let lastStack: string | null = null;
  const stackBreak = (g: Element) => {
    let m: Element | null = g;
    while (m && m.nodeType === 1 && !isPageMatrix(m)) m = m.parentNode as Element | null;
    const parts: string[] = [];
    for (let n = m?.parentNode as Element | null; n && n.nodeType === 1; n = n.parentNode as Element | null)
      parts.unshift(n.getAttribute("transform") ?? "");
    const stack = parts.join(" ");
    const isBreak = lastStack !== null && stack !== lastStack;
    lastStack = stack;
    return isBreak;
  };
  for (const g of Array.from(root.getElementsByTagName("g"))) {
    const cls = g.getAttribute("class");
    if (cls === "word") {
      const key = g.getAttribute("data-word-key") ?? "";
      const [s, a, n] = key.split(":").map(Number);
      if (s !== surah || !a || !n) throw new Error(`unexpected word key "${key}"`);
      const text = g.getAttribute("data-rasm-uthmani") ?? "";
      glyphs.push({ key, ayah: a, n, text, stackBreak: stackBreak(g), ...flatten(g, key) });
    } else if (cls === "ayah-mark") {
      const key = g.getAttribute("data-ayah-key") ?? "";
      const [s, a] = key.split(":").map(Number);
      if (s !== surah || !a) throw new Error(`unexpected ayah key "${key}"`);
      glyphs.push({ key: `${key}:mark`, ayah: a, n: 0, text: "", stackBreak: stackBreak(g), ...flatten(g, key) });
    } else if (cls === "basmalah") {
      if (glyphs.length) throw new Error(`${surah}: basmalah after the first glyph`);
      const key = `${surah}:basmalah`;
      glyphs.push({ key, ayah: 0, n: 0, text: "", stackBreak: stackBreak(g), ...flatten(g, key) });
    }
  }
  return glyphs;
}

const midY = (g: RawGlyph) => (g.y0 + g.y1) / 2;

function parsePlate(svgs: string[], surah: number, pageCount: number) {
  const chunks = svgs.map((svg) => parseChunk(svg, surah));
  const glyphs = chunks.flat();

  // Pages: reading order runs down a page, so a glyph that sits clearly
  // higher than the previous one starts the next page. Inside a chunk this
  // must agree with the API's own page stacking.
  const pageIdx: number[] = [];
  glyphs.forEach((g, i) => {
    const prev = glyphs[i - 1];
    const jump = !!prev && midY(g) < midY(prev) - PAGE_JUMP;
    const firstOfChunk = chunks.some((c) => c[0] === g);
    if (!firstOfChunk && jump !== g.stackBreak)
      throw new Error(
        `${g.key}: page break detection disagrees with the artwork ` +
          `(y ${round(midY(g))} after ${prev?.key} at y ${prev ? round(midY(prev)) : "-"}); ` +
          `the source artwork may be misplaced, check it at png.quran.ws`,
      );
    pageIdx.push(prev ? pageIdx[i - 1] + (jump ? 1 : 0) : 0);
  });
  const pageTotal = pageIdx[pageIdx.length - 1] + 1;
  if (pageTotal !== pageCount)
    throw new Error(`${surah}: found ${pageTotal} pages in the artwork, expected ${pageCount}`);

  // Lines, per page: within a printed line x decreases (RTL), though
  // neighbouring words may overlap; a glyph entirely right of the previous
  // one starts a new line.
  const lineOf: number[] = [];
  glyphs.forEach((g, i) => {
    const prev = glyphs[i - 1];
    if (!prev || pageIdx[i - 1] !== pageIdx[i]) lineOf.push(0);
    else lineOf.push(lineOf[i - 1] + (g.x0 > prev.x1 ? 1 : 0));
  });

  const pages = Array.from({ length: pageTotal }, (_, p) => {
    const idx = glyphs.flatMap((_, i) => (pageIdx[i] === p ? [i] : []));
    const lines = lineOf[idx[idx.length - 1]] + 1;
    // Sanity: every glyph's vertical centre sits near its line's median.
    for (let l = 0; l < lines; l++) {
      const own = idx.filter((i) => lineOf[i] === l);
      const ys = own.map((i) => (glyphs[i].y0 + glyphs[i].y1) / 2).sort((a, b) => a - b);
      const median = ys[Math.floor(ys.length / 2)];
      for (const i of own)
        if (Math.abs((glyphs[i].y0 + glyphs[i].y1) / 2 - median) > 12)
          throw new Error(`${glyphs[i].key}: off its detected line ${l + 1}; line detection failed`);
    }
    // Line centres from the ayah-end ornaments (same glyph, same height on every line).
    const centres: (number | null)[] = Array.from({ length: lines }, () => null);
    for (const i of idx) if (glyphs[i].ayah && glyphs[i].n === 0) centres[lineOf[i]] = (glyphs[i].y0 + glyphs[i].y1) / 2;
    const known = centres.flatMap((c, i) => (c === null ? [] : [[i, c] as const]));
    return { lines, centres, known };
  });

  // Pitch for pages with fewer than two ornaments: borrow one from another
  // page. Full pages share the same line pitch.
  const fallbackPitch = pages.map((p) => pitchOf(p.known)).find((v) => v !== null) ?? null;
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
  const plate = parsePlate(await surahSvgs(src.surah, meta.ayahs), src.surah, lastPage - firstPage + 1);
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
