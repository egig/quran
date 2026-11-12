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
 * Artwork for one word (or the ayah-end ornament), placed as on the printed
 * Madinah mushaf page. x is the printed x (0..layout.width). y is relative
 * to the centre of its printed line (the ayah-end ornament height), so any
 * line is drawn with
 * viewBox `0 ${band.top} ${layout.width} ${band.bottom - band.top}`.
 */
export interface Glyph {
  /** 1-based printed line within the surah's page. */
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
  version: 2;
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

export interface MushafLayout {
  /** Mushaf page number. */
  page: number;
  /** Page width in artwork units. */
  width: number;
  /** Number of printed lines. */
  lines: number;
  /** Vertical extent of every line, relative to its centre. */
  band: { top: number; bottom: number };
}

export interface SurahIndex {
  version: 2;
  surah: number;
  name: { ar: string; latin: string };
  /** Ayah numbers that have generated data. */
  ayahs: number[];
  layout: MushafLayout;
}

export interface RootIndex {
  version: 2;
  surahs: { surah: number; name: { ar: string; latin: string }; ayahs: number }[];
}
