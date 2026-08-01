import { describe, it, expect } from "vitest";

/** T16 金额定点化配套：前端计算必须两位定点，避免浮点误差累加。 */
function round2(n: number): number {
  // 与后端 Numeric(12,2) 对齐的取整方式
  return Number((Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2));
}

describe("money rounding (T16 定点化)", () => {
  it("消除 0.1 + 0.2 浮点误差", () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });
  it("累加多笔小额不产生漂移", () => {
    let sum = 0;
    for (let i = 0; i < 10; i++) sum += 0.1;
    expect(round2(sum)).toBe(1.0);
  });
  it("乘数量后再定点", () => {
    expect(round2(3.333 * 3)).toBe(10.0);
  });
});

/** T22 满减进度：当前消费距离下一档还差多少，是否已达档。 */
function fullReduceProgress(
  lineTotal: number,
  tiers: { threshold: number; value: number }[],
): { next?: { threshold: number; value: number; gap: number }; reached: number } {
  const reached = tiers
    .filter((t) => lineTotal >= t.threshold)
    .reduce((m, t) => Math.max(m, t.value), 0);
  const next = tiers.find((t) => lineTotal < t.threshold);
  return { next: next ? { ...next, gap: Math.max(0, next.threshold - lineTotal) } : undefined, reached };
}

describe("full reduce progress (T22)", () => {
  const tiers = [
    { threshold: 99, value: 10 },
    { threshold: 199, value: 25 },
    { threshold: 299, value: 40 },
  ];
  it("未达首档时给出差额", () => {
    const r = fullReduceProgress(80, tiers);
    expect(r.next?.gap).toBe(19);
    expect(r.reached).toBe(0);
  });
  it("达到中间档只计已达成的最高减免", () => {
    const r = fullReduceProgress(210, tiers);
    expect(r.reached).toBe(25);
    expect(r.next?.gap).toBe(89);
  });
  it("超过最高档不再有 next", () => {
    const r = fullReduceProgress(500, tiers);
    expect(r.reached).toBe(40);
    expect(r.next).toBeUndefined();
  });
});
