# Quran Terjemah

The Madinah mushaf page reproduced line for line — every word at its printed
position — with the Indonesian translation placed under each **meaningful
phrase** (not word by word). The page scales to the screen width. A page toggle
shows the full-sentence translations below. A phrase that runs onto the next
printed line shows its translation under the first part and "…" under the rest.

## Run

```sh
npm install
npm run data   # build public/data from content/*.json (fetches artwork once, cached in cache/)
npm run dev    # http://localhost:5173/1  or  /1/1
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

- `scripts/build-data.ts` fetches the whole surah once as SVG from
  `png.quran.ws/api/v1/image/{s}/1-{n}.svg?layout=mushaf` (renderer pinned
  with `v=3`), which reproduces the printed plate. It flattens every
  `data-word-key` group and ayah-end ornament, detects the printed lines
  (reading order runs right to left; a glyph fully right of the previous one
  starts a new line), and stores each glyph's printed x plus y relative to its
  line centre (the ornament centre; lines without an ornament are placed by
  the line pitch). Output: `public/data/{s}/index.json` (page layout) and
  `public/data/{s}/{a}.json` (words, ornament, phrases). Types in
  `src/types.ts`.
- The page draws each printed line as one SVG and puts a row of translations
  under it, each positioned under its phrase's words. Neighbouring phrases
  split the space between them at the midpoint, since printed words can
  overlap. The artwork is only moved (per line, vertically), never scaled
  relative to itself or restyled.
- Multi-page surahs are not supported yet; the build stops with an error.
- The JSON in `public/data` is the contract for a future mobile app.

## Attribution

- Qur'an text artwork: King Fahd Glorious Qur'an Printing Complex, Muṣḥaf
  al-Madīnah V4 (1441H), riwāyah Ḥafṣ ʿan ʿĀṣim. Free for digital use per the
  Complex's terms.
- Word decomposition: [png.quran.ws](https://png.quran.ws/about/), CC BY 4.0.
- Indonesian translation adapted from Terjemahan Al-Qur'an Kemenag RI (2019).
- Font: Plus Jakarta Sans (SIL Open Font License).
