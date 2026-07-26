import { Outlet, useNavigate, Link } from "react-router-dom";
import { Layout, Menu, Button, Dropdown } from "antd";
import { SafetyCertificateOutlined } from "@ant-design/icons";
import { useAuth } from "../store/auth";
import { logout } from "../api";

const { Header, Sider, Content } = Layout;

export default function AdminLayout() {
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const doLogout = useAuth((s) => s.logout);

  const onLogout = async () => {
    try {
      await logout();
    } catch {
      /* 忽略 */
    }
    doLogout();
    navigate("/login");
  };

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider theme="light" width={220} style={{ borderRight: "1px solid #f0f0f0", boxShadow: "2px 0 8px rgba(15,23,42,0.03)" }}>
        <div className="h-16 flex items-center px-5 font-bold text-[#6366F1] text-lg">
          <SafetyCertificateOutlined className="mr-2" /> 管理后台
        </div>
        <Menu
          mode="inline"
          defaultSelectedKeys={["/admin"]}
          items={[
            { key: "/admin", label: <Link to="/admin">平台仪表板</Link> },
            { key: "/admin/products", label: <Link to="/admin/products">商品审核</Link> },
            { key: "/admin/users", label: <Link to="/admin/users">用户管理</Link> },
            { key: "/admin/reviews", label: <Link to="/admin/reviews">负面评价</Link> },
            { key: "/admin/audit", label: <Link to="/admin/audit">审计日志</Link> },
            { key: "/admin/audit-dashboard", label: <Link to="/admin/audit-dashboard">审计看板</Link> },
          ]}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            background: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 24px",
            borderBottom: "1px solid #f0f0f0",
            boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
          }}
        >
          <Link to="/" className="text-slate-500">
            ← 返回商城
          </Link>
          <Dropdown
            menu={{ items: [{ key: "logout", label: "退出登录" }], onClick: onLogout }}
          >
            <Button>{user?.username}</Button>
          </Dropdown>
        </Header>
        <Content style={{ margin: 24 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
