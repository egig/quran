// Artwork for mushaf pages that png.quran.ws draws broken, taken from the
// King Fahd Complex's own vector edition of the same mushaf (Muṣḥaf
// al-Madīnah, Ḥafṣ, 1441H, Illustrator files), which png.quran.ws itself
// was cut from: on a page it draws correctly, every piece of ink in the
// Illustrator file sits exactly on a piece of png.quran.ws's artwork once
// placed with png.quran.ws's page matrix.
//
// On a broken page png.quran.ws still has the right pieces for each word,
// each word moved as a whole to a wrong place. So every word is matched to
// the vector file by the offset that lines up most of its pieces, and each
// piece of the vector file is given to the word whose moved piece covers
// it. The artwork drawn is the vector file's, unmoved and unscaled.

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { svgPathBbox } from "svg-path-bbox";
import svgpath from "svgpath";
import type { GlyphPath } from "../src/types.ts";

/**
 * Pages taken from the vector edition instead of png.quran.ws, with the
 * SHA-256 of the Illustrator file. png.quran.ws draws both with words piled
 * on each other in every renderer version (v1-v5, checked 2026-11-13).
 * Files come from a mirror that republishes the Complex's files unchanged
 * (the Complex's site lists them as "coming soon" since its redesign); the
 * commit is pinned and the hash checked. Free use on websites per the
 * Complex's published terms.
 */
export const VECTOR_PAGES: Record<number, string> = {
  17: "888fc2750f60030aae17e02cf3e3e678bc174b73212f65b9360a847a508db444", // 2:106-112
  144: "65a6fbe18cadc50f3b8d29ae1e48d507219f8e2f066790bde4281d4e34a009ea", // 6:125-130
};
const MIRROR = "https://raw.githubusercontent.com/MushafAlMadinahVector/MushafAlMadinahVector/a6f52f8b05fa28cdffb637cbbab0ed30515bbeb2/quran-pages";
/** Layers of the Illustrator file holding the text and the ayah numbers. */
const TEXT = "Quran Text";
const NUMBERS = "Aya No.";

export type Box = [number, number, number, number];
interface Piece {
  /** One closed subpath, in png.quran.ws printed-page coordinates. */
  d: string;
  /** Index of the PDF path it belongs to (pieces of one path share a fill). */
  path: number;
  layer: string;
  bb: Box;
}

/** The Illustrator file of mushaf `page`, from the cache or the pinned mirror, checked against `sha256`. */
export async function vectorFile(page: number, sha256: string, cacheDir: string): Promise<Uint8Array> {
  const file = join(cacheDir, `kfgqpc_hafs1441_${page}.ai`);
  const name = `${String(page).padStart(3, "0")}___Hafs39__DM.ai`;
  let buf: Buffer;
  if (existsSync(file)) buf = await readFile(file);
  else {
    const res = await fetch(`${MIRROR}/${name}`);
    if (!res.ok) throw new Error(`${name} -> ${res.status}`);
    buf = Buffer.from(await res.arrayBuffer());
  }
  const sha = createHash("sha256").update(buf).digest("hex");
  if (sha !== sha256) throw new Error(`${name}: SHA-256 ${sha}, expected ${sha256}`);
  if (!existsSync(file)) {
    await mkdir(cacheDir, { recursive: true });
    await writeFile(file, buf);
  }
  return new Uint8Array(buf);
}

export type Matrix = [number, number, number, number, number, number];
const mul = (a: Matrix, b: Matrix): Matrix => [
  a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
];

/**
 * Every filled piece (closed subpath) of the file, with its layer and fill
 * rule, placed with `pageMatrix` (PDF coordinates to png.quran.ws's).
 */
export async function filledPieces(data: Uint8Array, pageMatrix: Matrix): Promise<(Piece & { rule: "evenodd" | "nonzero" })[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const OPS = pdfjs.OPS;
  const doc = await pdfjs.getDocument({ data, verbosity: 0 }).promise;
  const config = await doc.getOptionalContentConfig();
  const layerName = new Map<string, string>();
  for (const [id, group] of config) layerName.set(id, (group as { name: string }).name);
  const ops = await (await doc.getPage(1)).getOperatorList();

  let ctm: Matrix = [1, 0, 0, 1, 0, 0];
  const saved: Matrix[] = [];
  const layers: (string | null)[] = [];
  const out: (Piece & { rule: "evenodd" | "nonzero" })[] = [];
  let pathNo = 0;
  const f = (n: number) => n.toFixed(3);
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const args = ops.argsArray[i];
    if (fn === OPS.save || fn === OPS.paintFormXObjectBegin) {
      saved.push(ctm);
      if (fn === OPS.paintFormXObjectBegin && args[0]) ctm = mul(ctm, args[0] as Matrix);
    } else if (fn === OPS.restore || fn === OPS.paintFormXObjectEnd) ctm = saved.pop()!;
    else if (fn === OPS.transform) ctm = mul(ctm, args as Matrix);
    else if (fn === OPS.beginMarkedContentProps)
      layers.push(args[0] === "OC" ? (layerName.get(args[1]?.id) ?? null) : null);
    else if (fn === OPS.beginMarkedContent) layers.push(null);
    else if (fn === OPS.endMarkedContent) layers.pop();
    else if (fn === OPS.constructPath) {
      const layer = layers.filter(Boolean).at(-1) ?? "";
      if (args[0] !== OPS.fill && args[0] !== OPS.eoFill) continue;
      const rule = args[0] === OPS.eoFill ? "evenodd" : "nonzero";
      const m = mul(pageMatrix, ctm);
      const pt = (x: number, y: number) => `${f(m[0] * x + m[2] * y + m[4])} ${f(m[1] * x + m[3] * y + m[5])}`;
      const path = pathNo++;
      const data = args[1][0] as Float32Array;
      let d = "";
      const flush = () => {
        if (d) out.push({ d, path, layer, rule, bb: svgPathBbox(d) as Box });
        d = "";
      };
      for (let j = 0; j < data.length; ) {
        const op = data[j++];
        if (op === 0) (flush(), (d = `M${pt(data[j++], data[j++])}`));
        else if (op === 1) d += `L${pt(data[j++], data[j++])}`;
        else if (op === 2) d += `C${pt(data[j++], data[j++])} ${pt(data[j++], data[j++])} ${pt(data[j++], data[j++])}`;
        else if (op === 3) d += "Z";
        else throw new Error(`vector page: path operator ${op}`);
      }
      flush();
    }
  }
  return out;
}

/** Filled pieces of the text and number layers, placed with png.quran.ws's page matrix. */
async function pieces(data: Uint8Array, pageMatrix: Matrix): Promise<Piece[]> {
  const out = (await filledPieces(data, pageMatrix)).filter((p) => p.layer === TEXT || p.layer === NUMBERS);
  const bad = out.find((p) => p.rule !== "evenodd");
  if (bad) throw new Error(`vector page: non-even-odd fill in layer ${bad.layer}`);
  return out;
}

/** A piece's shape, independent of where it sits: its commands and its points relative to its box. */
interface Shape {
  cmds: string;
  pts: number[];
}
function shape(d: string, bb: Box): Shape {
  let cmds = "";
  const pts: number[] = [];
  svgpath(d).abs().unshort().unarc().iterate((seg, _i, x, y) => {
    const s = seg[0] === "H" ? ["L", seg[1], y] : seg[0] === "V" ? ["L", x, seg[1]] : seg;
    cmds += s[0];
    for (let k = 1; k < s.length; k++) pts.push((s[k] as number) - bb[(k - 1) % 2]);
  });
  return { cmds, pts };
}
/** Same shape: same commands, every point within 0.05 (png.quran.ws rounds to 0.01). */
const same = (a: Shape, b: Shape) => a.cmds === b.cmds && a.pts.every((v, i) => Math.abs(v - b.pts[i]) < 0.05);
const near = (a: Box, b: Box, tol: number) => a.every((v, i) => Math.abs(v - b[i]) < tol);
const inside = (a: Box, b: Box, tol = 0.3) => a[0] >= b[0] - tol && a[1] >= b[1] - tol && a[2] <= b[2] + tol && a[3] <= b[3] + tol;
const centre = (b: Box) => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
const contains = (b: Box, [x, y]: number[], tol = 0) => x >= b[0] - tol && x <= b[2] + tol && y >= b[1] - tol && y <= b[3] + tol;
const union = (bs: Box[]): Box => [Math.min(...bs.map((b) => b[0])), Math.min(...bs.map((b) => b[1])), Math.max(...bs.map((b) => b[2])), Math.max(...bs.map((b) => b[3]))];
const area = (b: Box) => (b[2] - b[0]) * (b[3] - b[1]);

export interface VectorGlyph {
  key: string;
  /** Ayah-end ornament (word number 0). */
  mark: boolean;
  /** png.quran.ws's paths for this glyph, in printed-page coordinates (misplaced on a broken page). */
  paths: GlyphPath[];
}

export interface VectorArtwork {
  paths: GlyphPath[];
  bb: Box;
}

/**
 * The vector edition's artwork for each glyph of `page`, keyed like the
 * input. `pageMatrix` is png.quran.ws's placement of that page.
 */
export async function vectorArtwork(
  page: number,
  glyphs: VectorGlyph[],
  pageMatrix: Matrix,
  cacheDir: string,
  log: (msg: string) => void,
): Promise<Map<string, VectorArtwork>> {
  return artworkFromFile(await vectorFile(page, VECTOR_PAGES[page], cacheDir), page, glyphs, pageMatrix, log);
}

/** As vectorArtwork, from the Illustrator file's bytes (no pinning or hash check). */
export async function artworkFromFile(
  data: Uint8Array,
  page: number,
  glyphs: VectorGlyph[],
  pageMatrix: Matrix,
  log: (msg: string) => void,
): Promise<Map<string, VectorArtwork>> {
  const ps = await pieces(data, pageMatrix);
  const owner: (string | null)[] = ps.map(() => null);

  // Each glyph's png.quran.ws pieces, and the offset that moves most of
  // them onto identical vector pieces (of the given layer).
  const shapes = ps.map((p) => shape(p.d, p.bb));
  const own = (g: VectorGlyph) => g.paths.flatMap((p) => svgpath(p.d).abs().toString().split(/(?=M)/)).filter((d) => d.trim()).map((d) => {
    const bb = svgPathBbox(d) as Box;
    return { bb, s: shape(d, bb) };
  });
  const offset = (g: VectorGlyph, layer: string) => {
    const cands: [number, number][] = [];
    for (const o of own(g))
      ps.forEach((p, i) => {
        if (p.layer === layer && !owner[i] && same(shapes[i], o.s)) cands.push([p.bb[0] - o.bb[0], p.bb[1] - o.bb[1]]);
      });
    // Votes: candidate offsets agreeing within 0.15.
    const scored = cands.map(([dx, dy]) => ({ dx, dy, n: cands.filter(([x, y]) => Math.abs(x - dx) < 0.15 && Math.abs(y - dy) < 0.15).length }));
    scored.sort((a, b) => b.n - a.n);
    const best = scored[0];
    if (!best) throw new Error(`vector page ${page}: ${g.key} matches no vector piece`);
    return best;
  };

  // Ayah-end ornaments: png.quran.ws draws its own ornament glyph (the
  // same on every page, with its own digits) centred on the vector file's
  // ayah number. The number's digits are grouped, and the groups are given
  // to the page's ayah marks in reading order (lines top-down, right to
  // left); each ornament is moved, whole, onto its group's centre.
  const out = new Map<string, VectorArtwork>();
  const groups: { bb: Box; idx: number[] }[] = [];
  ps.forEach((p, i) => {
    if (p.layer !== NUMBERS) return;
    const g = groups.find((g) => Math.abs(centre(g.bb)[0] - centre(p.bb)[0]) < 9 && Math.abs(centre(g.bb)[1] - centre(p.bb)[1]) < 9);
    if (g) (g.idx.push(i), (g.bb = union([g.bb, p.bb])));
    else groups.push({ bb: p.bb, idx: [i] });
  });
  groups.sort((a, b) => (Math.abs(centre(a.bb)[1] - centre(b.bb)[1]) > 5 ? centre(a.bb)[1] - centre(b.bb)[1] : centre(b.bb)[0] - centre(a.bb)[0]));
  const marks = glyphs.filter((g) => g.mark);
  if (groups.length !== marks.length)
    throw new Error(`vector page ${page}: ${groups.length} ayah numbers, ${marks.length} ayah marks`);
  marks.forEach((g, k) => {
    const from = union(own(g).map((o) => o.bb));
    const [cx, cy] = centre(groups[k].bb), [fx, fy] = centre(from);
    const dx = cx - fx, dy = cy - fy;
    for (const i of groups[k].idx) owner[i] = g.key;
    out.set(g.key, {
      paths: g.paths.map((p) => ({ ...p, d: svgpath(p.d).translate(dx, dy).round(2).toString() })),
      bb: [from[0] + dx, from[1] + dy, from[2] + dx, from[3] + dy],
    });
  });
  const left = ps.filter((p, i) => p.layer === NUMBERS && !owner[i]);
  if (left.length) throw new Error(`vector page ${page}: ${left.length} ayah-number pieces match no ornament`);

  // Words: each vector piece covered by one of a word's moved pieces.
  const claims: Set<string>[] = ps.map(() => new Set());
  for (const g of glyphs.filter((g) => !g.mark)) {
    const { dx, dy } = offset(g, TEXT);
    for (const o of own(g)) {
      const moved: Box = [o.bb[0] + dx, o.bb[1] + dy, o.bb[2] + dx, o.bb[3] + dy];
      ps.forEach((p, i) => { if (!owner[i] && p.layer === TEXT && near(p.bb, moved, 0.08)) claims[i].add(g.key); });
    }
  }
  claims.forEach((c, i) => { if (!owner[i] && c.size === 1) owner[i] = [...c][0]; });
  const matched = owner.map(Boolean);

  // Pieces claimed by none or several words go to the smallest word box
  // holding them; such a piece inside a bigger piece of the same PDF path
  // is a hole (counter) and follows that piece.
  const boxOf = () => {
    const m = new Map<string, Box[]>();
    ps.forEach((p, i) => { if (owner[i]) m.set(owner[i]!, [...(m.get(owner[i]!) ?? []), p.bb]); });
    return new Map([...m].map(([k, bs]) => [k, union(bs)]));
  };
  const boxes = boxOf();
  const markKeys = new Set(glyphs.filter((g) => g.mark).map((g) => g.key));
  const dropped: Box[] = [];
  ps.forEach((p, i) => {
    if (owner[i] || p.layer !== TEXT) return;
    const cands = [...boxes].filter(([k, b]) => !markKeys.has(k) && inside(p.bb, b) && (claims[i].size === 0 || claims[i].has(k)));
    if (cands.length) owner[i] = cands.sort((a, b) => area(a[1]) - area(b[1]))[0][0];
    else dropped.push(p.bb);
  });
  ps.forEach((p, i) => {
    if (p.layer !== TEXT || matched[i]) return;
    const outer = ps.findIndex((q, j) => j !== i && q.path === p.path && area(q.bb) > area(p.bb) && inside(p.bb, q.bb, 0));
    if (outer >= 0 && owner[outer] && owner[i] !== owner[outer]) owner[i] = owner[outer];
  });
  if (dropped.length) {
    // Only the quarter-hizb sign (۞) is left over, which png.quran.ws does not draw either.
    const b = union(dropped);
    if (b[2] - b[0] > 14 || b[3] - b[1] > 14)
      throw new Error(`vector page ${page}: ${dropped.length} unassigned pieces spread over ${b.map((v) => v.toFixed(1))}`);
    log(`vector page ${page}: left out ${dropped.length} pieces at ${b.map((v) => v.toFixed(1)).join(",")} (quarter-hizb sign)`);
  }

  for (const g of glyphs.filter((g) => !g.mark)) {
    const mine = ps.map((p, i) => ({ p, i })).filter(({ i }) => owner[i] === g.key);
    if (!mine.length) throw new Error(`vector page ${page}: no artwork for ${g.key}`);
    // One SVG path per PDF path, so even-odd filling stays as the PDF fills it.
    const byPath = new Map<number, string>();
    for (const { p } of mine) byPath.set(p.path, (byPath.get(p.path) ?? "") + p.d);
    out.set(g.key, {
      paths: [...byPath.values()].map((d) => ({ d: svgpath(d).round(2).toString(), rule: "evenodd" as const })),
      bb: union(mine.map(({ p }) => p.bb)),
    });
  }
  return out;
}
