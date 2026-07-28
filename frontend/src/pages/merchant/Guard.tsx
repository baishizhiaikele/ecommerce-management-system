import type { ReactNode } from "react";
import { useAuth } from "../../store/auth";
import { Navigate } from "react-router-dom";

export default function Guard({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "merchant") return <Navigate to="/" replace />;
  return <>{children}</>;
}
