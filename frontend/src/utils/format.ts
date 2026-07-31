import { OrderStatus, Sentiment, ProductStatus } from "../api";
import { translate } from "../i18n";

export const money = (v: string | number) => {
  const n = typeof v === "string" ? parseFloat(v) : v;
  return isNaN(n) ? "0.00" : n.toFixed(2);
};

/** 把时间格式化为「年-月-日 时:分:秒」，保证精确到秒（不受浏览器区域设置影响）。
 * 注意：后端返回的多为「不带时区后缀的 UTC 时间字符串」。若直接交给 new Date()，
 * 会被当作本地时间解析，导致非 UTC 时区下显示偏移。因此这里对「无时区后缀」的
 * 字符串补上 Z（视为 UTC），再用本地时区方法展示，保证与服务器实际时间一致。 */
export const formatDateTime = (v?: string | null): string => {
  if (!v) return "-";
  let s = String(v).trim();
  // 仅含日期（YYYY-MM-DD）的不补时区，避免被当成 UTC 零点
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(s);
  if (!isDateOnly && !/[zZ]|[+\-]\d{2}:?\d{2}$/.test(s)) {
    s += "Z";
  }
  const d = new Date(s);
  if (isNaN(d.getTime())) return String(v);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

/** 解析后端时间字符串为 Date，对「无时区后缀」的统一视为 UTC，避免非 UTC 时区偏移。
 * 用于倒计时（new Date(endAt) - Date.now()）等需要精确时间差的场景。 */
export const parseTime = (v?: string | null): Date | null => {
  if (!v) return null;
  let s = String(v).trim();
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(s);
  if (!isDateOnly && !/[zZ]|[+\-]\d{2}:?\d{2}$/.test(s)) {
    s += "Z";
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
};

type Meta = { color: string; label: string };

/** 把带 key 的元数据转成「访问时才翻译」的代理，切换语言时自动刷新。 */
function i18nMeta<T extends string>(raw: Record<T, { color: string; key: string }>): Record<T, Meta> {
  return new Proxy(raw, {
    get(target, prop: string | symbol) {
      const m = (target as Record<string, { color: string; key: string }>)[prop as string];
      if (!m) return undefined;
      return { color: m.color, label: translate(m.key) };
    },
  }) as unknown as Record<T, Meta>;
}

export const orderStatusMeta = i18nMeta({
  pending_payment: { color: "orange", key: "order.status.unpaid" },
  paid: { color: "blue", key: "order.status.paid" },
  shipped: { color: "cyan", key: "order.status.shipped" },
  completed: { color: "green", key: "order.status.completed" },
  cancelled: { color: "default", key: "order.status.cancelled" },
  refund_requested: { color: "volcano", key: "order.status.refunding" },
  refunded: { color: "red", key: "order.status.refunded" },
  refund_rejected: { color: "red", key: "order.status.refund_rejected" },
  return_requested: { color: "volcano", key: "order.status.return_requested" },
  return_shipped: { color: "gold", key: "order.status.return_shipped" },
  return_received: { color: "geekblue", key: "order.status.return_received" },
  exchange: { color: "purple", key: "order.status.exchange" },
  dispute: { color: "magenta", key: "order.status.dispute" },
  closed: { color: "default", key: "order.status.closed" },
});

export const escrowMeta = i18nMeta({
  none: { color: "default", key: "escrow.none" },
  held: { color: "gold", key: "escrow.held" },
  released: { color: "green", key: "escrow.released" },
  reversed: { color: "red", key: "escrow.reversed" },
});

export const productStatusMeta = i18nMeta({
  draft: { color: "default", key: "product.status.draft" },
  pending: { color: "gold", key: "product.status.pending" },
  active: { color: "green", key: "product.status.active" },
  rejected: { color: "red", key: "product.status.rejected" },
});

export const sentimentMeta = i18nMeta({
  positive: { color: "green", key: "sentiment.positive" },
  neutral: { color: "default", key: "sentiment.neutral" },
  negative: { color: "red", key: "sentiment.negative" },
});

// 值为 i18n key，调用方需用 translate() 包裹。
export const actionLabel: Record<OrderStatus, string> = {
  pending_payment: "order.status.unpaid",
  paid: "order.next.pay",
  shipped: "order.action.ship",
  completed: "order.action.confirm",
  refund_requested: "order.action.refund",
  refunded: "order.action.process",
  refund_rejected: "order.next.refund",
  return_requested: "order.action.return",
  return_shipped: "order.action.return_ship",
  return_received: "order.action.return_receive",
  exchange: "order.action.exchange",
  dispute: "order.action.dispute",
};

// 依据「当前状态 + 当前角色」返回可执行的目标状态
export function nextActions(status: OrderStatus, role: string): OrderStatus[] {
  if (role === "buyer") {
    if (status === "pending_payment") return ["paid"];
    if (status === "paid") return ["refund_requested"];
    if (status === "shipped") return ["completed"];
    if (status === "refund_rejected") return ["refund_requested", "completed"];
  }
  if (role === "merchant") {
    if (status === "paid") return ["shipped"];
    if (status === "refund_requested") return ["refunded"];
    if (status === "return_shipped") return ["return_received"];
  }
  if (role === "admin") {
    if (status === "refund_requested") return ["refunded"];
  }
  return [];
}
