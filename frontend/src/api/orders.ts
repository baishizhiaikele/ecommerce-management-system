// T7：api 按域拆分（由 split_api 脚本生成，函数签名与原 index.ts 完全一致）。
import { api } from "./client";
import type { OrderOut, LogisticsEvent, InvoiceOut, PresaleOut, PresaleReservationOut, PaymentOut, PaymentStatus } from "./types";

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


// ---------- 电子发票 ----------

export const applyInvoice = (
  orderId: string,
  p: { title_type: string; title: string; tax_no?: string }
) => api.post<InvoiceOut>(`/invoices/orders/${orderId}`, p).then((r) => r.data);
export const getOrderInvoice = (orderId: string) =>
  api.get<InvoiceOut | null>(`/invoices/orders/${orderId}`).then((r) => r.data);
export const myInvoices = () => api.get<InvoiceOut[]>(`/invoices/mine`).then((r) => r.data);


// ---------- 预售定金 ----------


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


// ---------- 支付（沙箱网关）----------

export const createPayment = (orderId: string) =>
  api.post<PaymentOut>(`/payments/orders/${orderId}/pay`).then((r) => r.data);
export const confirmPayment = (orderId: string) =>
  api.post<{ status: string }>(`/payments/orders/${orderId}/confirm`).then((r) => r.data);


export const getPaymentStatus = (orderId: string) =>
  api.get<PaymentStatus>(`/payments/orders/${orderId}/status`).then((r) => r.data);
