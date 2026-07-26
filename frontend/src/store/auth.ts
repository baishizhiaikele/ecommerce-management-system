import { create } from "zustand";
import { api } from "../api/client";

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  role: "buyer" | "merchant" | "admin";
  is_active: boolean;
  points: number;
  created_at: string;
}

export function vipTier(points: number): { name: string; color: string; next: number } {
  if (points >= 5000) return { name: "钻石会员", color: "#7C3AED", next: 999999 };
  if (points >= 2000) return { name: "黄金会员", color: "#F59E0B", next: 5000 };
  if (points >= 500) return { name: "白银会员", color: "#94A3B8", next: 2000 };
  return { name: "普通会员", color: "#10B981", next: 500 };
}

interface AuthState {
  user: AuthUser | null;
  setUser: (user: AuthUser | null) => void;
  logout: () => Promise<void>;
  init: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
  // 退出：调用后端 /auth/logout 清除 HttpOnly Cookie 并吊销刷新令牌
  logout: async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // 忽略网络错误，前端仍清理本地用户态
    }
    set({ user: null });
  },
  // 令牌存放于 HttpOnly Cookie，随请求自动携带；仅需用 /auth/me 拉取当前用户
  init: async () => {
    try {
      const { data } = await api.get("/auth/me", { _noAuthRedirect: true } as any);
      set({ user: data });
    } catch {
      set({ user: null });
    }
  },
}));
