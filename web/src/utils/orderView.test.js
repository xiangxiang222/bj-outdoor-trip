import { describe, expect, it } from "vitest";
import { canReorder, matchOrderQuery, matchOrderTime, orderBadge, orderTimePresets } from "./orderView";

const today = "2026-10-20";

describe("orderBadge", () => {
  it("prefers refund, then cancel, then the desk status", () => {
    expect(orderBadge({ status: "cancelled", pay_status: "refunded", refundProgress: { text: "已退回" } }, today).label).toBe("已退款");
    expect(orderBadge({ status: "cancelled", pay_status: "unpaid" }, today).label).toBe("已取消");
    expect(orderBadge({ status: "waitlist", start_date: "2026-11-01" }, today).label).toBe("候补中");
    expect(orderBadge({ status: "applied", start_date: "2026-11-01" }, today).label).toBe("已报名待确认");
    expect(orderBadge({ status: "joined", pay_status: "unpaid", pay_amount: 80, start_date: "2026-11-01" }, today).label).toBe("待付款");
    expect(
      orderBadge(
        { status: "joined", pay_status: "paid", pay_amount: 80, channel: "trip", start_date: "2026-11-01", minGroupSize: 6, joinedCount: 1, guaranteed: false },
        today
      ).label
    ).toBe("待成团");
    expect(
      orderBadge({ status: "joined", pay_status: "paid", pay_amount: 80, channel: "trip", start_date: "2026-11-02", guaranteed: true }, today).label
    ).toBe("待出行");
  });

  it("marks a finished unpaid review and a reorderable done order", () => {
    const review = { id: 1, status: "joined", pay_status: "paid", pay_amount: 80, channel: "activity", start_date: "2026-10-01", canReview: true, route_id: 9 };
    expect(orderBadge(review, today).label).toBe("待评价");
    expect(canReorder(review, today)).toBe(true);
    expect(canReorder({ status: "joined", pay_status: "paid", start_date: "2026-11-02", guaranteed: true, route_id: 9 }, today)).toBe(false);
  });
});

describe("matchOrderTime", () => {
  const now = new Date(2026, 9, 20);

  it("offers this year and the previous years", () => {
    const presets = orderTimePresets(now);
    expect(presets.quick.map((item) => item.key)).toEqual(["1m", "3m", "year"]);
    expect(presets.years.map((item) => item.label)).toEqual(["2025年", "2024年"]);
  });

  it("filters by preset or by a custom range", () => {
    const recent = { created_at: "2026-10-02 09:00:00" };
    const older = { created_at: "2025-03-01 09:00:00" };
    expect(matchOrderTime(recent, { preset: "1m" }, now)).toBe(true);
    expect(matchOrderTime(older, { preset: "1m" }, now)).toBe(false);
    expect(matchOrderTime(older, { preset: "2025" }, now)).toBe(true);
    expect(matchOrderTime(recent, { start: "2026-10-01", end: "2026-10-31" }, now)).toBe(true);
    expect(matchOrderTime(older, { start: "2026-10-01" }, now)).toBe(false);
    expect(matchOrderQuery({ title: "青崖子" }, "崖")).toBe(true);
    expect(matchOrderQuery({ title: "青崖子" }, "金海")).toBe(false);
  });
});
