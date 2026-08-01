// T7：个性化推荐域（从 api/index.ts 按域拆出）
import { api } from "./client";
import type { ProductOut } from "./index";

/** 登录用户「猜你喜欢」个性化推荐。 */
export const recommendations = () =>
  api.get<ProductOut[]>("/recommendations").then((r) => r.data);

// T11 关联推荐：搭配购买 / 看了又看（基于订单/浏览共现协同过滤）
export const getSimilarProducts = (
  productId: string,
  kind: "co_purchase" | "also_viewed" = "co_purchase",
  limit = 8,
) =>
  api
    .get<ProductOut[]>(`/recommendations/similar/${productId}`, {
      params: { kind, limit },
    })
    .then((r) => r.data);
