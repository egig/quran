/**
 * Layout pass for one row of translations under a printed line.
 *
 * The page first gives each translation the slot under its phrase's words
 * (neighbours split the gap at the midpoint). A slot can be narrower than the
 * longest word of its translation, so the text would spill into its
 * neighbour. This pass widens such slots to their longest word. If the row
 * is then too wide, it frees room in this order, each step only as far as
 * needed:
 *   1. empty space in slots wider than their text (no visible change);
 *   2. more line wrapping in the widest translations (whole words only:
 *      words are never broken, not even after their own hyphen);
 *   3. smaller text, never below MIN_FONT_PX; a row that still does not fit
 *      is reported in the console.
 * Then it moves the translations as little as possible (least squares from
 * their slot centres), keeping their order, without overlap and inside the
 * row. Rows that already fit are left exactly as they are.
 *
 * Each translation span carries its slot as fractions of the row width in
 * data-l (left edge) and data-w (width), in visual order right to left.
 */

const MIN_FONT_PX = 6;
const SCALE_STEP = 0.02;
/** Horizontal padding of a .seg (1px each side) plus rounding slack. */
const PAD = 3;

let ctx: CanvasRenderingContext2D | null = null;

/** Single-line width and widest whole word of `text`. */
function measure(text: string, font: string): { line: number; word: number } {
  ctx ??= document.createElement("canvas").getContext("2d");
  if (!ctx) return { line: 0, word: 0 };
  ctx.font = font;
  const line = ctx.measureText(text).width;
  let word = 0;
  for (const w of text.split(/\s+/)) if (w) word = Math.max(word, ctx.measureText(w).width);
  return { line: line + PAD, word: word + PAD };
}

/** Pool-adjacent-violators: the non-decreasing sequence closest (least squares) to `target`. */
function isotonic(target: number[]): number[] {
  const blocks: { sum: number; n: number }[] = [];
  for (const t of target) {
    blocks.push({ sum: t, n: 1 });
    while (blocks.length > 1) {
      const b = blocks[blocks.length - 1];
      const a = blocks[blocks.length - 2];
      if (a.sum / a.n <= b.sum / b.n) break;
      a.sum += b.sum;
      a.n += b.n;
      blocks.pop();
    }
  }
  return blocks.flatMap((b) => Array<number>(b.n).fill(b.sum / b.n));
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function fitRow(row: HTMLElement): void {
  const W = row.clientWidth;
  const spans = [...row.children] as HTMLElement[];
  if (!W || !spans.length) return;

  row.style.removeProperty("--k");
  // Left to right from here on.
  const items = spans
    .map((s) => ({
      s,
      left: Number(s.dataset.l) * W,
      slot: Number(s.dataset.w) * W,
      ...measure(s.textContent ?? "", getComputedStyle(s).font),
    }))
    .reverse();

  // Largest x in [lo, hi] with sum(f(x)) <= W (f grows with x).
  const largest = (f: (x: number) => number[], lo: number, hi: number) => {
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (sum(f(mid)) <= W) lo = mid;
      else hi = mid;
    }
    return f(lo);
  };
  const widest = Math.max(...items.map((it) => it.line));

  let k = 1;
  let widths = items.map((it) => Math.max(it.slot, it.word));
  if (sum(widths) > W) {
    // 1. Drop empty slot space: a box need not be wider than its text.
    const base = items.map((it) => Math.max(it.word, Math.min(it.slot, it.line)));
    // 2. Cap every box at c: wider translations wrap onto more lines.
    const wrapped = (c: number) => items.map((it, i) => Math.max(it.word, Math.min(base[i], c)));
    // 3. Smaller text (scale k), wrapped as far as whole words allow.
    const scaled = (k: number) => items.map((it) => it.word * k);
    if (sum(base) <= W) widths = base;
    else if (sum(wrapped(0)) <= W) widths = largest(wrapped, 0, widest);
    else {
      const minScale = Math.min(1, MIN_FONT_PX / parseFloat(getComputedStyle(spans[0]).fontSize));
      k = 1;
      widths = scaled(1);
      while (sum(widths) > W && k > minScale + 1e-9) {
        k = Math.max(minScale, k - SCALE_STEP);
        widths = scaled(k);
      }
      row.style.setProperty("--k", String(k));
      if (sum(widths) > W + 0.5)
        console.warn(`Translations do not fit this line at ${W}px:`, items.map((it) => it.s.textContent).reverse());
    }
  }

  // Left edges L_i with L_{i+1} >= L_i + w_i. With s_i the sum of the widths
  // before i, u_i = L_i - s_i must be non-decreasing; its target keeps each
  // translation centred on its slot. Clamping keeps the row inside [0, W].
  const before: number[] = [];
  widths.reduce((acc, w, i) => ((before[i] = acc), acc + w), 0);
  const target = items.map((it, i) => it.left + it.slot / 2 - widths[i] / 2 - before[i]);
  const room = Math.max(0, W - sum(widths));
  const u = isotonic(target).map((v) => Math.min(Math.max(v, 0), room));

  let edge = W; // left edge of the previous span; the row runs right to left
  for (let i = items.length - 1; i >= 0; i--) {
    const left = u[i] + before[i];
    const { style } = items[i].s;
    style.width = `${widths[i]}px`;
    style.marginRight = `${edge - (left + widths[i])}px`;
    edge = left;
  }
}
