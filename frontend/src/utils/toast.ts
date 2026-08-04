import { message } from "antd";

/**
 * 统一 Toast 封装。
 *
 * 设计目标：
 * - 收敛散落在各页面的 antd `message.xxx` 调用，集中管理默认行为与去重逻辑；
 * - 旧代码中的 `import { message } from "antd"; message.success(...)` 仍可直接使用，零回归；
 * - 本封装在静态 message 之上做：默认时长、相同内容短时间内不去重重复刷屏、可统一替换。
 *
 * 注意：静态 message 不读取 ConfigProvider 上下文（主题/语言）。若需与 ConfigProvider
 * 完全联动，可在组件内改用 `App.useApp()` 拿到的 message 实例；本统一封装面向「全局一次性提示」。
 */

const DEFAULT_DURATION = 3; // 秒
const DEDUPE_MS = 1200; // 相同内容去重窗口
const lastShown = new Map<string, number>();

type ToastType = "success" | "error" | "info" | "warning" | "loading";

function show(type: ToastType, content: string, duration?: number) {
  const now = Date.now();
  const key = `${type}:${content}`;
  const prev = lastShown.get(key);
  if (prev && now - prev < DEDUPE_MS) {
    return; // 短时间内相同提示不重复弹
  }
  lastShown.set(key, now);
  // 加载态不自动消失；其余用默认时长（未显式传 0 时）
  const d = duration ?? (type === "loading" ? 0 : DEFAULT_DURATION);
  return message[type](content, d);
}

export const toast = {
  success: (content: string, duration?: number) => show("success", content, duration),
  error: (content: string, duration?: number) => show("error", content, duration),
  info: (content: string, duration?: number) => show("info", content, duration),
  warning: (content: string, duration?: number) => show("warning", content, duration),
  loading: (content: string, duration?: number) => show("loading", content, duration),
  /** 透传 antd message.open 的高级用法（带 icon / onClick 等），不做去重 */
  open: (config: Parameters<typeof message.open>[0]) => message.open(config),
  /** 手动关闭 loading 态返回的 key */
  destroy: () => message.destroy(),
};
