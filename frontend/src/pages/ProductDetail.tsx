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
import { useCart } from "../store/cart";
import { getProduct, listProductReviews, addCartItem, chat, ProductOut, ReviewOut } from "../api";
import { money, sentimentMeta } from "../utils/format";

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const add = useCart((s) => s.add);
  const [p, setP] = useState<ProductOut | null>(null);
  const [reviews, setReviews] = useState<ReviewOut[]>([]);
  const [qty, setQty] = useState(1);
  const [loading, setLoading] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);
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
    } catch {
      /* 忽略 */
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, [id]);

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
    } catch (e: any) {
      message.error(e.response?.data?.detail || "对话失败");
    } finally {
      setSending(false);
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
        <div className="h-72 rounded-2xl bg-gradient-to-br from-indigo-100 to-cyan-100 flex items-center justify-center text-6xl">
          🛍️
        </div>
        <div>
          <h1 className="text-2xl font-bold">{p.name}</h1>
          <div className="text-3xl font-bold text-[#4F46E5] my-3">¥{money(p.price)}</div>
          <Tag color={p.stock > 0 ? "green" : "red"}>
            {p.stock > 0 ? `库存 ${p.stock}` : "缺货"}
          </Tag>
          {p.ai_title && <div className="mt-3 text-slate-600">AI 标题：{p.ai_title}</div>}
          {p.ai_copy && <div className="mt-1 text-slate-600">AI 文案：{p.ai_copy}</div>}
          {p.ai_price_suggestion != null && (
            <div className="mt-1 text-slate-600">AI 建议价：¥{money(p.ai_price_suggestion)}</div>
          )}
          <div className="mt-4 flex items-center gap-3">
            <InputNumber min={1} max={p.stock || 1} value={qty} onChange={(v) => setQty(v || 1)} />
            <Button type="primary" disabled={p.stock <= 0} onClick={onAdd}>
              加入购物车
            </Button>
            <Button onClick={() => setChatOpen(true)}>咨询 AI 客服</Button>
          </div>
        </div>
      </div>

      {p.description && <Divider />}
      {p.description && <div className="text-slate-600 whitespace-pre-wrap">{p.description}</div>}

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
                    ? "bg-[#4F46E5] text-white"
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
      </Modal>
    </div>
  );
}
