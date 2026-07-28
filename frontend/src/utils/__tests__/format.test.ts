import { describe, it, expect } from "vitest";
import { money } from "../format";

describe("money", () => {
  it("formats numbers to 2 decimals", () => {
    expect(money(10)).toBe("10.00");
    expect(money(10.5)).toBe("10.50");
  });
  it("parses strings", () => {
    expect(money("3.1")).toBe("3.10");
  });
  it("handles NaN", () => {
    expect(money("abc")).toBe("0.00");
    expect(money(NaN)).toBe("0.00");
  });
});
