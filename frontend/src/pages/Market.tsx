import { useEffect, useRef, useState } from "react";
import type { AxiosError } from "axios";
import { useNavigate } from "react-router-dom";
import { Carousel, Card, Button, Input, Row, Col, Empty, Spin, Tag, message, Select, Switch, InputNumber, Rate, Space, AutoComplete } from "antd";
import { Search, Sparkles, Flame, Zap, ShoppingBag, Clock, Store, Gift, TrendingUp } from "lucide-react";
import { useCart } from "../store/cart";
import {
  listProducts,
  listCategories,
  recommendations,
  addCartItem,
  getBanners,
  getPromotions,
  listShops,
  searchHot,
  searchRecord,
  listCoupons,
  claimCoupon,
  searchSuggest,
  searchFacets,
  ProductOut,
  CategoryOut,
  BannerOut,
  PromotionOut,
  CouponOut,
  Facets,
} from "../api";
import { useI18n, translate } from "../i18n";
import { money } from "../utils/format";
import ProductImage from "../components/ProductImage";
import Reveal from "../components/Reveal";

function FlashCountdown({ endAt }: { endAt?: string | null }) {
  const [left, setLeft] = useState("");
  const { t } = useI18n();
  useEffect(() => {
    if (!endAt) return;
    const tick = () => {
      const diff = new Date(endAt).getTime() - Date.now();
      if (diff <= 0) {
        setLeft(t("market.ended"));
        return;
      }
      const h = Math.floor(diff / 3.6e6);
      const m = Math.floor((diff % 3.6e6) / 6e4);
      const s = Math.floor((diff % 6e4) / 1000);
      setLeft(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [endAt]);
  return (
    <span className="inline-flex items-center gap-1 font-mono text-sm text-rose-600">
      <Clock size={14} /> {left || "--:--:--"}
    </span>
  );
}

export default function Market() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const add = useCart((s) => s.add);
  const [items, setItems] = useState<ProductOut[]>([]);
  const [cats, setCats] = useState<CategoryOut[]>([]);
  const [banners, setBanners] = useState<BannerOut[]>([]);
  const [promos, setPromos] = useState<PromotionOut[]>([]);
  const [shops, setShops] = useState<{ id: string; name: string; product_count: number }[]>([]);
  const [topSales, setTopSales] = useState<ProductOut[]>([]);
  const [topRating, setTopRating] = useState<ProductOut[]>([]);
  const [kw, setKw] = useState("");
  const [cat, setCat] = useState<string | undefined>();
  const [sort, setSort] = useState<string | undefined>();
  const [minPrice, setMinPrice] = useState<number | null>(null);
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [inStock, setInStock] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recs, setRecs] = useState<ProductOut[]>([]);
  const [hot, setHot] = useState<string[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [coupons, setCoupons] = useState<CouponOut[]>([]);
  const [recent, setRecent] = useState<ProductOut[]>([]);
  const [rating, setRating] = useState<number | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [facets, setFacets] = useState<Facets | null>(null);
  // 以 ref 持有最新筛选条件，保证 setX + setTimeout(load, 0) 读取到最新值（P1-6 分面检索）
  const filterRef = useRef({ kw, cat, sort, minPrice, maxPrice, inStock, rating, page: 1 });
  useEffect(() => {
    filterRef.current = { kw, cat, sort, minPrice, maxPrice, inStock, rating, page: 1 };
  });

  const HISTORY_KEY = "market_search_history";
  useEffect(() => {
    searchHot()
      .then((r) => setHot(r))
      .catch(() => {});
    try {
      const h = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
      if (Array.isArray(h)) setHistory(h);
    } catch {
      /* ignore */
    }
  }, []);

  const pushHistory = (term: string) => {
    const t = term.trim();
    if (!t) return;
    const next = [t, ...history.filter((x) => x !== t)].slice(0, 10);
    setHistory(next);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  };

  const doSearch = (term: string) => {
    const t = term.trim();
    setKw(t);
    if (t) {
      pushHistory(t);
      searchRecord(t).catch(() => {});
    }
    setTimeout(load, 0);
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem(HISTORY_KEY);
  };

  const topCats = cats.filter((c) => !c.parent_id);
  const subOf = (pid?: string) => cats.filter((c) => c.parent_id === pid);

  const load = async () => {
    const f = filterRef.current;
    setLoading(true);
    try {
      const data = await listProducts({
        keyword: f.kw || undefined,
        category_id: f.cat,
        sort: f.sort,
        min_price: f.minPrice || undefined,
        max_price: f.maxPrice || undefined,
        min_rating: f.rating || undefined,
        in_stock: f.inStock,
        page: f.page,
        page_size: 20,
      });
      setItems(data);
    } catch {
      /* 忽略 */
    } finally {
      setLoading(false);
    }
  };

  const fetchSuggest = async (q: string) => {
    const term = (q || "").trim();
    if (!term) {
      setSuggestions([]);
      return;
    }
    try {
      const s = await searchSuggest(term);
      setSuggestions(s);
    } catch {
      /* 忽略联想失败 */
    }
  };

  useEffect(() => {
    load();
    listCategories().then(setCats).catch(() => {});
    recommendations().then(setRecs).catch(() => {});
    getBanners().then(setBanners).catch(() => {});
    getPromotions("flash").then(setPromos).catch(() => {});
    listShops().then(setShops).catch(() => {});
    listProducts({ sort: "sales", page_size: 6 }).then(setTopSales).catch(() => {});
    listProducts({ sort: "top_rating", page_size: 6 }).then(setTopRating).catch(() => {});
    listCoupons().then(setCoupons).catch(() => {});
    searchFacets().then(setFacets).catch(() => {});
    try {
      const r = JSON.parse(localStorage.getItem("browse_history") || "[]");
      if (Array.isArray(r)) setRecent(r.slice(0, 12));
    } catch {
      /* 忽略 */
    }
  }, []);

  const onAdd = async (p: ProductOut) => {
    try {
      await addCartItem({ product_id: p.id, quantity: 1 });
      add({ product_id: p.id, name: p.name, price: Number(p.price), quantity: 1, image_url: undefined });
      message.success("已加入购物车");
    } catch (e) {
      const err = e as AxiosError<any, any>;
      message.error(err.response?.data?.detail || "加入失败");
    }
  };

  const onClaim = async (c: CouponOut) => {
    try {
      await claimCoupon(c.id);
      message.success(t("coupon.claimSuccess"));
      setCoupons((s) => s.filter((x) => x.id !== c.id));
    } catch (e) {
      const err = e as AxiosError<any, any>;
      message.error(err.response?.data?.detail || t("coupon.claimFail"));
    }
  };

  const pickCat = (id?: string) => {
    setCat(id);
    setTimeout(load, 0);
  };

  const goBanner = (b: BannerOut) => {
    if (b.link_type === "product" && b.link_id) navigate(`/products/${b.link_id}`);
    else if (b.link_type === "shop" && b.link_id) navigate(`/shops/${b.link_id}`);
    else if (b.link_type === "category" && b.link_id) pickCat(b.link_id);
    else if (b.link_url) window.open(b.link_url, "_blank");
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
        <Tag color={p.stock > 0 ? "green" : "red"}>{p.stock > 0 ? t("market.inStock") : t("market.outStock")}</Tag>
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
        {t("pd.addCart")}
      </Button>
    </Card>
  );

  return (
    <div className="space-y-10">
      {/* 轮播 Banner */}
      {banners.length > 0 && (
        <Carousel autoplay className="rounded-3xl overflow-hidden shadow-sm" dots>
          {banners.map((b) => (
            <div key={b.id} onClick={() => goBanner(b)} className="cursor-pointer">
              <div className="h-[200px] md:h-[280px] w-full relative">
                <img src={b.image_url} alt={b.title} className="w-full h-full object-cover" />
                <div className="absolute left-6 bottom-6 bg-white/85 backdrop-blur px-4 py-2 rounded-xl text-[#111827] font-bold shadow">
                  {b.title}
                </div>
              </div>
            </div>
          ))}
        </Carousel>
      )}

      {/* 快捷入口 */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { labelKey: "market.quick.coupon", icon: <Gift size={20} />, go: () => navigate("/coupons") },
          { labelKey: "market.quick.shop", icon: <Store size={20} />, go: () => navigate("/shops") },
          { labelKey: "market.quick.points", icon: <Sparkles size={20} />, go: () => navigate("/points") },
          { labelKey: "market.quick.fav", icon: <ShoppingBag size={20} />, go: () => navigate("/favorites") },
        ].map((q) => (
          <button
            key={q.labelKey}
            onClick={q.go}
            className="flex items-center gap-3 rounded-2xl bg-white border border-[#EEF0F3] p-4 hover:border-[#4F46E5] hover:shadow-sm transition"
          >
            <span className="glow-icon" style={{ width: 42, height: 42, fontSize: 20 }}>
              {q.icon}
            </span>
            <span className="font-medium text-slate-700">{t(q.labelKey)}</span>
          </button>
        ))}
      </section>

      {/* 领券中心 */}
      {coupons.length > 0 && (
        <section>
          <div className="section-title flex items-center gap-2">
            <Gift size={16} className="text-[#4F46E5]" />
            <span className="st-text">{t("market.couponCenter")}</span>
            <Button type="link" size="small" onClick={() => navigate("/coupons")}>
              {t("market.moreOffers")}
            </Button>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {coupons.map((c) => (
              <div
                key={c.id}
                className="!w-56 shrink-0 flex rounded-2xl overflow-hidden border border-slate-100 shadow-sm"
              >
                <div
                  className="w-24 flex flex-col items-center justify-center text-white"
                  style={{ background: "#4F46E5" }}
                >
                  <div className="text-xl font-bold">
                    {c.type === "discount"
                      ? `${(Number(c.value) * 10).toFixed(1)}${t("membership.zhe")}`
                      : `¥${c.value}`}
                  </div>
                  <div className="text-[10px] opacity-90 mt-1 px-1 text-center">
                    {c.type === "discount"
                      ? translate("coupon.noThresholdDiscount")
                      : translate("coupon.thresholdHint").replace("{threshold}", c.threshold)}
                  </div>
                </div>
                <div className="flex-1 flex items-center justify-between px-3 py-2">
                  <div className="min-w-0">
                    <div className="font-semibold truncate text-sm">{c.name}</div>
                  </div>
                  <Button type="primary" size="small" onClick={() => onClaim(c)}>
                    {t("coupon.receive")}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 限时秒杀 */}
      {promos.length > 0 && (
        <section className="bg-gradient-to-r from-rose-50 to-orange-50 border border-rose-100 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Zap className="text-rose-500" size={20} />
              <span className="font-bold text-lg text-rose-600">{t("market.flash")}</span>
              <FlashCountdown endAt={promos[0]?.end_at} />
            </div>
            <Button size="small" type="primary" ghost onClick={() => navigate("/coupons")}>
              {t("market.moreOffers")}
            </Button>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {promos.map((pr) => (
              <div
                key={pr.id}
                onClick={() => pr.product_id && navigate(`/products/${pr.product_id}`)}
                className="!w-40 shrink-0 bg-white rounded-xl p-2 cursor-pointer hover:shadow"
              >
                <ProductImage name={pr.product_name || "秒杀"} image_url={pr.product_image || ""} height={120} rounded={8} />
                <div className="mt-2 text-sm font-medium truncate">{pr.product_name}</div>
                <div className="flex items-baseline gap-1">
                  <span className="text-rose-600 font-bold">¥{money(pr.discount_price || pr.original_price || 0)}</span>
                  {pr.original_price && (
                    <span className="text-xs text-slate-400 line-through">¥{money(pr.original_price)}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 多级分类导航 */}
      <section>
        <div className="section-title">
          <span className="st-text">{t("market.allCats")}</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {topCats.map((tc) => (
            <div key={tc.id} className="bg-white border border-[#EEF0F3] rounded-2xl p-4">
              <button
                onClick={() => pickCat(tc.id)}
                className={`font-bold text-base mb-2 hover:text-[#4F46E5] ${!cat ? "" : ""}`}
              >
                {tc.name}
              </button>
              <div className="flex flex-wrap gap-2">
                {subOf(tc.id).map((sc) => (
                  <button
                    key={sc.id}
                    onClick={() => pickCat(sc.id)}
                    className={`px-2.5 py-1 rounded-full text-xs border transition ${
                      cat === sc.id
                        ? "bg-[#4F46E5] text-white border-[#4F46E5]"
                        : "bg-slate-50 text-slate-600 border-slate-200 hover:border-[#4F46E5]"
                    }`}
                  >
                    {sc.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 双榜单：热销榜 / 好评榜 */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[
          { titleKey: "market.topSales", icon: <Flame size={16} className="text-rose-500" />, data: topSales, key: "sales" },
          { titleKey: "market.topRating", icon: <TrendingUp size={16} className="text-[#4F46E5]" />, data: topRating, key: "rating" },
        ].map((board) => (
          <div key={board.key} className="bg-white border border-[#EEF0F3] rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              {board.icon}
              <span className="font-bold">{t(board.titleKey)}</span>
              <span className="ml-auto text-xs text-slate-400">{t("market.topPrefix")} {board.data.length}</span>
            </div>
            <div className="space-y-2">
              {board.data.map((p, i) => (
                <div
                  key={p.id}
                  onClick={() => navigate(`/products/${p.id}`)}
                  className="flex items-center gap-3 cursor-pointer hover:bg-slate-50 rounded-lg p-1.5"
                >
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      i < 3 ? "bg-rose-500 text-white" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <ProductImage name={p.name} image_url={p.image_url} height={44} rounded={8} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm truncate">{p.name}</div>
                    <div className="text-[#4F46E5] font-bold text-sm">¥{money(p.price)}</div>
                  </div>
                  {board.key === "sales" ? (
                    <span className="text-xs text-slate-400">{t("market.sold")} {p.sales_count}</span>
                  ) : (
                    <Rate disabled value={5} style={{ fontSize: 12 }} />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* 店铺街 */}
      {shops.length > 0 && (
        <section>
          <div className="section-title flex items-center gap-2">
            <Store size={16} className="text-[#4F46E5]" />
            <span className="st-text">{t("market.shopStreet")}</span>
            <Button type="link" size="small" onClick={() => navigate("/shops")}>
              {t("market.allShops")}
            </Button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {shops.map((s) => (
              <Card
                key={s.id}
                hoverable
                className="soft-card"
                onClick={() => navigate(`/shops/${s.id}`)}
              >
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-[#4F46E5] flex items-center justify-center text-white">
                    <Store />
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{s.name}</div>
                    <Tag color="cyan">{s.product_count} {t("market.itemsOnSale")}</Tag>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* 猜你喜欢 */}
      {recs.length > 0 && (
        <section>
          <div className="section-title">
            <span className="st-text">{t("market.guessYouLike")}</span>
            <Tag color="purple">{t("market.aiRec")}</Tag>
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

      {/* 主题频道 */}
      <section>
          <div className="section-title">
            <span className="st-text">{t("market.themeChannels")}</span>
          </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {topCats.map((tc, i) => (
            <div
              key={tc.id}
              onClick={() => pickCat(tc.id)}
              className="relative h-28 rounded-2xl overflow-hidden cursor-pointer group"
            >
              <div
                className={`absolute inset-0 ${
                  i % 3 === 0 ? "bg-indigo-500" : i % 3 === 1 ? "bg-emerald-500" : "bg-amber-500"
                } opacity-90 group-hover:opacity-100 transition`}
              />
              <div className="relative z-10 h-full flex flex-col justify-center px-5 text-white">
                <div className="text-lg font-bold">{tc.name}</div>
                <div className="text-sm opacity-90">{t("market.pickNow")}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 最近浏览 */}
      {recent.length > 0 && (
        <section>
          <div className="section-title">
            <span className="st-text">{t("market.recentView")}</span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {recent.map((p, i) => (
              <div key={p.id} className="!w-44 shrink-0">
                <Reveal delay={i * 40}>
                  <CardItem p={p as ProductOut} />
                </Reveal>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 精选好物 + 筛选 */}
      <section>
        <div className="section-title">
          <span className="st-text">{cat ? cats.find((c) => c.id === cat)?.name : t("market.featured")}</span>
        </div>
        <div className="bg-white border border-[#EEF0F3] rounded-2xl p-4 mb-3 flex gap-3 flex-wrap items-center">
          <AutoComplete
            placeholder={t("market.searchPlaceholder")}
            allowClear
            style={{ width: 280 }}
            value={kw}
            options={suggestions.map((s) => ({ value: s }))}
            onChange={(v) => setKw(v)}
            onSearch={(v) => {
              setKw(v);
              fetchSuggest(v);
            }}
            onSelect={(v) => doSearch(v)}
            onKeyDown={(e) => {
              if (e.key === "Enter") doSearch(kw);
            }}
          />
          <Select
            placeholder={t("market.allCats")}
            allowClear
            style={{ width: 140 }}
            value={cat}
            onChange={(v) => pickCat(v)}
            options={cats.map((c) => {
              const cnt = facets?.categories.find((f) => f.id === c.id)?.count;
              return { value: c.id, label: cnt != null ? `${c.name} (${cnt})` : c.name };
            })}
          />
          <Select
            placeholder={t("market.rating")}
            allowClear
            style={{ width: 140 }}
            value={rating ?? undefined}
            onChange={(v) => {
              setRating(v ?? null);
              setTimeout(load, 0);
            }}
            options={[
              { value: 4.5, label: "4.5★+" },
              { value: 4, label: "4★+" },
              { value: 3, label: "3★+" },
            ]}
          />
          <Select
            placeholder={t("market.sortDefault")}
            allowClear
            style={{ width: 140 }}
            value={sort}
            onChange={(v) => {
              setSort(v);
              setTimeout(load, 0);
            }}
            options={[
              { value: "price_asc", label: t("market.priceAsc") },
              { value: "price_desc", label: t("market.priceDesc") },
              { value: "sales", label: t("market.sortSales") },
              { value: "top_rating", label: t("market.sortRating") },
              { value: "newest", label: t("market.sortNewest") },
            ]}
          />
          <InputNumber placeholder={t("market.minPrice")} min={0} style={{ width: 100 }} value={minPrice} onChange={(v) => setMinPrice(v)} />
          <InputNumber placeholder={t("market.maxPrice")} min={0} style={{ width: 100 }} value={maxPrice} onChange={(v) => setMaxPrice(v)} />
          <span className="flex items-center gap-1 text-slate-500">
            {t("market.inStockOnly")}
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
            {t("market.query")}
          </Button>
          {(cat || kw || sort || minPrice || maxPrice || inStock) && (
            <Button
              onClick={() => {
                setCat(undefined);
                setKw("");
                setSort(undefined);
                setMinPrice(null);
                setMaxPrice(null);
                setInStock(false);
                setRating(null);
                setTimeout(load, 0);
              }}
            >
              {t("common.reset")}
            </Button>
          )}
        </div>

        {/* 热搜 + 历史 */}
        {(hot.length > 0 || history.length > 0) && (
          <div className="flex flex-wrap items-center gap-2 mb-5 text-sm">
            {hot.length > 0 && (
              <Space size={[6, 6]} wrap>
                <span className="text-slate-400">{t("market.hotSearch")}</span>
                {hot.map((h) => (
                  <Tag
                    key={h}
                    color="volcano"
                    style={{ cursor: "pointer" }}
                    onClick={() => doSearch(h)}
                  >
                    {h}
                  </Tag>
                ))}
              </Space>
            )}
            {history.length > 0 && (
              <Space size={[6, 6]} wrap>
                <span className="text-slate-400">{t("market.searchHistory")}</span>
                {history.map((h) => (
                  <Tag
                    key={h}
                    style={{ cursor: "pointer", background: "#f1f5f9" }}
                    closable
                    onClose={(e) => {
                      e.preventDefault();
                      const next = history.filter((x) => x !== h);
                      setHistory(next);
                      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
                    }}
                    onClick={() => doSearch(h)}
                  >
                    {h}
                  </Tag>
                ))}
                <Button type="link" size="small" onClick={clearHistory}>
                  {t("common.clear")}
                </Button>
              </Space>
            )}
          </div>
        )}
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
          <Empty className="py-20" description={t("market.noProducts")} />
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
