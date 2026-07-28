import { describe, it, expect } from "vitest";
import { nextActions } from "../format";

describe("nextActions", () => {
  it("buyer can pay / refund / confirm", () => {
    expect(nextActions("pending_payment", "buyer")).toContain("paid");
    expect(nextActions("paid", "buyer")).toContain("refund_requested");
    expect(nextActions("shipped", "buyer")).toContain("completed");
  });
  it("merchant can ship / refund", () => {
    expect(nextActions("paid", "merchant")).toContain("shipped");
    expect(nextActions("refund_requested", "merchant")).toContain("refunded");
  });
  it("returns empty for non-actionable states", () => {
    expect(nextActions("completed", "buyer")).toEqual([]);
    expect(nextActions("refunded", "merchant")).toEqual([]);
  });
});
