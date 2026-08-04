/**
 * T6：统一前端错误上报。
 *
 * 设计原则（与后端零密钥/零依赖降级一致）：
 * - 生产环境若存在全局错误上报（如 Sentry、监控 SDK），在此处 hook 即可；
 *   未配置时降级为分级 console.error，绝不吞掉异常。
 * - 业务代码用 reportError(e) 替代 `.catch(() => {})`，避免"请求失败被伪装成暂无数据"。
 * - 副作用类异常（视频播放、全屏、ServiceWorker 注册等）仍可用 swallow() 显式忽略，
 *   以表达"此处吞错是有意为之"，并通过 eslint no-empty-function 兜底防回归。
 */

interface ReportMeta {
  /** 调用位置标签，便于定位（如 "ProductDetail.load"）*/
  tag?: string;
  /** 额外上下文 */
  extra?: Record<string, unknown>;
}

type ErrorReporter = (err: unknown, meta?: ReportMeta) => void;

let _reporter: ErrorReporter | null = null;

/** 允许运行时注入真实的错误上报实现（Sentry 等）。*/
export function setErrorReporter(reporter: ErrorReporter | null): void {
  _reporter = reporter;
}

// 内存错误日志（ring buffer），便于本地排障与运维聚合查询，不依赖任何外部服务。
const _log: Array<{ at: number; tag?: string; message: string; stack?: string }> = [];
const MAX_LOG = 50;

/** 返回最近收集的错误日志（只读快照），用于运维/调试面板聚合。*/
export function getErrorLog() {
  return _log.slice();
}

/** 上报一个错误（永不抛出）。*/
export function reportError(err: unknown, meta?: ReportMeta): void {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  _log.push({ at: Date.now(), tag: meta?.tag, message, stack });
  if (_log.length > MAX_LOG) _log.shift();
  try {
    if (_reporter) {
      _reporter(err, meta);
      return;
    }
  } catch {
    /* 上报通道自身异常不应影响主流程 */
  }
  // 降级：分级日志，保留原始堆栈
  const tag = meta?.tag ? `[${meta.tag}] ` : "";
  console.error(`${tag}未捕获错误:`, err, meta?.extra ?? "");
}

// 全局未捕获异常自动上报（window 级兜底），与主流程解耦。
let _globalHooked = false;
if (typeof window !== "undefined" && !_globalHooked) {
  _globalHooked = true;
  window.addEventListener("error", (e) => {
    reportError(e.error ?? e.message, { tag: "window.onerror" });
  });
  window.addEventListener("unhandledrejection", (e) => {
    reportError(e.reason, { tag: "unhandledrejection" });
  });
}

/**
 * 显式吞掉"预期内、无业务影响"的副作用异常（如全屏失败、视频自动播放被拦截）。
 * 与 reportError 区分：调用方明确接受忽略该异常，仅是语义化封装，避免裸 `.catch(() => {})`。
 */
export function swallow(err: unknown, tag?: string): void {
  if (!tag) return;
  // 仅记录 debug 级别，便于排查但不打扰
  console.debug(`[swallow:${tag}] 已忽略预期内异常:`, err);
}
