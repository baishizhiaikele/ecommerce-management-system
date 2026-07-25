import { Outlet, useNavigate, Link } from "react-router-dom";
import { Layout, Menu, Button, Dropdown } from "antd";
import { ShopOutlined } from "@ant-design/icons";
import { useAuth } from "../store/auth";
import { logout } from "../api";

const { Header, Sider, Content } = Layout;

export default function MerchantLayout() {
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
      <Sider theme="light" width={220} style={{ borderRight: "1px solid #f0f0f0" }}>
        <div className="h-16 flex items-center px-5 font-bold text-[#4F46E5] text-lg">
          <ShopOutlined className="mr-2" /> 商家后台
        </div>
        <Menu
          mode="inline"
          defaultSelectedKeys={["/merchant"]}
          items={[
            { key: "/merchant", label: <Link to="/merchant">数据看板</Link> },
            { key: "/merchant/products", label: <Link to="/merchant/products">商品管理</Link> },
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
