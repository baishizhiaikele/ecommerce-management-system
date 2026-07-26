import { api } from "./client";

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
  | "refund_rejected";
export type Sentiment = "positive" | "neutral" | "negative";
export type CouponType = "full_reduce" | "discount";
export type NotificationType = "order" | "coupon" | "points" | "review_alert" | "system";

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
  status: ProductStatus;
  sales_count: number;
  ai_title?: string | null;
  ai_copy?: string | null;
  ai_price_suggestion?: string | null;
  created_at: string;
  reject_reason?: string | null;
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
}
export interface OrderItemOut {
  id: string;
  product_id: string;
  name: string;
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
  items: OrderItemOut[];
  created_at: string;
  paid_at?: string | null;
  shipped_at?: string | null;
  completed_at?: string | null;
}

export interface CouponOut {
  id: string;
  name: string;
  type: CouponType;
  threshold: string;
  value: string;
  expire_at?: string | null;
  is_active: boolean;
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
  rating: number;
  content: string;
  sentiment: Sentiment;
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

// ---------- 商品 ----------
export const listProducts = (params?: {
  category_id?: string;
  keyword?: string;
  sort?: string;
  min_price?: number;
  max_price?: number;
  in_stock?: boolean;
  page?: number;
  page_size?: number;
}) => api.get<ProductOut[]>("/products", { params }).then((r) => r.data);
export const getProduct = (id: string) =>
  api.get<ProductOut>(`/products/${id}`).then((r) => r.data);
export const createProduct = (p: {
  name: string;
  price: number | string;
  stock: number;
  description?: string;
  image_url?: string;
  category_id?: string;
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
  p: { order_id: string; rating: number; content: string }
) =>
  api.post<ReviewOut>(`/products/${productId}/reviews`, p).then((r) => r.data);

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
export const addCartItem = (p: { product_id: string; quantity?: number }) =>
  api.post<CartItemOut>("/cart/items", p).then((r) => r.data);
export const updateCartItem = (itemId: string, quantity: number) =>
  api.put<CartItemOut>(`/cart/items/${itemId}`, { quantity }).then((r) => r.data);
export const removeCartItem = (itemId: string) =>
  api.delete(`/cart/items/${itemId}`);

// ---------- 订单 ----------
export const checkout = (
  address: string,
  opts?: { coupon_id?: string; use_points?: boolean }
) =>
  api
    .post<OrderOut>("/orders/checkout", {
      address,
      coupon_id: opts?.coupon_id || undefined,
      use_points: opts?.use_points || false,
    })
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
  api.get<{ tracking_no?: string; events: any[] }>(`/orders/${orderId}/logistics`).then((r) => r.data);

// ---------- 店铺 ----------
export const listShops = () =>
  api.get<{ id: string; name: string; product_count: number }[]>("/shops").then((r) => r.data);
export const getShop = (id: string) =>
  api
    .get<{ id: string; name: string; product_count: number; products: ProductOut[] }>(
      `/shops/${id}`
    )
    .then((r) => r.data);
export const listOrders = () =>
  api.get<OrderOut[]>("/orders").then((r) => r.data);
export const getOrder = (id: string) =>
  api.get<OrderOut>(`/orders/${id}`).then((r) => r.data);
export const transitionOrder = (id: string, status: OrderStatus) =>
  api.patch<OrderOut>(`/orders/${id}/status`, { status }).then((r) => r.data);

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

// ---------- 优惠券 ----------
export const listCoupons = () =>
  api.get<CouponOut[]>("/coupons").then((r) => r.data);
export const claimCoupon = (id: string) =>
  api.post<UserCouponOut>(`/coupons/${id}/claim`).then((r) => r.data);
export const myCoupons = () =>
  api.get<UserCouponOut[]>("/coupons/mine").then((r) => r.data);

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

// ---------- 个性化推荐 ----------
export const recommendations = () =>
  api.get<ProductOut[]>("/recommendations").then((r) => r.data);

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

// ---------- 售后工单 ----------
export interface SupportMessageOut {
  id: string;
  sender_role: "buyer" | "merchant" | "ai";
  content: string;
  created_at: string;
}
export interface SupportTicketOut {
  id: string;
  status: "open" | "answered" | "closed";
  subject?: string | null;
  product_id?: string | null;
  product_name?: string | null;
  user_id: string;
  user_name: string;
  created_at: string;
  updated_at: string;
  messages: SupportMessageOut[];
}
export const createTicket = (data: { product_id?: string; message: string; subject?: string }) =>
  api.post<SupportTicketOut>("/support/tickets", data).then((r) => r.data);
export const listTickets = () =>
  api.get<SupportTicketOut[]>("/support/tickets").then((r) => r.data);
export const getTicket = (id: string) =>
  api.get<SupportTicketOut>(`/support/tickets/${id}`).then((r) => r.data);
export const replyTicket = (id: string, content: string) =>
  api.post<SupportTicketOut>(`/support/tickets/${id}/messages`, { content }).then((r) => r.data);
export const closeTicket = (id: string) =>
  api.post<SupportTicketOut>(`/support/tickets/${id}/close`).then((r) => r.data);
