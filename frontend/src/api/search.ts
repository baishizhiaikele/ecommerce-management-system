// T7：api 按域拆分（由 split_api 脚本生成，函数签名与原 index.ts 完全一致）。
import { api } from "./client";
import type { Facets } from "./types";

// ---------- 搜索增强 ----------
export const searchHot = () => api.get<string[]>("/search/hot").then((r) => r.data);
export const searchRecord = (q: string) =>
  api.post(`/search/record?q=${encodeURIComponent(q)}`).then((r) => r.data);


// ---------- 搜索增强：分面检索 / 搜索联想 ----------

export const searchFacets = (params?: {
  keyword?: string;
  category_id?: string;
  min_price?: number;
  max_price?: number;
}) => api.get<Facets>("/search/facets", { params }).then((r) => r.data);
export const searchSuggest = (q: string) =>
  api.get<string[]>("/search/suggest", { params: { q } }).then((r) => r.data);
