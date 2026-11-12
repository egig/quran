# Quran Terjemah

Quran ayahs with Indonesian translation placed under each **meaningful phrase**
(not word by word), plus the full-sentence translation below. Responsive: lines
break only between phrases, so each phrase always keeps its translation under it.

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

- `scripts/build-data.ts` fetches each ayah as SVG from
  `png.quran.ws/api/v1/image/{s}/{a}.svg` (fit layout, very wide aspect, so the
  ayah is one line on one shared baseline, renderer pinned with `v=3`). It
  flattens every `data-word-key` group into line coordinates and writes
  `public/data/{s}/{a}.json` (see `src/types.ts`).
- The page draws each phrase's words with a single SVG viewBox cut from that
  line. The artwork is only moved, never scaled or restyled. Phrases sit in an
  RTL `flex-wrap` row. The ayah-end ornament rides with the last phrase.
- The JSON in `public/data` is the contract for a future mobile app.

## Attribution

- Qur'an text artwork: King Fahd Glorious Qur'an Printing Complex, Muṣḥaf
  al-Madīnah V4 (1441H), riwāyah Ḥafṣ ʿan ʿĀṣim. Free for digital use per the
  Complex's terms.
- Word decomposition: [png.quran.ws](https://png.quran.ws/about/), CC BY 4.0.
- Indonesian translation adapted from Terjemahan Al-Qur'an Kemenag RI (2019).
- Font: Plus Jakarta Sans (SIL Open Font License).
