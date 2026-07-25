import { Outlet, useNavigate, Link } from "react-router-dom";
import { Layout, Menu, Button, Dropdown, Badge } from "antd";
import { ShoppingOutlined, AppstoreOutlined } from "@ant-design/icons";
import { useAuth } from "../store/auth";
import { useCart } from "../store/cart";
import { logout } from "../api";

const { Header, Content } = Layout;

export default function MainLayout() {
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const doLogout = useAuth((s) => s.logout);
  const lines = useCart((s) => s.lines);
  const count = lines.reduce((s, l) => s + l.quantity, 0);

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
    <Layout className="min-h-screen">
      <Header
        style={{
          display: "flex",
          alignItems: "center",
          background: "#fff",
          borderBottom: "1px solid #f0f0f0",
          padding: "0 24px",
        }}
      >
        <Link to="/" className="text-lg font-bold text-[#4F46E5] mr-8 whitespace-nowrap">
          <ShoppingOutlined className="mr-1" /> AI 全托管小店
        </Link>
        <Menu
          mode="horizontal"
          className="flex-1 border-0"
          selectedKeys={[]}
          items={[{ key: "market", label: <Link to="/">商品集市</Link> }]}
        />
        <div className="flex items-center gap-2">
          <Badge count={count} size="small">
            <Button type="text" icon={<AppstoreOutlined />} onClick={() => navigate("/cart")}>
              购物车
            </Button>
          </Badge>
          <Button type="text" onClick={() => navigate("/orders")}>
            我的订单
          </Button>
          <Dropdown
            menu={{
              items: [{ key: "logout", label: "退出登录" }],
              onClick: onLogout,
            }}
          >
            <Button>{user?.username}</Button>
          </Dropdown>
        </div>
      </Header>
      <Content style={{ padding: 24, maxWidth: 1200, margin: "0 auto", width: "100%" }}>
        <Outlet />
      </Content>
    </Layout>
  );
}
