// T7：api 按域拆分（由 split_api 脚本生成，函数签名与原 index.ts 完全一致）。
import { api, API_BASE } from "./client";
import type { Decimal, Role, ProductStatus, OrderStatus, Sentiment, CouponType, NotificationType, ApiError, LowStockOut, AuditAlert, ReportPreviewOut, Token, UserOut, ProductOut, CategoryOut, CartItemOut, OrderItemOut, OrderOut, CouponOut, UserCouponOut, NotificationOut, PointLogOut, ReviewOut, MessageOut, ConversationOut, ChatResponse, MerchantStats, TrendPoint, AdminStats, AuditLogOut, BannerOut, PromotionType, PromotionOut, PromotionCreate, AddressOut, RewardType, RedemptionItemOut, RedemptionRecordOut, CartPreview, BundleSuggestion, ShopSummary, ShopDetail, DecorationModule, DecorationConfig, NoteProductCard, NoteOut, PlusPlan, PlusStatus, CategoryBreakdown, TopProduct, FunnelStage, Comparison, DashboardAnalytics, CouponCreate, LogisticsEvent, FloorOut, HomeArrangeOut, DemandGap, SuggestedCategory, TrendInsightOut, SupportAttachmentOut, SupportMessageOut, TicketStatus, TicketPriority, TicketCategory, SupportTicketOut, SupportTicketPage, CreateTicketRequest, ReplyRequest, StockLogOut, StockSummaryOut, FollowShopOut, Facets, AnswerOut, QuestionOut, ViewLogIn, ViewLogOut, BoughtOut, ShopEventOut, KnowledgeOut, KnowledgeSuggestOut, AffiliateLinkOut, AffiliateCommissionOut, AffiliateSummaryOut, AffiliateWithdrawalOut, LiveProductOut, LiveRoomOut, LiveRoomDetail, LiveMessageOut, InvoiceOut, PresaleOut, PresaleReservationOut, StaffPerm, StaffOut, PriceCompareOut, ReportFrequency, ReportTaskOut, AuditLogItem, PricePoint, PriceHistoryOut, AftersaleEventOut, AftersaleTimelineOut, ParsedAddress, VariantOut, MerchantReviewItem, MerchantReviewPage, MembershipOut, TaskOut, PaymentOut, PaymentStatus, AgentTool, AgentReply, RFMSegment, MerchantAnalytics } from "./types";

// ---------- 通用类型 ----------








// L3：统一的后端错误结构，配合 getErrorMessage 消除 AxiosError<ApiError> 的 any。


// getErrorMessage 统一从 ./client 导出（单一实现，兼容 1/2 参数调用）。

// 以下为原 api/index.ts 中 any 返回类型收敛后的具体结构（L3）。


























// ---------- AI 客服 ----------
export const chat = (p: {
  product_id: string;
  message: string;
  conversation_id?: string;
}) => api.post<ChatResponse>("/ai/chat", p).then((r) => r.data);
export const myConversations = () =>
  api.get<ConversationOut[]>("/ai/conversations").then((r) => r.data);


// ---------- 优惠券 ----------
export const listCoupons = () =>
  api.get<CouponOut[]>("/coupons").then((r) => r.data);
export const claimCoupon = (id: string) =>
  api.post<UserCouponOut>(`/coupons/${id}/claim`).then((r) => r.data);
export const myCoupons = () =>
  api.get<UserCouponOut[]>("/coupons/mine").then((r) => r.data);


// ---------- AI 营销 / 定价 ----------
export const aiMarketing = (id: string, platform: string, note?: string) =>
  api
    .post<{ platform: string; content: string }>(`/products/${id}/ai-marketing`, {
      platform,
      note,
    })
    .then((r) => r.data);
export const aiPriceAdvice = (id: string, note?: string, market_price?: number) =>
  api
    .post<{ suggested_price: number; reason: string }>(`/products/${id}/ai-price-advice`, {
      note,
      market_price,
    })
    .then((r) => r.data);


// ---------- 智能客服知识库 ----------


export const listKnowledge = () =>
  api.get<KnowledgeOut[]>(`/knowledge`).then((r) => r.data);
export const createKnowledge = (question: string, answer: string) =>
  api.post<KnowledgeOut>(`/knowledge`, { question, answer }).then((r) => r.data);
export const deleteKnowledge = (id: string) => api.delete(`/knowledge/${id}`);
export const suggestKnowledge = (merchantId: string, q: string) =>
  api
    .get<KnowledgeSuggestOut[]>(`/knowledge/suggest`, {
      params: { merchant_id: merchantId, q },
    })
    .then((r) => r.data);


// ---------- 子账号权限 ----------


export const listStaffPermissions = () =>
  api.get<{ permissions: StaffPerm[] }>(`/subaccounts/permissions`).then((r) => r.data);
export const listSubaccounts = () =>
  api.get<StaffOut[]>(`/subaccounts/mine`).then((r) => r.data);
export const createSubaccount = (p: {
  username: string;
  password: string;
  permissions: string[];
}) => api.post<StaffOut>(`/subaccounts`, p).then((r) => r.data);
export const updateSubaccount = (
  id: string,
  p: { permissions?: string[]; is_active?: boolean }
) => api.put<StaffOut>(`/subaccounts/${id}`, p).then((r) => r.data);
export const deleteSubaccount = (id: string) =>
  api.delete(`/subaccounts/${id}`).then((r) => r.data);


// ---------- AI 比价 ----------

export const getPriceCompare = (productId: string) =>
  api.get<PriceCompareOut>(`/products/${productId}/price-compare`).then((r) => r.data);

export { API_BASE };
// getErrorMessage 统一从 ./client 导出（单一实现，兼容 1/2 参数调用）。
export { getErrorMessage } from "./client";
