import { useEffect, useRef, useState, useCallback } from "react";
import { Link, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../store/auth";
import { useCartCount } from "../store/cart";
import { useI18n } from "../i18n";
import { supportUnread } from "../api";
import {
  Store,
  Coins,
  ShoppingCart,
  ShoppingBag,
  Heart,
  Sparkles,
  Crown,
  Ticket,
  UserPlus,
  Tag,
  MessageCircle,
  User,
  LogOut,
  Languages,
  BookOpen,
  History,
  Radio,
  Receipt,
  Search,
  ChevronDown,
  Sun,
  Moon,
} from "lucide-react";
import { useTheme } from "../hooks/useTheme";

const NAV = [
  { key: "market", labelKey: "nav.market", path: "/market", icon: <Store size={16} /> },
  { key: "mall", labelKey: "nav.mall", path: "/mall", icon: <Coins size={16} /> },
  { key: "cart", labelKey: "nav.cart", path: "/cart", icon: <ShoppingCart size={16} /> },
  { key: "orders", labelKey: "nav.orders", path: "/orders", icon: <ShoppingBag size={16} /> },
  { key: "favorites", labelKey: "nav.favorites", path: "/favorites", icon: <Heart size={16} /> },
  { key: "points", labelKey: "nav.points", path: "/points", icon: <Sparkles size={16} /> },
  { key: "membership", labelKey: "nav.membership", path: "/membership", icon: <Crown size={16} /> },
  { key: "coupons", labelKey: "nav.coupons", path: "/coupons", icon: <Ticket size={16} /> },
  { key: "shops", labelKey: "nav.shops", path: "/shops", icon: <Store size={16} /> },
  { key: "discover", labelKey: "nav.discover", path: "/discover", icon: <BookOpen size={16} /> },
  { key: "history", labelKey: "nav.history", path: "/history", icon: <History size={16} /> },
  { key: "follow", labelKey: "nav.follow", path: "/following", icon: <UserPlus size={16} /> },
  { key: "promotions", labelKey: "nav.promotions", path: "/promotions", icon: <Tag size={16} /> },
  { key: "live", labelKey: "nav.live", path: "/live", icon: <Radio size={16} /> },
  { key: "presales", labelKey: "nav.presales", path: "/presales", icon: <Receipt size={16} /> },
  { key: "ai-mall", labelKey: "nav.aiHome", path: "/ai-mall", icon: <Sparkles size={16} /> },
  { key: "support", labelKey: "nav.support", path: "/support", icon: <MessageCircle size={16} /> },
];

// 高频入口常驻导航条（保留滑动下划线），其余收进「更多 ▾」下拉，避免横向滚动找
const PRIMARY_KEYS = ["market", "cart", "favorites", "orders"];
const PRIMARY_NAV = PRIMARY_KEYS.map((k) => NAV.find((n) => n.key === k)!).filter(Boolean);
const MORE_NAV = NAV.filter((n) => !PRIMARY_KEYS.includes(n.key));

// 「更多」里的 13 个入口按语义分 4 组，避免一长条平铺让用户逐行扫描
const MORE_GROUPS: { titleKey: string; keys: string[] }[] = [
  {
    titleKey: "nav.group.discover",
    keys: ["ai-mall", "shops", "discover", "live", "promotions", "presales"],
  },
  { titleKey: "nav.group.benefits", keys: ["membership", "points", "coupons", "mall"] },
  { titleKey: "nav.group.mine", keys: ["history", "follow"] },
  { titleKey: "nav.group.service", keys: ["support"] },
];
const GROUPED_MORE = MORE_GROUPS.map((g) => ({
  titleKey: g.titleKey,
  items: g.keys.map((k) => MORE_NAV.find((n) => n.key === k)!).filter(Boolean),
})).filter((g) => g.items.length > 0);
// 兜底：任何未被分组的入口仍要可达，避免新增导航项后被"吃掉"
const UNGROUPED_MORE = MORE_NAV.filter(
  (n) => !MORE_GROUPS.some((g) => g.keys.includes(n.key))
);

// 移动端底部导航：严格控制在 5 项，保证每个热区 ≥ 64px 宽，避免误触
// （通知入口收进「我的」页面，客服入口移到移动端顶栏）
const MOBILE_NAV = [
  { key: "market", labelKey: "nav.market", path: "/market", icon: <Store size={20} /> },
  { key: "ai-mall", labelKey: "nav.aiHome", path: "/ai-mall", icon: <Sparkles size={20} /> },
  { key: "cart", labelKey: "nav.cart", path: "/cart", icon: <ShoppingCart size={20} /> },
  { key: "orders", labelKey: "nav.orders", path: "/orders", icon: <ShoppingBag size={20} /> },
  { key: "me", labelKey: "nav.profile", path: "/me", icon: <User size={20} /> },
];

export default function MainLayout() {
  const { user, logout } = useAuth();
  const { t, lang, setLang } = useI18n();
  const { isDark, toggleTheme } = useTheme();
  const cartCount = useCartCount();
  const navigate = useNavigate();
  const location = useLocation();
  // T20：加购时角标 bump 动效（cartCount 变化触发一次）
  const [cartBump, setCartBump] = useState(false);
  const prevCart = useRef(cartCount);
  useEffect(() => {
    if (cartCount > prevCart.current) {
      setCartBump(true);
      const id = setTimeout(() => setCartBump(false), 450);
      prevCart.current = cartCount;
      return () => clearTimeout(id);
    }
    prevCart.current = cartCount;
  }, [cartCount]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [headerKw, setHeaderKw] = useState("");
  const [unread, setUnread] = useState(0);

  // 客服工单未读红点：进入页面时拉取，并随路由切换/定时刷新
  useEffect(() => {
    let alive = true;
    const fetchUnread = async () => {
      if (!user) {
        setUnread(0);
        return;
      }
      try {
        const r = await supportUnread();
        if (alive) setUnread(r.unread);
      } catch {
        /* 忽略 */
      }
    };
    fetchUnread();
    const timer = setInterval(fetchUnread, 20000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [user, location.pathname]);

  const go = (path: string) => navigate(path);
  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + "/");

  // 全局滑动下划线：测量当前 active 按钮位置，平滑滑动到其下方
  const navRef = useRef<HTMLDivElement>(null);
  const [indStyle, setIndStyle] = useState<{ left: number; width: number } | null>(null);
  const updateIndicator = useCallback(() => {
    const el = navRef.current;
    if (!el) return;
    const activeBtn = el.querySelector<HTMLElement>('button[data-active="true"]');
    if (activeBtn) setIndStyle({ left: activeBtn.offsetLeft, width: activeBtn.offsetWidth });
    else setIndStyle(null);
  }, []);
  useEffect(() => {
    updateIndicator();
  }, [location.pathname, updateIndicator]);
  useEffect(() => {
    window.addEventListener("resize", updateIndicator);
    return () => window.removeEventListener("resize", updateIndicator);
  }, [updateIndicator]);

  // 「更多 ▾」下拉：仅展示非高频入口，点击外部自动收起
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const moreActive = MORE_NAV.some((n) => isActive(n.path));
  useEffect(() => {
    if (!moreOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [moreOpen]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center gap-4">
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white font-bold">
              C
            </span>
            <span className="font-bold text-lg hidden sm:block">{t("nav.brand")}</span>
          </Link>

          <div className="hidden lg:flex items-center gap-1 flex-1 min-w-0">
            <nav
              ref={navRef}
              aria-label={t("nav.primaryNav")}
              className="relative flex items-center gap-1 min-w-0 overflow-x-auto flex-1"
            >
              {PRIMARY_NAV.map((n) => {
                const active = isActive(n.path);
                return (
                  <button
                    key={n.key}
                    data-active={active}
                    aria-current={active ? "page" : undefined}
                    aria-label={t(n.labelKey)}
                    onClick={() => go(n.path)}
                    className={`relative shrink-0 whitespace-nowrap flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition ${
                      active
                        ? "text-indigo-600 font-medium"
                        : "text-slate-600 hover:text-indigo-600 hover:bg-slate-100"
                    }`}
                  >
                    <span className="relative inline-flex">
                      {n.icon}
                      {n.key === "support" && unread > 0 && (
                        <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-rose-500" />
                      )}
                      {n.key === "cart" && cartCount > 0 && (
                        <span className={`absolute -top-2 -right-2 min-w-4 h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] leading-4 text-center ${cartBump ? "cart-bump" : ""}`}>
                          {cartCount > 99 ? "99+" : cartCount}
                        </span>
                      )}
                    </span>
                    {t(n.labelKey)}
                  </button>
                );
              })}
              <span
                className="pointer-events-none absolute bottom-0 h-0.5 rounded-full bg-indigo-500 transition-all duration-300 ease-out"
                style={
                  indStyle
                    ? { left: indStyle.left, width: indStyle.width, opacity: 1 }
                    : { left: 0, width: 0, opacity: 0 }
                }
              />
            </nav>
            <div className="relative shrink-0" ref={moreRef}>
              <button
                aria-haspopup="menu"
                aria-expanded={moreOpen}
                aria-label={t("nav.more")}
                onClick={() => setMoreOpen((v) => !v)}
                className={`flex items-center gap-1 px-3 py-2 rounded-lg text-sm transition ${
                  moreActive
                    ? "text-indigo-600 font-medium bg-indigo-50"
                    : "text-slate-600 hover:text-indigo-600 hover:bg-slate-100"
                }`}
              >
                {t("nav.more")}
                <ChevronDown size={14} />
              </button>
              {moreOpen && (
                <div
                  role="menu"
                  aria-label={t("nav.more")}
                  className="absolute right-0 top-full mt-2 w-60 max-h-[26rem] overflow-y-auto rounded-xl bg-white shadow-lg border border-slate-100 py-1.5 z-50"
                >
                  {[
                    ...GROUPED_MORE,
                    ...(UNGROUPED_MORE.length
                      ? [{ titleKey: "nav.more", items: UNGROUPED_MORE }]
                      : []),
                  ].map((group) => (
                    <div key={group.titleKey} className="py-0.5">
                      <div className="px-4 pt-1.5 pb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                        {t(group.titleKey)}
                      </div>
                      {group.items.map((n) => {
                        const a = isActive(n.path);
                        return (
                          <button
                            key={n.key}
                            role="menuitem"
                            aria-current={a ? "page" : undefined}
                            onClick={() => {
                              go(n.path);
                              setMoreOpen(false);
                            }}
                            className={`w-full flex items-center gap-2 px-4 py-2 text-sm text-left transition ${
                              a
                                ? "text-indigo-600 bg-indigo-50 font-medium"
                                : "text-slate-700 hover:bg-slate-50"
                            }`}
                          >
                            {n.icon}
                            <span className="flex-1">{t(n.labelKey)}</span>
                            {n.key === "support" && unread > 0 && (
                              <span className="w-2 h-2 rounded-full bg-rose-500" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 全局搜索框（对标 Amazon / 淘宝头顶部搜索）；移动端同样常驻，搜索是电商第一入口 */}
          <div className="flex items-center flex-1 min-w-0 md:max-w-md md:mx-4">
            <div className="relative w-full">
              <button
                onClick={() =>
                  headerKw.trim() && navigate(`/search?keyword=${encodeURIComponent(headerKw.trim())}`)
                }
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                aria-label={t("market.searchBox")}
              >
                <Search size={16} />
              </button>
              <input
                value={headerKw}
                onChange={(e) => setHeaderKw(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && headerKw.trim())
                    navigate(`/search?keyword=${encodeURIComponent(headerKw.trim())}`);
                }}
                placeholder={t("market.searchBox")}
                className="w-full pl-9 pr-3 py-2 rounded-full border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300"
              />
            </div>
          </div>

          <div className="ml-auto flex items-center gap-1 sm:gap-2 shrink-0">
            {/* 移动端底部导航只放 5 项，客服入口移到顶栏，未读时显示红点 */}
            <button
              onClick={() => go("/support")}
              className="lg:hidden relative p-2 rounded-lg text-slate-600 hover:bg-slate-100"
              aria-label={t("nav.support")}
            >
              <MessageCircle size={18} />
              {unread > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-rose-500" />
              )}
            </button>
            <button
              onClick={toggleTheme}
              aria-label={isDark ? t("theme.toLight") : t("theme.toDark")}
              aria-pressed={isDark}
              title={isDark ? t("theme.toLight") : t("theme.toDark")}
              className="flex items-center justify-center w-9 h-9 rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button
              onClick={() => setLang(lang === "zh" ? "en" : "zh")}
              aria-label={t("nav.language")}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-sm text-slate-600 hover:bg-slate-100"
              title={t("nav.language")}
            >
              <Languages size={16} />
              {lang === "zh" ? "EN" : "中"}
            </button>

            {user ? (
              <div className="relative">
                <button
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  aria-label={t("nav.profile")}
                  onClick={() => setMenuOpen((v) => !v)}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-100"
                >
                  <span className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-medium">
                    {user.username.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="hidden sm:block text-sm font-medium">{user.username}</span>
                </button>
                {menuOpen && (
                  <div
                    role="menu"
                    aria-label={t("nav.profile")}
                    className="absolute right-0 mt-2 w-40 bg-white rounded-xl shadow-lg border border-slate-100 py-1 z-40"
                    onMouseLeave={() => setMenuOpen(false)}
                  >
                    <button
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        go("/me");
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                    >
                      <User size={15} /> {t("nav.profile")}
                    </button>
                    <button
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        logout();
                        go("/");
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-rose-600 hover:bg-rose-50 flex items-center gap-2"
                    >
                      <LogOut size={15} /> {t("nav.logout")}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => go("/login")}
                className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
              >
                {t("nav.login")}
              </button>
            )}
          </div>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="max-w-7xl mx-auto px-4 py-8 pb-24 lg:pb-8 outline-none"><Outlet /></main>

      {/* 移动端底部导航 */}
      <nav
        aria-label={t("nav.mobileNav")}
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur border-t border-slate-100 grid grid-cols-5 pb-[env(safe-area-inset-bottom)]"
      >
        {MOBILE_NAV.map((n) => {
          const active = isActive(n.path);
          return (
          <button
            key={n.key}
            aria-current={active ? "page" : undefined}
            aria-label={t(n.labelKey)}
            onClick={() => go(n.path)}
            className={`flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] ${
              active ? "text-indigo-600" : "text-slate-500"
            }`}
          >
            <span className="relative inline-flex">
              {n.icon}
              {n.key === "cart" && cartCount > 0 && (
                <span className={`absolute -top-2 -right-2 min-w-4 h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] leading-4 text-center ${cartBump ? "cart-bump" : ""}`}>
                  {cartCount > 99 ? "99+" : cartCount}
                </span>
              )}
            </span>
            {t(n.labelKey)}
          </button>
          );
        })}
      </nav>
    </div>
  );
}
