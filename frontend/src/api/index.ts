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
  | "refunded";
export type Sentiment = "positive" | "neutral" | "negative";

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
  address?: string | null;
  items: OrderItemOut[];
  created_at: string;
  paid_at?: string | null;
  shipped_at?: string | null;
  completed_at?: string | null;
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
export const checkout = (address: string) =>
  api.post<OrderOut>("/orders/checkout", { address }).then((r) => r.data);
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
