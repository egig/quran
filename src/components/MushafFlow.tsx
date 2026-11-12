import type { CSSProperties } from "react";
import type { AyahData, Glyph, Phrase } from "../types.ts";

const LANG = "id";

type Vars = CSSProperties & Record<`--${string}`, number | string>;

/**
 * All ayahs flow as one continuous RTL text block, like a mushaf page.
 * Lines break only between phrases, so each translation stays under its words.
 */
export function MushafFlow({ ayahs }: { ayahs: AyahData[] }) {
  if (!ayahs.length) return null;
  const top = Math.min(...ayahs.map((a) => a.line.top));
  const bottom = Math.max(...ayahs.map((a) => a.line.bottom));

  return (
    <div className="mushaf" dir="rtl" lang="ar" style={{ "--h": bottom - top } as Vars}>
      {ayahs.flatMap((a) =>
        a.phrases.map((p, i) => (
          <PhraseUnit
            key={`${a.key}:${p.from}`}
            data={a}
            phrase={p}
            last={i === a.phrases.length - 1}
            top={top}
            height={bottom - top}
          />
        )),
      )}
    </div>
  );
}

export function FullTranslations({ ayahs }: { ayahs: AyahData[] }) {
  return (
    <ol className="full-list" lang={LANG}>
      {ayahs.map((a) => (
        <li key={a.key} value={a.ayah}>
          {a.full[LANG]}
        </li>
      ))}
    </ol>
  );
}

function PhraseUnit(props: { data: AyahData; phrase: Phrase; last: boolean; top: number; height: number }) {
  const { data, phrase, last, top, height } = props;
  const words = data.words.slice(phrase.from - 1, phrase.to);
  // The ayah-end ornament rides with the ayah's last phrase so it never wraps alone.
  const glyphs: Glyph[] = last ? [...words, data.mark] : words;
  const x1 = Math.max(...glyphs.map((g) => g.x1));
  const x0 = Math.min(...glyphs.map((g) => g.x0));
  const wordsX0 = Math.min(...words.map((g) => g.x0));
  const arabic = words.map((w) => w.text).join(" ");

  const style: Vars = {
    "--w": x1 - x0, // whole run incl. ornament
    "--aw": x1 - wordsX0, // words only: translation width
    "--mw": wordsX0 - x0, // ornament (left of the words) to offset centring
  };

  return (
    <div className="phrase" style={style} id={last ? `ayat-${data.ayah}` : undefined}>
      <svg
        viewBox={`${x0} ${top} ${x1 - x0} ${height}`}
        fill="currentColor"
        role="img"
        aria-label={last ? `${arabic} (${data.ayah})` : arabic}
      >
        {glyphs.flatMap((g) => g.paths).map((p, i) => (
          <path key={i} d={p.d} fillRule={p.rule} />
        ))}
      </svg>
      <span className="tr" lang={LANG} dir="ltr">
        {phrase.text[LANG]}
      </span>
    </div>
  );
}
