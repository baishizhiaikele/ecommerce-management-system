import { useEffect, useState } from "react";
import type { AxiosError } from "axios";
import { List, Tag, Button, Modal, Input, Drawer, Empty, Spin, message } from "antd";
import {
  listTickets,
  getTicket,
  replyTicket,
  closeTicket,
  createTicket,
  SupportTicketOut,
} from "../api";
import { useAuth } from "../store/auth";
import { useI18n } from "../i18n";

const STATUS: Record<string, { color: string; label: string }> = {
  open: { color: "orange", label: "support.status.open" },
  answered: { color: "blue", label: "support.status.answered" },
  closed: { color: "default", label: "support.status.closed" },
};
const ROLE_LABEL: Record<string, string> = {
  buyer: "support.role.me",
  merchant: "support.role.merchant",
  ai: "support.role.ai",
};

export default function Support() {
  const { t } = useI18n();
  const role = useAuth((s) => s.user?.role);
  const [tickets, setTickets] = useState<SupportTicketOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<SupportTicketOut | null>(null);
  const [reply, setReply] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [newMsg, setNewMsg] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      setTickets(await listTickets());
    } catch {
      /* 忽略 */
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const openTicket = async (id: string) => {
    try {
      setActive(await getTicket(id));
    } catch (e) {
      const err = e as AxiosError<any, any>;
      message.error(err.response?.data?.detail || t("support.openFail"));
    }
  };

  const onReply = async () => {
    if (!active || !reply.trim()) return;
    try {
      const t = await replyTicket(active.id, reply);
      setActive(t);
      setReply("");
      load();
    } catch (e) {
      const err = e as AxiosError<any, any>;
      message.error(err.response?.data?.detail || t("support.replyFail"));
    }
  };

  const onClose = async () => {
    if (!active) return;
    try {
      await closeTicket(active.id);
      message.success(t("support.closedMsg"));
      setActive(null);
      load();
    } catch (e) {
      const err = e as AxiosError<any, any>;
      message.error(err.response?.data?.detail || t("common.operationFailed"));
    }
  };

  const onCreate = async () => {
    if (!newMsg.trim()) return;
    try {
      await createTicket({ message: newMsg, subject: t("support.defaultSubject") });
      message.success(t("support.submitted"));
      setNewOpen(false);
      setNewMsg("");
      load();
    } catch (e) {
      const err = e as AxiosError<any, any>;
      message.error(err.response?.data?.detail || t("support.submitFail"));
    }
  };

  if (role === "admin") {
    return <Empty description={t("support.adminNoNeed")} className="py-20" />;
  }

  const isMerchant = role === "merchant";

  return (
    <div className="space-y-6">
      <div className="section-title">
        <h2>{isMerchant ? t("support.titleMerchant") : t("support.titleMine")}</h2>
        {!isMerchant && (
          <Button className="ml-auto" type="primary" onClick={() => setNewOpen(true)}>
            {t("support.newTicket")}
          </Button>
        )}
      </div>
      {loading ? (
        <div className="text-center py-20">
          <Spin />
        </div>
      ) : tickets.length === 0 ? (
        <Empty description={isMerchant ? t("support.emptyMerchant") : t("support.emptyMine")} className="py-20" />
      ) : (
        <List
          className="card-soft overflow-hidden"
          dataSource={tickets}
          renderItem={(tk) => (
            <List.Item
              className="px-4 cursor-pointer hover:bg-slate-50"
              onClick={() => openTicket(tk.id)}
            >
              <List.Item.Meta
                title={
                  <span className="flex items-center gap-2">
                    {tk.subject || t("support.defaultSubject")}
                    {tk.product_name && <Tag color="cyan">{tk.product_name}</Tag>}
                    <Tag color={STATUS[tk.status].color}>{STATUS[tk.status].label}</Tag>
                  </span>
                }
                description={
                  isMerchant
                    ? `${t("support.from")}${tk.user_name}`
                    : `${t("support.recent")}${tk.messages[tk.messages.length - 1]?.content || ""}`
                }
              />
            </List.Item>
          )}
        />
      )}

      <Drawer
        title={active?.subject || t("support.detail")}
        open={!!active}
        onClose={() => setActive(null)}
        width={480}
        extra={
          active && active.status !== "closed" ? (
            <Button onClick={onClose}>{t("support.closeTicket")}</Button>
          ) : null
        }
      >
        <div className="space-y-3 mb-4">
          {active?.messages.map((m) => (
            <div key={m.id} className={m.sender_role === "merchant" ? "text-right" : "text-left"}>
              <div className="text-xs text-slate-400 mb-1">{t(ROLE_LABEL[m.sender_role])}</div>
              <span
                className={`inline-block px-3 py-2 rounded-2xl ${
                  m.sender_role === "merchant"
                    ? "bg-[#4F46E5] text-white"
                    : m.sender_role === "ai"
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-slate-100 text-slate-700"
                }`}
              >
                {m.content}
              </span>
            </div>
          ))}
        </div>
        {active && active.status !== "closed" && (
          <div className="flex gap-2">
            <Input
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder={isMerchant ? t("support.replyPlaceholder") : t("support.notePlaceholder")}
              onPressEnter={onReply}
            />
            <Button type="primary" onClick={onReply}>
              {t("support.send")}
            </Button>
          </div>
        )}
      </Drawer>

      <Modal title={t("support.newTicket")} open={newOpen} onCancel={() => setNewOpen(false)} onOk={onCreate} okText={t("common.submit")}>
        <Input.TextArea
          rows={4}
          placeholder={t("support.newPlaceholder")}
          value={newMsg}
          onChange={(e) => setNewMsg(e.target.value)}
        />
      </Modal>
    </div>
  );
}
