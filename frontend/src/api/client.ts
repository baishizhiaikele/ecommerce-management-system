import axios from "axios";

// L7：支持通过 VITE_API_BASE_URL 指定后端地址，默认走 Vite 代理 /api
export const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";

export const api = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
  // S4：令牌存放于 HttpOnly Cookie，必须随请求自动携带（Credentials）
  withCredentials: true,
});

/** 从 axios 错误中提取可展示给用户的提示文案（后端 detail 优先）。 */
export function getErrorMessage(error: unknown, fallback = "请求失败，请稍后重试"): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === "string" && detail) return detail;
    // FastAPI 422 校验错误为数组结构
    if (Array.isArray(detail) && detail.length && detail[0]?.msg) return detail[0].msg;
    if (error.code === "ECONNABORTED") return "请求超时，请检查网络后重试";
    if (!error.response) return "网络异常，无法连接服务器";
  }
  return fallback;
}

let isRefreshing = false;
let pending: (() => void)[] = [];

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    // 初始化拉取当前用户（/auth/me）在未登录时不应触发整页跳转登录，
    // 否则会与 auth store 的 init() 形成「401 → 整页重载 → init() → 401」的死循环
    if (original._noAuthRedirect) {
      return Promise.reject(error);
    }
    if (error.response?.status === 401 && original && !original._retry) {
      if (isRefreshing) {
        // 并发 401 复用同一次刷新
        return new Promise((resolve) => {
          pending.push(() => resolve(api(original)));
        });
      }
      original._retry = true;
      isRefreshing = true;
      try {
        // 刷新令牌存放于 HttpOnly Cookie，由浏览器随请求自动携带（S4）
        // 用裸 axios 而非 api 实例，避免刷新自身 401 时再次进入拦截器造成循环
        await axios.post(`${API_BASE}/auth/refresh`, {}, { withCredentials: true });
        pending.forEach((cb) => cb());
        pending = [];
        return api(original);
      } catch (e) {
        pending = [];
        // 刷新失败：仅当当前并非公开访问页（登录页/首页）时才跳登录，
        // 避免未登录用户浏览公开页面时被误踢到登录页、或 init() 与 401 形成死循环（S6）
        const path = window.location.pathname;
        const publicPaths = ["/login", "/", "/register", "/about"];
        if (!publicPaths.some((p) => path === p || path.startsWith(p + "/"))) {
          window.location.href = "/login";
        }
        return Promise.reject(e);
      } finally {
        isRefreshing = false;
      }
    }
    console.error("api error", error.response?.data || error.message);
    return Promise.reject(error);
  }
);
