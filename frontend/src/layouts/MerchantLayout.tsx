import { Link, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../store/auth";
import { useI18n } from "../i18n";
import {
  LayoutDashboard,
  Package,
  Boxes,
  Star,
  Tag,
  Ticket,
  ArrowLeft,
  User,
  LogOut,
  Languages,
  TrendingUp,
} from "lucide-react";

const MENU = [
  { key: "dashboard", labelKey: "nav.dashboard", path: "/merchant", icon: <LayoutDashboard size={18} /> },
  { key: "products", labelKey: "nav.products", path: "/merchant/products", icon: <Package size={18} /> },
  { key: "inventory", labelKey: "nav.inventory", path: "/merchant/inventory", icon: <Boxes size={18} /> },
  { key: "reviews", labelKey: "nav.reviews", path: "/merchant/reviews", icon: <Star size={18} /> },
  { key: "promotions", labelKey: "nav.merchantPromotions", path: "/merchant/promotions", icon: <Tag size={18} /> },
  { key: "coupons", labelKey: "nav.merchantCoupons", path: "/merchant/coupons", icon: <Ticket size={18} /> },
  { key: "trend", labelKey: "nav.trend", path: "/merchant/trend", icon: <TrendingUp size={18} /> },
];

const MOBILE_NAV = [
  { key: "dashboard", labelKey: "nav.dashboard", path: "/merchant", icon: <LayoutDashboard size={20} /> },
  { key: "products", labelKey: "nav.products", path: "/merchant/products", icon: <Package size={20} /> },
  { key: "inventory", labelKey: "nav.inventory", path: "/merchant/inventory", icon: <Boxes size={20} /> },
  { key: "reviews", labelKey: "nav.reviews", path: "/merchant/reviews", icon: <Star size={20} /> },
  { key: "promotions", labelKey: "nav.merchantPromotions", path: "/merchant/promotions", icon: <Tag size={20} /> },
  { key: "trend", labelKey: "nav.trend", path: "/merchant/trend", icon: <TrendingUp size={20} /> },
];

export default function MerchantLayout() {
  const { user, logout } = useAuth();
  const { t, lang, setLang } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50">
      <aside className="hidden md:flex w-60 shrink-0 bg-white border-r border-slate-100 flex-col">
        <Link to="/" className="h-16 flex items-center gap-2 px-5 border-b border-slate-100">
          <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white font-bold">
            C
          </span>
          <span className="font-bold">{t("nav.brand")} · {t("nav.shops")}</span>
        </Link>
        <nav className="flex-1 p-3 space-y-1">
          {MENU.map((m) => (
            <Link
              key={m.key}
              to={m.path}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-slate-600 hover:bg-slate-100"
            >
              {m.icon}
              {t(m.labelKey)}
            </Link>
          ))}
        </nav>
        <Link
          to="/"
          className="m-3 flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm text-slate-500 hover:bg-slate-100"
        >
          <ArrowLeft size={18} /> {t("nav.home")}
        </Link>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 flex items-center gap-3 px-4 bg-white border-b border-slate-100 sticky top-0 z-20">
          <span className="font-bold md:hidden">{t("nav.shops")}</span>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setLang(lang === "zh" ? "en" : "zh")}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-sm text-slate-600 hover:bg-slate-100"
              title={t("nav.language")}
            >
              <Languages size={16} />
              {lang === "zh" ? "EN" : "中"}
            </button>
            <div className="flex items-center gap-2 px-2.5 py-1.5">
              <span className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-medium">
                {(user?.username || "M").slice(0, 1).toUpperCase()}
              </span>
              <span className="text-sm font-medium hidden sm:block">{user?.username}</span>
            </div>
            <button
              onClick={() => logout()}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-sm text-rose-600 hover:bg-rose-50"
            >
              <LogOut size={16} /> <span className="hidden sm:inline">{t("nav.logout")}</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 pb-24 md:pb-6"><Outlet /></main>
      </div>

      {/* 移动端底部导航 */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur border-t border-slate-100 grid grid-cols-6">
        {MOBILE_NAV.map((m) => (
          <Link
            key={m.key}
            to={m.path}
            className={`flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] ${
              isActive(m.path) ? "text-indigo-600" : "text-slate-500"
            }`}
          >
            {m.icon}
            {t(m.labelKey)}
          </Link>
        ))}
      </nav>
    </div>
  );
}
