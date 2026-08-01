// T7：api 按域拆分（由 split_api 脚本生成，函数签名与原 index.ts 完全一致）。
import { api, API_BASE } from "./client";
import type { Decimal, Role, ProductStatus, OrderStatus, Sentiment, CouponType, NotificationType, ApiError, LowStockOut, AuditAlert, ReportPreviewOut, Token, UserOut, ProductOut, CategoryOut, CartItemOut, OrderItemOut, OrderOut, CouponOut, UserCouponOut, NotificationOut, PointLogOut, ReviewOut, MessageOut, ConversationOut, ChatResponse, MerchantStats, TrendPoint, AdminStats, AuditLogOut, BannerOut, PromotionType, PromotionOut, PromotionCreate, AddressOut, RewardType, RedemptionItemOut, RedemptionRecordOut, CartPreview, BundleSuggestion, ShopSummary, ShopDetail, DecorationModule, DecorationConfig, NoteProductCard, NoteOut, PlusPlan, PlusStatus, CategoryBreakdown, TopProduct, FunnelStage, Comparison, DashboardAnalytics, CouponCreate, LogisticsEvent, FloorOut, HomeArrangeOut, DemandGap, SuggestedCategory, TrendInsightOut, SupportAttachmentOut, SupportMessageOut, TicketStatus, TicketPriority, TicketCategory, SupportTicketOut, SupportTicketPage, CreateTicketRequest, ReplyRequest, StockLogOut, StockSummaryOut, FollowShopOut, Facets, AnswerOut, QuestionOut, ViewLogIn, ViewLogOut, BoughtOut, ShopEventOut, KnowledgeOut, KnowledgeSuggestOut, AffiliateLinkOut, AffiliateCommissionOut, AffiliateSummaryOut, AffiliateWithdrawalOut, LiveProductOut, LiveRoomOut, LiveRoomDetail, LiveMessageOut, InvoiceOut, PresaleOut, PresaleReservationOut, StaffPerm, StaffOut, PriceCompareOut, ReportFrequency, ReportTaskOut, AuditLogItem, PricePoint, PriceHistoryOut, AftersaleEventOut, AftersaleTimelineOut, ParsedAddress, VariantOut, MerchantReviewItem, MerchantReviewPage, MembershipOut, TaskOut, PaymentOut, PaymentStatus, AgentTool, AgentReply, RFMSegment, MerchantAnalytics } from "./types";

// ---------- 店铺 ----------


export const listShops = () => api.get<ShopSummary[]>("/shops").then((r) => r.data);
export const getShop = (id: string) =>
  api.get<ShopDetail>(`/shops/${id}`).then((r) => r.data);
export const listOrders = () =>
  api.get<OrderOut[]>("/orders").then((r) => r.data);
export const getOrder = (id: string) =>
  api.get<OrderOut>(`/orders/${id}`).then((r) => r.data);
export const transitionOrder = (id: string, status: OrderStatus) =>
  api.patch<OrderOut>(`/orders/${id}/status`, { status }).then((r) => r.data);
export const deleteOrder = (id: string) =>
  api.delete(`/orders/${id}`).then((r) => r.data);


// ---------- 店铺装修（P3-E） ----------


export const getMyDecoration = () =>
  api.get<DecorationConfig>("/decoration/mine").then((r) => r.data);
export const saveMyDecoration = (data: {
  theme_color: string;
  banner_image?: string | null;
  banner_title?: string | null;
  banner_subtitle?: string | null;
  layout: DecorationModule[];
}) => api.put<DecorationConfig>("/decoration/mine", data).then((r) => r.data);
export const getShopDecoration = (merchantId: string) =>
  api.get<DecorationConfig>(`/decoration/${merchantId}`).then((r) => r.data);


// ---------- 关注店铺 ----------
export const followShop = (merchantId: string) =>
  api.post(`/follow/${merchantId}`).then((r) => r.data);
export const unfollowShop = (merchantId: string) =>
  api.delete(`/follow/${merchantId}`).then((r) => r.data);
export const followStatus = (merchantId: string) =>
  api.get<{ following: boolean }>(`/follow/${merchantId}/status`).then((r) => r.data);
export const followersCount = (merchantId: string) =>
  api.get<{ count: number }>(`/follow/${merchantId}/count`).then((r) => r.data);

export const myFollowing = () =>
  api.get<FollowShopOut[]>("/follow/following").then((r) => r.data);
