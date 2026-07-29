import { Link, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../store/auth";
import { useI18n } from "../i18n";
import {
  BarChart3,
  Users,
  Package,
  Star,
  ShieldCheck,
  Activity,
  Ticket,
  Wallet,
  ArrowLeft,
  User,
  LogOut,
  Languages,
} from "lucide-react";

const MENU = [
  { key: "dashboard", labelKey: "nav.dashboard", path: "/admin", icon: <BarChart3 size={18} /> },
  { key: "users", labelKey: "page.admin.users", path: "/admin/users", icon: <Users size={18} /> },
  { key: "products", labelKey: "page.admin.products", path: "/admin/products", icon: <Package size={18} /> },
  { key: "reviews", labelKey: "page.admin.reviews", path: "/admin/reviews", icon: <Star size={18} /> },
  { key: "audit", labelKey: "page.admin.audit", path: "/admin/audit", icon: <ShieldCheck size={18} /> },
  { key: "auditDashboard", labelKey: "page.admin.auditDashboard", path: "/admin/audit-dashboard", icon: <Activity size={18} /> },
  { key: "coupons", labelKey: "page.admin.coupons", path: "/admin/coupons", icon: <Ticket size={18} /> },
  { key: "withdrawals", labelKey: "page.admin.withdrawals", path: "/admin/withdrawals", icon: <Wallet size={18} /> },
];

const MOBILE_NAV = [
  { key: "dashboard", labelKey: "nav.dashboard", path: "/admin", icon: <BarChart3 size={20} /> },
  { key: "users", labelKey: "page.admin.users", path: "/admin/users", icon: <Users size={20} /> },
  { key: "products", labelKey: "page.admin.products", path: "/admin/products", icon: <Package size={20} /> },
  { key: "reviews", labelKey: "page.admin.reviews", path: "/admin/reviews", icon: <Star size={20} /> },
  { key: "audit", labelKey: "page.admin.audit", path: "/admin/audit", icon: <ShieldCheck size={20} /> },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const { t, lang, setLang } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-slate-50">
      <aside className="hidden lg:flex w-60 shrink-0 bg-slate-900 text-slate-200 flex-col">
        <Link to="/" className="h-16 flex items-center gap-2 px-5 border-b border-white/10">
          <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white font-bold">
            C
          </span>
          <span className="font-bold text-white">{t("nav.brand")} · {t("nav.dashboard")}</span>
        </Link>
        <nav className="flex-1 p-3 space-y-1">
          {MENU.map((m) => (
            <Link
              key={m.key}
              to={m.path}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm ${
                isActive(m.path) ? "bg-white/10 text-white font-medium" : "text-slate-300 hover:bg-white/10"
              }`}
            >
              {m.icon}
              {t(m.labelKey)}
            </Link>
          ))}
        </nav>
        <Link
          to="/"
          className="m-3 flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm text-slate-400 hover:bg-white/10"
        >
          <ArrowLeft size={18} /> {t("nav.home")}
        </Link>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 flex items-center gap-3 px-4 bg-white border-b border-slate-100 sticky top-0 z-20">
          <span className="font-bold lg:hidden">{t("nav.dashboard")}</span>
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
                {(user?.username || "A").slice(0, 1).toUpperCase()}
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

        <main className="flex-1 p-6 lg:p-8 pb-24 lg:pb-8"><Outlet /></main>
      </div>

      {/* 移动端底部导航 */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur border-t border-slate-100 grid grid-cols-5">
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
