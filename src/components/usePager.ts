import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import type { TouchEvent } from "react";
import { useNavigate } from "react-router";

/**
 * Page turning for the reading view: swipe, arrow keys and the footer links.
 *
 * Mushaf order: the next page lies to the left. `ref` is a track holding the
 * current page with its neighbours beside it (next on the left, previous on
 * the right), so the pages move as one strip: dragging right pulls the next
 * page in with the finger (ArrowLeft does the same), dragging left the
 * previous one. On release the strip finishes the move in one slide; the
 * route then changes and the strip is put back at 0 in the same frame, with
 * the neighbour now the current page. Without a neighbour in that direction
 * the strip only gives a little and springs back.
 *
 * `dir` is +1 for the next page (content moves right), -1 for the previous.
 */
export function usePager({ page, next, prev }: { page: number; next: number | null; prev: number | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  /** True from the start of a turn until the new page is in place. */
  const busy = useRef(false);
  const drag = useRef<{ x: number; y: number; t: number; dx: number; axis: "x" | "y" | null } | null>(null);
  /** True right after a drag, so the click that may follow it does not toggle the bars. */
  const dragged = useRef(false);

  const go = useCallback(
    (dir: 1 | -1) => {
      const target = dir === 1 ? next : prev;
      const el = ref.current;
      if (!target || !el || busy.current) return;
      busy.current = true;
      slide(el, dir * el.offsetWidth, () => navigate(`/${target}`));
    },
    [next, prev, navigate],
  );

  // After the route change the neighbour is the current page (same panel, now
  // at offset 0): put the strip back at 0 before the browser paints, so
  // nothing moves on screen. Each page keeps its own scroll (see Panel in App).
  useLayoutEffect(() => {
    const el = ref.current;
    busy.current = false;
    if (!el) return;
    el.style.transition = "none";
    el.style.transform = "";
  }, [page]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if ((e.target as Element | null)?.closest?.("input, textarea, select, [contenteditable]")) return;
      if (e.key === "ArrowLeft") go(1);
      else if (e.key === "ArrowRight") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  const touch = {
    onTouchStart(e: TouchEvent) {
      dragged.current = false;
      // Two fingers (pinch) or a zoomed-in page: leave the gesture to the browser.
      if (busy.current || e.touches.length > 1 || (window.visualViewport?.scale ?? 1) > 1.01) {
        drag.current = null;
        return;
      }
      const t = e.touches[0];
      drag.current = { x: t.clientX, y: t.clientY, t: e.timeStamp, dx: 0, axis: null };
    },
    onTouchMove(e: TouchEvent) {
      const d = drag.current;
      const el = ref.current;
      if (!d || !el) return;
      if (e.touches.length > 1) {
        drag.current = null;
        el.style.transform = "";
        return;
      }
      const t = e.touches[0];
      const dx = t.clientX - d.x;
      const dy = t.clientY - d.y;
      if (!d.axis) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        d.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        dragged.current = true;
      }
      if (d.axis !== "x") return;
      d.dx = dx;
      const open = dx > 0 ? next : prev;
      el.style.transition = "none";
      el.style.transform = `translate3d(${open ? dx : dx * 0.2}px, 0, 0)`;
    },
    onTouchEnd(e: TouchEvent) {
      const d = drag.current;
      const el = ref.current;
      drag.current = null;
      if (!d || !el || d.axis !== "x") return;
      const dir = d.dx > 0 ? 1 : -1;
      const speed = Math.abs(d.dx) / Math.max(1, e.timeStamp - d.t); // px per ms
      const far = Math.abs(d.dx) > el.offsetWidth * 0.2 || (speed > 0.4 && Math.abs(d.dx) > 30);
      if (far && (dir === 1 ? next : prev)) go(dir);
      else
        slide(el, 0, () => {
          el.style.transform = "";
          el.style.transition = "";
        });
    },
    onTouchCancel() {
      drag.current = null;
      const el = ref.current;
      if (el && !busy.current) el.style.transform = "";
    },
  };

  /** Whether the gesture behind this click was a drag rather than a tap (read once per click). */
  const wasDrag = () => {
    const d = dragged.current;
    dragged.current = false;
    return d;
  };

  return { ref, go, touch, wasDrag };
}

const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Animates `el` to translateX(x), then calls `done` (at once when motion is reduced). */
function slide(el: HTMLElement, x: number, done: () => void) {
  if (reduceMotion()) {
    el.style.transition = "none";
    el.style.transform = x ? `translate3d(${x}px, 0, 0)` : "";
    done();
    return;
  }
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    el.removeEventListener("transitionend", onEnd);
    done();
  };
  const onEnd = (e: TransitionEvent) => e.target === el && finish();
  el.addEventListener("transitionend", onEnd);
  el.style.transition = "transform 220ms cubic-bezier(0.2, 0.7, 0.3, 1)";
  el.style.transform = `translate3d(${x}px, 0, 0)`;
  // transitionend does not fire when nothing moves (already at x) or the tab is hidden.
  setTimeout(finish, 300);
}
