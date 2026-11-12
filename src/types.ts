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
 * Artwork for one word (or the ayah-end ornament) in line coordinates.
 * Every glyph of every ayah sits in one shared band: y = 0 is the centre of
 * the ayah-end ornament (a fixed height above the printed baseline), and all
 * ink lies within line.top..line.bottom. Any contiguous run of glyphs, even
 * across ayahs, lines up when drawn with
 * viewBox `${x0} ${line.top} ${x1 - x0} ${line.bottom - line.top}`.
 */
export interface Glyph {
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
  version: 1;
  key: string;
  surah: number;
  ayah: number;
  surahName: { ar: string; latin: string };
  /** Vertical band shared by all ayahs (see Glyph). */
  line: { top: number; bottom: number };
  /** Words in reading order (right to left: x decreases). */
  words: Word[];
  /** Ayah-end ornament with its number, drawn after the last word. */
  mark: Glyph;
  phrases: Phrase[];
  full: LocalizedText;
  source: string;
  reviewed: boolean;
}

export interface SurahIndex {
  version: 1;
  surah: number;
  name: { ar: string; latin: string };
  /** Ayah numbers that have generated data. */
  ayahs: number[];
}

export interface RootIndex {
  version: 1;
  surahs: { surah: number; name: { ar: string; latin: string }; ayahs: number }[];
}
