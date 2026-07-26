import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
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
} from "antd";
import {
  ShoppingCartOutlined,
  HeartOutlined,
  HeartFilled,
  RobotOutlined,
  MessageOutlined,
} from "@ant-design/icons";
import { getProduct, listProductReviews, listVariants, addCartItem, type ProductOut, type ReviewOut, type VariantOut } from "../api";
import { money, productStatusMeta } from "../utils/format";
import { useAuth } from "../store/auth";
import { useCart } from "../store/cart";
import { useI18n } from "../i18n";
import EmptyState from "../components/EmptyState";
import ProductReviews from "../components/ProductReviews";
import ProductChat from "../components/ProductChat";

export default function ProductDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const { t } = useI18n();
  const [p, setP] = useState<ProductOut | null>(null);
  const [reviews, setReviews] = useState<ReviewOut[]>([]);
  const [variants, setVariants] = useState<VariantOut[]>([]);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [qty, setQty] = useState(1);
  const [loading, setLoading] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);

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
      message.error("加载失败");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

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

  const displayPrice = useMemo(() => {
    const base = Number(p?.price || 0);
    return base + (matchedVariant ? Number(matchedVariant.price_delta || 0) : 0);
  }, [p, matchedVariant]);

  const stock = matchedVariant ? matchedVariant.stock : p?.stock ?? 0;

  if (loading) return <div className="text-center py-20"><Spin /></div>;
  if (!p) return <EmptyState title="商品不存在" description="可能已下架" />;

  const addToCart = async () => {
    if (!user) {
      message.warning("请先登录");
      navigate("/login");
      return;
    }
    if (variants.length && !matchedVariant) {
      message.warning("请选择完整规格");
      return;
    }
    try {
      await addCartItem({ product_id: p.id, quantity: qty, variant_id: matchedVariant?.id });
      useCart.getState().add({
        product_id: p.id,
        name: p.name,
        price: displayPrice,
        quantity: qty,
        image_url: matchedVariant?.image_url || p.image_url,
      });
      message.success("已加入购物车");
    } catch (e: any) {
      message.error(e?.response?.data?.detail || "加入购物车失败");
    }
  };

  const buyNow = async () => {
    if (!user) {
      message.warning("请先登录");
      navigate("/login");
      return;
    }
    if (variants.length && !matchedVariant) {
      message.warning("请选择完整规格");
      return;
    }
    try {
      await addCartItem({ product_id: p.id, quantity: qty, variant_id: matchedVariant?.id });
      useCart.getState().add({
        product_id: p.id,
        name: p.name,
        price: displayPrice,
        quantity: qty,
        image_url: matchedVariant?.image_url || p.image_url,
      });
      navigate("/cart");
    } catch (e: any) {
      message.error(e?.response?.data?.detail || "下单失败");
    }
  };

  const avgRating =
    reviews.length > 0
      ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
      : 0;

  return (
    <div className="space-y-6">
      <Row gutter={[32, 24]}>
        <Col xs={24} md={10}>
          <div className="aspect-square rounded-2xl overflow-hidden bg-slate-100 flex items-center justify-center">
            {p.image_url ? (
              <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
            ) : (
              <EmptyState title="暂无图片" />
            )}
          </div>
        </Col>
        <Col xs={24} md={14}>
          <h1 className="text-2xl font-extrabold text-slate-800">{p.name}</h1>
          <div className="flex items-center gap-3 mt-2 text-slate-500 text-sm">
            <Rate disabled allowHalf value={avgRating} style={{ fontSize: 16 }} />
            <span>{reviews.length} 条评价</span>
            <span>已售 {p.sales_count}</span>
          </div>

          <div className="mt-4 px-4 py-3 rounded-xl bg-[#4F46E5]/5 border border-[#4F46E5]/10">
            <span className="text-slate-400 line-through mr-2">¥{money(Number(p.price))}</span>
            <span className="text-3xl font-extrabold brand-gradient-text">
              ¥{money(displayPrice)}
            </span>
            {matchedVariant && Number(matchedVariant.price_delta) !== 0 && (
              <Tag color={Number(matchedVariant.price_delta) > 0 ? "red" : "green"} className="ml-2">
                {Number(matchedVariant.price_delta) > 0 ? "+" : ""}¥{money(Number(matchedVariant.price_delta))}
              </Tag>
            )}
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

          <div className="mt-4 flex items-center gap-3">
            <span className="text-slate-500">数量</span>
            <InputNumber min={1} max={Math.max(stock, 1)} value={qty} onChange={(v) => setQty(v || 1)} />
            <span className="text-slate-400 text-sm">
              库存 {stock} 件
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
              {t("addToCart")}
            </Button>
            <Button size="large" onClick={buyNow} disabled={stock <= 0}>
              {t("buyNow")}
            </Button>
            <Tooltip title="AI 智能客服">
              <Button size="large" icon={<RobotOutlined />} onClick={() => setChatOpen(true)}>
                {t("askAI")}
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
            label: "商品详情",
            children: (
              <div className="prose max-w-none text-slate-600 whitespace-pre-wrap py-2">
                {p.description || "暂无描述"}
              </div>
            ),
          },
          {
            key: "reviews",
            label: `评价 (${reviews.length})`,
            children: <ProductReviews productId={p.id} reviews={reviews} />,
          },
        ]}
      />

      {chatOpen && (
        <ProductChat productId={p.id} productName={p.name} onClose={() => setChatOpen(false)} />
      )}
    </div>
  );
}
