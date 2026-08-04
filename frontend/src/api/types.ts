// T7：api 公共类型集中定义（由 split_api 脚本从 index.ts 提取，勿手改）。

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

export interface ApiError {
  detail?: string;
  message?: string;
  code?: string;
  errors?: Record<string, string[]>;
}

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
  variant_attrs?: { label: string; value: string }[] | null;
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

export interface BundleSuggestion {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
  merchant_id: string;
  projected_total: number;
}

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

export interface LogisticsEvent {
  time: string;
  location?: string;
  description?: string;
}

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

export interface FollowShopOut {
  merchant_id: string;
  shop_name?: string | null;
  shop_logo?: string | null;
  followers_count: number;
  created_at: string;
}

export interface Facets {
  categories: { id: string; name: string; count: number }[];
  price_min: number;
  price_max: number;
  rating_buckets: Record<string, number>;
  sorts: { value: string; label: string }[];
}

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

export interface AuditLogItem {
  id: string;
  user_id?: string | null;
  action: string;
  entity: string;
  entity_id?: string | null;
  detail?: string | null;
  created_at?: string | null;
}

export interface PricePoint {
  price: number;
  source: string;
  time: string | null;
}

export interface PriceHistoryOut {
  series: PricePoint[];
  compare: PriceCompareOut | null;
}

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

export interface ParsedAddress {
  province: string | null;
  city: string | null;
  district: string | null;
  detail: string;
  confidence: "high" | "medium" | "low" | "none";
}

export interface VariantOut {
  id: string;
  product_id: string;
  sku_code?: string | null;
  specs: Record<string, string>;
  price_delta: number;
  stock: number;
  image_url?: string | null;
}

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

export interface PaymentOut {
  payment_id: string;
  gateway: string;
  amount: number;
  currency: string;
  status: string;
  pay_url?: string;
  transaction_id?: string | null;
}

export interface PaymentStatus {
  payment_id: string | null;
  gateway: string | null;
  amount: number;
  status: string;
  escrow_status: "none" | "held" | "released" | "reversed";
  transaction_id: string | null;
  released_at: string | null;
}

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
