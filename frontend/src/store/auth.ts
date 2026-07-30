import { create } from "zustand";
import { api } from "../api/client";

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  role: "buyer" | "merchant" | "admin";
  is_active: boolean;
  points: number;
  growth_value?: number;
  level?: string;
  created_at: string;
}

export interface VipTier {
  key: string;
  name: string;
  color: string;
  min: number;
  next: number;
}

// 与后端 app/core/member_levels.py 的 MEMBER_TIERS 保持一致。
// 注意：等级由「成长值 growth_value」决定，而不是可消费的积分余额 points。
export const VIP_TIERS: VipTier[] = [
  { key: "bronze", name: "青铜会员", color: "#B45309", min: 0, next: 1000 },
  { key: "silver", name: "白银会员", color: "#94A3B8", min: 1000, next: 5000 },
  { key: "gold", name: "黄金会员", color: "#F59E0B", min: 5000, next: 20000 },
  { key: "diamond", name: "钻石会员", color: "#7C3AED", min: 20000, next: 999999 },
];

/** 依据成长值返回所属等级（与后端 get_tier 同语义）。 */
export function vipTier(growthValue: number): VipTier {
  let tier = VIP_TIERS[0];
  for (const t of VIP_TIERS) {
    if (growthValue >= t.min) tier = t;
    else break;
  }
  return tier;
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
      const { data } = await api.get("/auth/me", { _noAuthRedirect: true });
      set({ user: data });
    } catch {
      set({ user: null });
    }
  },
}));
