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

const STATUS: Record<string, { color: string; label: string }> = {
  open: { color: "orange", label: "待处理" },
  answered: { color: "blue", label: "已回复" },
  closed: { color: "default", label: "已关闭" },
};
const ROLE_LABEL: Record<string, string> = { buyer: "我", merchant: "商家", ai: "AI" };

export default function Support() {
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
      message.error(err.response?.data?.detail || "打开失败");
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
      message.error(err.response?.data?.detail || "回复失败");
    }
  };

  const onClose = async () => {
    if (!active) return;
    try {
      await closeTicket(active.id);
      message.success("工单已关闭");
      setActive(null);
      load();
    } catch (e) {
      const err = e as AxiosError<any, any>;
      message.error(err.response?.data?.detail || "操作失败");
    }
  };

  const onCreate = async () => {
    if (!newMsg.trim()) return;
    try {
      await createTicket({ message: newMsg, subject: "客服咨询" });
      message.success("工单已提交");
      setNewOpen(false);
      setNewMsg("");
      load();
    } catch (e) {
      const err = e as AxiosError<any, any>;
      message.error(err.response?.data?.detail || "提交失败");
    }
  };

  if (role === "admin") {
    return <Empty description="管理员无需客服工单" className="py-20" />;
  }

  const isMerchant = role === "merchant";

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold m-0">{isMerchant ? "客服工单（商家）" : "我的客服工单"}</h2>
        {!isMerchant && (
          <Button type="primary" onClick={() => setNewOpen(true)}>
            新建工单
          </Button>
        )}
      </div>
      {loading ? (
        <div className="text-center py-20">
          <Spin />
        </div>
      ) : tickets.length === 0 ? (
        <Empty description={isMerchant ? "暂无工单" : "还没有提交过工单"} className="py-20" />
      ) : (
        <List
          className="border border-slate-100 rounded-2xl overflow-hidden"
          dataSource={tickets}
          renderItem={(t) => (
            <List.Item
              className="px-4 cursor-pointer hover:bg-slate-50"
              onClick={() => openTicket(t.id)}
            >
              <List.Item.Meta
                title={
                  <span className="flex items-center gap-2">
                    {t.subject || "咨询工单"}
                    {t.product_name && <Tag color="cyan">{t.product_name}</Tag>}
                    <Tag color={STATUS[t.status].color}>{STATUS[t.status].label}</Tag>
                  </span>
                }
                description={
                  isMerchant ? `来自：${t.user_name}` : `最近：${t.messages[t.messages.length - 1]?.content || ""}`
                }
              />
            </List.Item>
          )}
        />
      )}

      <Drawer
        title={active?.subject || "工单详情"}
        open={!!active}
        onClose={() => setActive(null)}
        width={480}
        extra={
          active && active.status !== "closed" ? (
            <Button onClick={onClose}>关闭工单</Button>
          ) : null
        }
      >
        <div className="space-y-3 mb-4">
          {active?.messages.map((m) => (
            <div key={m.id} className={m.sender_role === "merchant" ? "text-right" : "text-left"}>
              <div className="text-xs text-slate-400 mb-1">{ROLE_LABEL[m.sender_role]}</div>
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
              placeholder={isMerchant ? "输入回复…" : "补充说明…"}
              onPressEnter={onReply}
            />
            <Button type="primary" onClick={onReply}>
              发送
            </Button>
          </div>
        )}
      </Drawer>

      <Modal title="新建工单" open={newOpen} onCancel={() => setNewOpen(false)} onOk={onCreate} okText="提交">
        <Input.TextArea
          rows={4}
          placeholder="请描述您的问题，商家会尽快回复"
          value={newMsg}
          onChange={(e) => setNewMsg(e.target.value)}
        />
      </Modal>
    </div>
  );
}
