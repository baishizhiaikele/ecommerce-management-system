// T7：api 按域拆分（由 split_api 脚本生成，函数签名与原 index.ts 完全一致）。
import { api } from "./client";
import type { CartItemOut, CartPreview, BundleSuggestion } from "./types";

// ---------- 购物车 ----------
export const getCart = () =>
  api.get<CartItemOut[]>("/cart").then((r) => r.data);
export const addCartItem = (p: { product_id: string; quantity?: number; variant_id?: string }) =>
  api.post<CartItemOut>("/cart/items", p).then((r) => r.data);
export const updateCartItem = (itemId: string, quantity: number) =>
  api.put<CartItemOut>(`/cart/items/${itemId}`, { quantity }).then((r) => r.data);
export const removeCartItem = (itemId: string) =>
  api.delete(`/cart/items/${itemId}`);

// P1-2 购物车凑单 / 满减进度

export const getCartPreview = () =>
  api.get<CartPreview>("/cart/preview").then((r) => r.data);


export const getBundleSuggestions = (gap: number = 0, limit: number = 8) =>
  api
    .get<BundleSuggestion[]>("/cart/bundle-suggestions", { params: { gap, limit } })
    .then((r) => r.data);
