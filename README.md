# Quran Terjemah

The Madinah mushaf page reproduced line for line — every word at its printed
position — with the Indonesian translation placed under each **meaningful
phrase** (not word by word). The page scales to the screen width. The reader
shows one mushaf page at a time (`/602`), with every surah printed on it,
closed by its page number. A phrase that runs onto the next printed line shows
its translation under the first part and "…" under the rest. A button at the top right switches between
light and dark.

## Run

```sh
npm install
npm run data   # build public/data from content/*.json (fetches artwork once, cached in cache/)
npm run dev    # http://localhost:5173/ (surah list), /1 or /602 (mushaf page)
```

## Deploy

Pushing to `main` deploys to GitHub Pages
(`.github/workflows/deploy.yml`). CI does not fetch artwork: it builds the
`public/data/` that is committed, so run `npm run data` and commit its output
first. In the repository settings, set **Pages → Source** to **GitHub
Actions** once.

To try the Pages build locally under a sub-path:

```sh
BASE_PATH=/quran/ npm run build:site
BASE_PATH=/quran/ npx vite preview   # http://localhost:4173/quran/
```

## Adding an ayah

1. Add an entry to `content/{surah}.json`:

   ```json
   "2": {
     "phrases": [
       { "words": [1, 1], "id": "Segala puji" },
       { "words": [2, 4], "id": "bagi Allah, Tuhan seluruh alam" }
     ],
     "full": { "id": "..." },
     "source": "kemenag-2019-adapted",
     "reviewed": false
   }
   ```

   `words` is an inclusive 1-based word range. Phrases must cover every word
   exactly once, in order; the build fails otherwise.
2. `npm run data`.
3. After a human has checked the phrases and wording, set `"reviewed": true`
   (the page shows a "Draf" badge until then).

## How it works

- `scripts/build-data.ts` fetches the surah as SVG in chunks of 10 ayahs from
  `png.quran.ws/api/v1/image/{s}/{from}-{to}.svg?layout=mushaf` (renderer
  pinned with `v=3`), which reproduces the printed plate. It flattens every
  `data-word-key` group, ayah-end ornament and the basmalah in printed-page
  coordinates (transforms from the page matrix down, so chunks join exactly).
  It detects pages (a glyph clearly higher than the previous one starts the
  next page; inside a chunk this must agree with the API's page stacking) and
  printed lines (reading order runs right to left; a glyph fully right of the
  previous one starts a new line). Each glyph stores its page, line, printed x,
  and y relative to its line centre (the ornament centre; lines without an
  ornament are placed by the line pitch). Output: `public/data/{s}/index.json`
  (pages, width, basmalah) and `public/data/{s}/{a}.json` (words, ornament,
  phrases). Types in `src/types.ts`.
- The page draws each printed line as one SVG and puts a row of translations
  under it, each positioned under its phrase's words. Neighbouring phrases
  split the space between them at the midpoint, since printed words can
  overlap. The artwork is only moved (per line, vertically), never scaled
  relative to itself or restyled. Each surah is cropped to its own ink;
  `layout.left` (its printed-page x offset) moves surahs that share a mushaf
  page into one frame, and `layout.pages[].ayahs` says which ayahs a page
  holds, so a page loads only those.
- A translation whose longest word does not fit its space gets room from its
  neighbours (`src/components/fitRow.ts`); a crowded line may also wrap more
  (between whole words only, never inside a word) or use smaller text (never
  below 6px).
- png.quran.ws's surah list gives the wrong page span for a few surahs
  (80, 84, 88, 90, 94, 96); `PAGE_SPAN_OVERRIDES` in the build script follows
  the artwork for those.
- Known upstream defects: mushaf pages 17 (Al-Baqarah 2:106–112) and 144
  (Al-Anʿām 6:125–130) are scrambled in png.quran.ws. They take their
  artwork from the King Fahd Complex's 1441H vector files, which
  png.quran.ws was cut from (`scripts/vector-pages.ts`, read with
  `pdfjs-dist`).
- The JSON in `public/data` is the contract for a future mobile app.

## Attribution

- Qur'an text artwork: King Fahd Glorious Qur'an Printing Complex, Muṣḥaf
  al-Madīnah V4 (1441H), riwāyah Ḥafṣ ʿan ʿĀṣim. Free for digital use per the
  Complex's terms.
- Word decomposition: [png.quran.ws](https://png.quran.ws/about/), CC BY 4.0.
- Pages 17 and 144: the Complex's 1441H vector files, via the
  [MushafAlMadinahVector](https://github.com/MushafAlMadinahVector/MushafAlMadinahVector)
  mirror; PDF reading with pdfjs-dist (Apache-2.0).
- Indonesian translation adapted from Terjemahan Al-Qur'an Kemenag RI (2019).
- Font: Plus Jakarta Sans (SIL Open Font License).
