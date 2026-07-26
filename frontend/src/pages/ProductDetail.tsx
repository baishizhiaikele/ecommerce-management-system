import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Card,
  Button,
  InputNumber,
  Spin,
  Tag,
  Divider,
  List,
  Rate,
  Modal,
  Input,
  message,
} from "antd";
import { HeartOutlined, HeartFilled } from "@ant-design/icons";
import { useCart } from "../store/cart";
import {
  getProduct,
  listProductReviews,
  addCartItem,
  chat,
  createTicket,
  isFavorited,
  addFavorite,
  removeFavorite,
  ProductOut,
  ReviewOut,
} from "../api";
import { money, sentimentMeta } from "../utils/format";

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const add = useCart((s) => s.add);
  const [p, setP] = useState<ProductOut | null>(null);
  const [reviews, setReviews] = useState<ReviewOut[]>([]);
  const [qty, setQty] = useState(1);
  const [loading, setLoading] = useState(true);
  const [faved, setFaved] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [needsHuman, setNeedsHuman] = useState(false);
  const [ticketOpen, setTicketOpen] = useState(false);
  const [ticketMsg, setTicketMsg] = useState("");
  const [msgs, setMsgs] = useState<{ role: string; content: string }[]>([]);
  const [convId, setConvId] = useState<string>();
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [prod, rev] = await Promise.all([getProduct(id), listProductReviews(id)]);
      setP(prod);
      setReviews(rev);
      if (prod) setFaved(await isFavorited(prod.id).then((d) => d.favorited));
    } catch {
      /* 忽略 */
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, [id]);

  const toggleFav = async () => {
    if (!p) return;
    try {
      if (faved) {
        await removeFavorite(p.id);
        setFaved(false);
        message.success("已取消收藏");
      } else {
        await addFavorite(p.id);
        setFaved(true);
        message.success("已加入收藏");
      }
    } catch (e: any) {
      message.error(e.response?.data?.detail || "操作失败");
    }
  };

  const onAdd = async () => {
    if (!p) return;
    try {
      await addCartItem({ product_id: p.id, quantity: qty });
      add({
        product_id: p.id,
        name: p.name,
        price: Number(p.price),
        quantity: qty,
        image_url: p.image_url || undefined,
      });
      message.success("已加入购物车");
    } catch (e: any) {
      message.error(e.response?.data?.detail || "加入失败");
    }
  };

  const sendMsg = async () => {
    if (!input.trim() || !p) return;
    setMsgs((m) => [...m, { role: "user", content: input }]);
    setInput("");
    setSending(true);
    try {
      const r = await chat({ product_id: p.id, message: input, conversation_id: convId });
      setConvId(r.conversation_id);
      setMsgs((m) => [...m, { role: "ai", content: r.reply }]);
      setNeedsHuman(!!r.needs_human);
    } catch (e: any) {
      message.error(e.response?.data?.detail || "对话失败");
    } finally {
      setSending(false);
    }
  };

  const submitTicket = async () => {
    if (!ticketMsg.trim() || !p) return;
    try {
      await createTicket({ product_id: p.id, message: ticketMsg, subject: `咨询：${p.name}` });
      message.success("工单已提交，商家会尽快回复");
      setTicketOpen(false);
      setTicketMsg("");
      setNeedsHuman(false);
    } catch (e: any) {
      message.error(e.response?.data?.detail || "提交失败");
    }
  };

  if (loading) return <div className="text-center py-20"><Spin /></div>;
  if (!p) return <div className="text-center py-20">商品不存在</div>;

  return (
    <div>
      <Button type="link" onClick={() => navigate(-1)}>
        ← 返回
      </Button>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-2">
        <div className="h-72 rounded-2xl bg-gradient-to-br from-[#EEF0FF] to-[#E6FBFF] shadow-sm flex items-center justify-center text-6xl transition-transform duration-300 hover:scale-[1.03]">
          🛍️
        </div>
        <div className="fade-up">
          <h1 className="text-2xl font-bold tracking-tight">{p.name}</h1>
          <div className="flex items-end gap-3 my-3">
            <div className="text-[#6366F1] font-bold leading-none">
              <span className="text-xl align-top mr-0.5">¥</span>
              <span className="text-4xl">{money(p.price)}</span>
            </div>
            <Tag color={p.stock > 0 ? "green" : "red"} className="mb-1">
              {p.stock > 0 ? `库存 ${p.stock}` : "缺货"}
            </Tag>
          </div>
          {(p.ai_title || p.ai_copy || p.ai_price_suggestion != null) && (
            <div className="bg-[#F7F8FC] rounded-xl p-3 space-y-1 text-sm">
              {p.ai_title && <div className="text-slate-600">AI 标题：{p.ai_title}</div>}
              {p.ai_copy && <div className="text-slate-600">AI 文案：{p.ai_copy}</div>}
              {p.ai_price_suggestion != null && (
                <div className="text-slate-600">AI 建议价：¥{money(p.ai_price_suggestion)}</div>
              )}
            </div>
          )}
          <div className="mt-5 flex items-center gap-3 flex-wrap">
            <InputNumber min={1} max={p.stock || 1} value={qty} onChange={(v) => setQty(v || 1)} />
            <Button type="primary" disabled={p.stock <= 0} onClick={onAdd}>
              加入购物车
            </Button>
            <Button
              icon={faved ? <HeartFilled style={{ color: "#EF4444" }} /> : <HeartOutlined />}
              onClick={toggleFav}
            >
              {faved ? "已收藏" : "收藏"}
            </Button>
            <Button onClick={() => setChatOpen(true)}>咨询 AI 客服</Button>
          </div>
        </div>
      </div>

      {p.description && <Divider />}
      {p.description && <div className="bg-[#F7F8FC] rounded-xl p-4 text-slate-600 whitespace-pre-wrap">{p.description}</div>}

      <Divider orientation="left">用户评价</Divider>
      <List
        dataSource={reviews}
        locale={{ emptyText: "暂无评价" }}
        renderItem={(r) => (
          <List.Item>
            <div>
              <Rate disabled value={r.rating} />
              <Tag color={sentimentMeta[r.sentiment].color} className="ml-2">
                {sentimentMeta[r.sentiment].label}
              </Tag>
              <div className="text-slate-600 mt-1">{r.content}</div>
            </div>
          </List.Item>
        )}
      />

      <Modal title="AI 智能客服" open={chatOpen} onCancel={() => setChatOpen(false)} footer={null}>
        <div className="h-80 overflow-auto mb-3 space-y-2">
          {msgs.length === 0 && (
            <div className="text-slate-400 text-center mt-10">向 AI 客服提问吧～</div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
              <span
                className={`inline-block px-3 py-2 rounded-2xl ${
                  m.role === "user"
                    ? "bg-[#6366F1] text-white"
                    : "bg-slate-100 text-slate-700"
                }`}
              >
                {m.content}
              </span>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPressEnter={sendMsg}
            placeholder="输入你的问题…"
            disabled={sending}
          />
          <Button type="primary" loading={sending} onClick={sendMsg}>
            发送
          </Button>
        </div>
        {needsHuman && (
          <div className="mt-3 flex items-center justify-between rounded-xl bg-amber-50 px-3 py-2">
            <span className="text-amber-700 text-sm">该问题建议转人工客服处理</span>
            <Button size="small" type="primary" onClick={() => setTicketOpen(true)}>
              提交工单
            </Button>
          </div>
        )}
      </Modal>

      <Modal
        title="提交人工客服工单"
        open={ticketOpen}
        onCancel={() => setTicketOpen(false)}
        onOk={submitTicket}
        okText="提交"
      >
        <Input.TextArea
          rows={4}
          placeholder="请描述您的问题，商家会尽快回复"
          value={ticketMsg}
          onChange={(e) => setTicketMsg(e.target.value)}
        />
      </Modal>
    </div>
  );
}
