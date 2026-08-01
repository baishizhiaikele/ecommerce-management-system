// T7：api 按域拆分（由 split_api 脚本生成，函数签名与原 index.ts 完全一致）。
import { api, API_BASE } from "./client";
import type { Decimal, Role, ProductStatus, OrderStatus, Sentiment, CouponType, NotificationType, ApiError, LowStockOut, AuditAlert, ReportPreviewOut, Token, UserOut, ProductOut, CategoryOut, CartItemOut, OrderItemOut, OrderOut, CouponOut, UserCouponOut, NotificationOut, PointLogOut, ReviewOut, MessageOut, ConversationOut, ChatResponse, MerchantStats, TrendPoint, AdminStats, AuditLogOut, BannerOut, PromotionType, PromotionOut, PromotionCreate, AddressOut, RewardType, RedemptionItemOut, RedemptionRecordOut, CartPreview, BundleSuggestion, ShopSummary, ShopDetail, DecorationModule, DecorationConfig, NoteProductCard, NoteOut, PlusPlan, PlusStatus, CategoryBreakdown, TopProduct, FunnelStage, Comparison, DashboardAnalytics, CouponCreate, LogisticsEvent, FloorOut, HomeArrangeOut, DemandGap, SuggestedCategory, TrendInsightOut, SupportAttachmentOut, SupportMessageOut, TicketStatus, TicketPriority, TicketCategory, SupportTicketOut, SupportTicketPage, CreateTicketRequest, ReplyRequest, StockLogOut, StockSummaryOut, FollowShopOut, Facets, AnswerOut, QuestionOut, ViewLogIn, ViewLogOut, BoughtOut, ShopEventOut, KnowledgeOut, KnowledgeSuggestOut, AffiliateLinkOut, AffiliateCommissionOut, AffiliateSummaryOut, AffiliateWithdrawalOut, LiveProductOut, LiveRoomOut, LiveRoomDetail, LiveMessageOut, InvoiceOut, PresaleOut, PresaleReservationOut, StaffPerm, StaffOut, PriceCompareOut, ReportFrequency, ReportTaskOut, AuditLogItem, PricePoint, PriceHistoryOut, AftersaleEventOut, AftersaleTimelineOut, ParsedAddress, VariantOut, MerchantReviewItem, MerchantReviewPage, MembershipOut, TaskOut, PaymentOut, PaymentStatus, AgentTool, AgentReply, RFMSegment, MerchantAnalytics } from "./types";

// ---------- 认证 ----------
export const register = (p: {
  username: string;
  email: string;
  password: string;
  role?: Role;
}) => api.post<Token>("/auth/register", p).then((r) => r.data);
export const login = (p: { username: string; password: string }) =>
  api.post<Token>("/auth/login", p).then((r) => r.data);
export const refreshToken = (refresh_token: string) =>
  api.post<Token>("/auth/refresh", { refresh_token }).then((r) => r.data);
export const logout = () => api.post("/auth/logout").then((r) => r.data);
export const me = () => api.get<UserOut>("/auth/me").then((r) => r.data);
