"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { nextThemeMode, resolveTheme, type Theme, type ThemeMode } from "../lib/theme";
export type { Theme, ThemeMode } from "../lib/theme";

interface ThemeCtx {
  theme: Theme;
  mode: ThemeMode;
  setTheme: (mode: ThemeMode) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeCtx>({ theme: "dark", mode: "system", setTheme: () => {}, toggle: () => {} });
const LS_KEY = "metapi.theme";

function storedMode(): ThemeMode {
  try {
    const value = localStorage.getItem(LS_KEY);
    if (value === "light" || value === "dark" || value === "system") return value;
  } catch {}
  return "system";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(storedMode);
  const [prefersLight, setPrefersLight] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-color-scheme: light)").matches);
  const theme = resolveTheme(mode, prefersLight);

  const setTheme = useCallback((value: ThemeMode) => {
    setMode(value);
    try { localStorage.setItem(LS_KEY, value); } catch {}
  }, []);
  const toggle = useCallback(() => setTheme(nextThemeMode(mode)), [mode, setTheme]);

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: light)");
    if (!media) return;
    const update = () => setPrefersLight(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => { document.documentElement.setAttribute("data-theme", theme); }, [theme]);
  const value = useMemo(() => ({ theme, mode, setTheme, toggle }), [theme, mode, setTheme, toggle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() { return useContext(ThemeContext); }
