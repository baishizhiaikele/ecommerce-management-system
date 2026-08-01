// T7：api 按域拆分（由 split_api 脚本生成，函数签名与原 index.ts 完全一致）。
import { api, API_BASE } from "./client";
import type { Decimal, Role, ProductStatus, OrderStatus, Sentiment, CouponType, NotificationType, ApiError, LowStockOut, AuditAlert, ReportPreviewOut, Token, UserOut, ProductOut, CategoryOut, CartItemOut, OrderItemOut, OrderOut, CouponOut, UserCouponOut, NotificationOut, PointLogOut, ReviewOut, MessageOut, ConversationOut, ChatResponse, MerchantStats, TrendPoint, AdminStats, AuditLogOut, BannerOut, PromotionType, PromotionOut, PromotionCreate, AddressOut, RewardType, RedemptionItemOut, RedemptionRecordOut, CartPreview, BundleSuggestion, ShopSummary, ShopDetail, DecorationModule, DecorationConfig, NoteProductCard, NoteOut, PlusPlan, PlusStatus, CategoryBreakdown, TopProduct, FunnelStage, Comparison, DashboardAnalytics, CouponCreate, LogisticsEvent, FloorOut, HomeArrangeOut, DemandGap, SuggestedCategory, TrendInsightOut, SupportAttachmentOut, SupportMessageOut, TicketStatus, TicketPriority, TicketCategory, SupportTicketOut, SupportTicketPage, CreateTicketRequest, ReplyRequest, StockLogOut, StockSummaryOut, FollowShopOut, Facets, AnswerOut, QuestionOut, ViewLogIn, ViewLogOut, BoughtOut, ShopEventOut, KnowledgeOut, KnowledgeSuggestOut, AffiliateLinkOut, AffiliateCommissionOut, AffiliateSummaryOut, AffiliateWithdrawalOut, LiveProductOut, LiveRoomOut, LiveRoomDetail, LiveMessageOut, InvoiceOut, PresaleOut, PresaleReservationOut, StaffPerm, StaffOut, PriceCompareOut, ReportFrequency, ReportTaskOut, AuditLogItem, PricePoint, PriceHistoryOut, AftersaleEventOut, AftersaleTimelineOut, ParsedAddress, VariantOut, MerchantReviewItem, MerchantReviewPage, MembershipOut, TaskOut, PaymentOut, PaymentStatus, AgentTool, AgentReply, RFMSegment, MerchantAnalytics } from "./types";

// ---------- 商品 ----------
export const listProducts = (params?: {
  category_id?: string;
  keyword?: string;
  sort?: string;
  min_price?: number;
  max_price?: number;
  min_rating?: number;
  in_stock?: boolean;
  merchant_id?: string;
  page?: number;
  page_size?: number;
}) => api.get<ProductOut[]>("/products", { params }).then((r) => r.data);

// P1-1 图搜：上传图片按相似度召回商品
export const searchByImage = (file: File) => {
  const form = new FormData();
  form.append("file", file);
  return api
    .post<ProductOut[]>("/search/by-image", form, {
      headers: { "Content-Type": "multipart/form-data" },
    })
    .then((r) => r.data);
};

export const getProduct = (id: string) =>
  api.get<ProductOut>(`/products/${id}`).then((r) => r.data);
export const createProduct = (p: {
  name: string;
  price: number | string;
  stock: number;
  description?: string;
  image_url?: string;
  category_id?: string;
  warning_threshold?: number;
}) => api.post<ProductOut>("/products", p).then((r) => r.data);
export const updateProduct = (
  id: string,
  p: Partial<{
    name: string;
    description: string;
    price: number | string;
    stock: number;
    image_url: string;
    category_id: string;
    warning_threshold?: number;
  }>
) => api.put<ProductOut>(`/products/${id}`, p).then((r) => r.data);
export const deleteProduct = (id: string) => api.delete(`/products/${id}`);
export const aiGenerateProduct = (id: string, note?: string) =>
  api
    .post<{ title: string; sales_copy: string; price_suggestion: number }>(
      `/products/${id}/ai-generate`,
      { note }
    )
    .then((r) => r.data);
export const setProductStatus = (
  id: string,
  status: ProductStatus,
  reject_reason?: string
) =>
  api
    .patch<ProductOut>(`/products/${id}/status`, { status, reject_reason })
    .then((r) => r.data);
export const listProductReviews = (productId: string) =>
  api.get<ReviewOut[]>(`/products/${productId}/reviews`).then((r) => r.data);
export const createProductReview = (
  productId: string,
  p: { order_id?: string; rating: number; content: string; images?: string[]; video?: string | null }
) =>
  api.post<ReviewOut>(`/products/${productId}/reviews`, p).then((r) => r.data);

export const appendReview = (
  reviewId: string,
  p: { content: string; images?: string[]; video?: string | null }
) =>
  api.post<ReviewOut>(`/products/reviews/${reviewId}/append`, p).then((r) => r.data);


// ---------- 分类 ----------
export const listCategories = () =>
  api.get<CategoryOut[]>("/categories").then((r) => r.data);
export const createCategory = (p: {
  name: string;
  slug: string;
  parent_id?: string;
}) => api.post<CategoryOut>("/categories", p).then((r) => r.data);


// ---------- 库存管理（商家）----------


export const inventorySummary = () =>
  api.get<StockSummaryOut>("/inventory/summary").then((r) => r.data);
export const inventoryLowStock = () =>
  api.get<LowStockOut[]>("/inventory/low-stock").then((r) => r.data);
export const inventoryLogs = (productId?: string) =>
  api
    .get<StockLogOut[]>("/inventory/logs", {
      params: productId ? { product_id: productId } : undefined,
    })
    .then((r) => r.data);
export const adjustStock = (
  productId: string,
  quantity: number,
  changeType: string,
  remark?: string
) =>
  api
    .post<StockLogOut>("/inventory/adjust", {
      product_id: productId,
      quantity,
      change_type: changeType,
      remark,
    })
    .then((r) => r.data);


// ---------- 评价增强（有用 / 举报）----------
export const markReviewHelpful = (reviewId: string) =>
  api.post<ReviewOut>(`/products/reviews/${reviewId}/helpful`).then((r) => r.data);
export const reportReview = (reviewId: string, reason?: string) =>
  api
    .post<ReviewOut>(`/products/reviews/${reviewId}/report`, { reason })
    .then((r) => r.data);


// ---------- 商品问答 Q&A ----------


export const listQuestions = (productId: string) =>
  api.get<QuestionOut[]>(`/products/${productId}/questions`).then((r) => r.data);
export const askQuestion = (productId: string, content: string) =>
  api
    .post<QuestionOut>(`/products/${productId}/questions`, { content })
    .then((r) => r.data);
export const answerQuestion = (questionId: string, content: string) =>
  api
    .post<QuestionOut>(`/products/questions/${questionId}/answers`, { content })
    .then((r) => r.data);
export const acceptAnswer = (questionId: string, answerId: string) =>
  api
    .post<QuestionOut>(`/products/questions/${questionId}/accept/${answerId}`)
    .then((r) => r.data);
export const deleteQuestion = (questionId: string) =>
  api.delete(`/products/questions/${questionId}`);


// ---------- P1-3 历史价格曲线 ----------


export const getPriceHistory = (productId: string) =>
  api.get<PriceHistoryOut>(`/products/${productId}/price-history`).then((r) => r.data);


// ---------- P1-5 售后进度时间轴 ----------


export const getAftersaleTimeline = (orderId: string) =>
  api.get<AftersaleTimelineOut>(`/orders/${orderId}/aftersale-timeline`).then((r) => r.data);


// ---------- 商品多规格 SKU ----------

export const listVariants = (productId: string) =>
  api.get<VariantOut[]>(`/products/${productId}/variants`).then((r) => r.data);
export const createVariant = (
  productId: string,
  p: { specs: Record<string, string>; stock: number; price_delta?: number; sku_code?: string; image_url?: string }
) => api.post<VariantOut>(`/products/${productId}/variants`, p).then((r) => r.data);
export const updateVariant = (variantId: string, p: Partial<VariantOut>) =>
  api.patch<VariantOut>(`/products/variants/${variantId}`, p).then((r) => r.data);
export const deleteVariant = (variantId: string) =>
  api.delete(`/products/variants/${variantId}`);


// ---------- 评价管理（商家）----------


export const merchantReviews = (params?: {
  product_id?: string;
  sentiment?: string;
  page?: number;
  page_size?: number;
}) => api.get<MerchantReviewPage>("/products/merchant/reviews", { params }).then((r) => r.data);
export const replyReview = (reviewId: string, content: string) =>
  api.post<ReviewOut>(`/products/reviews/${reviewId}/reply`, { content }).then((r) => r.data);
export const pinReview = (reviewId: string, pinned: boolean) =>
  api.patch<ReviewOut>(`/products/reviews/${reviewId}/pin`, { pinned }).then((r) => r.data);
export const deleteReview = (reviewId: string) =>
  api.delete(`/products/reviews/${reviewId}`);
export const reviewDistribution = (productId: string) =>
  api
    .get<{ product_id: string; total: number; average: number; distribution: Record<number, number> }>(
      `/products/${productId}/reviews/distribution`
    )
    .then((r) => r.data);
