import type { CSSProperties } from "react";
import type { AyahData, Glyph, Phrase } from "../types.ts";

const LANG = "id";

type Vars = CSSProperties & Record<`--${string}`, number | string>;

export function AyahView({ data }: { data: AyahData }) {
  const label = `QS. ${data.surahName.latin} [${data.surah}]: ${data.ayah}`;
  return (
    <article className="ayah" id={`ayat-${data.ayah}`} aria-label={label}>
      {!data.reviewed && (
        <span className="draft" title="Terjemahan per frasa belum diperiksa">
          Draf
        </span>
      )}
      <div className="ayah-line" dir="rtl" lang="ar" style={{ "--h": data.line.height } as Vars}>
        {data.phrases.map((p, i) => (
          <PhraseUnit key={p.from} data={data} phrase={p} last={i === data.phrases.length - 1} />
        ))}
      </div>
      <p className="full" lang={LANG}>
        {data.full[LANG]}
      </p>
      <p className="ref">{label}</p>
    </article>
  );
}

function PhraseUnit({ data, phrase, last }: { data: AyahData; phrase: Phrase; last: boolean }) {
  const words = data.words.slice(phrase.from - 1, phrase.to);
  // The ayah-end ornament rides with the last phrase so it never wraps alone.
  const glyphs: Glyph[] = last ? [...words, data.mark] : words;
  const x1 = Math.max(...glyphs.map((g) => g.x1));
  const x0 = Math.min(...glyphs.map((g) => g.x0));
  const wordsX0 = Math.min(...words.map((g) => g.x0));
  const arabic = words.map((w) => w.text).join(" ");

  const style: Vars = {
    "--w": x1 - x0, // whole run incl. ornament
    "--aw": x1 - wordsX0, // words only: bracket and translation width
    "--mw": wordsX0 - x0, // ornament (left of the words) to offset centring
  };

  return (
    <div className="phrase" style={style}>
      <div className="run">
        <svg
          viewBox={`${x0} 0 ${x1 - x0} ${data.line.height}`}
          fill="currentColor"
          role="img"
          aria-label={arabic}
        >
          {glyphs.flatMap((g) => g.paths).map((p, i) => (
            <path key={i} d={p.d} fillRule={p.rule} />
          ))}
        </svg>
        <span className="bracket" aria-hidden="true" />
        <span className="tr" lang={LANG} dir="ltr">
          {phrase.text[LANG]}
        </span>
      </div>
    </div>
  );
}
