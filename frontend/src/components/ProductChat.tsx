import { useEffect, useRef, useState } from "react";
import { Drawer, Input, Button, Avatar, Spin, message } from "antd";
import { RobotOutlined, UserOutlined, SendOutlined } from "@ant-design/icons";
import { chat } from "../api";

interface Props {
  productId: string;
  productName: string;
  onClose: () => void;
}

interface Msg {
  role: "user" | "ai";
  content: string;
}

export default function ProductChat({ productId, productName, onClose }: Props) {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "ai",
      content: `你好，我是「${productName}」的智能导购，有什么可以帮你的？`,
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }]);
    setLoading(true);
    try {
      const res = await chat({ product_id: productId, message: text });
      setMessages((m) => [...m, { role: "ai", content: res.reply }]);
    } catch (e: any) {
      message.error(e?.response?.data?.detail || "咨询失败，请稍后再试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Drawer
      title={`智能客服 · ${productName}`}
      placement="right"
      width={420}
      open
      onClose={onClose}
    >
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-auto space-y-3 pr-1">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`flex gap-2 ${m.role === "user" ? "flex-row-reverse" : ""}`}
            >
              <Avatar
                icon={m.role === "ai" ? <RobotOutlined /> : <UserOutlined />}
                style={{
                  background: m.role === "ai" ? "#4F46E5" : "#94a3b8",
                }}
              />
              <div
                className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
                  m.role === "ai"
                    ? "bg-slate-100 text-slate-700"
                    : "bg-[#4F46E5] text-white"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}
          {loading && <Spin />}
          <div ref={endRef} />
        </div>
        <div className="flex gap-2 pt-3 border-t">
          <Input
            placeholder="输入问题…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPressEnter={send}
            disabled={loading}
          />
          <Button type="primary" icon={<SendOutlined />} onClick={send} loading={loading} />
        </div>
      </div>
    </Drawer>
  );
}
