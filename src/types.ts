// Shared data contract between the build script, the web page and future apps.

/** Language code -> text. Only "id" (Indonesian) for now. */
export type LocalizedText = Record<string, string>;

// ---------- Authored content: content/{surah}.json ----------

export interface PhraseSource {
  /** Inclusive 1-based word range [from, to] within the ayah. */
  words: [number, number];
  /** Translation of this phrase, keyed by language. */
  [lang: string]: string | [number, number];
}

export interface AyahSource {
  phrases: PhraseSource[];
  /** Full-sentence translation, keyed by language. */
  full: LocalizedText;
  /** Where the wording comes from, e.g. "kemenag-2019-adapted". */
  source: string;
  /** Set to true only after a human has checked the phrases and text. */
  reviewed: boolean;
}

export interface SurahSource {
  surah: number;
  name: { ar: string; latin: string };
  ayahs: Record<string, AyahSource>;
}

// ---------- Generated data: public/data/... ----------

export interface GlyphPath {
  d: string;
  rule?: "evenodd";
}

/**
 * Artwork for one word (or the ayah-end ornament, or the basmalah), placed as
 * on the printed Madinah mushaf page. x is the printed x (0..layout.width).
 * y is relative to the centre of its printed line (the ayah-end ornament
 * height), so any line is drawn with
 * viewBox `0 ${band.top} ${layout.width} ${band.bottom - band.top}`.
 */
export interface Glyph {
  /** Mushaf page number. */
  page: number;
  /** 1-based printed line within this surah's part of that page. */
  line: number;
  x0: number;
  x1: number;
  paths: GlyphPath[];
}

export interface Word extends Glyph {
  /** 1-based word number within the ayah. */
  n: number;
  /** Uthmani rasm of the word. */
  text: string;
}

export interface Phrase {
  /** Inclusive 1-based word range. */
  from: number;
  to: number;
  text: LocalizedText;
}

export interface AyahData {
  version: 3;
  key: string;
  surah: number;
  ayah: number;
  surahName: { ar: string; latin: string };
  /** Words in reading order. */
  words: Word[];
  /** Ayah-end ornament with its number, drawn after the last word. */
  mark: Glyph;
  /** Empty when the ayah has no authored translation yet. */
  phrases: Phrase[];
  full: LocalizedText;
  source: string;
  reviewed: boolean;
}

export interface MushafPageInfo {
  /** Mushaf page number. */
  page: number;
  /** Number of printed lines of this surah on the page. */
  lines: number;
  /** First and last ayah with artwork on this page. */
  ayahs: [number, number];
}

export interface MushafLayout {
  /**
   * Printed-page x of artwork x = 0. Each surah is cropped to its own ink;
   * this aligns surahs that share a mushaf page.
   */
  left: number;
  /** Width shared by every page of the surah, in artwork units. */
  width: number;
  /** Vertical extent of every line, relative to its centre. */
  band: { top: number; bottom: number };
  /** Pages the surah spans, in order. */
  pages: MushafPageInfo[];
  /** The basmalah line that opens the surah, if printed separately. */
  basmalah: Glyph | null;
}

export interface SurahIndex {
  version: 4;
  surah: number;
  name: { ar: string; latin: string };
  /** Ayah numbers that have generated data. */
  ayahs: number[];
  layout: MushafLayout;
}

export interface SurahListEntry {
  surah: number;
  name: { ar: string; latin: string };
  ayahs: number;
  /** Place of revelation. */
  place: "makkah" | "madinah";
  /** First and last mushaf page. */
  pages: [number, number];
  /** True when public/data/{surah}/ has been generated. */
  available: boolean;
}

/** public/data/index.json: every surah of the mushaf, for the table of contents. */
export interface RootIndex {
  version: 4;
  surahs: SurahListEntry[];
}
