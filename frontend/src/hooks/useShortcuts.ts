import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";

/**
 * 全局键盘快捷键。
 * - `/`   ：聚焦搜索（已在搜索页则聚焦输入框，否则跳到搜索页并自动聚焦）
 * - `?`   ：打开快捷键帮助面板
 * - `Esc` ：由 antd 弹层自身处理；帮助面板也会被关闭
 *
 * 在输入框 / textarea / contenteditable 聚焦时不触发 `/` 与 `?`，避免与输入冲突。
 * 仅绑定一次（挂在 App 顶层）。
 */
function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable
  );
}

export function useShortcuts() {
  const navigate = useNavigate();
  const location = useLocation();
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 修饰键（Ctrl/Meta/Alt）组合不拦截，留给浏览器/系统快捷键
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;

      if (e.key === "/") {
        e.preventDefault();
        if (location.pathname === "/search") {
          // 已在搜索页：聚焦搜索框（页面读取 ?focus=1 或自动聚焦首个输入框）
          navigate("/search?focus=1");
        } else {
          navigate("/search?focus=1");
        }
      } else if (e.key === "?") {
        e.preventDefault();
        setHelpOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, location.pathname]);

  return { helpOpen, setHelpOpen };
}
