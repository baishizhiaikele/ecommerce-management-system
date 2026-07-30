import { ReactNode } from "react";
import ProtectedRoute from "../../components/ProtectedRoute";

/**
 * L6：商家后台守门组件，统一委托给共享的 ProtectedRoute，
 * 避免与 ProtectedRoute 重复的鉴权/角色逻辑。
 * 仅允许 role = merchant 进入。
 * @deprecated 新页面请直接使用 <ProtectedRoute roles={["merchant"]}>
 */
export default function Guard({ children }: { children: ReactNode }) {
  return <ProtectedRoute roles={["merchant"]}>{children}</ProtectedRoute>;
}
