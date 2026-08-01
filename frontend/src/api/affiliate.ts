// T7：api 按域拆分（由 split_api 脚本生成，函数签名与原 index.ts 完全一致）。
import { api } from "./client";
import type { AffiliateLinkOut, AffiliateCommissionOut, AffiliateSummaryOut, AffiliateWithdrawalOut } from "./types";

// ---------- 分销裂变 ----------




export const createAffiliateLink = (productId?: string) =>
  api
    .post<AffiliateLinkOut>(`/affiliate/links`, { product_id: productId ?? null })
    .then((r) => r.data);
export const listAffiliateLinks = () =>
  api.get<AffiliateLinkOut[]>(`/affiliate/links`).then((r) => r.data);
export const trackAffiliate = (code: string) =>
  api.post(`/affiliate/track`, { code }).then((r) => r.data);
export const affiliateSummary = () =>
  api.get<AffiliateSummaryOut>(`/affiliate/summary`).then((r) => r.data);
export const listAffiliateCommissions = () =>
  api.get<AffiliateCommissionOut[]>(`/affiliate/commissions`).then((r) => r.data);
export const applyAffiliateWithdrawal = (amount: number) =>
  api.post<AffiliateWithdrawalOut>(`/affiliate/withdrawals`, { amount }).then((r) => r.data);
export const listAffiliateWithdrawals = () =>
  api.get<AffiliateWithdrawalOut[]>(`/affiliate/withdrawals`).then((r) => r.data);
export const adminListAffiliateWithdrawals = () =>
  api.get<AffiliateWithdrawalOut[]>(`/affiliate/admin/withdrawals`).then((r) => r.data);
export const adminProcessWithdrawal = (id: string, approve: boolean, remark?: string) =>
  api
    .post<AffiliateWithdrawalOut>(`/affiliate/admin/withdrawals/${id}`, { approve, remark })
    .then((r) => r.data);
