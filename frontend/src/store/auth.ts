import { create } from "zustand";
import { api } from "../api/client";

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  role: "buyer" | "merchant" | "admin";
  is_active: boolean;
  created_at: string;
}

interface AuthState {
  user: AuthUser | null;
  setUser: (user: AuthUser | null) => void;
  setTokens: (access: string, refresh: string) => void;
  logout: () => void;
  init: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
  setTokens: (access, refresh) => {
    localStorage.setItem("access_token", access);
    localStorage.setItem("refresh_token", refresh);
  },
  logout: () => {
    clearAuth();
    set({ user: null });
  },
  init: async () => {
    const token = localStorage.getItem("access_token");
    if (!token) return;
    try {
      const { data } = await api.get("/auth/me");
      set({ user: data });
    } catch {
      clearAuth();
      set({ user: null });
    }
  },
}));

function clearAuth() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
}
