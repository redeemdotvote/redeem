import { useCallback, useEffect, useState } from "react";
import { appKit } from "../lib/wallet";

export type Theme = "light" | "dark";

const KEY = "redeem-theme";

/** Light is the product's own theme; dark is opt-in and remembered. */
function read(): Theme {
  try {
    return localStorage.getItem(KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function apply(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
  // The wallet modal renders outside our stylesheet, so it has to be told separately.
  try {
    appKit?.setThemeMode?.(theme);
    appKit?.setThemeVariables?.({ "--w3m-accent": theme === "dark" ? "#4ade9b" : "#157a4f" });
  } catch {}
}

/**
 * Theme lives on <html> as the `dark` class, set before first paint by the inline script in
 * index.html. This hook only reads and flips it — no provider, no context, no hydration gap.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(read);

  useEffect(() => {
    apply(theme);
    try {
      localStorage.setItem(KEY, theme);
    } catch {}
  }, [theme]);

  // Another tab flipping the theme should flip this one too.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === KEY) setTheme(read());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const toggle = useCallback(() => setTheme((value) => (value === "dark" ? "light" : "dark")), []);

  return { theme, setTheme, toggle, isDark: theme === "dark" };
}
