// T7：api 按域拆分（由 split_api 脚本生成，函数签名与原 index.ts 完全一致）。
import { api, API_BASE } from "./client";
import type { Decimal, Role, ProductStatus, OrderStatus, Sentiment, CouponType, NotificationType, ApiError, LowStockOut, AuditAlert, ReportPreviewOut, Token, UserOut, ProductOut, CategoryOut, CartItemOut, OrderItemOut, OrderOut, CouponOut, UserCouponOut, NotificationOut, PointLogOut, ReviewOut, MessageOut, ConversationOut, ChatResponse, MerchantStats, TrendPoint, AdminStats, AuditLogOut, BannerOut, PromotionType, PromotionOut, PromotionCreate, AddressOut, RewardType, RedemptionItemOut, RedemptionRecordOut, CartPreview, BundleSuggestion, ShopSummary, ShopDetail, DecorationModule, DecorationConfig, NoteProductCard, NoteOut, PlusPlan, PlusStatus, CategoryBreakdown, TopProduct, FunnelStage, Comparison, DashboardAnalytics, CouponCreate, LogisticsEvent, FloorOut, HomeArrangeOut, DemandGap, SuggestedCategory, TrendInsightOut, SupportAttachmentOut, SupportMessageOut, TicketStatus, TicketPriority, TicketCategory, SupportTicketOut, SupportTicketPage, CreateTicketRequest, ReplyRequest, StockLogOut, StockSummaryOut, FollowShopOut, Facets, AnswerOut, QuestionOut, ViewLogIn, ViewLogOut, BoughtOut, ShopEventOut, KnowledgeOut, KnowledgeSuggestOut, AffiliateLinkOut, AffiliateCommissionOut, AffiliateSummaryOut, AffiliateWithdrawalOut, LiveProductOut, LiveRoomOut, LiveRoomDetail, LiveMessageOut, InvoiceOut, PresaleOut, PresaleReservationOut, StaffPerm, StaffOut, PriceCompareOut, ReportFrequency, ReportTaskOut, AuditLogItem, PricePoint, PriceHistoryOut, AftersaleEventOut, AftersaleTimelineOut, ParsedAddress, VariantOut, MerchantReviewItem, MerchantReviewPage, MembershipOut, TaskOut, PaymentOut, PaymentStatus, AgentTool, AgentReply, RFMSegment, MerchantAnalytics } from "./types";

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
