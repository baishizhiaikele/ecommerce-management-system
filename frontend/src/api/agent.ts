// T7：api 按域拆分（由 split_api 脚本生成，函数签名与原 index.ts 完全一致）。
import { api } from "./client";
import type { AgentTool, AgentReply } from "./types";

// ---------- P3-B AI 可行动代理层 ----------


export const agentChat = (body: {
  message: string;
  product_id?: string;
  address?: string;
  tool?: string;
}) => api.post<AgentReply>("/agent/chat", body).then((r) => r.data);
export const agentTools = () =>
  api.get<AgentTool[]>("/agent/tools").then((r) => r.data);
