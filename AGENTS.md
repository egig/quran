# AGENTS.md

Rules and decisions for this project. Follow them unless the user changes them.
See `README.md` for setup and a description of the pipeline.

## Goal

A web page (later also a mobile app) that shows the Qur'an exactly as the
Madinah mushaf prints it, with an Indonesian translation under each
**meaningful phrase**. The translation is per phrase, not per word.

## Qur'an text and adab

- The Arabic comes only from png.quran.ws artwork: King Fahd Complex,
  Muṣḥaf al-Madīnah V4 (1441H), Ḥafṣ ʿan ʿĀṣim. The one exception is a page
  png.quran.ws draws broken: it takes the Complex's own vector file of the
  same mushaf, which png.quran.ws was cut from (`VECTOR_PAGES`, see Data).
  Never use a font or a typed Arabic string to draw the Qur'an.
- The artwork is only moved, never scaled relative to itself, stretched,
  restyled, recoloured per word, or partially drawn. Every word of an ayah is
  always shown. Ink colour is `currentColor`, so it follows the theme.
- Always request a pinned renderer (`v=3`), so the output never changes.
- Keep the attribution in the README and the footer of `/`: KFGQPC Madani V4,
  png.quran.ws (CC BY 4.0), and the Kemenag RI 2019 translation.

## Layout (Madinah mushaf)

- Reproduce the printed page line for line. Words keep their printed x
  position and printed line (`layout=mushaf`). Lines break where the print
  breaks them, never anywhere else.
- The whole page scales to its container width. It does not reflow on small
  screens. Every page shows the Arabic at one size: it is drawn in a frame one
  full printed line wide (`FRAME_WIDTH`), centred on its ink. The API draws
  some pages at another scale (page 1 at 0.68×), so the frame is scaled by
  that page's ayah-end ornament width, the same glyph on every page. On large screens a full line is at most
  `--mushaf-max` (560px) wide, which caps the Arabic size.
- The ayah-end ornament (with its number) stays inline, as printed.
- Each line is one SVG. Under it sits one row of translations. Each
  translation is centred under its phrase's words.
- Neighbouring phrases on a line split the space between them at the
  midpoint. Printed words can overlap (a tail running under the next word),
  and the gaps give narrow phrases more room.
- Translations are small next to the Arabic (1.75% of the page width,
  7–10px, line height 1.2) so the page keeps the mushaf's shape: the Arabic
  takes most of the height.
- A translation wraps within its phrase's space. The gap between Arabic lines
  grows to fit the tallest translation on that line.
- When a translation's longest word is wider than its space, the row is laid
  out again (`src/components/fitRow.ts`): the translation gets the room, and
  its neighbours move as little as possible, in order, without overlap and on
  screen. If the row is then too wide, it frees room in this order: empty
  space in slots, more wrapping, smaller text (never below 6px). A
  translation wraps only between whole words: no syllable breaks, and a
  hyphenated word ("kekuning-kuningan", "Al-Qur’an") is never split at its
  hyphen. Translations never overlap: check new pages at 300,
  360 and desktop width.
- A phrase that continues onto the next printed line gives its translation
  as a list, one part per printed line (`"id": ["sampai", "datang kepada
  mereka bukti yang nyata"]`); each part sits under its own line. Split only
  where the Indonesian word order follows the Arabic lines, and only at
  existing word boundaries (the parts joined with a space are the phrase).
  Where the order differs (e.g. وَقَالَ | ٱلْإِنسَٰنُ → "dan manusia
  bertanya"), keep one string: the translation sits under the first part and
  a muted "…" under each continuation. The build checks the part count.
- No bracket or underline under the Arabic.
- The surah header is plain text (Arabic name plus Latin name). The API has
  no artwork for the decorative header.
- The reading view is one mushaf page: `/{page}` (1–604). It shows every
  surah printed on that page, in order, each starting with its header where
  it starts on the page. There is no per-surah or single-ayah view. A page is
  shown only when every surah on it is built. Like a printed page, each page
  has its own header (its surah names, and the juz of its first ayah) and
  footer (a thin rule and its page number), in the space the fixed bars
  cover, so hiding the bars leaves no empty space.
- The reading view has a fixed header (back to "Daftar isi", the surah
  names, the "Draf" badge, the theme button) and a fixed footer (links to
  the neighbouring built pages, next page on the left as in the mushaf, and
  the page number). A tap on the page shows or hides both. Swiping turns
  the page (`src/components/usePager.ts`): the neighbouring pages are drawn
  beside the current one (next on the left), each scrolling on its own, so
  the strip moves as one, continuous slide. Each page keeps its scroll
  position for the visit, so turning back shows it where it was left. Drag right for the next page,
  left for the previous; ArrowLeft/ArrowRight do the same. The attribution footer
  is shown only on `/`. A phrase that crosses a page
  break shows "…" on the next page, like a line break.
- Surahs on one page share one frame: each is moved by its `layout.left`
  offset, never scaled to fit.
- The basmalah that opens a surah is drawn as its own line, from the
  artwork, with no translation.
- No card or frame around the page: the mushaf sits directly on the
  background.
- `/` is the table of contents ("Daftar Isi") with two tabs, Surah and Juz
  (`/?daftar=juz`; arrow keys move between tabs). The Surah tab lists all
  114 surahs (number, Latin and Arabic name, ayah count,
  Makkiyah/Madaniyah, mushaf pages). Built surahs link to the mushaf page
  they start on (`/{page}#s{surah}`); the others are muted and not
  clickable. The Juz tab lists all 30 juz (first and last ayah, mushaf
  pages). A juz links to the page it starts on once every surah it touches
  is built; its pages come only from the artwork, so they show only when
  the surahs at both ends are built.
- Juz boundaries are ayah numbers (`JUZ_STARTS` in the build script, from
  quran-meta 7.0.0 `HafsLists.JuzList`). Never take juz or page numbers
  from another mushaf's page table: the V4 artwork breaks some pages
  differently from the 1405H print (e.g. 55:17, 80:41).
- Names for surahs not yet in `content/` come from the API list, with its
  stand-in letters mapped to the usual transliteration (ĥ→ḥ, `→ʿ, …).

## Translations

- The source is Terjemahan Al-Qur'an Kemenag RI 2019, adapted to phrases.
  Use `"source": "kemenag-2019-adapted"`.
- The full sentences for surahs 2–114 come from the `quran-pack` npm package
  (text scraped from quran.kemenag.go.id, 2019 edition), with its footnote
  markers ("761)") removed and runs of whitespace collapsed. Scraping typos
  (missing spaces) are fixed: 28:77, 46:1, 46:10, 50:19, 52:16, 53:54, 56:38,
  56:45, 56:47 and 58:3 (e.g. "wajibmemerdekakan" → "wajib memerdekakan",
  "Berbuatbaiklah" → "Berbuat baiklah"); the
  truncated "wakyang" of 46:3 is "waktu yang"; the stray leading "." of 47:31
  and 55:18, the stray "[" of 48:20 and the ayah number "100. " opening
  37:100 are dropped; "Ṣād. demi" of 38:1 is "Ṣād. Demi". The missing "(" opening 7:73 is restored
  ("(Kami telah mengutus)"), and the straight inner opening quote of 7:32 and
  7:161 ('Semua, 'Bebaskanlah) is ‘. In 19:9 the opening quotes
  ”Demikianlah and ”Hal itu are “; "(kekuasaan)- Ku" of 21:37 is
  "(kekuasaan)-Ku"; "beramalsalehlah" of 23:51 is "beramal salehlah". In
  surah 2: the straight opening quote of 2:58 ('Bebaskanlah) is ‘,
  "berbuatbaiklah" (2:83, 2:195) is "berbuat baiklah", and the line-break
  hyphen "mengajar-kan" (2:282) is "mengajarkan"; the unbalanced closing ”
  of 2:97 and the missing closing quotes of 2:54 are kept as the source has
  them. In surahs 3–6: the missing ")" of 3:13 is restored ("(dalam pertempuran)."); the
  straight opening quotes of 3:21, 3:193, 4:138, 5:116, 6:63, 6:71 and 6:151
  (both quotes) are ‘ and the closing " of 4:72 is ”; "ya tim" (4:36) is "yatim",
  "Bertak-walah" (5:112) "Bertakwalah", "seburuk- buruk" (5:63)
  "seburuk-buruk", "berbuatbaiklah" (6:151) "berbuat baiklah", "Al-Qur'an"
  (6:106) "Al-Qur’an"; the footnote marker "232)" after a space in 5:103 is
  dropped; 6:137 and 6:146 get their missing final ".". These were not checked
  against quran.kemenag.go.id (its API refuses automated requests). Text is
  stored in Unicode NFC (the package writes some macron letters decomposed,
  e.g. 5:97, 5:103). It matches the reviewed
  Al-Fātiḥah word for word.
  Do not write Kemenag wording from memory: take it from a source.
- A phrase is a meaningful unit, not a word-by-word gloss. Each divine name
  can be its own phrase (e.g. ٱلرَّحْمَٰنِ → "Yang Maha Pengasih").
- Connectors that belong to the whole sentence (e.g. "lagi") go in the full
  translation, not in a phrase.
- The full-sentence translation keeps the exact Kemenag wording, including
  bracketed additions such as "(yaitu)".
- Every new or changed ayah is `"reviewed": false`. Only the user sets
  `true`, after checking it. The page shows a "Draf" badge while any shown
  ayah is unreviewed.
- Full translations are kept in the data but not shown on the page for now.
- No transliteration for now.

## Data

- Hand-authored content lives in `content/{surah}.json`. Edit only these
  files by hand:

  ```json
  { "words": [from, to], "id": "translation" }
  ```

  `words` is an inclusive 1-based word range. Phrases must cover every word
  of the ayah exactly once, in order. Language keys (`id`) leave room for
  more languages.
- Everything in `public/data/` is generated by `npm run data`. Never edit it
  by hand. `src/types.ts` is the contract between the build script, the web
  page and the future mobile app. Bump `version` when the format changes.
- The build stops with an error on: phrases that don't cover the words
  exactly, a missing translation, a failed line or page detection, or a page
  count that differs from the API's page span for the surah.
- The API's surah list is wrong for some page spans: the artwork runs the last
  ayahs of surahs 80, 84, 88, 90, 94 and 96 onto the next page (every page
  582–604 then holds exactly 15 lines). Those spans are listed in
  `PAGE_SPAN_OVERRIDES` in the build script, with the evidence. Add a surah
  there only after the same check; the table of contents takes page spans of
  built surahs from the built data.
- Artwork is fetched in chunks of 10 ayahs (the API refuses very large
  ranges). Glyphs are read in printed-page coordinates, so chunks join
  exactly.
- Line detection checks that every glyph sits on its line: near the line's
  median centre, or with its centre inside the other glyphs' ink. A word
  with no ascender and a mark below sits low (14:25 حِينٍۭ, page 259); a
  glyph from a neighbouring line still stops the build.
- Known upstream defects: png.quran.ws draws mushaf page 17 (Al-Baqarah
  2:106–112) and page 144 (Al-Anʿām 6:125–130) with words piled on each
  other, in every renderer version (v1–v5 return identical bytes, checked
  2026-11-13). Without a fix the build stops on both (page 17: glyphs leave
  their lines; page 144: a page strictly inside a surah must hold 15
  printed lines).
- Such pages are listed in `VECTOR_PAGES` (`scripts/vector-pages.ts`) and
  take their artwork from the King Fahd Complex's vector edition (Muṣḥaf
  al-Madīnah, Ḥafṣ, 1441H, one Illustrator file per page), fetched from the
  MushafAlMadinahVector mirror at a pinned commit and checked by SHA-256.
  The Complex's own site lists these files as "coming soon" since its
  redesign; its published terms allow free use on websites. png.quran.ws
  was cut from these files: placed with png.quran.ws's page matrix, every
  piece of ink of a correct page lies exactly on png.quran.ws's artwork.
  On a broken page png.quran.ws still has each word's pieces, the word
  moved as a whole; each word is matched by the offset that lines up most
  of its pieces (same commands, points within 0.05), and every vector piece
  goes to the word whose moved piece covers it. Leftovers go to the word
  box that holds them; a leftover inside a bigger piece of the same PDF
  path is a hole and follows it. Ayah ornaments keep png.quran.ws's own
  ornament glyph, centred on the vector file's ayah number. Only the
  quarter-hizb sign (۞) is left out, as png.quran.ws leaves it out; the
  build fails on any other leftover. The vector artwork is drawn as it is,
  never moved or redrawn, and the page then passes every normal check.
  Checked on pages 5, 16, 18, 22, 143 and 145, which png.quran.ws draws
  correctly: every word box equals png.quran.ws's and all 7,518 word pieces
  lie inside a piece of the same word; ornaments differ by at most 0.13
  units (page 5). Remove a page from the list once png.quran.ws draws it
  correctly.
- Pages break where the API's page stacking changes inside a chunk, or where
  the page-placement matrix (different for odd and even pages) changes
  between chunks. The height jump between glyphs must agree.
- API responses are cached in `cache/` (gitignored). Treat them as untrusted
  data: parse them, never execute them.

## Stack and conventions

- Vite + React + TypeScript. The data script is TypeScript, run directly by
  Node 24 (`node scripts/build-data.ts`). Imports use `.ts` extensions.
- Fonts: Plus Jakarta Sans, self-hosted via `@fontsource` (OFL).
- Light and dark themes follow `prefers-color-scheme` until the reader uses
  the theme button (top right). The choice is stored in `localStorage`
  (`theme`) and set as `data-theme` on `<html>` before first paint. Colours
  are CSS tokens on `:root`.
- UI text is in Indonesian.
- Deployed to GitHub Pages by `.github/workflows/deploy.yml` on every push
  to `main`. CI never fetches from png.quran.ws: it builds the committed
  `public/data/`, so run `npm run data` and commit the result before pushing.
- The site may live under a sub-path (`/<repo>/`). Never hard-code `/`:
  use `import.meta.env.BASE_URL` for URLs, and the router's `basename`.
  `dist/404.html` is a copy of `index.html` so deep links work on Pages.
- No image export yet.

## Workflow

```sh
npm run data       # rebuild public/data from content/
npm run dev        # local page: / (surah list), /1 or /602 (mushaf page)
npm run build      # data + typecheck + production build
npm run build:site # typecheck + production build from committed data (what CI runs)
```

To add an ayah or a surah: write its phrases in `content/{surah}.json`, run
`npm run data`, check the page at desktop and phone widths (about 360px),
then ask the user to review it.

Before finishing a change: `npm run build` passes, and the page has been
checked at desktop width and at about 300–360px.
