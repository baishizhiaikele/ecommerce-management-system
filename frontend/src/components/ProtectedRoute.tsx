import { ReactNode, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../store/auth";
import { Role } from "../api";
import { homeForRole } from "../utils/roleRouting";

export default function ProtectedRoute({
  roles,
  guest = false,
  children,
}: {
  roles?: Role[];
  guest?: boolean;
  children: ReactNode;
}) {
  const user = useAuth((s) => s.user);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // guest 模式：未登录也放行，让游客能完整浏览商品/搜索/店铺，仅在加购、下单等
    // 动作点再做引导登录（对标天猫/京东/亚马逊的游客可浏览体验）
    if (guest) return;
    if (!user) {
      // 买家端路径回买家登录页，商家/管理员后台路径回独立的后台登录页
      const isConsole = location.pathname.startsWith("/merchant") || location.pathname.startsWith("/admin");
      const loginPath = isConsole ? "/console/login" : "/login";
      // 记住来源页，登录成功后原路返回
      navigate(loginPath, {
        replace: true,
        state: { from: location.pathname + location.search },
      });
      return;
    }
    if (user && roles && !roles.includes(user.role)) {
      navigate(homeForRole(user.role), { replace: true });
    }
  }, [user, roles, guest, navigate, location.pathname, location.search]);

  // 需要身份但当前未登录：不渲染，等待上面的导航跳转
  if (!guest && !user) return null;
  if (!guest && user && roles && !roles.includes(user.role)) return null;
  return <>{children}</>;
}
