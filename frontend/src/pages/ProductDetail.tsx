import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate, useLocation, Link } from "react-router-dom";
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
  Popconfirm,
  Tooltip,
  Drawer,
  Modal,
} from "antd";
import {
  ShoppingCartOutlined,
  HeartOutlined,
  HeartFilled,
  RobotOutlined,
  MessageOutlined,
  CameraOutlined,
} from "@ant-design/icons";
import { getProduct, listProductReviews, listVariants, addCartItem, logView, proxyImg, listProducts, addFavorite, removeFavorite, isFavorited, getErrorMessage, type ProductOut, type ReviewOut, type VariantOut } from "../api";
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
import { CheckCircle2, RotateCcw, ShieldCheck, Zap, PackageCheck, type LucideIcon } from "lucide-react";

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
  const [chatOpen, setChatOpen] = useState(false);
  const [arOpen, setArOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const arStreamRef = useRef<MediaStream | null>(null);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      arStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
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
      message.error(t("common.loadFailed"));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // 记录浏览历史（本地兜底 + 登录用户同步后端）
  useEffect(() => {
    if (!p?.id) return;
    try {
      const raw = localStorage.getItem("browse_history") || "[]";
      const arr = JSON.parse(raw) as BrowseHistoryItem[];
      const next = [
        { id: p.id, name: p.name, price: p.price, image_url: p.image_url, stock: p.stock },
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
      }).catch(() => {});
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

  const gallery = useMemo(() => {
    const extra: string[] = [];
    try {
      const arr = JSON.parse(p?.images || "[]");
      if (Array.isArray(arr)) extra.push(...arr.filter((x: unknown) => typeof x === "string"));
    } catch {
      /* ignore */
    }
    const base = p?.image_url ? [p.image_url] : [];
    return Array.from(new Set([...base, ...extra])).filter(Boolean) as string[];
  }, [p?.image_url, p?.images]);

  useEffect(() => {
    setActiveImg(0);
  }, [p?.id]);

  useEffect(() => {
    let alive = true;
    if (p && user) {
      isFavorited(p.id)
        .then((r) => alive && setFaved(r.favorited))
        .catch(() => {});
    } else {
      setFaved(false);
    }
    return () => {
      alive = false;
    };
  }, [p?.id, user]);

  useEffect(() => {
    if (!p?.category_id) return;
    listProducts({ category_id: p.category_id, page_size: 12 })
      .then((r) => setRelated(r.filter((x) => x.id !== p.id).slice(0, 10)))
      .catch(() => {});
  }, [p?.category_id, p?.id]);

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

  if (loading) return <div className="text-center py-20"><Spin /></div>;
  if (!p) return <EmptyState title={t("pd.notFound")} description={t("pd.maybeOff")} />;

  const addToCart = async () => {
    if (!user) {
      message.warning(t("common.loginFirst"));
      navigate("/login", { state: { from: location.pathname } });
      return;
    }
    if (variants.length && !matchedVariant) {
      message.warning(t("pd.selectSpec"));
      return;
    }
    try {
      await addCartItem({ product_id: p.id, quantity: qty, variant_id: matchedVariant?.id });
      useCart.getState().add({
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
    if (!user) {
      message.warning(t("common.loginFirst"));
      navigate("/login", { state: { from: location.pathname } });
      return;
    }
    if (variants.length && !matchedVariant) {
      message.warning(t("pd.selectSpec"));
      return;
    }
    try {
      await addCartItem({ product_id: p.id, quantity: qty, variant_id: matchedVariant?.id });
      useCart.getState().add({
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
            <ProductImage
              name={p.name}
              image_url={gallery[activeImg] || p.image_url}
              height="100%"
              rounded={16}
              className="w-full h-full transition-transform duration-200 group-hover:scale-125"
            />
          </div>
          {gallery.length > 1 && (
            <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
              {gallery.map((src, i) => (
                <button
                  key={i}
                  onClick={() => setActiveImg(i)}
                  className={`shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 ${
                    i === activeImg ? "border-indigo-500" : "border-transparent"
                  }`}
                >
                  <ProductImage name={p.name} image_url={src} height={64} rounded={8} className="w-full h-full" />
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
                        {v}
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
                <span className="ml-2 text-rose-500 font-medium">
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
            >
              {t("pd.addCart")}
            </Button>
            <Button size="large" onClick={buyNow} disabled={stock <= 0}>
              {t("pd.buyNow")}
            </Button>
            <Tooltip title={faved ? t("pd.favRemoved") : t("pd.fav")}>
              <Button
                size="large"
                danger={faved}
                icon={faved ? <HeartFilled /> : <HeartOutlined />}
                onClick={toggleFav}
                disabled={!user}
              >
                {faved ? t("pd.unfav") : t("pd.fav")}
              </Button>
            </Tooltip>
            <Tooltip title={t("pd.aiChat")}>
              <Button size="large" icon={<RobotOutlined />} onClick={() => setChatOpen(true)}>
                {t("pd.chat")}
              </Button>
            </Tooltip>
            <Tooltip title={t("pd.arHint")}>
              <Button size="large" icon={<CameraOutlined />} onClick={() => { setArOpen(true); setTimeout(startCamera, 300); }}>
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
    </div>
  );
}
