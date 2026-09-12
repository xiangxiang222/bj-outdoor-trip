import { describe, expect, it } from "vitest";
import { couponCountdown, formatRemain, unusedCoupons } from "./couponTime";

describe("couponCountdown", () => {
  const now = new Date("2026-09-12T12:00:00").getTime();

  it("counts remaining time against claim expiry", () => {
    const clock = couponCountdown(
      { claimedAt: "2026-09-12 10:00:00", expiresAt: "2026-09-13 10:00:00", validHours: 24 },
      now
    );
    expect(clock.expired).toBe(false);
    expect(clock.percent).toBe(92);
    expect(clock.label).toBe("剩 22 小时 0 分");
  });

  it("marks expired instances", () => {
    const clock = couponCountdown({ claimedAt: "2026-09-10 10:00:00", expiresAt: "2026-09-11 10:00:00" }, now);
    expect(clock.expired).toBe(true);
    expect(clock.percent).toBe(0);
    expect(formatRemain(0)).toBe("已过期");
  });

  it("keeps unused coupons that still have time", () => {
    const rows = [
      { status: "unused", expiresAt: "2026-09-13 10:00:00", claimedAt: "2026-09-12 10:00:00" },
      { status: "used", expiresAt: "2026-09-13 10:00:00", claimedAt: "2026-09-12 10:00:00" },
      { status: "unused", expiresAt: "2026-09-11 10:00:00", claimedAt: "2026-09-10 10:00:00" },
    ];
    expect(unusedCoupons(rows, now)).toHaveLength(1);
  });
});
