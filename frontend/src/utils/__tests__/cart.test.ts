import { describe, it, expect } from "vitest";
import {
  calcSubtotal,
  calcCouponDiscount,
  calcPointsDiscount,
  calcPayable,
} from "../cart";

describe("calcSubtotal", () => {
  it("sums price * quantity", () => {
    expect(calcSubtotal([{ price: 10, quantity: 2 }, { price: 5.5, quantity: 3 }])).toBe(36.5);
  });
  it("returns 0 for empty cart", () => {
    expect(calcSubtotal([])).toBe(0);
  });
  it("accepts string prices", () => {
    expect(calcSubtotal([{ price: "10", quantity: 2 }])).toBe(20);
  });
});

describe("calcCouponDiscount", () => {
  it("returns 0 when no coupon", () => {
    expect(calcCouponDiscount(undefined, 100)).toBe(0);
  });
  it("applies discount-type as percentage off", () => {
    expect(calcCouponDiscount({ type: "discount", value: 0.9, threshold: 0 }, 100)).toBe(10);
  });
  it("returns 0 when below threshold for fixed coupon", () => {
    expect(calcCouponDiscount({ type: "fixed", value: 20, threshold: 200 }, 100)).toBe(0);
  });
  it("returns fixed value when above threshold", () => {
    expect(calcCouponDiscount({ type: "fixed", value: 20, threshold: 50 }, 100)).toBe(20);
  });
});

describe("calcPointsDiscount", () => {
  it("is 0 when not using points", () => {
    expect(calcPointsDiscount(500, 100, false)).toBe(0);
  });
  it("deducts full points when enough (100 积分 = 1 元)", () => {
    expect(calcPointsDiscount(500, 100, true)).toBe(5);
  });
  it("caps at subtotal", () => {
    expect(calcPointsDiscount(10000, 3, true)).toBe(3);
  });
});

describe("calcPayable", () => {
  it("subtracts discounts", () => {
    expect(calcPayable(100, 10, 5)).toBe(85);
  });
  it("never goes negative", () => {
    expect(calcPayable(10, 8, 5)).toBe(0);
  });
});
