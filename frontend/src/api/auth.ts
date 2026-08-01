// T7：api 按域拆分（由 split_api 脚本生成，函数签名与原 index.ts 完全一致）。
import { api } from "./client";
import type { Role, Token, UserOut } from "./types";

// ---------- 认证 ----------
export const register = (p: {
  username: string;
  email: string;
  password: string;
  role?: Role;
}) => api.post<Token>("/auth/register", p).then((r) => r.data);
export const login = (p: { username: string; password: string }) =>
  api.post<Token>("/auth/login", p).then((r) => r.data);
export const refreshToken = (refresh_token: string) =>
  api.post<Token>("/auth/refresh", { refresh_token }).then((r) => r.data);
export const logout = () => api.post("/auth/logout").then((r) => r.data);
export const me = () => api.get<UserOut>("/auth/me").then((r) => r.data);
