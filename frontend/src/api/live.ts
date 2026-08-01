// T7：api 按域拆分（由 split_api 脚本生成，函数签名与原 index.ts 完全一致）。
import { api, API_BASE } from "./client";
import type { LiveProductOut, LiveRoomOut, LiveRoomDetail, LiveMessageOut } from "./types";

// ---------- 直播带货 ----------




export const listLiveRooms = () => api.get<LiveRoomOut[]>("/live").then((r) => r.data);
export const myLiveRooms = () => api.get<LiveRoomOut[]>("/live/mine").then((r) => r.data);
export const createLiveRoom = (p: { title: string; cover_url?: string; product_ids: string[] }) =>
  api.post<LiveRoomOut>("/live", p).then((r) => r.data);
export const getLiveRoom = (id: string) =>
  api.get<LiveRoomDetail>(`/live/${id}`).then((r) => r.data);
export const startLiveRoom = (id: string) =>
  api.post<LiveRoomOut>(`/live/${id}/start`).then((r) => r.data);
export const endLiveRoom = (id: string) =>
  api.post<LiveRoomOut>(`/live/${id}/end`).then((r) => r.data);
export const enterLiveRoom = (id: string) =>
  api.post<{ viewers: number }>(`/live/${id}/enter`).then((r) => r.data);
export const listLiveMessages = (id: string, afterId?: string) =>
  api
    .get<LiveMessageOut[]>(`/live/${id}/messages`, {
      params: afterId ? { after_id: afterId } : undefined,
    })
    .then((r) => r.data);
export const sendLiveMessage = (id: string, content: string) =>
  api.post<LiveMessageOut>(`/live/${id}/messages`, { content }).then((r) => r.data);

// P2 直播分销增强：改直播价 / 置顶 / 切讲解 / 移品 / AI 话术
export const upsertLiveProduct = (
  roomId: string,
  productId: string,
  p: { live_price?: number | null; explaining?: boolean; pinned?: boolean }
) => api.put<LiveProductOut>(`/live/${roomId}/products/${productId}`, p).then((r) => r.data);
export const removeLiveProduct = (roomId: string, productId: string) =>
  api.delete(`/live/${roomId}/products/${productId}`).then((r) => r.data);
export const setLiveExplaining = (roomId: string, productId: string, explaining: boolean) =>
  api.post(`/live/${roomId}/products/${productId}/explain`, { explaining }).then((r) => r.data);
export const liveAiScript = (roomId: string, productId?: string) =>
  api
    .post<{ script: string }>(`/live/${roomId}/ai-script`, { product_id: productId ?? null })
    .then((r) => r.data);

/** 直播弹幕 WebSocket 地址：同源走相对路径（开发经 Vite 代理，生产走同源托管）。 */
export function liveWsUrl(id: string): string {
  const base = import.meta.env.VITE_API_BASE_URL || "";
  const path = `/api/live/${id}/ws`;
  if (base) {
    const u = new URL(base);
    const proto = u.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${u.host}${path}`;
  }
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}${path}`;
}

/** 图片经后端代理转发（仅外部 http(s) 链接走 /api/images/proxy，本地 /uploads 不受影响）。 */
export function proxyImg(url: string): string {
  if (!url || !/^https?:\/\//i.test(url)) return url;
  return `${API_BASE}/images/proxy?u=${encodeURIComponent(url)}`;
}
