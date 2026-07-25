import { Role } from "../api";

// 角色对应的首页路由，作为「受保护路由」与「登录跳转」的唯一真相来源，
// 避免 ProtectedRoute / Login 重复维护同一份映射（改一处即可全局生效）。
export const HOME_BY_ROLE: Record<Role, string> = {
  buyer: "/",
  merchant: "/merchant",
  admin: "/admin",
};

export function homeForRole(role?: Role | string): string {
  if (!role) return "/";
  return HOME_BY_ROLE[role as Role] ?? "/";
}
