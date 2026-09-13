import { useSyncExternalStore } from "react";

/**
 * The theme.
 *
 * Dark is the default: OpenLoop is an operations surface people leave open, and
 * the light theme is a preference rather than a requirement. The choice is
 * applied to `<html class="dark">` before first paint by the inline script in
 * `index.html`; this module only reads and changes it afterwards.
 *
 * Nothing here re-renders the app tree — a theme change is a change to the CSS
 * variables in `src/index.css`, and every component is already reading them.
 */

export type Theme = "light" | "dark";

const STORAGE_KEY = "openloop.theme";
const THEME_COLOR: Record<Theme, string> = { light: "#FBFBFD", dark: "#0E0E11" };

const listeners = new Set<() => void>();

/** The theme currently applied to the document. */
export function currentTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function apply(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", THEME_COLOR[theme]);
}

export function setTheme(theme: Theme) {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* Private mode, or storage disabled — the theme still applies, it just
       will not be remembered. */
  }
  apply(theme);
  for (const listener of listeners) listener();
}

export function toggleTheme() {
  setTheme(currentTheme() === "dark" ? "light" : "dark");
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The applied theme, kept in sync across every toggle on the page. */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, currentTheme, () => "dark" as Theme);
}
