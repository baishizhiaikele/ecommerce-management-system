import { useEffect, useState } from "react";
import { Outlet, useNavigate, Link, useLocation } from "react-router-dom";
import { Layout, Menu, Button, Dropdown, Tooltip, Input, Badge } from "antd";
import {
  SafetyCertificateOutlined,
  BellOutlined,
  LogoutOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { useAuth } from "../store/auth";
import { logout, unreadCount } from "../api";

const { Header, Sider, Content } = Layout;

export default function AdminLayout() {
  const navigate = useNavigate();
  const loc = useLocation();
  const user = useAuth((s) => s.user);
  const doLogout = useAuth((s) => s.logout);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    unreadCount()
      .then((d) => setUnread(d.count))
      .catch(() => {});
  }, []);

  const onLogout = async () => {
    try {
      await logout();
    } catch {
      /* 忽略 */
    }
    doLogout();
    navigate("/login");
  };

  const menuItems = [
    { key: "/admin", label: <Link to="/admin">平台仪表板</Link> },
    { key: "/admin/products", label: <Link to="/admin/products">商品审核</Link> },
    { key: "/admin/users", label: <Link to="/admin/users">用户管理</Link> },
    { key: "/admin/coupons", label: <Link to="/admin/coupons">优惠券管理</Link> },
    { key: "/admin/reviews", label: <Link to="/admin/reviews">负面评价</Link> },
    { key: "/admin/audit", label: <Link to="/admin/audit">审计日志</Link> },
    { key: "/admin/audit-dashboard", label: <Link to="/admin/audit-dashboard">审计看板</Link> },
  ];

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider
        theme="light"
        width={236}
        collapsible
        breakpoint="lg"
        className="glass"
        style={{ borderRight: "1px solid #EEF0F3", overflow: "hidden" }}
      >
        <Link to="/admin">
          <div className="bg-slate-50 m-3 rounded-2xl p-4 flex items-center gap-3" style={{ position: "relative" }}>
            <span className="glow-icon" style={{ width: 40, height: 40, fontSize: 20 }}>
              <SafetyCertificateOutlined />
            </span>
            <div className="text-slate-800">
              <div className="font-bold leading-tight">管理后台</div>
              <div className="text-[11px] text-slate-500">Admin Console</div>
            </div>
          </div>
        </Link>
        <Menu
          mode="inline"
          selectedKeys={[loc.pathname]}
          items={menuItems}
          className="!border-0 !bg-transparent px-2"
        />
      </Sider>
      <Layout>
        <Header
          className="glass sticky top-0 z-10"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 24px",
            borderBottom: "1px solid #EEF0F3",
          }}
        >
          <span className="text-slate-500 text-sm">实时运营概览</span>
          <div className="flex items-center gap-2">
            <Input
              prefix={<SearchOutlined className="text-slate-400" />}
              placeholder="搜索…"
              variant="filled"
              className="!w-56 hidden md:block !rounded-full"
            />
            <Tooltip title="通知">
              <Badge count={unread} size="small">
                <Button type="text" icon={<BellOutlined />} onClick={() => navigate("/admin/audit")} />
              </Badge>
            </Tooltip>
            <Dropdown
              menu={{
                items: [{ key: "logout", icon: <LogoutOutlined />, label: "退出登录" }],
                onClick: onLogout,
              }}
            >
              <Button className="!rounded-full">
                <span
                  className="w-6 h-6 rounded-full inline-flex items-center justify-center text-white text-xs mr-1"
                  style={{ background: "#4F46E5" }}
                >
                  {(user?.username || "?")[0]?.toUpperCase()}
                </span>
                {user?.username}
              </Button>
            </Dropdown>
          </div>
        </Header>
        <Content style={{ maxWidth: 1480, margin: "0 auto", padding: 24, width: "100%" }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
