import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Spin } from "antd";
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
import MerchantProducts from "./pages/merchant/Products";
import MerchantDashboard from "./pages/merchant/Dashboard";
import AdminDashboard from "./pages/admin/Dashboard";
import AdminUsers from "./pages/admin/Users";
import AdminProducts from "./pages/admin/Products";
import AdminReviews from "./pages/admin/Reviews";
import AdminAudit from "./pages/admin/Audit";
import { useAuth } from "./store/auth";

export default function App() {
  const init = useAuth((s) => s.init);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    init().finally(() => setReady(true));
  }, [init]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
        <Route path="/" element={<Market />} />
        <Route path="/products/:id" element={<ProductDetail />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/orders/:id" element={<OrderDetail />} />
      </Route>
      <Route element={<ProtectedRoute roles={["merchant"]}><MerchantLayout /></ProtectedRoute>}>
        <Route path="/merchant" element={<MerchantDashboard />} />
        <Route path="/merchant/products" element={<MerchantProducts />} />
      </Route>
      <Route element={<ProtectedRoute roles={["admin"]}><AdminLayout /></ProtectedRoute>}>
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/products" element={<AdminProducts />} />
        <Route path="/admin/users" element={<AdminUsers />} />
        <Route path="/admin/reviews" element={<AdminReviews />} />
        <Route path="/admin/audit" element={<AdminAudit />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
