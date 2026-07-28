import { lazy, Suspense, useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Spin, message } from "antd";
import Login from "./pages/Auth/Login";
import ProtectedRoute from "./components/ProtectedRoute";
import MainLayout from "./layouts/MainLayout";
import MerchantLayout from "./layouts/MerchantLayout";
import AdminLayout from "./layouts/AdminLayout";
import Market from "./pages/Market";
import Notifications from "./pages/Notifications";
import { LanguageProvider } from "./i18n";
import { useAuth } from "./store/auth";

// S5：按路由懒加载，把买家二级页、商家后台、管理后台（含 recharts 等较重依赖）拆出首屏包体
const ProductDetail = lazy(() => import("./pages/ProductDetail"));
const Cart = lazy(() => import("./pages/Cart"));
const Orders = lazy(() => import("./pages/Orders"));
const OrderDetail = lazy(() => import("./pages/OrderDetail"));
const Favorites = lazy(() => import("./pages/Favorites"));
const Points = lazy(() => import("./pages/Points"));
const Me = lazy(() => import("./pages/Me"));
const Membership = lazy(() => import("./pages/Membership"));
const Pay = lazy(() => import("./pages/Pay"));
const Address = lazy(() => import("./pages/Address"));
const Coupons = lazy(() => import("./pages/Coupons"));
const Support = lazy(() => import("./pages/Support"));
const Shop = lazy(() => import("./pages/Shop"));
const Mall = lazy(() => import("./pages/Mall"));
const Promotions = lazy(() => import("./pages/Promotions"));
const Following = lazy(() => import("./pages/Following"));
const MerchantProducts = lazy(() => import("./pages/merchant/Products"));
const MerchantDashboard = lazy(() => import("./pages/merchant/Dashboard"));
const AdminDashboard = lazy(() => import("./pages/admin/Dashboard"));
const AdminUsers = lazy(() => import("./pages/admin/Users"));
const AdminProducts = lazy(() => import("./pages/admin/Products"));
const AdminReviews = lazy(() => import("./pages/admin/Reviews"));
const AdminAudit = lazy(() => import("./pages/admin/Audit"));
const AdminAuditDashboard = lazy(() => import("./pages/admin/AuditDashboard"));
const AdminCoupons = lazy(() => import("./pages/admin/Coupons"));
const MerchantCoupons = lazy(() => import("./pages/merchant/Coupons"));
const MerchantInventory = lazy(() => import("./pages/merchant/Inventory"));
const MerchantReviews = lazy(() => import("./pages/merchant/Reviews"));
const MerchantPromotions = lazy(() => import("./pages/merchant/Promotions"));
const MerchantTrend = lazy(() => import("./pages/merchant/TrendInsight"));
const AIMall = lazy(() => import("./pages/AIMall"));

function RouteFallback() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3">
      <Spin size="large" />
      <div className="text-slate-400 text-sm">加载中…</div>
    </div>
  );
}

export default function App() {
  const init = useAuth((s) => s.init);
  const user = useAuth((s) => s.user);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    init().finally(() => setReady(true));
  }, [init]);

  // 全局实时通知：连接 WebSocket，收到站内信即时 toast 提示。
  // 令牌位于 HttpOnly Cookie，握手时浏览器自动携带，后端从 cookie 鉴权。
  useEffect(() => {
    if (!user) return;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/api/ws/notifications`);
    ws.onmessage = (e) => {
      try {
        const m = JSON.parse(e.data);
        message.open({ content: `${m.title}：${m.content}`, duration: 4 });
      } catch {
        /* 忽略非 JSON 消息 */
      }
    };
    return () => ws.close();
  }, [user]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <LanguageProvider>
      {/* P2-14 a11y：键盘用户可跳过顶部导航直接到达主内容 */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[100] focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:shadow"
      >
        跳过导航
      </a>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
            <Route path="/" element={<Market />} />
            <Route path="/products/:id" element={<ProductDetail />} />
            <Route path="/cart" element={<Cart />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/orders/:id" element={<OrderDetail />} />
            <Route path="/favorites" element={<Favorites />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/points" element={<Points />} />
            <Route path="/membership" element={<Membership />} />
            <Route path="/pay/:id" element={<Pay />} />
            <Route path="/me" element={<Me />} />
            <Route path="/addresses" element={<Address />} />
            <Route path="/coupons" element={<Coupons />} />
            <Route path="/mall" element={<Mall />} />
            <Route path="/support" element={<Support />} />
            <Route path="/shops" element={<Shop />} />
            <Route path="/shops/:id" element={<Shop />} />
            <Route path="/promotions" element={<Promotions />} />
            <Route path="/following" element={<Following />} />
            <Route path="/ai-mall" element={<AIMall />} />
          </Route>
          <Route element={<ProtectedRoute roles={["merchant"]}><MerchantLayout /></ProtectedRoute>}>
            <Route path="/merchant" element={<MerchantDashboard />} />
            <Route path="/merchant/products" element={<MerchantProducts />} />
            <Route path="/merchant/inventory" element={<MerchantInventory />} />
            <Route path="/merchant/reviews" element={<MerchantReviews />} />
            <Route path="/merchant/promotions" element={<MerchantPromotions />} />
            <Route path="/merchant/support" element={<Support />} />
            <Route path="/merchant/coupons" element={<MerchantCoupons />} />
            <Route path="/merchant/trend" element={<MerchantTrend />} />
          </Route>
          <Route element={<ProtectedRoute roles={["admin"]}><AdminLayout /></ProtectedRoute>}>
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/products" element={<AdminProducts />} />
            <Route path="/admin/users" element={<AdminUsers />} />
            <Route path="/admin/reviews" element={<AdminReviews />} />
            <Route path="/admin/audit" element={<AdminAudit />} />
            <Route path="/admin/audit-dashboard" element={<AdminAuditDashboard />} />
            <Route path="/admin/coupons" element={<AdminCoupons />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </LanguageProvider>
  );
}
