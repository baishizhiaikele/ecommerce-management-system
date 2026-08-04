import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import {
  Row,
  Col,
  Button,
  InputNumber,
  Tag,
  Divider,
  message,
  Spin,
  Rate,
  Tabs,
  Empty,
  Tooltip,
  Drawer,
  Modal,
  Result,
} from "antd";
import {
  ShoppingCartOutlined,
  HeartOutlined,
  HeartFilled,
  RobotOutlined,
  CameraOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { Heart } from "lucide-react";
import { getProduct, listProductReviews, listVariants, logView, proxyImg, listProducts, addFavorite, removeFavorite, isFavorited, getPriceHistory, getNotesForProduct, trackAffiliateClick, getSimilarProducts, listCoupons, getErrorMessage, type ProductOut, type ReviewOut, type VariantOut, type PriceHistoryOut, type NoteOut } from "../api";
import { reportError, swallow } from "../utils/reportError";
import { money, productStatusMeta } from "../utils/format";
import { useFlashPrice } from "../context/FlashPriceContext";
import { useAuth } from "../store/auth";
import { useCart } from "../store/cart";
import { useI18n } from "../i18n";
import ProductImage from "../components/ProductImage";
import EmptyState from "../components/EmptyState";
import ProductReviews from "../components/ProductReviews";
import ProductChat from "../components/ProductChat";
import ProductQA from "../components/ProductQA";
import ProductCard from "../components/ProductCard";
import Reveal from "../components/Reveal";
import LoginPrompt from "../components/LoginPrompt";
import ARTryOn from "../components/ARTryOn";
import { CheckCircle2, RotateCcw, ShieldCheck, Zap, PackageCheck, Bell, type LucideIcon } from "lucide-react";

// 详情页服务承诺条（对标淘宝/京东信任背书）
const SERVICES: { key: string; Icon: LucideIcon }[] = [
  { key: "pd.svcAuth", Icon: CheckCircle2 },
  { key: "pd.svcReturn", Icon: RotateCcw },
  { key: "pd.svcShip", Icon: Zap },
  { key: "pd.svcFreight", Icon: ShieldCheck },
  { key: "pd.svcBad", Icon: PackageCheck },
];

// L3：本地浏览历史的条目结构（与写入时一致），消除 any[]。
interface BrowseHistoryItem {
  id: string;
  name: string;
  price: number;
  image_url?: string;
  stock?: number;
}

export default function ProductDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuth((s) => s.user);
  const { t } = useI18n();
  const [p, setP] = useState<ProductOut | null>(null);
  const [reviews, setReviews] = useState<ReviewOut[]>([]);
  const [variants, setVariants] = useState<VariantOut[]>([]);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [qty, setQty] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [arOpen, setArOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const arStreamRef = useRef<MediaStream | null>(null);
  // 游客加购时的非阻断式登录引导；reason 区分加购与结算文案
  const [loginPrompt, setLoginPrompt] = useState<{ open: boolean; reason: "cart" | "checkout" }>({
    open: false,
    reason: "cart",
  });

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      arStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch((e) => swallow(e, "ProductDetail.videoPlay"));
      }
    } catch {
      message.warning(t("pd.arNoCamera"));
    }
  };
  const stopCamera = () => {
    arStreamRef.current?.getTracks().forEach((tr) => tr.stop());
    arStreamRef.current = null;
  };

  const load = async () => {
    setLoading(true);
    try {
      const [prod, rv, vs] = await Promise.all([
        getProduct(id),
        listProductReviews(id),
        listVariants(id).catch(() => [] as VariantOut[]),
      ]);
      setP(prod);
      setReviews(rv);
      setVariants(vs);
    } catch {
      setLoadError(true);
      message.error(t("common.loadFailed"));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, [id]);

  // 记录浏览历史（本地兜底 + 登录用户同步后端）
  useEffect(() => {
    if (!p?.id) return;
    try {
      const raw = localStorage.getItem("browse_history") || "[]";
      const arr = JSON.parse(raw) as BrowseHistoryItem[];
      const next = [
        { id: p.id, name: p.name, price: Number(p.price), image_url: p.image_url, stock: p.stock },
        ...arr.filter((x) => x.id !== p.id),
      ].slice(0, 20);
      localStorage.setItem("browse_history", JSON.stringify(next));
    } catch {
      /* 忽略 */
    }
    const u = useAuth.getState().user;
    if (u) {
      logView({
        product_id: p.id,
        product_name: p.name,
        price: p.price != null ? Number(p.price) : null,
        image_url: p.image_url,
      }).catch((e) => reportError(e, { tag: "ProductDetail.logView" }));
    }
  }, [p]);

  // 由变体推导规格分组
  const specGroups = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const v of variants) {
      for (const [k, val] of Object.entries(v.specs || {})) {
        if (!map.has(k)) map.set(k, []);
        if (!map.get(k)!.includes(val)) map.get(k)!.push(val);
      }
    }
    return Array.from(map.entries()).map(([key, values]) => ({ key, values }));
  }, [variants]);

  // 默认选中第一个变体的规格组合
  useEffect(() => {
    if (variants.length && Object.keys(selected).length === 0) {
      setSelected({ ...(variants[0].specs || {}) });
    }
  }, [variants, selected]);

  // 匹配当前选中的变体
  const matchedVariant = useMemo(() => {
    if (!variants.length) return null;
    return (
      variants.find((v) =>
        Object.entries(selected).every(([k, val]) => (v.specs || {})[k] === val)
      ) || null
    );
  }, [variants, selected]);

  const flash = useFlashPrice(p);
  const displayPrice = useMemo(() => {
    if (flash.isFlash) return flash.price;
    const base = Number(p?.price || 0);
    return base + (matchedVariant ? Number(matchedVariant.price_delta || 0) : 0);
  }, [p, matchedVariant, flash]);

  const stock = matchedVariant ? matchedVariant.stock : p?.stock ?? 0;

  // —— 体验增强：图廊 / 收藏 / 同类推荐 ——
  const [activeImg, setActiveImg] = useState(0);
  const [faved, setFaved] = useState(false);
  const [related, setRelated] = useState<ProductOut[]>([]);
  const [coPurchase, setCoPurchase] = useState<ProductOut[]>([]); // T11 搭配购买
  const [alsoViewed, setAlsoViewed] = useState<ProductOut[]>([]); // T11 看了又看
  const [seedingNotes, setSeedingNotes] = useState<NoteOut[]>([]); // P3-G 种草社交背书
  const [landedPrice, setLandedPrice] = useState<number | null>(null); // T9 到手价预估

  interface GalleryItem { url: string; type: "image" | "video" }
  const isVideoUrl = (url: string) => /\.(mp4|webm|ogg)(\?|$)/i.test(url);
  const gallery = useMemo(() => {
    const items: GalleryItem[] = [];
    // 视频优先展示
    if ((p as any).video_url) {
      items.push({ url: (p as any).video_url, type: "video" });
    }
    // 主图
    if (p?.image_url) items.push({ url: p.image_url, type: "image" });
    // 附加图
    try {
      const arr = JSON.parse(p?.images || "[]");
      if (Array.isArray(arr)) {
        for (const x of arr) {
          if (typeof x === "string") {
            items.push({ url: x, type: isVideoUrl(x) ? "video" : "image" });
          }
        }
      }
    } catch { /* ignore */ }
    return items;
  }, [p?.image_url, p?.images, (p as any).video_url]);

  useEffect(() => {
    setActiveImg(0);
  }, [p?.id]);

  useEffect(() => {
    let alive = true;
    if (p && user) {
      isFavorited(p.id)
        .then((r) => alive && setFaved(r.favorited))
        .catch((e) => reportError(e, { tag: "ProductDetail.favStatus" }));
    } else {
      setFaved(false);
    }
    return () => {
      alive = false;
    };
  }, [p?.id, user]);

  // P1-3 历史价格曲线
  const [priceHistory, setPriceHistory] = useState<PriceHistoryOut | null>(null);
  useEffect(() => {
    if (!p?.id) return;
    let alive = true;
    getPriceHistory(p.id)
      .then((r) => alive && setPriceHistory(r))
      .catch((e) => reportError(e, { tag: "ProductDetail.priceHistory" }));
    return () => {
      alive = false;
    };
  }, [p?.id]);

  useEffect(() => {
    if (!p?.category_id) return;
    listProducts({ category_id: p.category_id, page_size: 12 })
      .then((r) => setRelated(r.filter((x) => x.id !== p.id).slice(0, 10)))
      .catch((e) => reportError(e, { tag: "ProductDetail.related" }));
    // P3-G 种草社交背书：该商品被哪些已审核笔记种草
    getNotesForProduct(p.id, 12)
      .then(setSeedingNotes)
      .catch((e) => reportError(e, { tag: "ProductDetail.notes" }));
    // T11 关联推荐（item-item 协同过滤）：搭配购买 + 看了又看
    getSimilarProducts(p.id, "co_purchase", 10)
      .then(setCoPurchase)
      .catch((e: unknown) => reportError(e, { tag: "ProductDetail.coPurchase" }));
    getSimilarProducts(p.id, "also_viewed", 10)
      .then(setAlsoViewed)
      .catch((e: unknown) => reportError(e, { tag: "ProductDetail.alsoViewed" }));
    // T9 到手价预估：取可作用于本商品的平台券/商家券，估算最优券后到手价
    const base = displayPrice;
    listCoupons()
      .then((cs) => {
        const usable = cs.filter(
          (c) => c.is_active && (c.merchant_id == null || (p?.merchant_id && c.merchant_id === p.merchant_id)),
        );
        let best = 0;
        for (const c of usable) {
          const threshold = Number(c.threshold) || 0;
          const value = Number(c.value) || 0;
          if (base < threshold) continue;
          const off = c.type === "discount" ? base * (1 - value) : value;
          best = Math.max(best, off);
        }
        setLandedPrice(best > 0 ? Number((base - best).toFixed(2)) : null);
      })
      .catch((e: unknown) => reportError(e, { tag: "ProductDetail.coupons" }));
  }, [p?.category_id, p?.id, p?.merchant_id, displayPrice]);

  const toggleFav = async () => {
    if (!user) {
      message.info(t("common.loginFirst"));
      navigate("/login", { state: { from: location.pathname } });
      return;
    }
    if (!p) return;
    try {
      if (faved) {
        await removeFavorite(p.id);
        setFaved(false);
        message.success(t("pd.favRemoved"));
      } else {
        await addFavorite(p.id);
        setFaved(true);
        message.success(t("pd.favAdded"));
      }
    } catch {
      message.error(t("common.submitFail"));
    }
  };

  // T21b 降价提醒：收藏商品降价时后端会推送 price_drop 通知，
  // 因此「开启降价提醒」等价于确保已收藏（与淘宝保持一致）。
  const togglePriceAlert = async () => {
    if (!user) {
      message.info(t("common.loginFirst"));
      navigate("/login", { state: { from: location.pathname } });
      return;
    }
    if (!p) return;
    try {
      if (!faved) {
        await addFavorite(p.id);
        setFaved(true);
      }
      message.success(t("pd.priceAlertOn"));
    } catch {
      message.error(t("common.submitFail"));
    }
  };

  if (loading) return <div className="text-center py-20"><Spin /></div>;
  if (loadError)
    return (
      <Result
        status="warning"
        title={t("common.loadFailed")}
        subTitle={t("pd.maybeOff")}
        extra={
          <Button type="primary" icon={<ReloadOutlined />} onClick={load}>
            {t("common.retry")}
          </Button>
        }
      />
    );
  if (!p) return <EmptyState title={t("pd.notFound")} description={t("pd.maybeOff")} />;

  const addToCart = async () => {
    if (variants.length && !matchedVariant) {
      message.warning(t("pd.selectSpec"));
      return;
    }
    // 游客也允许加购：先写入本地购物车，再弹出非阻断式登录引导（可继续浏览）
    if (!user) {
      useCart.getState().add({
        product_id: p.id,
        name: p.name,
        price: displayPrice,
        quantity: qty,
        image_url: matchedVariant?.image_url || p.image_url || undefined,
      });
      message.success(t("pd.addedCart"));
      setLoginPrompt({ open: true, reason: "cart" });
      return;
    }
    try {
      // P0-F4：add() 内部对登录用户已调 addCartItem，不要在外层重复调用
      await useCart.getState().add({
        product_id: p.id,
        name: p.name,
        price: displayPrice,
        quantity: qty,
        image_url: matchedVariant?.image_url || p.image_url || undefined,
      });
      message.success(t("pd.addedCart"));
    } catch (e) {
      message.error(getErrorMessage(e));
    }
  };

  const buyNow = async () => {
    if (variants.length && !matchedVariant) {
      message.warning(t("pd.selectSpec"));
      return;
    }
    if (!user) {
      // 立即购买需要登录结算：游客先提示登录，本地车已记录本次商品
      useCart.getState().add({
        product_id: p.id,
        name: p.name,
        price: displayPrice,
        quantity: qty,
        image_url: matchedVariant?.image_url || p.image_url || undefined,
      });
      setLoginPrompt({ open: true, reason: "checkout" });
      return;
    }
    try {
      // P0-F4：add() 内部对登录用户已调 addCartItem，不要在外层重复调用
      await useCart.getState().add({
        product_id: p.id,
        name: p.name,
        price: displayPrice,
        quantity: qty,
        image_url: matchedVariant?.image_url || p.image_url || undefined,
      });
      // 本项目结算在购物车页完成：跳过去时带上本次商品，购物车只勾选它，
      // 避免"立即购买"把之前遗留的商品一起结算掉
      navigate("/cart", { state: { buyNowProductId: p.id } });
    } catch (e) {
      message.error(getErrorMessage(e));
    }
  };

  const avgRating =
    reviews.length > 0
      ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
      : 0;

  return (
    <div className="space-y-8 pb-28 md:pb-0">
      <Row gutter={[32, 24]}>
        <Col xs={24} md={10}>
          <div
            role="img"
            aria-label={`${p.name} ${t("pd.mainImage")}`}
            className="relative aspect-square rounded-2xl overflow-hidden bg-slate-100 flex items-center justify-center cursor-zoom-in group"
            onMouseMove={(e) => {
              const el = e.currentTarget.querySelector("img");
              if (el) {
                const r = e.currentTarget.getBoundingClientRect();
                const x = ((e.clientX - r.left) / r.width) * 100;
                const y = ((e.clientY - r.top) / r.height) * 100;
                el.style.transformOrigin = `${x}% ${y}%`;
              }
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget.querySelector("img");
              if (el) el.style.transformOrigin = "center center";
            }}
          >
            {gallery[activeImg]?.type === "video" ? (
              <video
                src={gallery[activeImg].url}
                controls
                autoPlay
                muted
                loop
                playsInline
                className="w-full h-full object-contain rounded-2xl"
                style={{ maxHeight: "100%" }}
              />
            ) : (
              <ProductImage
                name={p.name}
                image_url={gallery[activeImg]?.url || p.image_url}
                height="100%"
                rounded={16}
                className="w-full h-full transition-transform duration-200 group-hover:scale-125"
              />
            )}
          </div>
          {gallery.length > 1 && (
            <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
              {gallery.map((item, i) => (
                <button
                  key={i}
                  onClick={() => setActiveImg(i)}
                  aria-current={i === activeImg ? "true" : undefined}
                  aria-label={`${item.type === "video" ? t("pd.videoThumbnail") : t("pd.thumbnail")} ${i + 1}`}
                  className={`shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 relative ${
                    i === activeImg ? "border-indigo-500" : "border-transparent"
                  }`}
                >
                  {item.type === "video" ? (
                    <div className="w-full h-full bg-slate-900 flex items-center justify-center">
                      <span className="text-white text-xl">▶</span>
                    </div>
                  ) : (
                    <ProductImage name={p.name} image_url={item.url} height={64} rounded={8} className="w-full h-full" />
                  )}
                </button>
              ))}
            </div>
          )}
        </Col>
        <Col xs={24} md={14}>
          <h1 className="text-2xl font-extrabold text-slate-800">{p.name}</h1>
          <div className="flex items-center gap-3 mt-2 text-slate-500 text-sm">
            <Rate disabled allowHalf value={avgRating} style={{ fontSize: 16 }} />
            <span>{reviews.length} {t("pd.reviewCount")}</span>
            <span>{t("market.sold")} {p.sales_count}</span>
          </div>

          <div className="mt-4 px-4 py-3 rounded-xl bg-[#4F46E5]/5 border border-[#4F46E5]/10">
            {/* 只有真的比原价便宜时才显示划线价，否则就是虚假原价 */}
            {displayPrice < Number(p.price) && (
              <span className="text-slate-400 line-through mr-2">¥{money(Number(p.price))}</span>
            )}
            <span className="text-3xl font-extrabold brand-gradient-text">
              ¥{money(displayPrice)}
            </span>
            {displayPrice < Number(p.price) && (
              <Tag color="volcano" className="ml-2">
                {t("cart.saved").replace("{x}", money(Number(p.price) - displayPrice))}
              </Tag>
            )}
            {matchedVariant && Number(matchedVariant.price_delta) !== 0 && (
              <Tag color={Number(matchedVariant.price_delta) > 0 ? "red" : "green"} className="ml-2">
                {Number(matchedVariant.price_delta) > 0 ? "+" : ""}¥{money(Number(matchedVariant.price_delta))}
              </Tag>
            )}
            {/* T9 到手价预估：叠加可领平台/店铺券后的最优券后价 */}
            {landedPrice != null && landedPrice < displayPrice && (
              <div className="mt-2 text-sm text-emerald-600">
                {t("pd.landedPrice")}: <b className="text-base">¥{money(landedPrice)}</b>
                <span className="ml-1 text-slate-400">{t("pd.landedHint")}</span>
              </div>
            )}
          </div>

          {/* 服务承诺（对标淘宝/京东信任背书） */}
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
            {SERVICES.map(({ key, Icon }) => (
              <span
                key={key}
                className="inline-flex items-center gap-1 bg-slate-50 border border-slate-100 rounded-full px-2.5 py-1"
              >
                <Icon size={13} className="text-emerald-500" />
                {t(key)}
              </span>
            ))}
          </div>

          {/* T21b 降价提醒：收藏商品降价后推送通知（与收藏解耦的明确入口） */}
          <button
            type="button"
            onClick={togglePriceAlert}
            disabled={!user}
            aria-label={t("pd.priceAlert")}
            className="mt-3 inline-flex items-center gap-1.5 text-xs text-emerald-600 hover:text-emerald-700 disabled:text-slate-300"
          >
            <Bell size={14} />
            {t("pd.priceAlert")}
          </button>

          {/* 规格选择 */}
          {specGroups.length > 0 && (
            <div className="mt-4 space-y-3">
              {specGroups.map((g) => (
                <div key={g.key} className="flex items-start gap-3">
                  <span className="text-slate-500 w-16 shrink-0 pt-1">{g.key}</span>
                  <div className="flex flex-wrap gap-2">
                    {g.values.map((val) => {
                      const active = selected[g.key] === val;
                      return (
                        <Button
                          key={val}
                          type={active ? "primary" : "default"}
                          shape="round"
                          aria-pressed={active}
                          aria-label={`${g.key} ${val}`}
                          onClick={() => setSelected((s) => ({ ...s, [g.key]: val }))}
                        >
                          {val}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              ))}
              {matchedVariant?.sku_code && (
                <div className="text-xs text-slate-400">SKU：{matchedVariant.sku_code}</div>
              )}
            </div>
          )}

          {/* 核心卖点（对标 Amazon 五点描述） */}
          {p && Object.keys(p.attributes || {}).length > 0 && (
            <div className="mt-4">
              <div className="text-sm font-medium text-slate-700 mb-2">{t("pd.sellingPoints")}</div>
              <ul className="space-y-1.5">
                {Object.entries(p.attributes || {})
                  .slice(0, 5)
                  .map(([k, v]) => (
                    <li key={k} className="flex items-start gap-1.5 text-sm text-slate-600">
                      <CheckCircle2 size={15} className="text-indigo-500 mt-0.5 shrink-0" />
                      <span>
                        <span className="text-slate-400">{k}：</span>
                        {String(v)}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          )}

          <div className="mt-4 flex items-center gap-3">
            <span className="text-slate-500">{t("pd.quantity")}</span>
            <InputNumber min={1} max={Math.max(stock, 1)} value={qty} onChange={(v) => setQty(v || 1)} />
            <span className="text-slate-400 text-sm">
              {t("pd.stockInfo").replace("{n}", String(stock))}
              {stock > 0 && stock <= 20 && (
                <span className="ml-2 text-rose-500 font-medium" role="status" aria-live="polite">
                  {t("pd.lowStock").replace("{n}", String(stock))}
                </span>
              )}
            </span>
          </div>

          <Divider />

          <div className="flex flex-wrap gap-3">
            <Button
              type="primary"
              size="large"
              icon={<ShoppingCartOutlined />}
              onClick={addToCart}
              disabled={stock <= 0}
              aria-label={t("pd.addCart")}
            >
              {t("pd.addCart")}
            </Button>
            <Button size="large" onClick={buyNow} disabled={stock <= 0} aria-label={t("pd.buyNow")}>
              {t("pd.buyNow")}
            </Button>
            <Tooltip title={faved ? t("pd.favRemoved") : t("pd.fav")}>
              <Button
                size="large"
                danger={faved}
                icon={faved ? <HeartFilled /> : <HeartOutlined />}
                onClick={toggleFav}
                disabled={!user}
                aria-label={faved ? t("pd.unfav") : t("pd.fav")}
              >
                {faved ? t("pd.unfav") : t("pd.fav")}
              </Button>
            </Tooltip>
            <Tooltip title={t("pd.aiChat")}>
              <Button size="large" icon={<RobotOutlined />} onClick={() => setChatOpen(true)} aria-label={t("pd.chat")}>
                {t("pd.chat")}
              </Button>
            </Tooltip>
            <Tooltip title={t("pd.arHint")}>
              <Button size="large" icon={<CameraOutlined />} onClick={() => { setArOpen(true); setTimeout(startCamera, 300); }} aria-label={t("pd.ar")}>
                {t("pd.ar")}
              </Button>
            </Tooltip>
          </div>

          <div className="mt-4">
            <Tag color={productStatusMeta[p.status].color}>{productStatusMeta[p.status].label}</Tag>
          </div>
        </Col>
      </Row>

      <Tabs
        defaultActiveKey="desc"
        items={[
          {
            key: "desc",
            label: t("pd.detail"),
            children: (
              <div className="prose max-w-none text-slate-600 whitespace-pre-wrap py-2">
                {p.description || t("pd.noDesc")}
              </div>
            ),
          },
          {
            key: "reviews",
            label: `${t("pd.reviews")} (${reviews.length})`,
            children: <ProductReviews productId={p.id} />,
          },
          {
            key: "qa",
            label: t("qna.title"),
            children: <ProductQA productId={p.id} merchantId={p.merchant_id} />,
          },
          {
            key: "price",
            label: t("pd.priceTrend"),
            children: <PriceTrendCard data={priceHistory} currentPrice={Number(p.price)} />,
          },
          {
            key: "seed",
            label: `${t("pd.seeding")} (${seedingNotes.length})`,
            children: <SeedingNotes notes={seedingNotes} />,
          },
          ...(p?.ar_enabled
            ? [
                {
                  key: "ar",
                  label: t("pd.ar"),
                  children: (
                    <ARTryOn productImage={gallery[0]?.url} overlayImage={p?.ar_overlay_url} />
                  ),
                },
              ]
            : []),
        ]}
      />

      {/* 同类推荐（对标"猜你喜欢"） */}
      {related.length > 0 && (
        <section className="mt-10">
          <div className="section-title">
            <span className="st-text">{t("pd.related")}</span>
          </div>
          <div className="rail-scroll">
            {related.map((rp, i) => (
              <div key={rp.id} className="!w-44 shrink-0">
                <Reveal delay={i * 40}>
                  <ProductCard p={rp} />
                </Reveal>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* T11 搭配购买（基于订单共现协同过滤） */}
      {coPurchase.length > 0 && (
        <section className="mt-10">
          <div className="section-title">
            <span className="st-text">{t("pd.coPurchase")}</span>
          </div>
          <div className="rail-scroll">
            {coPurchase.map((rp, i) => (
              <div key={rp.id} className="!w-44 shrink-0">
                <Reveal delay={i * 40}>
                  <ProductCard p={rp} />
                </Reveal>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* T11 看了又看（基于浏览共现协同过滤） */}
      {alsoViewed.length > 0 && (
        <section className="mt-10">
          <div className="section-title">
            <span className="st-text">{t("pd.alsoViewed")}</span>
          </div>
          <div className="rail-scroll">
            {alsoViewed.map((rp, i) => (
              <div key={rp.id} className="!w-44 shrink-0">
                <Reveal delay={i * 40}>
                  <ProductCard p={rp} />
                </Reveal>
              </div>
            ))}
          </div>
        </section>
      )}

      <Modal
        title={t("pd.ar")}
        open={arOpen}
        onCancel={() => { setArOpen(false); stopCamera(); }}
        footer={[
          <Button key="close" onClick={() => { setArOpen(false); stopCamera(); }}>
            {t("common.close")}
          </Button>,
        ]}
      >
        <div className="relative bg-black rounded overflow-hidden" style={{ aspectRatio: "3 / 4" }}>
          <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
          {p && (
            <img
              src={p.image_url ? proxyImg(p.image_url) : ""}
              alt=""
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1/2 opacity-80 pointer-events-none mix-blend-screen"
            />
          )}
        </div>
        <p className="text-xs text-slate-400 mt-2">{t("pd.arOverlayHint")}</p>
      </Modal>

      <Drawer
        title={t("pd.chat")}
        width={420}
        open={chatOpen}
        onClose={() => setChatOpen(false)}
      >
        <ProductChat product={p} />
      </Drawer>

      <LoginPrompt
        open={loginPrompt.open}
        reason={loginPrompt.reason}
        onClose={() => setLoginPrompt((s) => ({ ...s, open: false }))}
      />

      {/* T13 移动端吸底操作栏：小屏常驻加购/立即购买，主流程键盘与拇指可达 */}
      <div
        aria-label={t("pd.mobileActions")}
        className="lg:hidden fixed bottom-0 left-0 right-0 z-30 flex items-center gap-2 bg-white/95 backdrop-blur border-t border-slate-100 px-3 py-2 safe-area-bottom"
      >
        <Button
          type="primary"
          block
          icon={<ShoppingCartOutlined />}
          onClick={addToCart}
          disabled={stock <= 0}
          aria-label={t("pd.addCart")}
        >
          {t("pd.addCart")}
        </Button>
        <Button block onClick={buyNow} disabled={stock <= 0} aria-label={t("pd.buyNow")}>
          {t("pd.buyNow")}
        </Button>
      </div>
      {/* 吸底栏占位，避免遮挡页面底部内容 */}
      <div className="lg:hidden h-14" />
    </div>
  );
}

// P3-G 种草社交背书：商品详情页「种草」标签页
function SeedingNotes({ notes }: { notes: NoteOut[] }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  if (notes.length === 0) {
    return <Empty className="py-10" description={t("pd.noSeeding")} />;
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
      {notes.map((n) => (
        <div
          key={n.id}
          className="flex gap-3 p-3 rounded-xl border border-slate-100 hover:border-indigo-200 cursor-pointer transition-colors"
          onClick={() => {
            // 从种草笔记点入，若已挂推广码则归因到作者
            if (n.affiliate_code) trackAffiliateClick(n.affiliate_code);
            navigate(`/discover/${n.id}`);
          }}
        >
          {n.images[0] && (
            <div className="w-16 h-16 rounded-lg overflow-hidden bg-slate-100 shrink-0">
              <ProductImage src={n.images[0]} name={n.title} height={64} rounded={12} className="w-full h-full object-cover" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium truncate">{n.author_name}</span>
              {n.affiliate_code && <Tag color="green" className="text-xs">{t("note.promoting")}</Tag>}
            </div>
            <div className="text-sm font-medium line-clamp-1 mt-0.5">{n.title}</div>
            <div className="text-xs text-slate-500 line-clamp-2 mt-0.5">{n.content}</div>
            <div className="text-xs text-rose-500 mt-1 flex items-center gap-1">
              <Heart size={12} /> {n.likes_count}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// P1-3 历史价格曲线卡片（轻量 SVG 折线，无重图表依赖）
function PriceTrendCard({ data, currentPrice }: { data: PriceHistoryOut | null; currentPrice: number }) {
  const { t } = useI18n();
  if (!data) return <Spin className="block py-6" />;
  const series = data.series || [];
  if (series.length === 0) {
    return <Empty className="py-8" description={t("pd.noPriceHistory")} />;
  }
  const prices = series.map((s) => s.price);
  const min = Math.min(...prices, currentPrice);
  const max = Math.max(...prices, currentPrice);
  const W = 320, H = 120, pad = 16;
  const x = (i: number) => pad + (i * (W - pad * 2)) / Math.max(series.length - 1, 1);
  const y = (v: number) => H - pad - ((v - min) / (max - min || 1)) * (H - pad * 2);
  const path = series.map((s, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(s.price)}`).join(" ");
  const cmp = data.compare;
  return (
    <div className="py-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-md">
        <polyline fill="none" stroke="#2563eb" strokeWidth={2} points={`${x(0)},${y(prices[0])} ` + series.map((s, i) => `${x(i)},${y(s.price)}`).join(" ")} />
        <path d={path} fill="none" stroke="#2563eb" strokeWidth={2} />
        {series.map((s, i) => (
          <circle key={i} cx={x(i)} cy={y(s.price)} r={3} fill="#2563eb" />
        ))}
      </svg>
      <div className="text-xs text-slate-500 mt-2">
        {t("pd.priceLow")} {money(min)} · {t("pd.priceHigh")} {money(max)} · {t("pd.currentPrice")} {money(currentPrice)}
      </div>
      {cmp && (
        <div className="text-xs text-slate-500 mt-1">
          {t("pd.compareAvg")} {money(cmp.avg_price)} · {cmp.our_price > cmp.avg_price ? t("pd.priceHighThanAvg") : cmp.our_price < cmp.avg_price ? t("pd.priceLowThanAvg") : t("pd.priceAvg")}
        </div>
      )}
      <div className="mt-3 space-y-1">
        {series.map((s, i) => (
          <div key={i} className="flex justify-between text-xs text-slate-500">
            <span>{s.time ? new Date(s.time).toLocaleDateString() : "-"}</span>
            <span>{money(s.price)}</span>
            <span className="text-slate-400">{s.source}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
