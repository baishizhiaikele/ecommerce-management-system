import { useState } from "react";
import { Input, Button, Avatar } from "antd";
import { RobotOutlined, SendOutlined } from "@ant-design/icons";
import { chat, ChatResponse, ProductOut } from "../api";
import { useI18n } from "../i18n";

type ProductChatMessage = { role: "user" | "assistant"; content: string };

export default function ProductChat({ product }: { product: ProductOut }) {
  const { t } = useI18n();
  const [messages, setMessages] = useState<ProductChatMessage[]>([
    { role: "assistant", content: t("chat.greeting", { name: product.name }) },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const send = async () => {
    const text = input.trim();
    if (!text) return;
    const next: ProductChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const r: ChatResponse = await chat({ product_id: product.id, message: text });
      setMessages([...next, { role: "assistant", content: r.reply }]);
    } catch {
      setMessages([...next, { role: "assistant", content: t("chat.fail") }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-96">
      <div className="flex items-center gap-2 px-3 py-2 border-b font-medium">
        <Avatar size="small" icon={<RobotOutlined />} style={{ background: "#4F46E5" }} />
        {t("chat.title", { name: product.name })}
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm ${
                m.role === "user" ? "bg-[#4F46E5] text-white" : "bg-slate-100 text-slate-700"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-2 p-2 border-t">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onPressEnter={send}
          placeholder={t("chat.placeholder")}
        />
        <Button type="primary" icon={<SendOutlined />} loading={loading} onClick={send} />
      </div>
    </div>
  );
}
