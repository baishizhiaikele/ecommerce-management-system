// T7：api 按域拆分（由 split_api 脚本生成，函数签名与原 index.ts 完全一致）。
import { api } from "./client";
import type { SupportTicketOut, SupportTicketPage, CreateTicketRequest, ReplyRequest } from "./types";

// ---------- 售后工单 ----------










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
