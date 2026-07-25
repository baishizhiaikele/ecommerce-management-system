import { OrderStatus, Sentiment, ProductStatus } from "../api";

export const money = (v: string | number) => {
  const n = typeof v === "string" ? parseFloat(v) : v;
  return isNaN(n) ? "0.00" : n.toFixed(2);
};

export const orderStatusMeta: Record<OrderStatus, { label: string; color: string }> = {
  pending_payment: { label: "待付款", color: "orange" },
  paid: { label: "已付款", color: "blue" },
  shipped: { label: "已发货", color: "cyan" },
  completed: { label: "已完成", color: "green" },
  refund_requested: { label: "退款中", color: "volcano" },
  refunded: { label: "已退款", color: "red" },
};

export const productStatusMeta: Record<ProductStatus, { label: string; color: string }> = {
  draft: { label: "草稿", color: "default" },
  pending: { label: "待审核", color: "gold" },
  active: { label: "已上架", color: "green" },
  rejected: { label: "已驳回", color: "red" },
};

export const sentimentMeta: Record<Sentiment, { label: string; color: string }> = {
  positive: { label: "正面", color: "green" },
  neutral: { label: "中性", color: "default" },
  negative: { label: "负面", color: "red" },
};

export const actionLabel: Record<OrderStatus, string> = {
  paid: "支付",
  shipped: "发货",
  completed: "确认收货",
  refund_requested: "申请退款",
  refunded: "处理退款",
  pending_payment: "待付款",
};

// 依据「当前状态 + 当前角色」返回可执行的目标状态
export function nextActions(status: OrderStatus, role: string): OrderStatus[] {
  if (role === "buyer") {
    if (status === "pending_payment") return ["paid"];
    if (status === "paid") return ["refund_requested"];
    if (status === "shipped") return ["completed"];
  }
  if (role === "merchant") {
    if (status === "paid") return ["shipped"];
    if (status === "refund_requested") return ["refunded"];
  }
  if (role === "admin") {
    if (status === "refund_requested") return ["refunded"];
  }
  return [];
}
