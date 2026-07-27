import { lazy, Suspense, useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Spin, message } from "antd";
import Login from "./pages/Auth/Login";
import ProtectedRoute from "./components/ProtectedRoute";
import MainLayout from "./layouts/MainLayout";
import MerchantLayout from "./layouts/MerchantLayout";
import AdminLayout from "./layouts/AdminLayout";
import Market from "./pages/Market";
import ProductDetail from "./pages/ProductDetail";
import Cart from "./pages/Cart";
import Orders from "./pages/Orders";
import OrderDetail from "./pages/OrderDetail";
import Favorites from "./pages/Favorites";
import Notifications from "./pages/Notifications";
import Points from "./pages/Points";
import Me from "./pages/Me";
import Membership from "./pages/Membership";
import Pay from "./pages/Pay";
import Address from "./pages/Address";
import Coupons from "./pages/Coupons";
import Support from "./pages/Support";
import Shop from "./pages/Shop";
import Mall from "./pages/Mall";
import Promotions from "./pages/Promotions";
import { LanguageProvider } from "./i18n";
import { useAuth } from "./store/auth";

// S5：按路由懒加载，把商家后台/管理后台（含 recharts 等较重依赖）拆出首屏包体
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
const Following = lazy(() => import("./pages/Following"));

export default function App() {
  const init = useAuth((s) => s.init);
  const token = useAuth((s) => s.token);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    init().finally(() => setReady(true));
  }, [init]);

  // 全局实时通知：连接 WebSocket，收到站内信即时 toast 提示
  useEffect(() => {
    if (!token) return;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/api/ws/notifications?token=${token}`);
    ws.onmessage = (e) => {
      try {
        const m = JSON.parse(e.data);
        message.open({ content: `${m.title}：${m.content}`, duration: 4 });
      } catch {
        /* 忽略非 JSON 消息 */
      }
    };
    return () => ws.close();
  }, [token]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <LanguageProvider>
      <Suspense
        fallback={
          <div className="min-h-screen flex items-center justify-center">
            <Spin size="large" />
          </div>
        }
      >
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
      </Route>
      <Route element={<ProtectedRoute roles={["merchant"]}><MerchantLayout /></ProtectedRoute>}>
        <Route path="/merchant" element={<MerchantDashboard />} />
        <Route path="/merchant/products" element={<MerchantProducts />} />
        <Route path="/merchant/inventory" element={<MerchantInventory />} />
        <Route path="/merchant/reviews" element={<MerchantReviews />} />
        <Route path="/merchant/promotions" element={<MerchantPromotions />} />
        <Route path="/merchant/support" element={<Support />} />
        <Route path="/merchant/coupons" element={<MerchantCoupons />} />
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
