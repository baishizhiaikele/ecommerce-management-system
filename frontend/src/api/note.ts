// T7：api 按域拆分（由 split_api 脚本生成，函数签名与原 index.ts 完全一致）。
import { api } from "./client";
import type { NoteOut } from "./types";

// ---------- 种草笔记（P3-G） ----------


export const listNotes = (params?: { keyword?: string; limit?: number; offset?: number }) =>
  api.get<NoteOut[]>("/notes", { params }).then((r) => r.data);
export const createNote = (data: {
  title: string;
  content: string;
  images?: string[];
  product_ids?: string[];
}) => api.post<NoteOut>("/notes", data).then((r) => r.data);
export const toggleNoteLike = (id: string) =>
  api
    .post<{ note_id: string; liked: boolean; likes_count: number }>(`/notes/${id}/like`)
    .then((r) => r.data);
export const deleteNote = (id: string) => api.delete(`/notes/${id}`).then(() => undefined);
export const getNote = (id: string) => api.get<NoteOut>(`/notes/${id}`).then((r) => r.data);

// P3-G 种草推荐流与商业化闭环
export const getNoteFeed = (params: { limit?: number; offset?: number } = {}) =>
  api.get<NoteOut[]>(`/notes/feed`, { params }).then((r) => r.data);
export const getNotesForProduct = (productId: string, limit = 20) =>
  api.get<NoteOut[]>(`/notes/for-product/${productId}`, { params: { limit } }).then((r) => r.data);
export const attachAffiliate = (noteId: string) =>
  api.post<NoteOut>(`/notes/${noteId}/attach-affiliate`).then((r) => r.data);
export const trackAffiliateClick = (code: string) => {
  if (!code) return Promise.resolve();
  return api.post(`/affiliate/track`, { code }).catch(() => undefined);
};
