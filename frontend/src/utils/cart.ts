export interface CartLine {
  price: number | string;
  quantity: number;
}

/** 优惠券形态（与 UserCouponOut 兼容：value/threshold 为字符串或数字）。 */
export interface CouponLike {
  type: string;
  value: number | string;
  threshold: number | string;
}

/** 购物车小计：sum(price * quantity)。 */
export function calcSubtotal(items: CartLine[]): number {
  return items.reduce((sum, it) => sum + Number(it.price) * it.quantity, 0);
}

/**
 * 优惠券抵扣金额。
 * - discount 类型：按 (1 - value) 比例立减（value=0.9 表示打 9 折，减 10%）。
 * - fixed 类型：满 threshold 才可用，减固定 value；未达门槛返回 0。
 */
export function calcCouponDiscount(
  coupon: CouponLike | undefined,
  subtotal: number
): number {
  if (!coupon) return 0;
  if (coupon.type === "discount")
    return Number((subtotal * (1 - Number(coupon.value))).toFixed(2));
  if (Number(subtotal) < Number(coupon.threshold)) return 0;
  return Number(coupon.value);
}

/** 积分抵扣：100 积分 = 1 元，最多抵扣到小计金额，未勾选返回 0。 */
export function calcPointsDiscount(
  points: number,
  subtotal: number,
  usePoints: boolean
): number {
  if (!usePoints) return 0;
  return Math.min(points, Math.floor(subtotal * 100)) / 100;
}

/** 应付金额：小计减去各项优惠，且不为负。 */
export function calcPayable(
  subtotal: number,
  couponDisc: number,
  pointsDisc: number
): number {
  return Math.max(subtotal - couponDisc - pointsDisc, 0);
}
