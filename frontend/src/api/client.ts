import axios from "axios";

export const api = axios.create({
  baseURL: "/api",
  timeout: 15000,
});

let isRefreshing = false;
let pending: ((token: string) => void)[] = [];

function clearAuth() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config as any;
    if (error.response?.status === 401 && original && !original._retry) {
      const refresh = localStorage.getItem("refresh_token");
      if (!refresh) {
        clearAuth();
        return Promise.reject(error);
      }
      if (isRefreshing) {
        return new Promise((resolve) => {
          pending.push((token) => {
            original.headers.Authorization = `Bearer ${token}`;
            resolve(api(original));
          });
        });
      }
      original._retry = true;
      isRefreshing = true;
      try {
        // 刷新请求使用裸 axios，避免再次进入本拦截器导致递归
        const { data } = await axios.post("/api/auth/refresh", {
          refresh_token: refresh,
        });
        localStorage.setItem("access_token", data.access_token);
        localStorage.setItem("refresh_token", data.refresh_token);
        api.defaults.headers.common.Authorization = `Bearer ${data.access_token}`;
        pending.forEach((cb) => cb(data.access_token));
        pending = [];
        original.headers.Authorization = `Bearer ${data.access_token}`;
        return api(original);
      } catch (e) {
        pending = [];
        clearAuth();
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
