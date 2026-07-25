import { ReactNode, useEffect } from "react";
import { useNavigate } from "react-router-dom";
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

  useEffect(() => {
    if (!user) {
      navigate("/login", { replace: true });
      return;
    }
    if (roles && !roles.includes(user.role)) {
      navigate(homeForRole(user.role), { replace: true });
    }
  }, [user, roles, navigate]);

  if (!user) return null;
  if (roles && !roles.includes(user.role)) return null;
  return <>{children}</>;
}
