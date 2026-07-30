import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getPromotions, type ProductOut, type PromotionOut } from "../api";

type FlashState = {
  list: PromotionOut[];
  map: Map<number, PromotionOut>;
};

const FlashCtx = createContext<FlashState>({ list: [], map: new Map() });

// 模块级缓存，供非 React（事件回调）场景下同步取价。
let _flashMap: Map<number, PromotionOut> = new Map();

function isActive(p: PromotionOut): boolean {
  const now = Date.now();
  if (p.start_at) {
    const s = new Date(p.start_at).getTime();
    if (!Number.isNaN(s) && now < s) return false;
  }
  if (p.end_at) {
    const e = new Date(p.end_at).getTime();
    if (!Number.isNaN(e) && now > e) return false;
  }
  return true;
}

function flashPriceOf(p?: ProductOut | null): {
  price: number;
  original: number;
  isFlash: boolean;
} {
  const original = Number(p?.price || 0);
  const promo = p?.id != null ? _flashMap.get(p.id) : undefined;
  if (promo) {
    let price = original;
    if (promo.discount_price != null) price = Number(promo.discount_price);
    else if (promo.discount_rate != null) price = original * Number(promo.discount_rate);
    return { price, original, isFlash: true };
  }
  return { price: original, original, isFlash: false };
}

export function FlashPriceProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<PromotionOut[]>([]);

  useEffect(() => {
    let alive = true;
    const load = () =>
      getPromotions("flash")
        .then((r) => {
          if (alive) setList(r);
        })
        .catch(() => {});
    load();
    const id = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const value = useMemo<FlashState>(() => {
    const map = new Map<number, PromotionOut>();
    for (const p of list) {
      if (p.product_id != null && isActive(p)) map.set(p.product_id, p);
    }
    _flashMap = map;
    return { list, map };
  }, [list]);

  return <FlashCtx.Provider value={value}>{children}</FlashCtx.Provider>;
}

/** 暴露完整限时秒杀列表，供首页秒杀专区等渲染整张卡片。 */
export function useFlashList(): PromotionOut[] {
  return useContext(FlashCtx).list;
}

/**
 * 返回商品当前的“限时秒杀成交价”。与后端 cart._effective_price 逻辑保持一致：
 * 优先取 promotion.discount_price；否则取 product.price * promotion.discount_rate。
 * 若商品当前不在生效中的限时秒杀，则返回原价。
 * 通过订阅 context 保证秒杀数据加载/变化时组件重新渲染。
 */
export function useFlashPrice(
  p?: ProductOut | null
): { price: number; original: number; isFlash: boolean } {
  useContext(FlashCtx);
  return flashPriceOf(p);
}

/** 非 Hook 版本，供事件回调（如加入购物车）同步取价。 */
export function getFlashPrice(p?: ProductOut | null): number {
  return flashPriceOf(p).price;
}
