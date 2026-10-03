"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { translate, type Lang } from "../i18n/dicts";

interface LangCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
}

const LangContext = createContext<LangCtx>({
  lang: "en",
  setLang: () => {},
  t: (k) => k,
});

const LS_KEY = "metapi.lang";

function detectLang(): Lang {
  if (typeof window === "undefined") return "en";
  const saved = localStorage.getItem(LS_KEY);
  if (saved === "en" || saved === "zh-Hant" || saved === "zh-Hans") return saved;
  const nav = navigator.language || "";
  return nav.startsWith("zh")
    ? /TW|HK|MO|Hant/i.test(nav)
      ? "zh-Hant"
      : "zh-Hans"
    : "en";
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => detectLang());

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(LS_KEY, l);
    } catch {}
  }, []);

  useEffect(() => {
    document.documentElement.lang =
      lang === "en" ? "en" : lang === "zh-Hant" ? "zh-Hant" : "zh-Hans";
  }, [lang]);

  const t = useCallback((key: string) => translate(lang, key), [lang]);

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang() {
  return useContext(LangContext);
}
