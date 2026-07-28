import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { zh } from "./zh";
import { en } from "./en";

export type Lang = "zh" | "en";

const dict: Record<Lang, Record<string, string>> = { zh, en };

// 模块级当前语言，供非 React 上下文环境（如 utils/format.ts 的元数据）同步取用。
let currentLang: Lang = (localStorage.getItem("lang") as Lang) || "zh";

export function getLang(): Lang {
  return currentLang;
}

/** 全局翻译函数：缺失英文时回落到中文，避免界面出现原始 key。支持 {name} 形式的参数插值。 */
export function translate(key: string, params?: Record<string, string | number>): string {
  let s = dict[currentLang][key] ?? dict.zh[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.split(`{${k}}`).join(String(v));
    }
  }
  return s;
}

const LanguageContext = createContext<{
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  translate: (key: string, params?: Record<string, string | number>) => string;
}>({
  lang: currentLang,
  setLang: () => {},
  t: (k, p) => translate(k, p),
  translate,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(currentLang);

  const setLang = useCallback((l: Lang) => {
    currentLang = l;
    localStorage.setItem("lang", l);
    setLangState(l);
    // 跨标签页同步
    try {
      window.dispatchEvent(new Event("langchange"));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const sync = () => setLangState(currentLang);
    window.addEventListener("langchange", sync);
    const onStorage = (e: StorageEvent) => {
      if (e.key === "lang" && e.newValue) {
        currentLang = e.newValue as Lang;
        setLangState(currentLang);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("langchange", sync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => translate(key, params),
    []
  );

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, translate }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useI18n() {
  return useContext(LanguageContext);
}
