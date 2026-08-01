// T7：api 按域拆分（由 split_api 脚本生成，函数签名与原 index.ts 完全一致）。
import { api } from "./client";
import type { ReportPreviewOut, ProductOut, MerchantStats, TrendPoint, ReportFrequency, ReportTaskOut } from "./types";

// ---------- 商家 ----------
export const merchantStats = () =>
  api.get<MerchantStats>("/merchant/dashboard/stats").then((r) => r.data);
export const merchantTrend = (days = 7) =>
  api
    .get<TrendPoint[]>("/merchant/dashboard/trend", { params: { days } })
    .then((r) => r.data);
export const myProducts = () =>
  api.get<ProductOut[]>("/merchant/products").then((r) => r.data);


// ---------- 上传 ----------
export const uploadImage = (file: File) => {
  const fd = new FormData();
  fd.append("file", file);
  return api.post<{ url: string; filename: string }>("/upload/image", fd).then((r) => r.data);
};

export const uploadVideo = (file: File) => {
  const fd = new FormData();
  fd.append("file", file);
  return api.post<{ url: string; filename: string }>("/upload/video", fd).then((r) => r.data);
};


// ---------- 报表定时邮件 ----------


export const listReportTasks = () =>
  api.get<ReportTaskOut[]>(`/merchant/report-tasks`).then((r) => r.data);
export const createReportTask = (p: {
  frequency: ReportFrequency;
  email: string;
  is_active?: boolean;
}) => api.post<ReportTaskOut>(`/merchant/report-tasks`, p).then((r) => r.data);
export const updateReportTask = (
  id: string,
  p: { is_active?: boolean; email?: string; frequency?: ReportFrequency }
) => api.put<ReportTaskOut>(`/merchant/report-tasks/${id}`, p).then((r) => r.data);
export const deleteReportTask = (id: string) =>
  api.delete(`/merchant/report-tasks/${id}`).then((r) => r.data);
export const getReportPreview = () =>
  api.get<ReportPreviewOut>(`/merchant/report-tasks/preview`).then((r) => r.data);
