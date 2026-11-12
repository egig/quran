/**
 * Soft hyphens (U+00AD) at Indonesian syllable boundaries, so the browser can
 * break a long word in a narrow translation slot. They are invisible unless
 * the browser actually breaks there (CSS hyphens: manual).
 *
 * Rules (Pedoman Umum Ejaan Bahasa Indonesia, simplified): ng, ny, sy, kh
 * count as one consonant; a single consonant between vowels starts the next
 * syllable (ma-kan); two consonants are split (ham-par); three or more keep
 * the first with the preceding vowel (in-stru-men). Neighbouring vowels are
 * never split (ai, au, oi are diphthongs). No piece is shorter than two letters.
 */

const VOWEL = /[aiueoāīūēō]/i;
const DIGRAPH = /^(ng|ny|sy|kh)/i;
const MIN_PIECE = 2;
const MIN_WORD = 6;

function hyphenateWord(word: string): string {
  if (word.length < MIN_WORD || !/^[\p{L}]+$/u.test(word)) return word;
  // Split into units: a vowel, a consonant digraph, or a single consonant.
  const units: { s: string; v: boolean }[] = [];
  for (let i = 0; i < word.length; ) {
    const d = word.slice(i).match(DIGRAPH);
    const s = d ? d[0] : word[i];
    units.push({ s, v: VOWEL.test(s) });
    i += s.length;
  }
  const breaks = new Set<number>(); // unit index a new syllable starts at
  let prevVowel = -1;
  units.forEach((u, i) => {
    if (!u.v) return;
    if (prevVowel >= 0) {
      const consonants = i - prevVowel - 1;
      if (consonants === 1) breaks.add(i - 1);
      else if (consonants >= 2) breaks.add(prevVowel + 2);
    }
    prevVowel = i;
  });
  let out = "";
  let piece = 0;
  const lettersFrom = (i: number) => units.slice(i).reduce((n, u) => n + u.s.length, 0);
  units.forEach((u, i) => {
    if (breaks.has(i) && piece >= MIN_PIECE && lettersFrom(i) >= MIN_PIECE) {
      out += "­";
      piece = 0;
    }
    out += u.s;
    piece += u.s.length;
  });
  return out;
}

export function hyphenate(text: string): string {
  return text.replace(/\p{L}+/gu, hyphenateWord);
}
