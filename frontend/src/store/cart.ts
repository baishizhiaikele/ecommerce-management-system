import { create } from "zustand";
import { addCartItem, getCart, updateCartItem, removeCartItem } from "../api";
import { useAuth } from "./auth";

export interface CartLine {
  product_id: string;
  name: string;
  price: number;
  quantity: number;
  image_url?: string;
}

const GUEST_CART_KEY = "guest_cart";

function loadGuest(): CartLine[] {
  try {
    const raw = localStorage.getItem(GUEST_CART_KEY);
    return raw ? (JSON.parse(raw) as CartLine[]) : [];
  } catch {
    return [];
  }
}

function saveGuest(lines: CartLine[]) {
  try {
    localStorage.setItem(GUEST_CART_KEY, JSON.stringify(lines));
  } catch {
    /* localStorage 不可用时静默降级（游客车仅本地可用） */
  }
}

interface CartState {
  /** 游客购物车（本地持久化，未登录时作为唯一数据源） */
  guestLines: CartLine[];
  /** 登录态下服务端购物车中的商品种类数，供导航角标展示 */
  serverCount: number;
  add: (line: CartLine) => Promise<void>;
  setQuantity: (product_id: string, quantity: number) => Promise<void>;
  remove: (product_id: string) => Promise<void>;
  clearGuest: () => void;
  /** 清空购物车：登录态逐条删除服务端商品，游客态清空本地车 */
  clear: () => Promise<void>;
  /** 登录态下从服务端拉取数量刷新角标 */
  reloadServer: () => Promise<void>;
  /** 登录成功后把游客车合并进服务端购物车 */
  mergeGuestToServer: () => Promise<void>;
}

export const useCart = create<CartState>((set, get) => ({
  guestLines: loadGuest(),
  serverCount: 0,

  add: async (line) => {
    const user = useAuth.getState().user;
    if (user) {
      await addCartItem({ product_id: line.product_id, quantity: line.quantity });
      await get().reloadServer();
      return;
    }
    const lines = [...get().guestLines];
    const found = lines.find((l) => l.product_id === line.product_id);
    if (found) {
      found.quantity += line.quantity;
    } else {
      lines.push({ ...line });
    }
    saveGuest(lines);
    set({ guestLines: lines });
  },

  setQuantity: async (product_id, quantity) => {
    const user = useAuth.getState().user;
    if (user) {
      const cart = await getCart();
      const item = cart.find((c) => c.product_id === product_id);
      if (item) await updateCartItem(item.id, quantity);
      await get().reloadServer();
      return;
    }
    const lines = get().guestLines.map((l) =>
      l.product_id === product_id ? { ...l, quantity } : l
    );
    saveGuest(lines);
    set({ guestLines: lines });
  },

  remove: async (product_id) => {
    const user = useAuth.getState().user;
    if (user) {
      const cart = await getCart();
      const item = cart.find((c) => c.product_id === product_id);
      if (item) await removeCartItem(item.id);
      await get().reloadServer();
      return;
    }
    const lines = get().guestLines.filter((l) => l.product_id !== product_id);
    saveGuest(lines);
    set({ guestLines: lines });
  },

  clearGuest: () => {
    saveGuest([]);
    set({ guestLines: [] });
  },

  clear: async () => {
    const user = useAuth.getState().user;
    if (!user) {
      saveGuest([]);
      set({ guestLines: [] });
      return;
    }
    try {
      const cart = await getCart();
      await Promise.all(cart.map((c) => removeCartItem(c.id)));
    } catch {
      /* 清空失败不影响用户跳转订单页 */
    }
  },

  reloadServer: async () => {
    try {
      const cart = await getCart();
      set({ serverCount: cart.length });
    } catch {
      /* 角标数量非关键路径，失败时保持原值 */
    }
  },

  mergeGuestToServer: async () => {
    const lines = get().guestLines;
    if (lines.length === 0) return;
    try {
      for (const l of lines) {
        await addCartItem({ product_id: l.product_id, quantity: l.quantity });
      }
      saveGuest([]);
      set({ guestLines: [] });
      await get().reloadServer();
    } catch {
      /* 合并失败保留游客车，下次登录再尝试 */
    }
  },
}));

/** 当前购物车种类数：游客读本地、登录读服务端，供导航角标调用 */
export function useCartCount(): number {
  const isGuest = !useAuth((s) => s.user);
  const guestLines = useCart((s) => s.guestLines);
  const serverCount = useCart((s) => s.serverCount);
  return isGuest ? guestLines.length : serverCount;
}
