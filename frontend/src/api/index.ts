import { api, API_BASE } from "./client";
export { API_BASE };
// getErrorMessage 统一从 ./client 导出（单一实现，兼容 1/2 参数调用）。
export { getErrorMessage } from "./client";

// ---------- 通用类型 ----------
export type Decimal = string;
export type Role = "buyer" | "merchant" | "admin";
export type ProductStatus = "draft" | "pending" | "active" | "rejected";
export type OrderStatus =
  | "pending_payment"
  | "paid"
  | "shipped"
  | "completed"
  | "refund_requested"
  | "refunded"
  | "refund_rejected"
  | "return_requested"
  | "return_shipped"
  | "return_received"
  | "exchange"
  | "dispute";
export type Sentiment = "positive" | "neutral" | "negative";
export type CouponType = "full_reduce" | "discount";
export type NotificationType = "order" | "coupon" | "points" | "review_alert" | "system";

// L3：统一的后端错误结构，配合 getErrorMessage 消除 AxiosError<ApiError> 的 any。
export interface ApiError {
  detail?: string;
  message?: string;
  code?: string;
  errors?: Record<string, string[]>;
}

// getErrorMessage 统一从 ./client 导出（单一实现，兼容 1/2 参数调用）。

// 以下为原 api/index.ts 中 any 返回类型收敛后的具体结构（L3）。
export interface LowStockOut {
  id: string;
  name: string;
  stock: number;
}
export interface AuditAlert {
  level?: string;
  type?: string;
  message?: string;
  samples?: string[];
}
export interface ReportPreviewOut {
  summary?: string;
  sales_trend?: { day: string; gmv: number }[];
  category_breakdown?: { gmv: number; category: string }[];
  top_products?: { name: string; gmv: number }[];
}

export interface Token {
  access_token: string;
  refresh_token: string;
  token_type: string;
}
export interface UserOut {
  id: string;
  username: string;
  email: string;
  role: Role;
  is_active: boolean;
  created_at: string;
  points?: number;
}
export interface ProductOut {
  id: string;
  merchant_id: string;
  category_id?: string | null;
  name: string;
  description?: string | null;
  price: Decimal;
  stock: number;
  image_url?: string | null;
  images?: string | null;
  specs?: string | null;
  status: ProductStatus;
  sales_count: number;
  warning_threshold?: number;
  ai_title?: string | null;
  ai_copy?: string | null;
  ai_price_suggestion?: string | null;
  attributes?: Record<string, unknown>;
  created_at: string;
  reject_reason?: string | null;
  ar_enabled?: boolean; // P2 体验增强：AR 试穿开关
  ar_overlay_url?: string | null;
}
export interface CategoryOut {
  id: string;
  name: string;
  slug: string;
  parent_id?: string | null;
  created_at: string;
}
export interface CartItemOut {
  id: string;
  product_id: string;
  name: string;
  price: Decimal;
  image_url?: string | null;
  stock: number;
  quantity: number;
  variant_id?: string | null;
  variant_label?: string | null;
  merchant_id?: string | null;
  category_id?: string | null;
  is_flash?: boolean;
  original?: number | null;
}
export interface OrderItemOut {
  id: string;
  product_id: string;
  name: string;
  image_url?: string | null;
  price: Decimal;
  quantity: number;
}
export interface OrderOut {
  id: string;
  order_no: string;
  status: OrderStatus;
  total_amount: Decimal;
  discount_amount: Decimal;
  address?: string | null;
  receiver?: string | null;
  contact?: string | null;
  delivery_type?: "express" | "pickup";
  pickup_store?: string | null;
  pickup_code?: string | null;
  picked_up_at?: string | null;
  items: OrderItemOut[];
  created_at: string;
  paid_at?: string | null;
  shipped_at?: string | null;
  completed_at?: string | null;
  return_tracking_no?: string | null;
  return_carrier?: string | null;
  dispute_reason?: string | null;
}

export interface CouponOut {
  id: string;
  name: string;
  type: CouponType;
  threshold: string;
  value: string;
  expire_at?: string | null;
  is_active: boolean;
  merchant_id?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  total?: number;
  issued?: number;
}
export interface UserCouponOut {
  id: string;
  coupon_id: string;
  name: string;
  type: CouponType;
  threshold: string;
  value: string;
  expire_at?: string | null;
  is_used: boolean;
  claimed_at: string;
  merchant_id?: string | null;
  applicable_category?: string | null;
}
export interface NotificationOut {
  id: string;
  type: NotificationType;
  title: string;
  content?: string | null;
  ref_id?: string | null;
  is_read: boolean;
  created_at: string;
}
export interface PointLogOut {
  id: string;
  action: string;
  delta: number;
  balance: number;
  remark?: string | null;
  created_at: string;
}
export interface ReviewOut {
  id: string;
  order_id: string;
  product_id: string;
  user_id: string;
  username?: string | null;
  rating: number;
  images?: string[];
  video?: string | null;
  append_content?: string | null;
  append_at?: string | null;
  append_images?: string[];
  content: string;
  sentiment: Sentiment;
  reply?: string | null;
  is_pinned?: boolean;
  helpful_count?: number;
  report_count?: number;
  created_at: string;
}
export interface MessageOut {
  id: string;
  role: "user" | "ai";
  content: string;
  created_at: string;
}
export interface ConversationOut {
  id: string;
  product_id: string;
  created_at: string;
  messages: MessageOut[];
}
export interface ChatResponse {
  conversation_id: string;
  reply: string;
  needs_human?: boolean;
}
export interface MerchantStats {
  product_count: number;
  active_product_count: number;
  order_count: number;
  paid_order_count: number;
  total_sales: Decimal;
  pending_review_count: number;
  low_stock_count: number;
}
export interface TrendPoint {
  date: string;
  amount: Decimal;
  orders?: number;
}
export interface AdminStats {
  user_count: number;
  merchant_count: number;
  product_count: number;
  pending_product_count: number;
  order_count: number;
  total_gmv: Decimal;
  negative_review_count: number;
}
export interface AuditLogOut {
  id: string;
  user_id?: string | null;
  action: string;
  entity: string;
  entity_id?: string | null;
  detail?: string | null;
  created_at: string;
}

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

// ---------- 首页运营内容 ----------
export interface BannerOut {
  id: string;
  title: string;
  image_url: string;
  link_type: string;
  link_id?: string | null;
  link_url?: string | null;
  sort_order: number;
}
export type PromotionType = "flash" | "discount" | "full_reduce" | "gift" | "second_half" | "bundle";
export interface PromotionOut {
  id: string;
  title: string;
  type: PromotionType;
  product_id?: string | null;
  discount_price?: string | null;
  discount_rate?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  threshold_amount?: string | null;
  gift_product_id?: string | null;
  bundle_count?: number | null;
  bundle_price?: string | null;
  product_name?: string | null;
  product_image?: string | null;
  original_price?: string | null;
  gift_product_name?: string | null;
}

export interface PromotionCreate {
  title: string;
  type: PromotionType;
  product_id: string;
  discount_price?: number;
  discount_rate?: number;
  start_at?: string;
  end_at?: string;
  is_active?: boolean;
  threshold_amount?: number;
  gift_product_id?: string;
  bundle_count?: number;
  bundle_price?: number;
}
export interface AddressOut {
  id: string;
  user_id: string;
  receiver: string;
  phone: string;
  province: string;
  city: string;
  district: string;
  detail: string;
  is_default: boolean;
}

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

// ---------- 买家中心：地址 / 签到 ----------
export const listAddresses = () =>
  api.get<AddressOut[]>("/me/addresses").then((r) => r.data);
export const createAddress = (p: Omit<AddressOut, "id" | "user_id">) =>
  api.post<AddressOut>("/me/addresses", p).then((r) => r.data);
export const updateAddress = (id: string, p: Partial<Omit<AddressOut, "id" | "user_id">>) =>
  api.put<AddressOut>(`/me/addresses/${id}`, p).then((r) => r.data);
export const deleteAddress = (id: string) => api.delete(`/me/addresses/${id}`);
export const signIn = () =>
  api.post<{ signed_today: boolean; points: number; gained: number; streak?: number }>(
    "/me/signin"
  ).then((r) => r.data);
export const getSignInStatus = () =>
  api
    .get<{ signed_today: boolean }>("/me/signin/status")
    .then((r) => r.data);

// ---------- 积分商城 ----------
export type RewardType = "coupon" | "virtual";
export interface RedemptionItemOut {
  id: string;
  name: string;
  description?: string | null;
  image_url?: string | null;
  cost_points: number;
  type: RewardType;
  stock: number;
  sold: number;
  is_active: boolean;
}
export interface RedemptionRecordOut {
  id: string;
  item_id: string;
  item_name?: string | null;
  cost_points: number;
  reward?: string | null;
  created_at: string;
}
export const listRewards = () =>
  api.get<RedemptionItemOut[]>("/rewards").then((r) => r.data);
export const redeemReward = (id: string) =>
  api
    .post<RedemptionRecordOut>(`/rewards/${id}/redeem`)
    .then((r) => r.data);
export const myRedemptions = () =>
  api.get<RedemptionRecordOut[]>("/rewards/mine").then((r) => r.data);

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

// ---------- 购物车 ----------
export const getCart = () =>
  api.get<CartItemOut[]>("/cart").then((r) => r.data);
export const addCartItem = (p: { product_id: string; quantity?: number; variant_id?: string }) =>
  api.post<CartItemOut>("/cart/items", p).then((r) => r.data);
export const updateCartItem = (itemId: string, quantity: number) =>
  api.put<CartItemOut>(`/cart/items/${itemId}`, { quantity }).then((r) => r.data);
export const removeCartItem = (itemId: string) =>
  api.delete(`/cart/items/${itemId}`);

// P1-2 购物车凑单 / 满减进度
export interface CartPreview {
  subtotal: number;
  item_promo_discount: number;
  item_promo_hits: string[];
  full_reduce_progress: Array<{
    product_id: string;
    title: string;
    threshold: number;
    value: number;
    line_total: number;
    reached: boolean;
    gap: number;
    every: boolean;
  }>;
  coupon_progress: {
    user_coupon_id: string;
    name: string;
    threshold: number;
    value: number;
    gap: number;
  } | null;
}
export const getCartPreview = () =>
  api.get<CartPreview>("/cart/preview").then((r) => r.data);

export interface BundleSuggestion {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
  merchant_id: string;
  projected_total: number;
}
export const getBundleSuggestions = (gap: number = 0, limit: number = 8) =>
  api
    .get<BundleSuggestion[]>("/cart/bundle-suggestions", { params: { gap, limit } })
    .then((r) => r.data);

// ---------- 订单 ----------
export const checkout = (
  address: string,
  opts?: {
    receiver?: string;
    contact?: string;
    coupon_id?: string;
    use_points?: boolean;
    delivery_type?: "express" | "pickup";
    pickup_store?: string;
    cart_item_ids?: string[];
    live_room_id?: string;
  }
) =>
  api
    .post<OrderOut>("/orders/checkout", {
      address,
      receiver: opts?.receiver || undefined,
      contact: opts?.contact || undefined,
      coupon_id: opts?.coupon_id || undefined,
      use_points: opts?.use_points || false,
      delivery_type: opts?.delivery_type || "express",
      pickup_store: opts?.pickup_store || undefined,
      cart_item_ids: opts?.cart_item_ids || undefined,
      live_room_id: opts?.live_room_id || undefined,
    })
    .then((r) => r.data);

export const verifyPickup = (orderId: string, pickup_code: string) =>
  api
    .post<OrderOut>(`/orders/${orderId}/pickup-verify`, { pickup_code })
    .then((r) => r.data);

export const requestRefund = (orderId: string, reason: string, image_urls?: string[]) =>
  api
    .post<OrderOut>(`/orders/${orderId}/refund`, { reason, image_urls: image_urls || [] })
    .then((r) => r.data);
export const reviewRefund = (orderId: string, approve: boolean, note?: string) =>
  api
    .patch<OrderOut>(`/orders/${orderId}/refund-review`, { approve, note })
    .then((r) => r.data);
export const addLogistics = (
  orderId: string,
  tracking_no: string,
  event: { time: string; location: string; description: string }
) =>
  api
    .post(`/orders/${orderId}/logistics`, { tracking_no, event })
    .then((r) => r.data);
export const getLogistics = (orderId: string) =>
  api
    .get<{ tracking_no?: string; events: LogisticsEvent[] }>(`/orders/${orderId}/logistics`)
    .then((r) => r.data);

// ---------- 店铺 ----------
export interface ShopSummary {
  id: string;
  name: string;
  avatar?: string | null;
  description?: string | null;
  rating: number;
  product_count: number;
}
export interface ShopDetail extends ShopSummary {
  sales_total: number;
  joined_at?: string | null;
  products: ProductOut[];
}
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

// ---------- AI 客服 ----------
export const chat = (p: {
  product_id: string;
  message: string;
  conversation_id?: string;
}) => api.post<ChatResponse>("/ai/chat", p).then((r) => r.data);
export const myConversations = () =>
  api.get<ConversationOut[]>("/ai/conversations").then((r) => r.data);

// ---------- 商家 ----------
export const merchantStats = () =>
  api.get<MerchantStats>("/merchant/dashboard/stats").then((r) => r.data);
export const merchantTrend = (days = 7) =>
  api
    .get<TrendPoint[]>("/merchant/dashboard/trend", { params: { days } })
    .then((r) => r.data);
export const myProducts = () =>
  api.get<ProductOut[]>("/merchant/products").then((r) => r.data);

// ---------- 店铺装修（P3-E） ----------
export interface DecorationModule {
  type: "banner" | "notice" | "products";
  text?: string;
  title?: string;
  product_ids?: string[];
  products?: ProductOut[];
}
export interface DecorationConfig {
  merchant_id: string;
  theme_color: string;
  banner_image?: string | null;
  banner_title?: string | null;
  banner_subtitle?: string | null;
  layout: DecorationModule[];
}
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

// ---------- 种草笔记（P3-G） ----------
export interface NoteProductCard {
  id: string;
  name: string;
  price: number;
  image_url?: string | null;
  sales_count: number;
}
export interface NoteOut {
  id: string;
  author_id: string;
  author_name: string;
  title: string;
  content: string;
  images: string[];
  products: NoteProductCard[];
  likes_count: number;
  liked: boolean;
  created_at?: string | null;
  affiliate_code?: string | null; // P3-G 种草商业化闭环
  share_url?: string | null; // 作者推广分享链接
}
export const listNotes = (params?: { keyword?: string; limit?: number; offset?: number }) =>
  api.get<NoteOut[]>("/notes", { params }).then((r) => r.data);
export const createNote = (data: {
  title: string;
  content: string;
  images?: string[];
  product_ids?: string[];
}) => api.post<NoteOut>("/notes", data).then((r) => r.data);
export const toggleNoteLike = (id: string) =>
  api
    .post<{ note_id: string; liked: boolean; likes_count: number }>(`/notes/${id}/like`)
    .then((r) => r.data);
export const deleteNote = (id: string) => api.delete(`/notes/${id}`).then(() => undefined);
export const getNote = (id: string) => api.get<NoteOut>(`/notes/${id}`).then((r) => r.data);

// P3-G 种草推荐流与商业化闭环
export const getNoteFeed = (params: { limit?: number; offset?: number } = {}) =>
  api.get<NoteOut[]>(`/notes/feed`, { params }).then((r) => r.data);
export const getNotesForProduct = (productId: string, limit = 20) =>
  api.get<NoteOut[]>(`/notes/for-product/${productId}`, { params: { limit } }).then((r) => r.data);
export const attachAffiliate = (noteId: string) =>
  api.post<NoteOut>(`/notes/${noteId}/attach-affiliate`).then((r) => r.data);
export const trackAffiliateClick = (code: string) => {
  if (!code) return Promise.resolve();
  return api.post(`/affiliate/track`, { code }).catch(() => undefined);
};

// ---------- PLUS 付费会员（P3-H） ----------
export interface PlusPlan {
  key: string;
  name: string;
  price: number;
  days: number;
  gift_points: number;
}
export interface PlusStatus {
  active: boolean;
  plan?: string | null;
  expire_at?: string | null;
  plans: PlusPlan[];
  benefits: string[];
}
export const getPlusStatus = () => api.get<PlusStatus>("/plus/status").then((r) => r.data);
export const subscribePlus = (plan: string) =>
  api.post<PlusStatus>("/plus/subscribe", { plan }).then((r) => r.data);

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
export interface CategoryBreakdown {
  category_id?: string | null;
  category: string;
  products: number;
  sales: number;
  revenue: number;
}
export interface TopProduct {
  id: string;
  name: string;
  sales: number;
  revenue: number;
}
export interface FunnelStage {
  stage: string;
  value: number;
}
export interface Comparison {
  gmv_now: number;
  gmv_prev: number;
  gmv_rate: number;
  orders_now: number;
  orders_prev: number;
  orders_rate: number;
}
export interface DashboardAnalytics {
  category_breakdown: CategoryBreakdown[];
  top_products: TopProduct[];
  funnel: FunnelStage[];
  comparison: Comparison;
}
export const adminDashboardAnalytics = () =>
  api.get<DashboardAnalytics>("/admin/dashboard/analytics").then((r) => r.data);

// ---------- 优惠券 ----------
export const listCoupons = () =>
  api.get<CouponOut[]>("/coupons").then((r) => r.data);
export const claimCoupon = (id: string) =>
  api.post<UserCouponOut>(`/coupons/${id}/claim`).then((r) => r.data);
export const myCoupons = () =>
  api.get<UserCouponOut[]>("/coupons/mine").then((r) => r.data);

// ---------- 优惠券管理（管理员 / 商家）----------
export interface CouponCreate {
  name: string;
  type: CouponType;
  threshold?: number | string;
  value: number | string;
  total?: number;
  is_active?: boolean;
  start_at?: string | null;
  end_at?: string | null;
  expire_at?: string | null;
  merchant_id?: string;
}

/** 物流轨迹节点 */
export interface LogisticsEvent {
  time: string;
  location?: string;
  description?: string;
}
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

// ---------- 收藏 ----------
export const listFavorites = () =>
  api.get<ProductOut[]>("/favorites").then((r) => r.data);
export const addFavorite = (productId: string) =>
  api.post<ProductOut>(`/favorites/${productId}`).then((r) => r.data);
export const removeFavorite = (productId: string) =>
  api.delete(`/favorites/${productId}`);
export const isFavorited = (productId: string) =>
  api
    .get<{ favorited: boolean }>(`/favorites/${productId}/is-favorited`)
    .then((r) => r.data);

// ---------- 通知 ----------
export const listNotifications = () =>
  api.get<NotificationOut[]>("/notifications").then((r) => r.data);
export const unreadCount = () =>
  api.get<{ count: number }>("/notifications/unread-count").then((r) => r.data);
export const markRead = (id: string) =>
  api.patch<NotificationOut>(`/notifications/${id}/read`).then((r) => r.data);
export const markAllRead = () =>
  api.post("/notifications/read-all").then((r) => r.data);

// ---------- 积分 ----------
export const pointHistory = () =>
  api.get<PointLogOut[]>("/points/history").then((r) => r.data);

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

// ---------- 个性化推荐（T7：按域拆分到 ./recommend）----------
export * from "./recommend";

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

// ---------- AI 首页编排 / 选品洞察 ----------
export interface FloorOut {
  key: string;
  title: string;
  reason: string;
  products: ProductOut[];
}
export interface HomeArrangeOut {
  segment: string;
  hour: number;
  floors: FloorOut[];
  insight: string;
}
export interface DemandGap {
  keyword: string;
  search_count: number;
  matched_products: number;
  suggested_category: string;
}
export interface SuggestedCategory {
  category: string;
  keywords: string[];
}
export interface TrendInsightOut {
  hot_keywords: string[];
  demand_gap: DemandGap[];
  suggested_categories: SuggestedCategory[];
  rising_products: ProductOut[];
  insight: string;
}
export const homeArrange = (params?: { segment?: string; hour?: number }) =>
  api.get<HomeArrangeOut>("/ai/home-arrange", { params }).then((r) => r.data);
export const trendInsight = () =>
  api.get<TrendInsightOut>("/ai/trend-insight").then((r) => r.data);

// ---------- 售后工单 ----------
export interface SupportAttachmentOut {
  id: string;
  url: string;
  filename?: string | null;
  content_type?: string | null;
}
export interface SupportMessageOut {
  id: string;
  sender_role: "buyer" | "merchant" | "ai";
  content: string;
  is_internal: boolean;
  is_revoked: boolean;
  attachments: SupportAttachmentOut[];
  created_at: string;
}
export type TicketStatus = "open" | "answered" | "closed";
export type TicketPriority = "low" | "normal" | "high" | "urgent";
export type TicketCategory = "inquiry" | "aftersale" | "logistics" | "other";
export interface SupportTicketOut {
  id: string;
  status: TicketStatus;
  subject?: string | null;
  product_id?: string | null;
  product_name?: string | null;
  order_id?: string | null;
  order_no?: string | null;
  user_id: string;
  user_name: string;
  priority: TicketPriority;
  category: TicketCategory;
  satisfaction_rating?: number | null;
  satisfaction_comment?: string | null;
  unread_for_buyer: number;
  unread_for_merchant: number;
  created_at: string;
  updated_at: string;
  messages: SupportMessageOut[];
}
export interface SupportTicketPage {
  items: SupportTicketOut[];
  total: number;
  page: number;
  page_size: number;
}
export interface CreateTicketRequest {
  product_id?: string;
  message: string;
  subject?: string;
  priority?: TicketPriority;
  category?: TicketCategory;
  order_id?: string;
  attachments?: string[];
}
export interface ReplyRequest {
  content: string;
  is_internal?: boolean;
  attachments?: string[];
}

export const createTicket = (data: CreateTicketRequest) =>
  api.post<SupportTicketOut>("/support/tickets", data).then((r) => r.data);
export const listTickets = (params?: {
  status?: string;
  priority?: string;
  category?: string;
  search?: string;
  page?: number;
  page_size?: number;
}) =>
  api.get<SupportTicketPage>("/support/tickets", { params }).then((r) => r.data);
export const getTicket = (id: string) =>
  api.get<SupportTicketOut>(`/support/tickets/${id}`).then((r) => r.data);
export const replyTicket = (id: string, data: ReplyRequest) =>
  api.post<SupportTicketOut>(`/support/tickets/${id}/messages`, data).then((r) => r.data);
export const revokeMessage = (id: string, messageId: string) =>
  api
    .post<SupportTicketOut>(`/support/tickets/${id}/messages/${messageId}/revoke`)
    .then((r) => r.data);
export const closeTicket = (id: string) =>
  api.post<SupportTicketOut>(`/support/tickets/${id}/close`).then((r) => r.data);
export const rateTicket = (id: string, rating: number, comment?: string) =>
  api.post<SupportTicketOut>(`/support/tickets/${id}/rate`, { rating, comment }).then((r) => r.data);
export const aiReplyTicket = (id: string) =>
  api.post<{ content: string }>(`/support/tickets/${id}/ai-reply`).then((r) => r.data);
export const supportUnread = () =>
  api.get<{ unread: number }>("/support/unread").then((r) => r.data);
export const deleteTicket = (id: string) =>
  api.delete<{ ok: boolean }>(`/support/tickets/${id}`).then((r) => r.data);
export const deleteTickets = (ids: string[]) =>
  api
    .delete<{ ok: boolean; deleted: number }>("/support/tickets", { data: { ids } })
    .then((r) => r.data);

// ---------- 库存管理（商家）----------
export interface StockLogOut {
  id: string;
  product_id: string;
  product_name?: string | null;
  change_type: string;
  quantity: number;
  balance_after: number;
  remark?: string | null;
  created_at: string;
}
export interface StockSummaryOut {
  total_skus: number;
  low_stock_count: number;
  out_of_stock_count: number;
  recent_changes: number;
}
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

// ---------- 关注店铺 ----------
export const followShop = (merchantId: string) =>
  api.post(`/follow/${merchantId}`).then((r) => r.data);
export const unfollowShop = (merchantId: string) =>
  api.delete(`/follow/${merchantId}`).then((r) => r.data);
export const followStatus = (merchantId: string) =>
  api.get<{ following: boolean }>(`/follow/${merchantId}/status`).then((r) => r.data);
export const followersCount = (merchantId: string) =>
  api.get<{ count: number }>(`/follow/${merchantId}/count`).then((r) => r.data);
export interface FollowShopOut {
  merchant_id: string;
  shop_name?: string | null;
  shop_logo?: string | null;
  followers_count: number;
  created_at: string;
}
export const myFollowing = () =>
  api.get<FollowShopOut[]>("/follow/following").then((r) => r.data);

// ---------- 搜索增强 ----------
export const searchHot = () => api.get<string[]>("/search/hot").then((r) => r.data);
export const searchRecord = (q: string) =>
  api.post(`/search/record?q=${encodeURIComponent(q)}`).then((r) => r.data);

// ---------- 搜索增强：分面检索 / 搜索联想 ----------
export interface Facets {
  categories: { id: string; name: string; count: number }[];
  price_min: number;
  price_max: number;
  rating_buckets: Record<string, number>;
  sorts: { value: string; label: string }[];
}
export const searchFacets = (params?: {
  keyword?: string;
  category_id?: string;
  min_price?: number;
  max_price?: number;
}) => api.get<Facets>("/search/facets", { params }).then((r) => r.data);
export const searchSuggest = (q: string) =>
  api.get<string[]>("/search/suggest", { params: { q } }).then((r) => r.data);

// ---------- 评价增强（有用 / 举报）----------
export const markReviewHelpful = (reviewId: string) =>
  api.post<ReviewOut>(`/products/reviews/${reviewId}/helpful`).then((r) => r.data);
export const reportReview = (reviewId: string, reason?: string) =>
  api
    .post<ReviewOut>(`/products/reviews/${reviewId}/report`, { reason })
    .then((r) => r.data);

// ---------- 商品问答 Q&A ----------
export interface AnswerOut {
  id: string;
  question_id: string;
  user_id: string;
  username?: string | null;
  content: string;
  is_accepted: boolean;
  created_at: string;
}
export interface QuestionOut {
  id: string;
  product_id: string;
  user_id: string;
  username?: string | null;
  content: string;
  created_at: string;
  answers: AnswerOut[];
}
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

// ---------- 浏览历史 / 最近常买 ----------
export interface ViewLogIn {
  product_id: string;
  product_name?: string | null;
  price?: number | null;
  image_url?: string | null;
}
export interface ViewLogOut {
  id: string;
  product_id: string;
  product_name?: string | null;
  price?: number | null;
  image_url?: string | null;
  created_at: string;
}
export interface BoughtOut {
  product_id: string;
  product_name: string;
  times: number;
  image_url?: string | null;
}
export const logView = (data: ViewLogIn) =>
  api.post(`/me/view-log`, data).then((r) => r.data);
export const listHistory = (limit = 30) =>
  api.get<ViewLogOut[]>(`/me/history`, { params: { limit } }).then((r) => r.data);
export const listRecentlyBought = () =>
  api.get<BoughtOut[]>(`/me/recently-bought`).then((r) => r.data);

// ---------- 关注流动态 ----------
export interface ShopEventOut {
  id: string;
  merchant_id: string;
  shop_name?: string | null;
  product_id?: string | null;
  event_type: "new_product" | "price_drop";
  product_name?: string | null;
  image_url?: string | null;
  old_price?: number | null;
  new_price?: number | null;
  created_at: string;
}
export const followFeed = (limit = 50) =>
  api.get<ShopEventOut[]>(`/follow/feed`, { params: { limit } }).then((r) => r.data);

// ---------- 智能客服知识库 ----------
export interface KnowledgeOut {
  id: string;
  merchant_id: string;
  question: string;
  answer: string;
  source: "manual" | "learned";
  hit_count: number;
  created_at: string;
}
export interface KnowledgeSuggestOut {
  entry_id: string;
  question: string;
  answer: string;
  score: number;
}
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

// ---------- 分销裂变 ----------
export interface AffiliateLinkOut {
  id: string;
  product_id: string | null;
  code: string;
  clicks: number;
  created_at: string | null;
}
export interface AffiliateCommissionOut {
  id: string;
  order_id: string;
  order_amount: number;
  commission: number;
  status: string;
  created_at: string | null;
}
export interface AffiliateSummaryOut {
  total_commission: number;
  reversed_commission: number;
  withdrawn: number;
  available: number;
  invitees: number;
  clicks: number;
}
export interface AffiliateWithdrawalOut {
  id: string;
  user_id: string;
  amount: number;
  status: string;
  remark: string | null;
  created_at: string | null;
  processed_at: string | null;
}
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

// ---------- 直播带货 ----------
export interface LiveProductOut {
  id: string;
  name: string;
  price: number;
  image_url?: string | null;
  stock: number;
  pinned: boolean;
  live_price?: number | null; // 直播专属价
  explaining: boolean; // 是否正在讲解
  source: "normal" | "explaining" | "flash";
}
export interface LiveRoomOut {
  id: string;
  merchant_id: string;
  title: string;
  cover_url?: string | null;
  status: "scheduled" | "live" | "ended";
  viewers: number;
  started_at?: string | null;
  created_at?: string | null;
  merchant_name?: string | null;
  product_count: number;
}
export interface LiveRoomDetail extends LiveRoomOut {
  products: LiveProductOut[];
}
export interface LiveMessageOut {
  id: string;
  user_id: string;
  username: string;
  content: string;
  created_at?: string | null;
}
export const listLiveRooms = () => api.get<LiveRoomOut[]>("/live").then((r) => r.data);
export const myLiveRooms = () => api.get<LiveRoomOut[]>("/live/mine").then((r) => r.data);
export const createLiveRoom = (p: { title: string; cover_url?: string; product_ids: string[] }) =>
  api.post<LiveRoomOut>("/live", p).then((r) => r.data);
export const getLiveRoom = (id: string) =>
  api.get<LiveRoomDetail>(`/live/${id}`).then((r) => r.data);
export const startLiveRoom = (id: string) =>
  api.post<LiveRoomOut>(`/live/${id}/start`).then((r) => r.data);
export const endLiveRoom = (id: string) =>
  api.post<LiveRoomOut>(`/live/${id}/end`).then((r) => r.data);
export const enterLiveRoom = (id: string) =>
  api.post<{ viewers: number }>(`/live/${id}/enter`).then((r) => r.data);
export const listLiveMessages = (id: string, afterId?: string) =>
  api
    .get<LiveMessageOut[]>(`/live/${id}/messages`, {
      params: afterId ? { after_id: afterId } : undefined,
    })
    .then((r) => r.data);
export const sendLiveMessage = (id: string, content: string) =>
  api.post<LiveMessageOut>(`/live/${id}/messages`, { content }).then((r) => r.data);

// P2 直播分销增强：改直播价 / 置顶 / 切讲解 / 移品 / AI 话术
export const upsertLiveProduct = (
  roomId: string,
  productId: string,
  p: { live_price?: number | null; explaining?: boolean; pinned?: boolean }
) => api.put<LiveProductOut>(`/live/${roomId}/products/${productId}`, p).then((r) => r.data);
export const removeLiveProduct = (roomId: string, productId: string) =>
  api.delete(`/live/${roomId}/products/${productId}`).then((r) => r.data);
export const setLiveExplaining = (roomId: string, productId: string, explaining: boolean) =>
  api.post(`/live/${roomId}/products/${productId}/explain`, { explaining }).then((r) => r.data);
export const liveAiScript = (roomId: string, productId?: string) =>
  api
    .post<{ script: string }>(`/live/${roomId}/ai-script`, { product_id: productId ?? null })
    .then((r) => r.data);

/** 直播弹幕 WebSocket 地址：同源走相对路径（开发经 Vite 代理，生产走同源托管）。 */
export function liveWsUrl(id: string): string {
  const base = import.meta.env.VITE_API_BASE_URL || "";
  const path = `/api/live/${id}/ws`;
  if (base) {
    const u = new URL(base);
    const proto = u.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${u.host}${path}`;
  }
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}${path}`;
}

/** 图片经后端代理转发（仅外部 http(s) 链接走 /api/images/proxy，本地 /uploads 不受影响）。 */
export function proxyImg(url: string): string {
  if (!url || !/^https?:\/\//i.test(url)) return url;
  return `${API_BASE}/images/proxy?u=${encodeURIComponent(url)}`;
}

// ---------- 电子发票 ----------
export interface InvoiceOut {
  id: string;
  invoice_no: string;
  order_id: string;
  title_type: "personal" | "company";
  title: string;
  tax_no?: string | null;
  amount: number;
  issued_at?: string | null;
  order_no?: string | null;
}
export const applyInvoice = (
  orderId: string,
  p: { title_type: string; title: string; tax_no?: string }
) => api.post<InvoiceOut>(`/invoices/orders/${orderId}`, p).then((r) => r.data);
export const getOrderInvoice = (orderId: string) =>
  api.get<InvoiceOut | null>(`/invoices/orders/${orderId}`).then((r) => r.data);
export const myInvoices = () => api.get<InvoiceOut[]>(`/invoices/mine`).then((r) => r.data);

// ---------- 预售定金 ----------
export interface PresaleOut {
  id: string;
  merchant_id: string;
  product_id: string;
  title: string;
  presale_price: string;
  deposit: string;
  inflate_rate: number;
  end_at?: string | null;
  is_active: number;
  created_at?: string | null;
  product_name?: string | null;
  product_image?: string | null;
  original_price?: string | null;
  deposit_deduction?: number | null;
  balance_due?: number | null;
}
export interface PresaleReservationOut {
  id: string;
  presale_id: string;
  deposit_paid: string;
  status: "deposit_paid" | "completed" | "cancelled";
  order_id?: string | null;
  created_at?: string | null;
  completed_at?: string | null;
  presale_title?: string | null;
  product_name?: string | null;
  product_image?: string | null;
  balance_due?: number | null;
}
export const listPresales = () => api.get<PresaleOut[]>(`/presales`).then((r) => r.data);
export const myPresales = () => api.get<PresaleOut[]>(`/presales/mine`).then((r) => r.data);
export const createPresale = (p: {
  product_id: string;
  title: string;
  presale_price: number;
  deposit: number;
  inflate_rate: number;
  end_at?: string;
}) => api.post<PresaleOut>(`/presales`, p).then((r) => r.data);
export const payPresaleDeposit = (presaleId: string) =>
  api.post<PresaleReservationOut>(`/presales/${presaleId}/deposit`).then((r) => r.data);
export const myPresaleReservations = () =>
  api.get<PresaleReservationOut[]>(`/presales/reservations`).then((r) => r.data);
export const payPresaleBalance = (reservationId: string, address: string) =>
  api
    .post<PresaleReservationOut>(`/presales/reservations/${reservationId}/balance`, { address })
    .then((r) => r.data);

// ---------- 子账号权限 ----------
export interface StaffPerm {
  key: string;
  label: string;
}
export interface StaffOut {
  id: string;
  owner_id: string;
  staff_user_id: string;
  username: string;
  permissions: string[];
  is_active: boolean;
  created_at?: string | null;
}
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
export interface PriceCompareOut {
  product_id: string;
  product_name?: string;
  our_price: number;
  competitor_count: number;
  min_price: number;
  max_price: number;
  avg_price: number;
  percentile: number;
  suggestion: string;
}
export const getPriceCompare = (productId: string) =>
  api.get<PriceCompareOut>(`/products/${productId}/price-compare`).then((r) => r.data);

// ---------- 报表定时邮件 ----------
export type ReportFrequency = "daily" | "weekly";
export interface ReportTaskOut {
  id: string;
  merchant_id: string;
  frequency: ReportFrequency;
  email: string;
  is_active: boolean;
  last_sent_at?: string | null;
  created_at?: string | null;
}
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

// ---------- 审计回放 / 告警 ----------
export interface AuditLogItem {
  id: string;
  user_id?: string | null;
  action: string;
  entity: string;
  entity_id?: string | null;
  detail?: string | null;
  created_at?: string | null;
}
export const getAuditReplay = (entity: string, entityId?: string) =>
  api
    .get<AuditLogItem[]>(`/admin/audit/replay`, { params: { entity, entity_id: entityId } })
    .then((r) => r.data);
export const getAuditAlerts = () =>
  api.get<{ alerts: AuditAlert[]; generated_at: string }>(`/admin/audit/alerts`).then((r) => r.data);

// ---------- 通知分类免打扰 ----------
export const listNotificationCategories = () =>
  api.get<{ categories: string[] }>(`/notifications/categories`).then((r) => r.data);
export const getNotificationSettings = () =>
  api.get<{ muted: string[] }>(`/notifications/settings`).then((r) => r.data);
export const updateNotificationSettings = (muted: string[]) =>
  api.put<{ muted: string[] }>(`/notifications/settings`, { muted }).then((r) => r.data);

// ---------- 报表导出 PDF ----------
export const exportOrdersPdf = () =>
  api
    .get("/merchant/reports/orders/pdf", { responseType: "blob" })
    .then((r) => downloadBlob(r.data, "orders.pdf"));

// ---------- P1-3 历史价格曲线 ----------
export interface PricePoint {
  price: number;
  source: string;
  time: string | null;
}
export interface PriceHistoryOut {
  series: PricePoint[];
  compare: PriceCompareOut | null;
}
export const getPriceHistory = (productId: string) =>
  api.get<PriceHistoryOut>(`/products/${productId}/price-history`).then((r) => r.data);

// ---------- P1-5 售后进度时间轴 ----------
export interface AftersaleEventOut {
  id: string;
  event_type: string;
  actor_role: string;
  title: string;
  description: string | null;
  time: string | null;
}
export interface AftersaleTimelineOut {
  order_id: string;
  status: OrderStatus;
  events: AftersaleEventOut[];
}
export const getAftersaleTimeline = (orderId: string) =>
  api.get<AftersaleTimelineOut>(`/orders/${orderId}/aftersale-timeline`).then((r) => r.data);

// ---------- P1-6 地址智能解析 ----------
export interface ParsedAddress {
  province: string | null;
  city: string | null;
  district: string | null;
  detail: string;
  confidence: "high" | "medium" | "low" | "none";
}
export const parseAddressText = (text: string) =>
  api
    .post<ParsedAddress>(`/me/addresses/parse`, { text })
    .then((r) => r.data);

// ---------- 商品多规格 SKU ----------
export interface VariantOut {
  id: string;
  product_id: string;
  sku_code?: string | null;
  specs: Record<string, string>;
  price_delta: number;
  stock: number;
  image_url?: string | null;
}
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
export interface MerchantReviewItem extends ReviewOut {
  reply?: string | null;
  is_pinned?: boolean;
}
export interface MerchantReviewPage {
  items: MerchantReviewItem[];
  total: number;
  page: number;
  page_size: number;
}
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

// ---------- 退货物流（买家）----------
export const returnLogistics = (
  orderId: string,
  tracking_no: string,
  event: { time: string; location: string; description: string }
) => api.post(`/orders/${orderId}/return-logistics`, { tracking_no, event }).then((r) => r.data);

// ---------- P3-A 退货退款 / 换货 / 仲裁 ----------
export const returnShip = (
  orderId: string,
  p: { tracking_no: string; carrier: string; note?: string }
) => api.post<OrderOut>(`/orders/${orderId}/return-ship`, p).then((r) => r.data);
export const confirmReturnReceived = (orderId: string) =>
  api.post<OrderOut>(`/orders/${orderId}/return-receive`).then((r) => r.data);
export const requestExchange = (orderId: string, note?: string) =>
  api.post<OrderOut>(`/orders/${orderId}/exchange`, { note }).then((r) => r.data);
export const openDispute = (orderId: string, reason: string) =>
  api.post<OrderOut>(`/orders/${orderId}/dispute`, { reason }).then((r) => r.data);
export const reviewDispute = (orderId: string, approve: boolean, note?: string) =>
  api.post<OrderOut>(`/orders/${orderId}/dispute-review`, { approve, note }).then((r) => r.data);

// ---------- 部分退款 ----------
export const requestRefundPartial = (
  orderId: string,
  reason: string,
  refundAmount?: number,
  image_urls?: string[]
) =>
  api
    .post<OrderOut>(`/orders/${orderId}/refund`, {
      reason,
      refund_amount: refundAmount,
      image_urls: image_urls || [],
    })
    .then((r) => r.data);

// ---------- 会员等级 + 任务中心 ----------
export interface MembershipOut {
  level: string;
  level_name: string;
  growth_value: number;
  discount: number;
  free_shipping: boolean;
  next_level?: string | null;
  next_level_name?: string | null;
  next_growth?: number | null;
  progress: number;
  benefits: string[];
}
export interface TaskOut {
  key: string;
  name: string;
  description: string;
  points: number;
  done: boolean;
  claimed: boolean;
}
export const getMembership = () =>
  api.get<MembershipOut>("/me/membership").then((r) => r.data);
export const listTasks = () =>
  api.get<TaskOut[]>("/me/tasks").then((r) => r.data);
export const claimTask = (key: string) =>
  api.post<{ ok: boolean; gained: number; points: number }>(`/me/tasks/${key}/claim`).then((r) => r.data);

// ---------- 支付（沙箱网关）----------
export interface PaymentOut {
  payment_id: string;
  gateway: string;
  amount: number;
  currency: string;
  status: string;
  pay_url?: string;
  transaction_id?: string | null;
}
export const createPayment = (orderId: string) =>
  api.post<PaymentOut>(`/payments/orders/${orderId}/pay`).then((r) => r.data);
export const confirmPayment = (orderId: string) =>
  api.post<{ status: string }>(`/payments/orders/${orderId}/confirm`).then((r) => r.data);
export interface PaymentStatus {
  payment_id: string | null;
  gateway: string | null;
  amount: number;
  status: string;
  escrow_status: "none" | "held" | "released" | "reversed";
  transaction_id: string | null;
  released_at: string | null;
}

export const getPaymentStatus = (orderId: string) =>
  api.get<PaymentStatus>(`/payments/orders/${orderId}/status`).then((r) => r.data);

// ---------- P3-B AI 可行动代理层 ----------
export interface AgentTool {
  name: string;
  description: string;
  params: Record<string, string>;
}
export interface AgentReply {
  reply: string;
  intent?: string;
  products?: {
    id: string;
    name: string;
    price: number;
    image_url: string | null;
    category_id: string | null;
  }[];
  tool_calls: { tool: string; result: unknown }[];
}
export const agentChat = (body: {
  message: string;
  product_id?: string;
  address?: string;
  tool?: string;
}) => api.post<AgentReply>("/agent/chat", body).then((r) => r.data);
export const agentTools = () =>
  api.get<AgentTool[]>("/agent/tools").then((r) => r.data);

// ---------- 商家深度分析（含 RFM / 复购率）----------
export interface RFMSegment {
  segment: string;
  customers: number;
  total_monetary: number;
}
export interface MerchantAnalytics {
  stats: MerchantStats;
  rfm: RFMSegment[];
  repurchase_rate: number;
  buyers: number;
  sales_trend: TrendPoint[];
  top_products: TopProduct[];
}
export const merchantAnalytics = () =>
  api.get<MerchantAnalytics>("/merchant/dashboard/analytics").then((r) => r.data);
