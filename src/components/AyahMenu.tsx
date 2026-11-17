import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, TouchEvent } from "react";
import { Link, useLocation } from "react-router";
import { isBookmarked, toggleBookmark, useAccount, useBookmarks } from "../account.ts";
import { ayahAt } from "./MushafPage.tsx";

export interface AyahTarget {
  surah: number;
  ayah: number;
  /** Surah name, for the menu title. */
  name: string;
  x: number;
  y: number;
}

/** Hold time before a touch opens the ayah menu, and how far the finger may move meanwhile. */
const HOLD_MS = 500;
const SLOP = 10;

/**
 * Right click (or a long press on a touch screen) on an ayah opens its menu.
 * `name` gives a surah's name. Returns the open target, the handlers for the
 * page strip, and `consumed()`, true right after a press opened the menu so
 * the click that follows does not toggle the bars.
 *
 * Android fires `contextmenu` on a long press itself; iOS does not, so a
 * timer covers it. Whichever comes first opens the menu.
 */
export function useAyahPress(name: (surah: number) => string) {
  const [target, setTarget] = useState<AyahTarget | null>(null);
  const hold = useRef<{ x: number; y: number; timer: number } | null>(null);
  const opened = useRef(0);

  const open = (el: Element, x: number, y: number) => {
    const hit = ayahAt(el, x);
    if (!hit) return false;
    opened.current = Date.now();
    setTarget({ ...hit, name: name(hit.surah), x, y });
    return true;
  };
  const cancel = () => {
    if (hold.current) clearTimeout(hold.current.timer);
    hold.current = null;
  };
  useEffect(() => cancel, []);
  const close = useCallback(() => setTarget(null), []);

  return {
    target,
    close,
    consumed: () => Date.now() - opened.current < 800,
    handlers: {
      onContextMenu(e: ReactMouseEvent) {
        cancel();
        if (open(e.target as Element, e.clientX, e.clientY)) e.preventDefault();
      },
      onTouchStart(e: TouchEvent) {
        cancel();
        if (e.touches.length !== 1) return;
        const t = e.touches[0];
        const el = e.target as Element;
        hold.current = {
          x: t.clientX,
          y: t.clientY,
          timer: window.setTimeout(() => {
            hold.current = null;
            open(el, t.clientX, t.clientY);
          }, HOLD_MS),
        };
      },
      onTouchMove(e: TouchEvent) {
        const h = hold.current;
        const t = e.touches[0];
        if (h && t && Math.hypot(t.clientX - h.x, t.clientY - h.y) > SLOP) cancel();
      },
      onTouchEnd: cancel,
      onTouchCancel: cancel,
    },
  };
}

/**
 * The menu of one ayah, at the point that opened it: bookmark it or remove
 * its bookmark, or sign in first.
 */
export function AyahMenu({ target, page, close }: { target: AyahTarget; page: number; close: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const { user, pending } = useAccount();
  const list = useBookmarks();
  const { pathname } = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [pos, setPos] = useState({ left: target.x, top: target.y });
  const marked = isBookmarked(list, target.surah, target.ayah);

  // Keep the menu on screen.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const m = 8;
    const { width, height } = el.getBoundingClientRect();
    setPos({
      left: Math.max(m, Math.min(target.x, innerWidth - width - m)),
      top: target.y + height + m > innerHeight ? Math.max(m, target.y - height) : target.y,
    });
    el.querySelector<HTMLElement>("[role=menuitem]")?.focus();
  }, [target]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && close();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    // Capture: a scroll inside any page panel closes it too.
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [close]);

  const toggle = async () => {
    try {
      await toggleBookmark(target.surah, target.ayah, page);
      close();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div
      ref={ref}
      className="ayah-menu"
      role="menu"
      aria-label={`QS ${target.name} ${target.surah}:${target.ayah}`}
      style={pos}
      lang="id"
      onClick={(e) => e.stopPropagation()}
    >
      <p className="ayah-menu-title">
        QS {target.name} {target.surah}:{target.ayah}
      </p>
      {pending ? (
        <p className="ayah-menu-note">Memuat…</p>
      ) : user ? (
        <button type="button" role="menuitem" className="menu-item" onClick={toggle} disabled={list === null}>
          <BookmarkIcon filled={marked} />
          <span>{marked ? "Hapus tanda" : "Tandai ayat"}</span>
        </button>
      ) : (
        <Link role="menuitem" className="menu-item" to={`/masuk?kembali=${encodeURIComponent(pathname)}`}>
          <BookmarkIcon filled={false} />
          <span>Masuk untuk menandai</span>
        </Link>
      )}
      {error && <p className="ayah-menu-note error">{error}</p>}
    </div>
  );
}

export function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg className="bookmark-icon" viewBox="0 0 24 24" aria-hidden="true" data-filled={filled || undefined}>
      <path d="M6 3.5h12v17l-6-4.2-6 4.2z" />
    </svg>
  );
}
