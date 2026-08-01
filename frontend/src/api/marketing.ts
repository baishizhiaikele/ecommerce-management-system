// T7：api 按域拆分（由 split_api 脚本生成，函数签名与原 index.ts 完全一致）。
import { api, API_BASE } from "./client";
import type { Decimal, Role, ProductStatus, OrderStatus, Sentiment, CouponType, NotificationType, ApiError, LowStockOut, AuditAlert, ReportPreviewOut, Token, UserOut, ProductOut, CategoryOut, CartItemOut, OrderItemOut, OrderOut, CouponOut, UserCouponOut, NotificationOut, PointLogOut, ReviewOut, MessageOut, ConversationOut, ChatResponse, MerchantStats, TrendPoint, AdminStats, AuditLogOut, BannerOut, PromotionType, PromotionOut, PromotionCreate, AddressOut, RewardType, RedemptionItemOut, RedemptionRecordOut, CartPreview, BundleSuggestion, ShopSummary, ShopDetail, DecorationModule, DecorationConfig, NoteProductCard, NoteOut, PlusPlan, PlusStatus, CategoryBreakdown, TopProduct, FunnelStage, Comparison, DashboardAnalytics, CouponCreate, LogisticsEvent, FloorOut, HomeArrangeOut, DemandGap, SuggestedCategory, TrendInsightOut, SupportAttachmentOut, SupportMessageOut, TicketStatus, TicketPriority, TicketCategory, SupportTicketOut, SupportTicketPage, CreateTicketRequest, ReplyRequest, StockLogOut, StockSummaryOut, FollowShopOut, Facets, AnswerOut, QuestionOut, ViewLogIn, ViewLogOut, BoughtOut, ShopEventOut, KnowledgeOut, KnowledgeSuggestOut, AffiliateLinkOut, AffiliateCommissionOut, AffiliateSummaryOut, AffiliateWithdrawalOut, LiveProductOut, LiveRoomOut, LiveRoomDetail, LiveMessageOut, InvoiceOut, PresaleOut, PresaleReservationOut, StaffPerm, StaffOut, PriceCompareOut, ReportFrequency, ReportTaskOut, AuditLogItem, PricePoint, PriceHistoryOut, AftersaleEventOut, AftersaleTimelineOut, ParsedAddress, VariantOut, MerchantReviewItem, MerchantReviewPage, MembershipOut, TaskOut, PaymentOut, PaymentStatus, AgentTool, AgentReply, RFMSegment, MerchantAnalytics } from "./types";

// ---------- 首页运营内容 ----------







export const getBanners = () =>
  api.get<BannerOut[]>("/banners").then((r) => r.data);
export const getPromotions = (type?: PromotionType) =>
  api
    .get<PromotionOut[]>("/promotions", { params: type ? { type } : undefined })
    .then((r) => r.data);
export const myPromotions = () =>
  api.get<PromotionOut[]>("/promotions/mine").then((r) => r.data);
export const createPromotion = (p: PromotionCreate) =>
  api.post<PromotionOut>("/promotions", p).then((r) => r.data);
export const deletePromotion = (id: string) =>
  api.delete(`/promotions/${id}`).then((r) => r.data);


// ---------- 报表导出 ----------
function downloadBlob(data: Blob, filename: string) {
  const url = window.URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
}
export const exportOrdersReport = () =>
  api
    .get("/merchant/reports/orders", { responseType: "blob" })
    .then((r) => downloadBlob(r.data, "orders.csv"));


// ---------- AI 首页编排 / 选品洞察 ----------





export const homeArrange = (params?: { segment?: string; hour?: number }) =>
  api.get<HomeArrangeOut>("/ai/home-arrange", { params }).then((r) => r.data);
export const trendInsight = () =>
  api.get<TrendInsightOut>("/ai/trend-insight").then((r) => r.data);


// ---------- 报表导出 PDF ----------
export const exportOrdersPdf = () =>
  api
    .get("/merchant/reports/orders/pdf", { responseType: "blob" })
    .then((r) => downloadBlob(r.data, "orders.pdf"));
