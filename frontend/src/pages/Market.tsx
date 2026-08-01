import { useEffect, useMemo, useRef, useState, useCallback, memo } from "react";
import type { ReactNode } from "react";
import type { AxiosError } from "axios";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Carousel, Card, Button, Row, Col, Empty, Result, Tag, message, Select, Switch, InputNumber, Rate, Space, AutoComplete } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { Search, Sparkles, Flame, Zap, ShoppingBag, Clock, Store, Gift, TrendingUp, Tag as TagIcon } from "lucide-react";
import {
  listProducts,
  listCategories,
  recommendations,
  getBanners,
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
  getErrorMessage,
} from "../api";
import { useI18n, translate } from "../i18n";
import { money, parseTime } from "../utils/format";
import ProductImage from "../components/ProductImage";
import ProductCard from "../components/ProductCard";
import ProductGrid from "../components/ProductGrid";
import Reveal from "../components/Reveal";
import ProductPrice from "../components/ProductPrice";
import { useFlashList } from "../context/FlashPriceContext";

function FlashCountdown({ endAt }: { endAt?: string | null }) {
  const [left, setLeft] = useState("");
  const { t } = useI18n();
  useEffect(() => {
    if (!endAt) return;
    const tick = () => {
      const diff = (parseTime(endAt)?.getTime() ?? 0) - Date.now();
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

/* ---------- 抽取的可复用 / 可记忆子组件（v6：模块化 + 缩小重渲染范围） ---------- */

const QuickEntry = memo(function QuickEntry({ labelKey, icon, onGo }: { labelKey: string; icon: ReactNode; onGo: () => void }) {
  const { t } = useI18n();
  return (
    <button
      onClick={onGo}
      className="card-soft card-lift flex items-center gap-4 p-5 min-h-[92px] hover:border-[#4F46E5]"
    >
      <span className="glow-icon shrink-0" style={{ width: 50, height: 50, fontSize: 24 }}>
        {icon}
      </span>
      <span className="font-semibold text-slate-800 text-[15px] leading-tight">{t(labelKey)}</span>
    </button>
  );
});

const CouponCard = memo(function CouponCard({ c, onClaim }: { c: CouponOut; onClaim: (c: CouponOut) => void }) {
  const { t } = useI18n();
  const isDiscount = c.type === "discount";
  const bigText = isDiscount
    ? `${(Number(c.value) * 10).toFixed(1)}${t("membership.zhe")}`
    : `¥${c.value}`;
  const subText = isDiscount
    ? translate("coupon.noThresholdDiscount")
    : translate("coupon.thresholdHint").replace("{threshold}", c.threshold);
  return (
    <div className="w-64 shrink-0 flex rounded-2xl overflow-hidden border border-slate-100 shadow-sm bg-white">
      <div
        className="w-28 px-2 py-3 flex flex-col items-center justify-center text-white shrink-0"
        style={{ background: "#4F46E5" }}
      >
        <div className="text-xl font-bold leading-tight whitespace-nowrap">{bigText}</div>
        <div className="text-[10px] opacity-90 mt-1 text-center leading-tight px-1">{subText}</div>
      </div>
      <div className="flex-1 min-w-0 px-3 py-3 flex flex-col justify-between">
        <div className="text-sm font-semibold text-slate-800 truncate" title={c.name}>
          {c.name}
        </div>
        <div className="flex items-center justify-between mt-2">
          <Tag color="blue" className="!m-0">
            {isDiscount ? translate("coupon.type.discount") : translate("coupon.type.full_reduce")}
          </Tag>
          <Button type="primary" size="small" onClick={() => onClaim(c)}>
            {t("coupon.receive")}
          </Button>
        </div>
      </div>
    </div>
  );
});

const ProductLeaderboard = memo(function ProductLeaderboard({
  titleKey,
  icon,
  data,
  boardKey,
  onOpen,
}: {
  titleKey: string;
  icon: ReactNode;
  data: ProductOut[];
  boardKey: string;
  onOpen: (id: string) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="card-soft p-4">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <span className="font-bold">{t(titleKey)}</span>
        <span className="ml-auto text-xs text-slate-400">{t("market.topPrefix")} {data.length}</span>
      </div>
      <div className="space-y-2">
        {data.map((p, i) => (
          <div
            key={p.id}
            onClick={() => onOpen(p.id)}
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
              <ProductPrice p={p} showTag={false} className="text-[#4F46E5] font-bold text-sm" />
            </div>
            {boardKey === "sales" ? (
              <span className="text-xs text-slate-400">{t("market.sold")} {p.sales_count}</span>
            ) : boardKey === "rating" ? (
              <Rate disabled value={5} style={{ fontSize: 12 }} />
            ) : boardKey === "new" ? (
              <Tag color="magenta" className="ml-1">{t("market.newArrival")}</Tag>
            ) : (
              <Tag color="green" className="ml-1">{t("market.greatValue")}</Tag>
            )}
          </div>
        ))}
      </div>
    </div>
  );
});

const ShopCard = memo(function ShopCard({
  s,
  onOpen,
}: {
  s: { id: string; name: string; product_count: number };
  onOpen: (id: string) => void;
}) {
  const { t } = useI18n();
  return (
    <Card hoverable className="soft-card" onClick={() => onOpen(s.id)}>
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
  );
});

export default function Market() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useI18n();
  const SORT_LABEL: Record<string, string> = {
    price_asc: t("market.priceAsc"),
    price_desc: t("market.priceDesc"),
    sales: t("market.sortSales"),
    top_rating: t("market.sortRating"),
    newest: t("market.sortNewest"),
  };
  const [items, setItems] = useState<ProductOut[]>([]);
  const [cats, setCats] = useState<CategoryOut[]>([]);
  const [banners, setBanners] = useState<BannerOut[]>([]);
  const promos = useFlashList();
  const [shops, setShops] = useState<{ id: string; name: string; product_count: number }[]>([]);
  const [topSales, setTopSales] = useState<ProductOut[]>([]);
  const [topRating, setTopRating] = useState<ProductOut[]>([]);
  const [topNew, setTopNew] = useState<ProductOut[]>([]);
  const [topPrice, setTopPrice] = useState<ProductOut[]>([]);
  // T19：类目内榜单（仅进入"按分类浏览"模式时加载与展示，复用 listProducts 的 category_id + sort）
  const [catTop, setCatTop] = useState<{
    sales: ProductOut[];
    rating: ProductOut[];
    new: ProductOut[];
  }>({ sales: [], rating: [], new: [] });
  const [kw, setKw] = useState(searchParams.get("kw") || "");
  const [cat, setCat] = useState<string | undefined>(searchParams.get("category") || undefined);
  // 处于"按分类浏览"模式时（从 AI 首页/分类入口进入），隐藏首页式元素（轮播/快捷入口/榜单/推荐），
  // 只保留筛选与商品列表，让类目页在观感上明显区别于首页，避免用户误以为"还是首页"。
  const browsingCategory = Boolean(cat);
  const [sort, setSort] = useState<string | undefined>();
  const [minPrice, setMinPrice] = useState<number | null>(null);
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [inStock, setInStock] = useState(false);
  const [loading, setLoading] = useState(false);
  // 列表加载失败必须区别于"没有搜到商品"：错误态给出原因 + 重试，避免用户误以为无货
  const [listError, setListError] = useState<string | null>(null);
  const [recs, setRecs] = useState<ProductOut[]>([]);
  const [hot, setHot] = useState<string[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [coupons, setCoupons] = useState<CouponOut[]>([]);
  const [recent, setRecent] = useState<ProductOut[]>([]);
  const [rating, setRating] = useState<number | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [facets, setFacets] = useState<Facets | null>(null);
  // 模块化 / 重渲染优化（v6）：固化稳定引用，使上方 memo 子组件仅在自身 props 变化时才重渲染
  const openProduct = useCallback((id: string) => navigate(`/products/${id}`), [navigate]);
  const openShop = useCallback((id: string) => navigate(`/shops/${id}`), [navigate]);
  const handleClaim = useCallback(
    async (c: CouponOut) => {
      try {
        await claimCoupon(c.id);
        message.success(t("coupon.claimSuccess"));
        setCoupons((s) => s.filter((x) => x.id !== c.id));
      } catch (e) {
        const err = e as AxiosError<ApiError>;
        message.error(err.response?.data?.detail || t("coupon.claimFail"));
      }
    },
    [t],
  );
  const quickEntries = useMemo(
    () => [
      { labelKey: "market.quick.coupon", icon: <Gift size={22} />, go: () => navigate("/coupons") },
      { labelKey: "market.quick.shop", icon: <Store size={22} />, go: () => navigate("/shops") },
      { labelKey: "market.quick.points", icon: <Sparkles size={22} />, go: () => navigate("/points") },
      { labelKey: "market.quick.fav", icon: <ShoppingBag size={22} />, go: () => navigate("/favorites") },
    ],
    [navigate],
  );
  const boards = useMemo(
    () => [
      { titleKey: "market.topSales", icon: <Flame size={16} className="text-rose-500" />, data: topSales, key: "sales" },
      { titleKey: "market.topRating", icon: <TrendingUp size={16} className="text-[#4F46E5]" />, data: topRating, key: "rating" },
      { titleKey: "market.topNew", icon: <Sparkles size={16} className="text-fuchsia-500" />, data: topNew, key: "new" },
      { titleKey: "market.topPrice", icon: <TagIcon size={16} className="text-emerald-500" />, data: topPrice, key: "price" },
    ],
    [topSales, topRating, topNew, topPrice],
  );
  // 商品列表区锚点，点击分类时平滑滚动到此以便用户看到筛选结果（UX 修复）
  const productSectionRef = useRef<HTMLElement | null>(null);
  // 以 ref 持有最新筛选条件，保证 setX + setTimeout(load, 0) 读取到最新值（P1-6 分面检索）
  const filterRef = useRef({ kw, cat, sort, minPrice, maxPrice, inStock, rating, page: 1 });
  useEffect(() => {
    filterRef.current = { kw, cat, sort, minPrice, maxPrice, inStock, rating, page: 1 };
  });
  // 兼容通过 /market?kw= 或 /market?category= 进入时加载对应筛选结果。
  // 以 searchParams 为唯一驱动：只要 URL 上带了 kw/category，就强制以其值加载，
  // 不再依赖"是否与当前 state 不同"的判断——避免 state 已同步时漏触发 load。
  useEffect(() => {
    const k = searchParams.get("kw");
    const c = searchParams.get("category");
    if (!k && !c) return;
    // 同步 UI 状态（分类下拉框高亮、搜索框预填）
    setKw(k ?? "");
    setCat(c ?? undefined);
    setSort(undefined);
    // T19：进入分类浏览模式时同步加载类目内榜单
    loadCatBoards(c ?? undefined);
    // 同步筛选快照并立即加载，确保拿到对应类目商品
    const snapshot = {
      kw: k ?? "",
      cat: (c ?? undefined) as string | undefined,
      sort: undefined,
      minPrice: null,
      maxPrice: null,
      inStock: false,
      rating: null,
      page: 1,
    };
    filterRef.current = snapshot;
    // 用函数体内固定快照直接加载，避免读取 ref 时序问题
    (async () => {
      setLoading(true);
      setListError(null);
      try {
        const data = await listProducts({
          keyword: snapshot.kw || undefined,
          category_id: snapshot.cat,
          sort: snapshot.sort,
          min_price: undefined,
          max_price: undefined,
          min_rating: undefined,
          in_stock: false,
          page: 1,
          page_size: 20,
        });
        setItems(data);
      } catch (e) {
        setListError(getErrorMessage(e));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

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

  const load = async () => {
    const f = filterRef.current;
    setLoading(true);
    setListError(null);
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
    } catch (e) {
      setListError(getErrorMessage(e));
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
    // L5：关键首屏数据加载失败不再静默吞掉，至少打印错误日志以便排查。
    // 多个请求并行，仅以单条 toast 提示用户，避免连发多条打扰。
    let loadError = false;
    const onLoadFail = (label: string) => (e: unknown) => {
      console.error(`[Market] ${label} 加载失败`, e);
      loadError = true;
    };
    Promise.allSettled([
      listCategories().then(setCats).catch(onLoadFail("categories")),
      recommendations().then(setRecs).catch(onLoadFail("recommendations")),
      getBanners().then(setBanners).catch(onLoadFail("banners")),
      listShops().then(setShops).catch(onLoadFail("shops")),
      listProducts({ sort: "sales", page_size: 6 }).then(setTopSales).catch(onLoadFail("topSales")),
      listProducts({ sort: "top_rating", page_size: 6 }).then(setTopRating).catch(onLoadFail("topRating")),
      listProducts({ sort: "newest", page_size: 6 }).then(setTopNew).catch(onLoadFail("topNew")),
      listProducts({ sort: "price_asc", page_size: 6 }).then(setTopPrice).catch(onLoadFail("topPrice")),
      listCoupons().then(setCoupons).catch(onLoadFail("coupons")),
      searchFacets().then(setFacets).catch(onLoadFail("facets")),
    ]).then(() => {
      if (loadError) message.error(t("home.loadFailed") || "部分内容加载失败，请稍后刷新");
    });
    try {
      const r = JSON.parse(localStorage.getItem("browse_history") || "[]");
      if (Array.isArray(r)) setRecent(r.slice(0, 12));
    } catch {
      /* 忽略 */
    }
  }, []);

  const pickCat = (id?: string) => {
    setCat(id);
    loadCatBoards(id);
    setTimeout(() => {
      load();
      productSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  };

  // T19：按当前分类加载类目内榜单（销量/好评/新品），独立于全局榜单，进入分类浏览时调用
  const loadCatBoards = useCallback(
    async (catId?: string) => {
      if (!catId) {
        setCatTop({ sales: [], rating: [], new: [] });
        return;
      }
      const fetchOne = (sort: string, setter: (v: ProductOut[]) => void) =>
        listProducts({ category_id: catId, sort, page_size: 5 })
          .then(setter)
          .catch(() => {});
      fetchOne("sales", (v) => setCatTop((s) => ({ ...s, sales: v })));
      fetchOne("top_rating", (v) => setCatTop((s) => ({ ...s, rating: v })));
      fetchOne("newest", (v) => setCatTop((s) => ({ ...s, new: v })));
    },
    [],
  );

  const goBanner = (b: BannerOut) => {
    if (b.link_type === "product" && b.link_id) navigate(`/products/${b.link_id}`);
    else if (b.link_type === "shop" && b.link_id) navigate(`/shops/${b.link_id}`);
    else if (b.link_type === "category" && b.link_id) pickCat(b.link_id);
    else if (b.link_url) {
      const url = b.link_url.trim();
      // 仅允许 http(s) 外链，阻止 javascript: 等危险协议与开放重定向（P0-M10）
      if (/^https?:\/\//i.test(url)) {
        window.open(url, "_blank", "noopener,noreferrer");
      } else {
        message.warning(t("banner.unsafeLink") ?? "不支持的链接");
      }
    }
  };

  return (
    <div className="page-shell stack-lg py-8">
      {/* T19：分类浏览模式下的面包屑：首页 > 全部分类 > 当前类目，点击可回退 */}
      {browsingCategory && (
        <nav aria-label={t("market.breadcrumbAll")} className="flex items-center gap-2 text-sm text-slate-500">
          <button className="hover:text-[#4F46E5]" onClick={() => { navigate("/"); pickCat(undefined); }}>
            {t("market.breadcrumbHome")}
          </button>
          <span>/</span>
          <button className="hover:text-[#4F46E5]" onClick={() => pickCat(undefined)}>
            {t("market.breadcrumbAll")}
          </button>
          <span>/</span>
          <span className="text-slate-800 font-medium">
            {cats.find((c) => c.id === cat)?.name ?? cat}
          </span>
        </nav>
      )}

      {/* 轮播 Banner（放大 + 柔和叠层）
          走 ProductImage：可代理外链、加载失败自动回退到 lucide 图标+渐变+标题，
          避免出现“只有 alt 文字 / 空白块”的情况。 */}
      {!browsingCategory && banners.length > 0 && (
        <Carousel autoplay className="hero-shell" dots>
          {banners.map((b) => (
            <div key={b.id} onClick={() => goBanner(b)} className="cursor-pointer">
              <div className="relative h-[240px] md:h-[340px]">
                <ProductImage
                  name={b.title}
                  image_url={b.image_url}
                  height="100%"
                  rounded={0}
                  className="absolute inset-0 w-full h-full"
                />
                <div className="absolute left-6 bottom-6 z-10">
                  <div className="hero-caption max-w-md">{b.title}</div>
                </div>
              </div>
            </div>
          ))}
        </Carousel>
      )}

      {/* 快捷入口 */}
      {!browsingCategory && (
      <section className="grid grid-cols-2 md:grid-cols-4 gap-5">
        {quickEntries.map((q) => (
          <QuickEntry key={q.labelKey} labelKey={q.labelKey} icon={q.icon} onGo={q.go} />
        ))}
      </section>
      )}

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
          <div className="rail-scroll">
            {coupons.map((c) => (
              <CouponCard key={c.id} c={c} onClaim={handleClaim} />
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
          <div className="rail-scroll">
            {promos.map((pr) => (
              <div
                key={pr.id}
                onClick={() => pr.product_id && navigate(`/products/${pr.product_id}`)}
                className="!w-40 shrink-0 bg-white rounded-xl p-2 cursor-pointer hover:shadow"
              >
                <ProductImage name={pr.product_name || t("market.flash")} image_url={pr.product_image || ""} height={120} rounded={8} />
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

      {/* 多榜单：热销榜 / 好评榜 / 新品榜 / 低价好物榜 */}
      {!browsingCategory && (
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {boards.map((board) => (
          <ProductLeaderboard
            key={board.key}
            titleKey={board.titleKey}
            icon={board.icon}
            data={board.data}
            boardKey={board.key}
            onOpen={openProduct}
          />
        ))}
      </section>
      )}

      {/* T19：类目内榜单（仅分类浏览模式展示，区别于全局榜单）。
          标题取当前类目名，三榜复用 ProductLeaderboard，数据来自 loadCatBoards。 */}
      {browsingCategory && (
        <section>
          <div className="section-title">
            <span className="st-text">{t("market.catBoardTitle", { name: cats.find((c) => c.id === cat)?.name ?? cat })}</span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <ProductLeaderboard
              titleKey="market.catTopSales"
              icon={<Flame size={16} className="text-rose-500" />}
              data={catTop.sales}
              boardKey="cat-sales"
              onOpen={openProduct}
            />
            <ProductLeaderboard
              titleKey="market.catTopRating"
              icon={<TrendingUp size={16} className="text-amber-500" />}
              data={catTop.rating}
              boardKey="cat-rating"
              onOpen={openProduct}
            />
            <ProductLeaderboard
              titleKey="market.catTopNew"
              icon={<Zap size={16} className="text-emerald-500" />}
              data={catTop.new}
              boardKey="cat-new"
              onOpen={openProduct}
            />
          </div>
        </section>
      )}

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
              <ShopCard key={s.id} s={s} onOpen={openShop} />
            ))}
          </div>
        </section>
      )}

      {/* 猜你喜欢 */}
      {!browsingCategory && recs.length > 0 && (
        <section>
          <div className="section-title">
            <span className="st-text">{t("market.guessYouLike")}</span>
            <Tag color="purple">{t("market.aiRec")}</Tag>
          </div>
          <div className="rail-scroll">
            {recs.map((p, i) => (
              <div key={p.id} className="!w-44 shrink-0">
                <Reveal delay={i * 50}>
                  <ProductCard p={p} />
                </Reveal>
              </div>
            ))}
          </div>
        </section>
      )}


      {/* 最近浏览 */}
      {recent.length > 0 && (
        <section>
          <div className="section-title">
            <span className="st-text">{t("market.recentView")}</span>
          </div>
          <div className="rail-scroll">
            {recent.map((p, i) => (
              <div key={p.id} className="!w-44 shrink-0">
                <Reveal delay={i * 40}>
                  <ProductCard p={p as ProductOut} />
                </Reveal>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 精选好物 + 筛选 */}
      <section ref={productSectionRef}>
        <div className="section-title">
          <span className="st-text">{cat ? cats.find((c) => c.id === cat)?.name : t("market.featured")}</span>
        </div>
        <div className="card-soft p-4 mb-4 flex gap-3 flex-wrap items-center">
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
          {(cat || kw || sort || minPrice || maxPrice || inStock || rating) && (
            <div className="w-full flex flex-wrap items-center gap-2 text-sm">
              <span className="text-slate-400">{t("market.selectedFilters")}</span>
              <Space size={[6, 6]} wrap>
                {kw && (
                  <Tag
                    closable
                    onClose={(e) => {
                      e.preventDefault();
                      setKw("");
                      setTimeout(load, 0);
                    }}
                  >
                    {t("market.chipKeyword")}: {kw}
                  </Tag>
                )}
                {cat && (
                  <Tag
                    closable
                    onClose={(e) => {
                      e.preventDefault();
                      setCat(undefined);
                      setTimeout(load, 0);
                    }}
                  >
                    {t("market.chipCategory")}: {cats.find((c) => c.id === cat)?.name}
                  </Tag>
                )}
                {rating != null && (
                  <Tag
                    closable
                    onClose={(e) => {
                      e.preventDefault();
                      setRating(null);
                      setTimeout(load, 0);
                    }}
                  >
                    {t("market.chipRating")}: {rating}★
                  </Tag>
                )}
                {sort && (
                  <Tag
                    closable
                    onClose={(e) => {
                      e.preventDefault();
                      setSort(undefined);
                      setTimeout(load, 0);
                    }}
                  >
                    {t("market.chipSort")}: {SORT_LABEL[sort]}
                  </Tag>
                )}
                {(minPrice != null || maxPrice != null) && (
                  <Tag
                    closable
                    onClose={(e) => {
                      e.preventDefault();
                      setMinPrice(null);
                      setMaxPrice(null);
                      setTimeout(load, 0);
                    }}
                  >
                    {t("market.chipPrice")}: ¥{minPrice ?? 0}
                    {maxPrice != null ? `-¥${maxPrice}` : "+"}
                  </Tag>
                )}
                {inStock && (
                  <Tag
                    closable
                    onClose={(e) => {
                      e.preventDefault();
                      setInStock(false);
                      setTimeout(load, 0);
                    }}
                  >
                    {t("market.chipInStock")}
                  </Tag>
                )}
                <Button
                  type="link"
                  size="small"
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
                  {t("market.clearAll")}
                </Button>
              </Space>
            </div>
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
          <Row gutter={[20, 20]}>
            {Array.from({ length: 8 }).map((_, i) => (
              <Col key={i} xs={24} sm={12} md={8} lg={6}>
                <div className="product-card overflow-hidden" style={{ padding: 0 }}>
                  <div className="skeleton-shimmer" style={{ height: 200 }} />
                  <div style={{ padding: 16, display: "grid", gap: 10 }}>
                    <div className="skeleton-shimmer" style={{ height: 14, width: "70%" }} />
                    <div className="skeleton-shimmer" style={{ height: 14, width: "40%" }} />
                    <div className="skeleton-shimmer" style={{ height: 36, width: "100%" }} />
                  </div>
                </div>
              </Col>
            ))}
          </Row>
        ) : listError ? (
          <Result
            status="warning"
            title={t("state.errorTitle")}
            subTitle={listError}
            extra={
              <Button type="primary" icon={<ReloadOutlined />} onClick={load}>
                {t("common.retry")}
              </Button>
            }
          />
        ) : items.length === 0 ? (
          <div className="py-16 text-center">
            <Empty description={t("market.noResult")} />
            <p className="text-slate-400 text-sm mt-2">{t("market.noResultHint")}</p>
            {hot.length > 0 && (
              <div className="mt-4 flex flex-wrap justify-center gap-2">
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
              </div>
            )}
          </div>
        ) : (
          <ProductGrid items={items} gutter={[20, 20]} xs={24} sm={12} md={8} lg={6} />
        )}
      </section>
    </div>
  );
}
