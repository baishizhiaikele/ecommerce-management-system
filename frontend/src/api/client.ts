import axios from "axios";

export const api = axios.create({
  // L7：支持通过 VITE_API_BASE_URL 指定后端地址，默认走 Vite 代理 /api
  baseURL: import.meta.env.VITE_API_BASE_URL || "/api",
  timeout: 15000,
  // S4：令牌存放于 HttpOnly Cookie，必须随请求自动携带（Credentials）
  withCredentials: true,
});

let isRefreshing = false;
let pending: (() => void)[] = [];

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config as any;
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
        await axios.post("/api/auth/refresh", {}, { withCredentials: true });
        pending.forEach((cb) => cb());
        pending = [];
        return api(original);
      } catch (e) {
        pending = [];
        // 刷新失败：跳转登录页（S6 的 ErrorBoundary 不会捕获路由级跳转）
        window.location.href = "/login";
        return Promise.reject(e);
      } finally {
        isRefreshing = false;
      }
    }
    console.error("api error", error.response?.data || error.message);
    return Promise.reject(error);
  }
);
