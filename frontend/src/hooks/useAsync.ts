import { useCallback, useEffect, useRef, useState } from "react";
import { getErrorMessage } from "../api/client";

export interface AsyncState<T> {
  /** 请求成功后的数据；失败或首次加载时为 undefined */
  data: T | undefined;
  /** 首次或重试加载中 */
  loading: boolean;
  /** 可直接展示给用户的错误文案；无错误时为 null */
  error: string | null;
  /** 重新执行一次请求 */
  retry: () => void;
  /** 手动覆盖数据（乐观更新用） */
  setData: (updater: T | ((prev: T | undefined) => T)) => void;
}

/**
 * 统一的异步数据三态 hook。
 *
 * 解决全站 `.catch(() => {})` 把"请求失败"伪装成"暂无数据"的问题：
 * 调用方拿到明确的 loading / error / data 三态，配合 <AsyncBoundary> 渲染
 * 骨架屏、错误+重试、空态引导三种不同界面。
 *
 * @param fetcher 返回 Promise 的取数函数
 * @param deps    依赖数组，变化时自动重新取数（语义同 useEffect）
 */
export function useAsync<T>(fetcher: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [data, setDataState] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  // fetcher 通常是内联箭头函数，用 ref 持有以免把它写进依赖导致死循环
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  // 组件卸载 / 依赖变更后，丢弃过期请求的结果，避免竞态覆盖与卸载后 setState
  const runIdRef = useRef(0);

  useEffect(() => {
    const runId = ++runIdRef.current;
    setLoading(true);
    setError(null);
    fetcherRef
      .current()
      .then((res) => {
        if (runIdRef.current !== runId) return;
        setDataState(res);
      })
      .catch((e) => {
        if (runIdRef.current !== runId) return;
        setError(getErrorMessage(e));
      })
      .finally(() => {
        if (runIdRef.current !== runId) return;
        setLoading(false);
      });
    return () => {
      // 依赖变更：使旧请求失效
      runIdRef.current++;
    };
  }, [...deps, tick]);

  const retry = useCallback(() => setTick((n) => n + 1), []);

  const setData = useCallback((updater: T | ((prev: T | undefined) => T)) => {
    setDataState((prev) =>
      typeof updater === "function" ? (updater as (p: T | undefined) => T)(prev) : updater
    );
  }, []);

  return { data, loading, error, retry, setData };
}
