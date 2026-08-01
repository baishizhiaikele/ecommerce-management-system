// T7：api 按域拆分（由 split_api 脚本生成，函数签名与原 index.ts 完全一致）。
import { api } from "./client";
import type { Role, ProductStatus, AuditAlert, UserOut, ProductOut, CouponOut, ReviewOut, TrendPoint, AdminStats, AuditLogOut, DashboardAnalytics, CouponCreate, AuditLogItem, MerchantAnalytics } from "./types";

// ---------- 管理员 ----------
export const adminListUsers = () =>
  api.get<UserOut[]>("/admin/users").then((r) => r.data);
export const adminUpdateUser = (
  id: string,
  p: { is_active?: boolean; role?: Role }
) => api.patch<UserOut>(`/admin/users/${id}`, p).then((r) => r.data);
export const adminListProducts = (status?: ProductStatus) =>
  api
    .get<ProductOut[]>("/admin/products", { params: status ? { status } : undefined })
    .then((r) => r.data);
export const adminStats = () =>
  api.get<AdminStats>("/admin/dashboard/stats").then((r) => r.data);
export const adminTrend = (days = 7) =>
  api
    .get<TrendPoint[]>("/admin/dashboard/trend", { params: { days } })
    .then((r) => r.data);
export const adminNegativeReviews = () =>
  api.get<ReviewOut[]>("/admin/reviews/negative").then((r) => r.data);
export const adminAuditLogs = () =>
  api.get<AuditLogOut[]>("/admin/audit-logs").then((r) => r.data);
export const auditStats = () =>
  api
    .get<{ by_action: { action: string; count: number }[]; by_day: { day: string; count: number }[] }>(
      "/admin/audit-stats"
    )
    .then((r) => r.data);


// ---------- 管理员深度分析（科技渐变看板）----------





export const adminDashboardAnalytics = () =>
  api.get<DashboardAnalytics>("/admin/dashboard/analytics").then((r) => r.data);


// ---------- 优惠券管理（管理员 / 商家）----------


/** 物流轨迹节点 */

export const adminCoupons = () =>
  api.get<CouponOut[]>("/coupons/admin").then((r) => r.data);
export const merchantCoupons = () =>
  api.get<CouponOut[]>("/coupons/merchant").then((r) => r.data);
export const createCoupon = (p: CouponCreate) =>
  api.post<CouponOut>("/coupons", p).then((r) => r.data);
export const updateCoupon = (id: string, p: Partial<CouponCreate>) =>
  api.put<CouponOut>(`/coupons/${id}`, p).then((r) => r.data);
export const deleteCoupon = (id: string) =>
  api.delete(`/coupons/${id}`);


// ---------- 审计回放 / 告警 ----------

export const getAuditReplay = (entity: string, entityId?: string) =>
  api
    .get<AuditLogItem[]>(`/admin/audit/replay`, { params: { entity, entity_id: entityId } })
    .then((r) => r.data);
export const getAuditAlerts = () =>
  api.get<{ alerts: AuditAlert[]; generated_at: string }>(`/admin/audit/alerts`).then((r) => r.data);


// ---------- 商家深度分析（含 RFM / 复购率）----------


export const merchantAnalytics = () =>
  api.get<MerchantAnalytics>("/merchant/dashboard/analytics").then((r) => r.data);
