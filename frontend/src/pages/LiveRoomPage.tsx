import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Badge, Button, Card, Drawer, Empty, Input, Tag, message } from "antd";
import { Radio as RadioIcon, Send, ShoppingCart, Users } from "lucide-react";
import {
  addCartItem,
  createAffiliateLink,
  enterLiveRoom,
  getLiveRoom,
  listLiveMessages,
  liveWsUrl,
  sendLiveMessage,
  type LiveRoomOut,
  trackAffiliateClick,
  type LiveMessageOut,
  type LiveRoomDetail,
} from "../api";
import { useI18n } from "../i18n";
import ProductPrice from "../components/ProductPrice";
import { reportError, swallow } from "../utils/reportError";
import ProductImage from "../components/ProductImage";
import { useAuth } from "../store/auth";

export default function LiveRoomPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [room, setRoom] = useState<LiveRoomDetail | null>(null);
  const [msgs, setMsgs] = useState<LiveMessageOut[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const lastIdRef = useRef<string | undefined>(undefined);
  const wsRef = useRef<WebSocket | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) return;
    getLiveRoom(id).then(setRoom).catch((e) => reportError(e, { tag: "LiveRoom.load" }));
    if (user) enterLiveRoom(id).catch((e) => swallow(e, "LiveRoom.enter"));
  }, [id, user]);

  // 弹幕：优先 WebSocket 实时推送，连接失败/断开时降级为 3 秒轮询
  useEffect(() => {
    if (!id) return;
    let stop = false;
    let timer: number | undefined;
    const isWsOpen = () => wsRef.current?.readyState === WebSocket.OPEN;

    const fallbackPoll = async () => {
      if (isWsOpen()) return;
      try {
        const inc = await listLiveMessages(id, lastIdRef.current);
        if (!stop && inc.length) {
          setMsgs((prev) => [...prev, ...inc].slice(-200));
          lastIdRef.current = inc[inc.length - 1].id;
        }
      } catch {
        /* ignore */
      }
    };

    const startWs = () => {
      try {
        const ws = new WebSocket(liveWsUrl(id));
        wsRef.current = ws;
        ws.onmessage = (ev) => {
          try {
            const data = JSON.parse(ev.data);
            if (data.type === "error") return;
            const m = data as LiveMessageOut;
            if (m?.id && m?.content) {
              setMsgs((prev) => {
                if (prev.some((x) => x.id === m.id)) return prev;
                lastIdRef.current = m.id;
                return [...prev, m].slice(-200);
              });
            }
          } catch {
            /* ignore */
          }
        };
        ws.onclose = () => {
          wsRef.current = null;
          if (!stop) timer = window.setInterval(fallbackPoll, 3000);
        };
        ws.onerror = () => {
          ws.close();
        };
      } catch {
        timer = window.setInterval(fallbackPoll, 3000);
      }
    };

    startWs();
    fallbackPoll();
    return () => {
      stop = true;
      if (timer) clearInterval(timer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [id]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs]);

  const send = async () => {
    const content = text.trim();
    if (!content || !id) return;
    setSending(true);
    try {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ content }));
      } else {
        const m = await sendLiveMessage(id, content);
        setMsgs((prev) => [...prev, m].slice(-200));
        lastIdRef.current = m.id;
      }
      setText("");
    } catch (e: any) {
      message.error(e?.response?.data?.detail || t("common.operationFailed"));
    } finally {
      setSending(false);
    }
  };

  // P1-4 直播下单闭环：加购并归因到当前直播间（结算时带回 live_room_id）
  const addToCart = async (productId: string) => {
    try {
      await addCartItem({ product_id: productId, quantity: 1 });
      if (id) localStorage.setItem("live_room_id", id);
      message.success(t("live.addedToCart"));
    } catch (e: any) {
      message.error(e?.response?.data?.detail || t("common.operationFailed"));
    }
  };

  // P2 直播分销：观众把直播间商品生成自己的推广链接，分享后下单归因到本人佣金
  const shareEarn = async (productId: string) => {
    try {
      const link = await createAffiliateLink(productId);
      if (link.code) await trackAffiliateClick(link.code); // 自身点击先埋点，便于后续下单归因
      const shareUrl = `${window.location.origin}/products/${productId}?ref=${link.code}${id ? `&live=${id}` : ""}`;
      try {
        await navigator.clipboard?.writeText(shareUrl);
        message.success(t("live.shareCopied"));
      } catch {
        message.success(t("live.shareReady"));
      }
    } catch (e: any) {
      message.error(e?.response?.data?.detail || t("common.operationFailed"));
    }
  };

  if (!room) return null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* 直播画面区 */}
        <div className="lg:col-span-2">
          <div className="relative aspect-video rounded-2xl overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-rose-950">
            {room.cover_url && (
              <ProductImage src={room.cover_url} alt={room.title} />
            )}
            <div className="absolute inset-0 flex items-center justify-center">
              {room.status === "live" ? (
                <div className="text-center text-white/80">
                  <RadioIcon size={48} className="mx-auto animate-pulse text-rose-400" />
                  <div className="mt-2 text-sm">{t("live.streamingHint")}</div>
                </div>
              ) : (
                <div className="text-white/70 text-lg font-semibold">
                  {room.status === "ended" ? t("live.endedHint") : t("live.notStarted")}
                </div>
              )}
            </div>
            <div className="absolute top-3 left-3 flex items-center gap-2">
              {room.status === "live" && (
                <Tag color="red" className="!m-0 animate-pulse">● {t("live.living")}</Tag>
              )}
              <span className="text-white/90 text-xs bg-black/40 rounded-full px-2 py-0.5 flex items-center gap-1">
                <Users size={12} /> {room.viewers}
              </span>
            </div>
          </div>
          <div className="mt-3">
            <h1 className="text-lg font-bold">{room.title}</h1>
            <div className="text-sm text-slate-400">{room.merchant_name}</div>
          </div>
        </div>

        {/* 弹幕区 */}
        <Card className="soft-card flex flex-col" styles={{ body: { display: "flex", flexDirection: "column", height: 420, padding: 12 } }}>
          <div className="font-semibold mb-2">{t("live.chat")}</div>
          <div ref={listRef} className="flex-1 overflow-y-auto space-y-1.5 pr-1">
            {msgs.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("live.noChat")} />
            ) : (
              msgs.map((m) => (
                <div key={m.id} className="text-sm leading-snug">
                  <span className="text-sky-600 font-medium">{m.username}：</span>
                  <span className="text-slate-700">{m.content}</span>
                </div>
              ))
            )}
          </div>
          <div className="mt-2 flex gap-2">
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onPressEnter={send}
              maxLength={200}
              placeholder={room.status === "live" ? t("live.chatPh") : t("live.chatDisabled")}
              disabled={room.status !== "live"}
            />
            <Button
              type="primary"
              icon={<Send size={14} />}
              onClick={send}
              loading={sending}
              disabled={room.status !== "live"}
            />
          </div>
        </Card>
      </div>

      {/* 讲解商品 / 小黄车 */}
      <Card
        className="soft-card"
        title={
          <div className="flex items-center justify-between">
            <span>{t("live.products")}</span>
            <Button
              size="small"
              type="primary"
              icon={<ShoppingCart size={14} />}
              onClick={() => setCartOpen(true)}
            >
              {t("live.cartDrawer")}（{room.products.length}）
            </Button>
          </div>
        }
      >
        {room.products.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("live.noProducts")} />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {room.products.map((p, i) => (
              <div
                key={p.id}
                className="rounded-xl border border-slate-100 overflow-hidden hover:shadow-md transition-shadow"
              >
                <div className="aspect-square bg-slate-100 relative">
                  <ProductImage src={p.image_url} alt={p.name} />
                  <span className="absolute top-1 left-1 bg-rose-500 text-white text-[10px] rounded px-1">
                    {i + 1}
                  </span>
                  {p.explaining && (
                    <Tag color="red" className="!absolute top-1 right-1 !m-0 !text-[10px]">
                      {t("live.explaining")}
                    </Tag>
                  )}
                  {p.live_price != null && p.live_price < p.price && (
                    <span className="absolute bottom-1 left-1 bg-amber-500 text-white text-[10px] rounded px-1">
                      {t("live.livePrice")}
                    </span>
                  )}
                </div>
                <div className="p-2">
                  <div className="text-xs truncate">{p.name}</div>
                  <div className="flex items-center justify-between mt-1">
                    {p.live_price != null && p.live_price < p.price ? (
                      <span className="text-rose-600 font-bold text-sm">
                        ¥{p.live_price}
                        <span className="text-slate-300 line-through text-[10px] ml-1">¥{p.price}</span>
                      </span>
                    ) : (
                      <ProductPrice p={p} className="text-rose-600 font-bold text-sm" />
                    )}
                    <Button
                      size="small"
                      type="primary"
                      icon={<ShoppingCart size={12} />}
                      onClick={() => addToCart(p.id)}
                    >
                      {t("live.add")}
                    </Button>
                  </div>
                </div>
                <div className="px-2 pb-2">
                  <Button
                    size="small"
                    block
                    onClick={() => shareEarn(p.id)}
                  >
                    {t("live.shareEarn")}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* 小黄车抽屉（移动端友好，点击商品加购） */}
      <Drawer
        title={t("live.cartDrawer")}
        placement="right"
        width={340}
        open={cartOpen}
        onClose={() => setCartOpen(false)}
      >
        {room.products.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("live.noProducts")} />
        ) : (
          <div className="space-y-3">
            {room.products.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-lg border border-slate-100 p-2">
                <div className="relative h-14 w-14 shrink-0">
                  <ProductImage src={p.image_url} alt={p.name} className="h-14 w-14 rounded object-cover" />
                  {p.explaining && (
                    <Tag color="red" className="!absolute -top-1 -left-1 !m-0 !text-[9px]">
                      {t("live.explaining")}
                    </Tag>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-slate-700">{p.name}</div>
                  <div className="text-xs text-rose-600 font-bold">
                    {p.live_price != null && p.live_price < p.price
                      ? `¥${p.live_price}`
                      : `¥${p.price}`}
                  </div>
                </div>
                <Button size="small" type="primary" onClick={() => addToCart(p.id)}>
                  {t("live.add")}
                </Button>
                <Button size="small" onClick={() => shareEarn(p.id)}>
                  {t("live.shareEarn")}
                </Button>
              </div>
            ))}
          </div>
        )}
      </Drawer>
    </div>
  );
}
