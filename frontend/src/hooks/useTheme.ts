import { useCallback, useEffect, useState } from "react";

/**
 * 全局主题（浅色 / 深色）状态管理。
 * - 持久化到 localStorage，刷新后保留；
 * - 首次访问读取系统 `prefers-color-scheme` 作为默认值；
 * - 同步写入 <html data-theme="dark|light">，供 index.css 的 [data-theme="dark"] 覆盖规则生效。
 */
const STORAGE_KEY = "ui-theme";

export type ThemeMode = "light" | "dark";

function getInitialMode(): ThemeMode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* 隐私模式下 localStorage 可能不可用，忽略 */
  }
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return "light";
}

function applyToDocument(mode: ThemeMode) {
  const root = document.documentElement;
  root.dataset.theme = mode;
  root.style.colorScheme = mode;
}

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(getInitialMode);

  useEffect(() => {
    applyToDocument(mode);
  }, [mode]);

  const toggleTheme = useCallback(() => {
    setMode((m) => {
      const next: ThemeMode = m === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* 忽略持久化失败 */
      }
      return next;
    });
  }, []);

  const setTheme = useCallback((next: ThemeMode) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* 忽略 */
    }
    setMode(next);
  }, []);

  return { mode, isDark: mode === "dark", toggleTheme, setTheme };
}
