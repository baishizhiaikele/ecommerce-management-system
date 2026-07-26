import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Input, Card, Button, Row, Col, Empty, Spin, Tag, message, Select, Switch, InputNumber } from "antd";
import { Search, Sparkles, Flame, Zap, ShoppingBag } from "lucide-react";
import { useCart } from "../store/cart";
import {
  listProducts,
  listCategories,
  recommendations,
  addCartItem,
  ProductOut,
  CategoryOut,
} from "../api";
import { money } from "../utils/format";
import ProductImage from "../components/ProductImage";
import Reveal from "../components/Reveal";

export default function Market() {
  const navigate = useNavigate();
  const add = useCart((s) => s.add);
  const [items, setItems] = useState<ProductOut[]>([]);
  const [cats, setCats] = useState<CategoryOut[]>([]);
  const [kw, setKw] = useState("");
  const [cat, setCat] = useState<string | undefined>();
  const [sort, setSort] = useState<string | undefined>();
  const [minPrice, setMinPrice] = useState<number | null>(null);
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [inStock, setInStock] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recs, setRecs] = useState<ProductOut[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await listProducts({
        keyword: kw || undefined,
        category_id: cat,
        sort,
        min_price: minPrice || undefined,
        max_price: maxPrice || undefined,
        in_stock: inStock,
      });
      setItems(data);
    } catch {
      /* 忽略 */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    listCategories()
      .then(setCats)
      .catch(() => {});
    recommendations()
      .then(setRecs)
      .catch(() => {});
  }, []);

  const onAdd = async (p: ProductOut) => {
    try {
      await addCartItem({ product_id: p.id, quantity: 1 });
      add({
        product_id: p.id,
        name: p.name,
        price: Number(p.price),
        quantity: 1,
        image_url: undefined,
      });
      message.success("已加入购物车");
    } catch (e: any) {
      message.error(e.response?.data?.detail || "加入失败");
    }
  };

  const pickCat = (id?: string) => {
    setCat(id);
    setTimeout(load, 0);
  };

  const CardItem = ({ p }: { p: ProductOut }) => (
    <Card
      hoverable
      className="product-card group"
      cover={<ProductImage name={p.name} image_url={p.image_url} height={190} rounded={0} />}
      onClick={() => navigate(`/products/${p.id}`)}
    >
      <div className="truncate text-sm text-slate-700 font-medium" title={p.name}>
        {p.name}
      </div>
      <div className="flex items-center justify-between mt-2">
        <span className="text-[#4F46E5] font-bold text-lg">
          <span className="text-sm align-top mr-0.5">¥</span>
          {money(p.price)}
        </span>
        <Tag color={p.stock > 0 ? "green" : "red"}>{p.stock > 0 ? "有货" : "缺货"}</Tag>
      </div>
      <Button
        block
        className="mt-3"
        type="primary"
        disabled={p.stock <= 0}
        onClick={(e) => {
          e.stopPropagation();
          onAdd(p);
        }}
      >
        加入购物车
      </Button>
    </Card>
  );

  return (
    <div className="space-y-10">
      {/* Hero */}
      <section className="relative bg-white border border-[#EEF0F3] rounded-3xl p-8 md:p-10 overflow-hidden">
        <div className="relative z-10 max-w-2xl">
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
            <Sparkles size={13} /> AI 智能推荐 · 全球好物
          </span>
          <h1 className="text-3xl md:text-[40px] font-bold leading-tight mt-4 text-[#111827]">
            发现属于你的
            <br />
            品质生活好物
          </h1>
          <p className="text-slate-500 mt-3 text-sm md:text-base">
            聚合千家店铺，AI 为你精选高性价比商品。限时优惠、新人立减，一站购齐。
          </p>
          <Input
            size="large"
            allowClear
            value={kw}
            onChange={(e) => setKw(e.target.value)}
            onPressEnter={load}
            placeholder="搜索商品 / 品牌 / 店铺"
            prefix={<Search className="text-slate-400" size={18} />}
            className="mt-5 !rounded-full"
            style={{ maxWidth: 480 }}
            suffix={
              <Button type="primary" shape="round" onClick={load}>
                搜索
              </Button>
            }
          />
          <div className="flex flex-wrap gap-2 mt-4">
            {[
              { label: "热销榜", k: "sales", icon: <Flame size={14} /> },
              { label: "最新上架", k: "newest", icon: <Sparkles size={14} /> },
              { label: "高性价比", k: "price_asc", icon: <ShoppingBag size={14} /> },
            ].map((q) => (
              <button
                key={q.k}
                onClick={() => {
                  setSort(q.k);
                  setTimeout(load, 0);
                }}
                className="flex items-center gap-1 px-3 py-1.5 rounded-full text-sm text-slate-600 bg-slate-50 border border-slate-200 hover:text-[#4F46E5] hover:border-[#4F46E5] transition"
              >
                {q.icon}
                {q.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* 分类宫格 */}
      <section>
        <div className="section-title">
          <span className="st-text">全部分类</span>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
          <button
            onClick={() => pickCat(undefined)}
            className={`group rounded-2xl p-4 text-left bg-white border border-[#EEF0F3] transition hover:shadow-sm hover:border-[#4F46E5] ${
              !cat ? "ring-2 ring-[#4F46E5]" : ""
            }`}
          >
            <span className="glow-icon" style={{ width: 40, height: 40, fontSize: 18 }}>
              <ShoppingBag size={18} />
            </span>
            <div className="mt-2 text-sm font-medium">全部</div>
          </button>
          {cats.map((c) => (
            <button
              key={c.id}
              onClick={() => pickCat(c.id)}
              className={`group rounded-2xl p-4 text-left bg-white border border-[#EEF0F3] transition hover:shadow-sm hover:border-[#4F46E5] ${
                cat === c.id ? "ring-2 ring-[#4F46E5]" : ""
              }`}
            >
              <span className="glow-icon" style={{ width: 40, height: 40, fontSize: 18 }}>
                <ShoppingBag size={18} />
              </span>
              <div className="mt-2 text-sm font-medium truncate">{c.name}</div>
            </button>
          ))}
        </div>
      </section>

      {/* 促销位 */}
      <section className="bg-white border border-[#EEF0F3] rounded-2xl p-5 md:p-6 flex items-center justify-between flex-wrap gap-3 fade-up">
        <div className="flex items-center gap-3">
          <span className="glow-icon" style={{ width: 48, height: 48, fontSize: 22 }}>
            <Zap size={22} />
          </span>
          <div>
            <div className="font-bold text-lg text-[#111827]">限时秒杀 · 新人专享</div>
            <div className="text-slate-500 text-sm">每日精选爆款，下单立减，先到先得</div>
          </div>
        </div>
        <Button type="primary" shape="round" size="large" onClick={() => navigate("/coupons")}>
          领取优惠券
        </Button>
      </section>

      {/* 猜你喜欢 */}
      {recs.length > 0 && (
        <section>
          <div className="section-title">
            <span className="st-text">猜你喜欢</span>
            <Tag color="purple">AI 推荐</Tag>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {recs.map((p, i) => (
              <div key={p.id} className="!w-44 shrink-0">
                <Reveal delay={i * 50}>
                  <CardItem p={p} />
                </Reveal>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 精选好物 + 筛选 */}
      <section>
        <div className="section-title">
          <span className="st-text">{cat ? cats.find((c) => c.id === cat)?.name : "精选好物"}</span>
        </div>
        <div className="bg-white border border-[#EEF0F3] rounded-2xl p-4 mb-5 flex gap-3 flex-wrap items-center">
          <Select
            placeholder="全部分类"
            allowClear
            style={{ width: 140 }}
            value={cat}
            onChange={(v) => pickCat(v)}
            options={cats.map((c) => ({ value: c.id, label: c.name }))}
          />
          <Select
            placeholder="综合排序"
            allowClear
            style={{ width: 140 }}
            value={sort}
            onChange={(v) => {
              setSort(v);
              setTimeout(load, 0);
            }}
            options={[
              { value: "price_asc", label: "价格从低到高" },
              { value: "price_desc", label: "价格从高到低" },
              { value: "sales", label: "销量优先" },
              { value: "newest", label: "最新上架" },
            ]}
          />
          <InputNumber
            placeholder="最低价"
            min={0}
            style={{ width: 100 }}
            value={minPrice}
            onChange={(v) => setMinPrice(v)}
          />
          <InputNumber
            placeholder="最高价"
            min={0}
            style={{ width: 100 }}
            value={maxPrice}
            onChange={(v) => setMaxPrice(v)}
          />
          <span className="flex items-center gap-1 text-slate-500">
            仅看有货
            <Switch
              size="small"
              checked={inStock}
              onChange={(v) => {
                setInStock(v);
                setTimeout(load, 0);
              }}
            />
          </span>
          <Button type="primary" onClick={load}>
            查询
          </Button>
        </div>
        {loading ? (
          <Row gutter={[16, 16]}>
            {Array.from({ length: 8 }).map((_, i) => (
              <Col key={i} xs={24} sm={12} md={8} lg={6}>
                <div className="product-card overflow-hidden" style={{ padding: 0 }}>
                  <div className="skeleton-shimmer" style={{ height: 190 }} />
                  <div style={{ padding: 16, display: "grid", gap: 10 }}>
                    <div className="skeleton-shimmer" style={{ height: 14, width: "70%" }} />
                    <div className="skeleton-shimmer" style={{ height: 14, width: "40%" }} />
                    <div className="skeleton-shimmer" style={{ height: 36, width: "100%" }} />
                  </div>
                </div>
              </Col>
            ))}
          </Row>
        ) : items.length === 0 ? (
          <Empty className="py-20" description="暂无商品" />
        ) : (
          <Row gutter={[16, 16]}>
            {items.map((p, i) => (
              <Col key={p.id} xs={24} sm={12} md={8} lg={6}>
                <Reveal delay={(i % 8) * 60}>
                  <CardItem p={p} />
                </Reveal>
              </Col>
            ))}
          </Row>
        )}
      </section>
    </div>
  );
}
