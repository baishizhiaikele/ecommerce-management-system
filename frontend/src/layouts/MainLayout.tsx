import { useEffect, useState } from "react";
import { Outlet, useNavigate, Link } from "react-router-dom";
import { Layout, Menu, Button, Dropdown, Badge, Tooltip } from "antd";
import {
  ShoppingOutlined,
  AppstoreOutlined,
  HeartOutlined,
  BellOutlined,
  GiftOutlined,
} from "@ant-design/icons";
import { useAuth } from "../store/auth";
import { useCart } from "../store/cart";
import { logout, unreadCount } from "../api";
import { useI18n } from "../i18n";

const { Header, Content } = Layout;

export default function MainLayout() {
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const doLogout = useAuth((s) => s.logout);
  const lines = useCart((s) => s.lines);
  const count = lines.reduce((s, l) => s + l.quantity, 0);
  const [unread, setUnread] = useState(0);
  const { lang, setLang, t } = useI18n();

  const onLogout = async () => {
    try {
      await logout();
    } catch {
      /* 忽略 */
    }
    doLogout();
    navigate("/login");
  };

  useEffect(() => {
    unreadCount()
      .then((d) => setUnread(d.count))
      .catch(() => {});
    const t = setInterval(() => {
      unreadCount()
        .then((d) => setUnread(d.count))
        .catch(() => {});
    }, 20000);
    return () => clearInterval(t);
  }, []);

  return (
    <Layout className="min-h-screen">
      <Header
        className="glass sticky top-0 z-50"
        style={{
          display: "flex",
          alignItems: "center",
          borderBottom: "1px solid #EEF0F3",
          padding: "0 24px",
        }}
      >
        <Link
          to="/"
          className="flex items-center gap-2 mr-8 whitespace-nowrap group"
        >
          <span className="glow-icon" style={{ width: 38, height: 38, fontSize: 20 }}>
            <ShoppingOutlined />
          </span>
          <span className="text-lg font-extrabold brand-gradient-text">{t("brand")}</span>
        </Link>
        <Menu
          mode="horizontal"
          className="flex-1 border-0 bg-transparent hidden lg:flex"
          selectedKeys={[]}
          items={[
            { key: "market", label: <Link to="/">{t("market")}</Link> },
            { key: "shops", label: <Link to="/shops">{t("shops")}</Link> },
            { key: "favorites", label: <Link to="/favorites">{t("favorites")}</Link> },
            { key: "points", label: <Link to="/points">{t("points")}</Link> },
          ]}
        />
        <div className="flex items-center gap-1">
          <Button type="text" className="hidden sm:inline-flex" onClick={() => setLang(lang === "zh" ? "en" : "zh")}>
            {lang === "zh" ? "EN" : "中"}
          </Button>
          <Tooltip title={t("notifications")}>
            <Badge count={unread} size="small">
              <Button
                type="text"
                aria-label={t("notifications")}
                icon={<BellOutlined />}
                onClick={() => navigate("/notifications")}
              />
            </Badge>
          </Tooltip>
          <Tooltip title={t("coupons")}>
            <Button
              type="text"
              aria-label={t("coupons")}
              icon={<GiftOutlined />}
              onClick={() => navigate("/coupons")}
            />
          </Tooltip>
          <Badge count={count} size="small">
            <Button type="text" icon={<AppstoreOutlined />} onClick={() => navigate("/cart")}>
              <span className="hidden sm:inline">{t("cart")}</span>
            </Button>
          </Badge>
          <Button type="text" className="hidden sm:inline-flex" onClick={() => navigate("/orders")}>
            {t("orders")}
          </Button>
          <Dropdown
            menu={{
              items: [
                { key: "me", label: `${user?.username}（${user?.points ?? 0} 积分）` },
                { key: "logout", label: t("logout") },
              ],
              onClick: ({ key }) => key === "logout" && onLogout(),
            }}
          >
            <Button className="!rounded-full ml-1">
              <HeartOutlined className="mr-1" />
              {user?.username}
            </Button>
          </Dropdown>
        </div>
      </Header>
      <Content style={{ padding: 24, maxWidth: 1200, margin: "0 auto", width: "100%" }}>
        <Outlet />
      </Content>
    </Layout>
  );
}
