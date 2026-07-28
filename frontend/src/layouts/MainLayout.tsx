import { useState } from "react";
import { Link, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../store/auth";
import { useI18n } from "../i18n";
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
  Bell,
  User,
  LogOut,
  Languages,
  BookOpen,
  History,
  Radio,
} from "lucide-react";

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
  { key: "follow", labelKey: "nav.follow", path: "/follow", icon: <UserPlus size={16} /> },
  { key: "promotions", labelKey: "nav.promotions", path: "/promotions", icon: <Tag size={16} /> },
  { key: "live", labelKey: "nav.live", path: "/live", icon: <Radio size={16} /> },
  { key: "ai-mall", labelKey: "nav.aiHome", path: "/ai-mall", icon: <Sparkles size={16} /> },
  { key: "support", labelKey: "nav.support", path: "/support", icon: <MessageCircle size={16} /> },
];

// 移动端底部导航（仅展示高频入口）
const MOBILE_NAV = [
  { key: "market", labelKey: "nav.market", path: "/market", icon: <Store size={20} /> },
  { key: "cart", labelKey: "nav.cart", path: "/cart", icon: <ShoppingCart size={20} /> },
  { key: "notifications", labelKey: "nav.notifications", path: "/notifications", icon: <Bell size={20} /> },
  { key: "orders", labelKey: "nav.orders", path: "/orders", icon: <ShoppingBag size={20} /> },
  { key: "me", labelKey: "nav.profile", path: "/me", icon: <User size={20} /> },
  { key: "ai-mall", labelKey: "nav.aiHome", path: "/ai-mall", icon: <Sparkles size={20} /> },
];

export default function MainLayout() {
  const { user, logout } = useAuth();
  const { t, lang, setLang } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const go = (path: string) => navigate(path);
  const isActive = (path: string) => location.pathname === path;

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

          <nav className="hidden lg:flex items-center gap-1 flex-1 overflow-x-auto">
            {NAV.map((n) => (
              <button
                key={n.key}
                onClick={() => go(n.path)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition ${
                  isActive(n.path)
                    ? "bg-indigo-50 text-indigo-600 font-medium"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {n.icon}
                {t(n.labelKey)}
              </button>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setLang(lang === "zh" ? "en" : "zh")}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-sm text-slate-600 hover:bg-slate-100"
              title={t("nav.language")}
            >
              <Languages size={16} />
              {lang === "zh" ? "EN" : "中"}
            </button>

            {user ? (
              <div className="relative">
                <button
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
                    className="absolute right-0 mt-2 w-40 bg-white rounded-xl shadow-lg border border-slate-100 py-1 z-40"
                    onMouseLeave={() => setMenuOpen(false)}
                  >
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        go("/me");
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                    >
                      <User size={15} /> {t("nav.profile")}
                    </button>
                    <button
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

      <main id="main-content" tabIndex={-1} className="max-w-7xl mx-auto px-4 py-6 pb-24 lg:pb-6 outline-none"><Outlet /></main>

      {/* 移动端底部导航 */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur border-t border-slate-100 grid grid-cols-6">
        {MOBILE_NAV.map((n) => (
          <button
            key={n.key}
            onClick={() => go(n.path)}
            className={`flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] ${
              isActive(n.path) ? "text-indigo-600" : "text-slate-500"
            }`}
          >
            {n.icon}
            {t(n.labelKey)}
          </button>
        ))}
      </nav>
    </div>
  );
}
