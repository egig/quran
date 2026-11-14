// The printed surah header (a band with a cartouche holding the surah's
// name), taken from the King Fahd Complex's vector edition of the mushaf, the
// same files scripts/vector-pages.ts uses. png.quran.ws has no artwork for
// it. In each file the band is one path of the "Ornament" layer, with the
// cartouche cut out; the name's letters are pieces of the text layer lying
// inside the band. Only the name is kept: the band is used to find it. Pages
// 1 and 2 frame Al-Fātiḥah and Al-Baqarah with a full-page ornament instead,
// so those two surahs have no header artwork.

import svgpath from "svgpath";
import type { GlyphPath, SurahHeader } from "../src/types.ts";
import { filledPieces, vectorFile, type Box, type Matrix } from "./vector-pages.ts";

/**
 * SHA-256 of the Illustrator file of every page a surah starts on (pages 1
 * and 2 excepted), from the pinned mirror in vector-pages.ts.
 */
export const HEADER_PAGES: Record<number, string> = {
  50: "33f4d9c586fa386eb1e454b400a36d5194b1931f25dc22e029b4762627ac0bae",
  77: "4fe30f257f0cbd0b3e18d95783f96becb37e3e96b8f4c6e3cb1fe1acf95bda7f",
  106: "fcc87a6fc89787ed4a4f65b67a439aca0a6c11fc8b20185f0ed44a98a2e8943e",
  128: "5578d3df8e5afdf9946fa10e4c31d983c3abcdc23bf651352a2fbd9063c02582",
  151: "30d121ae51a185ff937e6d78849373f42f88f7f034c822f2e69e4aadbd44cd9d",
  177: "010bb50568b0e9242a2e0c7c6687a699eb9334517f7b9ef1d4fd4adfefdee06e",
  187: "4d6ad720b12883b2465188ee799ad6dfd07c6438193b37a30680bcc4c7f0458e",
  208: "6c77aa72d8e09a47f9fa844c1c06f7db6a6feae196de9777b2d5b0d2294079c9",
  221: "3ca7b32c97b8b1df6161b16c5e6e515b67277b6b144ec4dc88139d727c3bbc2e",
  235: "899107197be363ff9a0876849f8bd8a1918194e7c5b1842d3c8c47f8af2ee898",
  249: "34e3b812d326b6a51504909289a7c31abdbed3ed1f36c0a2eda51ecae0d7fa4b",
  255: "8f65902fe9336b5ef7572413c9784d97ee10ef29f76eb5833f321b07916f14af",
  262: "884b0e27b29c6a5d0f035f2373a4f1fb2847f8f77809f1c265ed7642a1db630c",
  267: "a1ea2aa857056189aef01e0ebe2009776a5b9af430388660ec97514a4eca398f",
  282: "b0b65b396564c9a6752a5ec9be870d40da1a46b3f52b120e186b0603d2274220",
  293: "74a708f8dee8561634cfc8dc02600994ec96be826ef79ddc6eeaee5e14401aa7",
  305: "17b13445777e58e018b540b9305bc06da1ffe55ea58f13d27dd69f5d776c0d64",
  312: "7c3c204038642060a861f0aad97e683a5c0672e09ef9e0fe0085272e8fbfa3fd",
  322: "df7cdec6f2c6493c04ecf2c2a77871c6614d09b86ef6558be6d3e11ba8733630",
  332: "d28009f3bcf5b01824de5dd7ad5bbe31a713dfd7d8fcdf8afffbd28d40443010",
  342: "684c491fb9864d7ba70676e8c3e41475e19c741adf178a20790eb947a0e8fdd6",
  350: "7e5c38aff9eea72d3b2127ee71cedcdf558bb3cf74818690b6ddf84beebce6f5",
  359: "742dcc06ea3925fba9d9735da2285ea27ef4a7966e11339dcfd8cdac51d886e9",
  367: "4f0fd48435c17a4742f408e52945642522197c5a5c7fe3cb60797e47c9552ecf",
  377: "310f15d221649a5d2d2109045569c096a446cc3be8f7404813330123c46e8e9d",
  385: "a356b81b5062bb5df78ba1cd090533483f5fb782560282e2beaf8032e4055200",
  396: "3f9abdbafae89d48cf5f75384cc6f267a27018364b7873dc4a87ebcf721d44eb",
  404: "65d641b6a2746ffef6818729094bb7da92ea400d4f37a4a853c5412222e87091",
  411: "fa667eb4c312339a920d746f611f3bd24e887294a4c99649bca8fc3334db5f0d",
  415: "986ac937483bb306ff7216e6b798f03a5f9facaf694e304a55311312e0b82eab",
  418: "6b6d92775fdff69d98657c85df7c204e42502a8716fffafcdbb00073cd19cf78",
  428: "e61d284778ed7d9587032f1bdd0e7c29191a44bec16fa659bd6e0c8b085df403",
  434: "9146f9a6e1fc60f04f950bd322730b518e5417633b2c1a09fb7487c7f5147f34",
  440: "aa311e0da6d91e53274b8240379c504b5ca70cb1d4fbb18aa09dadc6e58e4916",
  446: "5b16fd535d0736a522f88c399c4755df5f5b5e1dd16365326f5bc056b9efccfd",
  453: "4c8cc909b9627da473ce989d303fd7e1b5df5b7d728a5cefd0a8680eaada7940",
  458: "ddf3a3eef10906db01dbcd18497173cb285f2230a0d30543f70347507b637a00",
  467: "d3358134412394b14f65099e1af1ce847373cfb454b96a11ba3c4787e31b74d2",
  477: "110d2f40f6ee656f236ff07589dab44338462476bf4298cff7cc6bfd5335ffe8",
  483: "36c749a22dc300ffc85ec209facbc837476032a069d4dcceb72fb27e171a0b0a",
  489: "a25cdae8bef7b76476943d9c0c9d494ca910b0f3892bd09501a8db6f647f732f",
  496: "ef31c642853078622a9de80e648cd01a43f385b65b65210ef124020e6413568e",
  499: "5f1abefe699b393f865eeae4f74429d95016f67e99cdccecc25311617eccc287",
  502: "8993ac8e8804346fb392b72b553e6fe324f126978b3041223b8e6a6222904329",
  507: "45a34808e6578b7ae47fbd6bfd60a9f8af1cad6c650a2b9455a5d3a1b5568a03",
  511: "d199087b42ac97f80b7d309d46107db728734cb968cb12d23ad120678d1df735",
  515: "792fe5a20dde3b40bd2f0c65a2903b8d54ba9fc62a40a898e30bcd4fe0724f45",
  518: "680ba381aa88acf32b5325cafaa1cf12012b931010213a83e8acfbe1a6f680c4",
  520: "e4236f3a120c1debc464354dc7c8a62086f76c94e8fefcce92c052731d8dc385",
  523: "ee7fb06c0a69bf28444f8d797f6a412dc4566618d2a007d0097d47d20c90b2c5",
  526: "2857c6f3e8ff102852355f3c22f83fb9a07cac000b718587d8123700a3a65e1e",
  528: "0b3bc5356b4d3bb8b1a1959a97e173a84065bdbf3d5a8dbebda8ecedcbde2e03",
  531: "78ec02c8b19e3d1327cb6d86317d42a4cbf3f951de9781842c3600935a875356",
  534: "e0254bda2f5cf4d685eeacfd24a0579f1969aa4c984967287d164041b4ec97dc",
  537: "64c05c1873cf3f1d270444288c3b50c0f1462db8f17f2a91234e6a34b8ba445c",
  542: "237d7a6d01b0df8d2688ec40defcfd3e9da7313ecc9491b1adfce4bb0a91c4de",
  545: "1d94e2fda2c394f8f5d5eb28e7d0b641a324c0da6dd1490fd277c7b3a25c4164",
  549: "3f2dc873a852938e326ace6f4059be4d33276f3dd50e4093ad80fb6a85a34846",
  551: "bb6459834a29d6678416a2bafe4afe891e776bb2e5f34a58a53032f7f0ede1aa",
  553: "5d569c8f02bbcc16d417d421456973a27fec5dd522328bcef031749414c68dca",
  554: "9bd85d02da880e957a0fca8d2922cedeeb1110e7936db9fff1f56eea33c8ff18",
  556: "afae5232cc25016ceeb6cfbcda2d97e39a703ddca8137a88d44cb701a6ef15af",
  558: "3d6dad1426f0b5ce07a8ac3fa4f94118b568d3ee9276369a664f2ae252a83340",
  560: "a38060f6bb602e076f04a7832c9882374949df0ed5bcabae0978d8a94cdf835c",
  562: "de9c7aafe0e3cf1d8ae603ede468a0002e1340ff83929d8d84e7d6cc97d80654",
  564: "561513a1772dcec9bbfb4d80aad3dd683f2bd68a912787faa78db61aeb807a45",
  566: "29ec9f5f9d5dd99add19cb2c93d08546dc7e44b4aa50b321d6c34f3047b2669f",
  568: "a4fc6d3ce9cbcf527a3c744e52b1e4c64e6aed1ae1e40d49208f376811da56f0",
  570: "fb47d7d43450ee2da7af2115d392f4292daa237744f3de721d172a3eaad2b5b9",
  572: "dacd35db1145265789990371b096a170fd40b38ad375132eca9590145169fda6",
  574: "a139638127aeea80dc108e6e1cad1ab639bf0e29bf4a1135e121517beeb886a7",
  575: "17e17ae21f64fa9ac8d58bc6018b101a8167dabd5529ffb6b4d081c6998f2d82",
  577: "6739d56f0afbeddfad7f8d4abfea7151ce4f746b89f4c18ab9cf884def326a6d",
  578: "d071be6e912ee85ae96a2f80e273a5d11a9a381506c1c95c6c9fb94beefa106f",
  580: "255e932c3a166a61c57002f4fef77704d4d4a4c179ff61ae50441a7fbe900a71",
  582: "6fa56548155bed23fa98ee2f3e80417006d0455791c8bec23e7c9b369e0675fe",
  583: "db075219cef0020231656bae86353c1e86a765038c13beab8a5e006b34026edc",
  585: "7e7a247fbe1febe7ab5b66f1642245133572a32bdf3c4baccb4e2f066bad2024",
  586: "2e94d577e2d382e9b68718a6c032cb34ecc6636df545335c2d08cd484f8b9394",
  587: "60c4e0b16aa362912f68b64ed648e24ad7503cb571560e74a85724f2f4b04e63",
  589: "58099efd9d45ec45b4c629cac467e514ae32d456dbfc6d5d6ed223148d7a659c",
  590: "230f764a3fc9341f0a4d4a52399437a8f382f3924a5ab6da834d6e4c0de8ba2c",
  591: "2cb656ac37fff5a693be70f6770cf0c5da2c1f69e28b52c78ee4bfbc9ca704cb",
  592: "b2c77339df34ae92fa73b40167550a807b53c91de2a8f976dbe047e2ce7fb65b",
  593: "8b6df930e6b33d011eac0dd213125b0c37e3ae95750b75d88d248a0489653995",
  594: "4b0f051f7610a6c010b9c227d9b8c4f57fe6753fee3bb5efcbbfbbca6c42ea5d",
  595: "e7cfdab756d25b88810e517c92622bf61b93bc3a98995d507ea9c15cd184c71b",
  596: "f5fa8e5a635866a1ae29c8ff798d5303ca1f1efdf8e9469b1a88f19950d2f9f2",
  597: "da1cce8720cfe154acd0c80f941f626f090c0894f87a4c79195a6ff231304731",
  598: "c19d38157eed053a263064f56499504346c18b91bb3ce4226173de94b3b15a53",
  599: "93c86f63d1c7b7d69ff427bf3288af5ca15fe486bca1d3179754f52ff2e7ecfb",
  600: "2a38b28575b7ef7bcdc81cdfe011372d4b6eb4de3b2b05ab9098c910e6ef8d30",
  601: "157a7d5a13cb39d701170196f1903e9d3dbffdfdc9e78bc0349b5c83ce903af5",
  602: "deb40b6370dfaaadbcec471618347de8cc24b051f97823eabf17ed440b8ddec0",
  603: "3228078865bf5121c03dd97d82c2dedc91c64127a363148cd3d61dcec626454d",
  604: "511a9b427240a56777d2d5ddae71ed4af31be5e6fa80a9be3b7cea807ce22437",
};

/** png.quran.ws's page matrix without its offset: PDF points to its units, y down. */
const SCALE: Matrix = [1.3333, 0, 0, -1.3333, 0, 0];

const union = (bs: Box[]): Box => [
  Math.min(...bs.map((b) => b[0])),
  Math.min(...bs.map((b) => b[1])),
  Math.max(...bs.map((b) => b[2])),
  Math.max(...bs.map((b) => b[3])),
];
const inside = (a: Box, b: Box, tol = 0.5) => a[0] >= b[0] - tol && a[1] >= b[1] - tol && a[2] <= b[2] + tol && a[3] <= b[3] + tol;

/** The surah headers printed on `page`, top to bottom. */
export async function surahHeaders(page: number, cacheDir: string): Promise<SurahHeader[]> {
  const sha = HEADER_PAGES[page];
  if (!sha) throw new Error(`surah header: no pinned vector file for page ${page}`);
  const ps = await filledPieces(await vectorFile(page, sha, cacheDir), SCALE);

  // Bands: ornament paths one printed line wide and one line tall.
  const ornament = new Map<number, typeof ps>();
  for (const p of ps) if (p.layer.startsWith("Ornament")) ornament.set(p.path, [...(ornament.get(p.path) ?? []), p]);
  const bands = [...ornament.values()]
    .map((pieces) => ({ pieces, bb: union(pieces.map((p) => p.bb)) }))
    .filter(({ bb }) => bb[2] - bb[0] > 200 && bb[3] - bb[1] < 50)
    .sort((a, b) => a.bb[1] - b.bb[1]);

  return bands.map(({ bb }) => {
    const [w, h] = [bb[2] - bb[0], bb[3] - bb[1]];
    if (w < 320 || w > 340 || h < 35 || h > 40) throw new Error(`surah header on page ${page}: band ${w.toFixed(1)}×${h.toFixed(1)}`);
    // The name: text pieces inside the band. Pages 50 and 77 also draw the
    // cartouche filled with the name cut out, as well as the name itself:
    // drop the cartouche outline (wider than any letter) and the duplicates,
    // which would cancel each other under even-odd filling.
    const seen = new Set<string>();
    const name = ps.filter((p) => {
      if (p.layer.startsWith("Ornament") || !inside(p.bb, bb) || p.bb[2] - p.bb[0] > 80) return false;
      const key = p.bb.map((v) => v.toFixed(2)).join();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (name.length < 10) throw new Error(`surah header on page ${page}: only ${name.length} pieces of the name`);
    // Only the name is kept (the page draws a thin rule on each side of it),
    // cropped to its own ink: centred on x = 0, top at y = 0.
    const nb = union(name.map((p) => p.bb));
    const byPath = new Map<number, { d: string; rule: string }>();
    for (const p of name) byPath.set(p.path, { d: (byPath.get(p.path)?.d ?? "") + p.d, rule: p.rule });
    const paths = [...byPath.values()].map(({ d, rule }) => {
      const out: GlyphPath = { d: svgpath(d).translate(-(nb[0] + nb[2]) / 2, -nb[1]).round(2).toString() };
      if (rule === "evenodd") out.rule = "evenodd";
      return out;
    });
    const r = (v: number) => Math.round(v * 100) / 100;
    return { width: r(nb[2] - nb[0]), height: r(nb[3] - nb[1]), name: paths };
  });
}
