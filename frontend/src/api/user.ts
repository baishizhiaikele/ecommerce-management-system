// T7：api 按域拆分（由 split_api 脚本生成，函数签名与原 index.ts 完全一致）。
import { api } from "./client";
import type { ProductOut, NotificationOut, PointLogOut, AddressOut, RedemptionItemOut, RedemptionRecordOut, PlusStatus, ViewLogIn, ViewLogOut, BoughtOut, ShopEventOut, ParsedAddress, MembershipOut, TaskOut } from "./types";

// ---------- 买家中心：地址 / 签到 ----------
export const listAddresses = () =>
  api.get<AddressOut[]>("/me/addresses").then((r) => r.data);
export const createAddress = (p: Omit<AddressOut, "id" | "user_id">) =>
  api.post<AddressOut>("/me/addresses", p).then((r) => r.data);
export const updateAddress = (id: string, p: Partial<Omit<AddressOut, "id" | "user_id">>) =>
  api.put<AddressOut>(`/me/addresses/${id}`, p).then((r) => r.data);
export const deleteAddress = (id: string) => api.delete(`/me/addresses/${id}`);
export const signIn = () =>
  api.post<{ signed_today: boolean; points: number; gained: number; streak?: number }>(
    "/me/signin"
  ).then((r) => r.data);
export const getSignInStatus = () =>
  api
    .get<{ signed_today: boolean }>("/me/signin/status")
    .then((r) => r.data);


// ---------- 积分商城 ----------



export const listRewards = () =>
  api.get<RedemptionItemOut[]>("/rewards").then((r) => r.data);
export const redeemReward = (id: string) =>
  api
    .post<RedemptionRecordOut>(`/rewards/${id}/redeem`)
    .then((r) => r.data);
export const myRedemptions = () =>
  api.get<RedemptionRecordOut[]>("/rewards/mine").then((r) => r.data);


// ---------- PLUS 付费会员（P3-H） ----------


export const getPlusStatus = () => api.get<PlusStatus>("/plus/status").then((r) => r.data);
export const subscribePlus = (plan: string) =>
  api.post<PlusStatus>("/plus/subscribe", { plan }).then((r) => r.data);


// ---------- 收藏 ----------
export const listFavorites = () =>
  api.get<ProductOut[]>("/favorites").then((r) => r.data);
export const addFavorite = (productId: string) =>
  api.post<ProductOut>(`/favorites/${productId}`).then((r) => r.data);
export const removeFavorite = (productId: string) =>
  api.delete(`/favorites/${productId}`);
export const isFavorited = (productId: string) =>
  api
    .get<{ favorited: boolean }>(`/favorites/${productId}/is-favorited`)
    .then((r) => r.data);


// ---------- 通知 ----------
export const listNotifications = () =>
  api.get<NotificationOut[]>("/notifications").then((r) => r.data);
export const unreadCount = () =>
  api.get<{ count: number }>("/notifications/unread-count").then((r) => r.data);
export const markRead = (id: string) =>
  api.patch<NotificationOut>(`/notifications/${id}/read`).then((r) => r.data);
export const markAllRead = () =>
  api.post("/notifications/read-all").then((r) => r.data);


// ---------- 积分 ----------
export const pointHistory = () =>
  api.get<PointLogOut[]>("/points/history").then((r) => r.data);


// ---------- 浏览历史 / 最近常买 ----------



export const logView = (data: ViewLogIn) =>
  api.post(`/me/view-log`, data).then((r) => r.data);
export const listHistory = (limit = 30) =>
  api.get<ViewLogOut[]>(`/me/history`, { params: { limit } }).then((r) => r.data);
export const listRecentlyBought = () =>
  api.get<BoughtOut[]>(`/me/recently-bought`).then((r) => r.data);


// ---------- 关注流动态 ----------

export const followFeed = (limit = 50) =>
  api.get<ShopEventOut[]>(`/follow/feed`, { params: { limit } }).then((r) => r.data);


// ---------- 通知分类免打扰 ----------
export const listNotificationCategories = () =>
  api.get<{ categories: string[] }>(`/notifications/categories`).then((r) => r.data);
export const getNotificationSettings = () =>
  api.get<{ muted: string[] }>(`/notifications/settings`).then((r) => r.data);
export const updateNotificationSettings = (muted: string[]) =>
  api.put<{ muted: string[] }>(`/notifications/settings`, { muted }).then((r) => r.data);


// ---------- P1-6 地址智能解析 ----------

export const parseAddressText = (text: string) =>
  api
    .post<ParsedAddress>(`/me/addresses/parse`, { text })
    .then((r) => r.data);


// ---------- 会员等级 + 任务中心 ----------


export const getMembership = () =>
  api.get<MembershipOut>("/me/membership").then((r) => r.data);
export const listTasks = () =>
  api.get<TaskOut[]>("/me/tasks").then((r) => r.data);
export const claimTask = (key: string) =>
  api.post<{ ok: boolean; gained: number; points: number }>(`/me/tasks/${key}/claim`).then((r) => r.data);
