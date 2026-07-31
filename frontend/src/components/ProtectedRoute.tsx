import { ReactNode, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../store/auth";
import { Role } from "../api";
import { homeForRole } from "../utils/roleRouting";

export default function ProtectedRoute({
  roles,
  children,
}: {
  roles?: Role[];
  children: ReactNode;
}) {
  const user = useAuth((s) => s.user);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!user) {
      // 记住来源页，登录成功后原路返回
      navigate("/login", {
        replace: true,
        state: { from: location.pathname + location.search },
      });
      return;
    }
    if (roles && !roles.includes(user.role)) {
      navigate(homeForRole(user.role), { replace: true });
    }
  }, [user, roles, navigate, location.pathname, location.search]);

  if (!user) return null;
  if (roles && !roles.includes(user.role)) return null;
  return <>{children}</>;
}
