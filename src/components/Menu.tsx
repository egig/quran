import { useEffect, useRef, useState } from "react";

type Theme = "light" | "dark";

const systemTheme = (): Theme => (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

/**
 * Light/dark theme. Follows the system until the reader picks one; the
 * choice is remembered in this browser and stamped as data-theme on <html>
 * (index.html applies it before first paint).
 */
function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    const stamped = document.documentElement.dataset.theme;
    return stamped === "light" || stamped === "dark" ? stamped : systemTheme();
  });

  useEffect(() => {
    // Track the system setting while the reader has not chosen.
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (!document.documentElement.dataset.theme) setTheme(systemTheme());
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* storage unavailable: keep for this visit only */
    }
  };
  return [theme, toggle];
}

/** Whether translations are shown under the Arabic. On by default; remembered in this browser. */
export function useTranslations(): [boolean, () => void] {
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem("translation") !== "off";
    } catch {
      return true;
    }
  });
  const toggle = () => {
    setOn(!on);
    try {
      localStorage.setItem("translation", on ? "off" : "on");
    } catch {
      /* storage unavailable: keep for this visit only */
    }
  };
  return [on, toggle];
}

/**
 * The "more" menu (⋮) at the right of the top bar: dark mode and, in the
 * reader, translations on or off.
 */
export function Menu({ translations }: { translations?: [boolean, () => void] }) {
  const [open, setOpen] = useState(false);
  const [theme, toggleTheme] = useTheme();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        ref.current?.querySelector<HTMLButtonElement>(".menu-button")?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="menu" ref={ref}>
      <button
        type="button"
        className="menu-button"
        aria-label="Menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="5" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="12" cy="19" r="1.8" />
        </svg>
      </button>
      {open && (
        <div className="menu-list" role="menu">
          <Switch label="Mode gelap" on={theme === "dark"} toggle={toggleTheme} />
          {translations && <Switch label="Terjemahan" on={translations[0]} toggle={translations[1]} />}
        </div>
      )}
    </div>
  );
}

function Switch({ label, on, toggle }: { label: string; on: boolean; toggle: () => void }) {
  return (
    <button type="button" role="menuitemcheckbox" aria-checked={on} className="menu-item" onClick={toggle}>
      <span>{label}</span>
      <span className="switch" aria-hidden="true" />
    </button>
  );
}
