import { describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { ROUTE_MODES, normalizeRouteMode, routePriceFacts, routeUpcomingFacts, routeLabels } from "./routePresentation";

const require = createRequire(import.meta.url);
const native = require("../../../miniprogram/utils/route-presentation.js");

describe("route catalog presentation", () => {
  it("keeps the same saved modes on both clients and ignores stale storage values", () => {
    expect(ROUTE_MODES.map((mode) => mode.key)).toEqual(["poster", "grid", "list"]);
    expect(native.ROUTE_MODES).toEqual(ROUTE_MODES);
    for (const value of ["poster", "grid", "list", "unknown", null, {}, ""]) {
      expect(normalizeRouteMode(value)).toBe(native.normalizeRouteMode(value));
    }
    expect(normalizeRouteMode("unknown")).toBe("poster");
  });

  it("shows a real zero price and falls back only when a member price is actually missing", () => {
    for (const [route, expected] of [
      [{ fromPrice: 199, memberFromPrice: 0 }, { amount: 0, original: 199, member: true }],
      [{ fromPrice: 199, memberFromPrice: "189" }, { amount: 189, original: 199, member: true }],
      [{ fromPrice: 0, memberFromPrice: null }, { amount: 0, original: null, member: false }],
      [{ fromPrice: 199, memberFromPrice: "" }, { amount: 199, original: null, member: false }],
      [{ fromPrice: "", memberFromPrice: undefined }, { amount: null, original: null, member: false }],
      [{ fromPrice: -1, memberFromPrice: "abc" }, { amount: null, original: null, member: false }],
      [{ fromPrice: false, memberFromPrice: [] }, { amount: null, original: null, member: false }],
    ]) {
      expect(routePriceFacts(route)).toEqual(expected);
      const facts = native.decorateRoute(route).viewFacts;
      expect(facts.price).toBe(expected.amount);
      expect(facts.hasPrice).toBe(expected.amount != null);
      expect(facts.member).toBe(expected.member);
      expect(facts.discounted).toBe(expected.original != null);
    }
  });

  it("distinguishes an API route without price tiers from a genuinely free route on both clients", () => {
    for (const [route, amount] of [
      [{ memberFromPrice: 0, studentFromPrice: 0, priceTiers: [] }, null],
      [{ fromPrice: null, memberFromPrice: 0, priceTiers: [] }, null],
      [{ fromPrice: 0, memberFromPrice: 0, studentFromPrice: 0, priceTiers: [] }, 0],
      [{ fromPrice: "0", memberFromPrice: 0, priceTiers: [] }, 0],
      [{ memberFromPrice: 0 }, 0],
      [{ memberFromPrice: 99 }, 99],
    ]) {
      const expected = { amount, original: null, member: false };
      expect(routePriceFacts(route)).toEqual(expected);
      expect(native.routePriceFacts(route)).toEqual(expected);
      const facts = native.decorateRoute(route).viewFacts;
      expect(facts.price).toBe(amount);
      expect(facts.hasPrice).toBe(amount != null);
      expect(facts.free).toBe(amount === 0);
    }
  });

  it("selects the next real departure by Beijing date and excludes ended or malformed entries", () => {
    const now = new Date("2026-10-28T16:01:00Z"); // Already Thursday in Beijing.
    const route = { upcoming: [
      { start_date: "2026-10-28", status: "confirmed" },
      { startDate: "2026-10-31", status: "recruiting" },
      { start_date: "2026-10-29", status: "confirmed" },
      { start_date: "2026-10-29", status: "cancelled" },
      { start_date: "2026-10-29", status: "finished" },
      { start_date: "2099-13-99", status: "recruiting" },
      { start_date: "2027-02-30", status: "recruiting" },
      null,
    ] };
    expect(routeUpcomingFacts(route, now)).toEqual({ date: "2026-10-29", count: 2 });
    vi.useFakeTimers({ toFake:["Date"] });
    vi.setSystemTime(now);
    try {
      expect(native.decorateRoute(route).viewFacts.nextDate).toBe("10.29");
      expect(native.decorateRoute({ upcoming: route.upcoming.filter((row) => !row || row.status !== "confirmed" && row.startDate !== "2026-10-31") }).viewFacts.hasSchedule).toBe(false);
    } finally { vi.useRealTimers(); }
    expect(routeUpcomingFacts({}, now)).toEqual({ date: "", count: 0 });
    expect(route.upcoming[0].start_date).toBe("2026-10-28");
  });

  it("uses actual tag names, deduplicates them and limits display without changing the API row", () => {
    const route = { playTags: [{ name: "亲子" }, { name: "徒步" }, { name: "亲子" }, "摄影", "山水"], tags: ["旧玩法"] };
    expect(routeLabels(route)).toEqual(["亲子", "徒步", "摄影"]);
    expect(route.playTags).toHaveLength(5);
    expect(routeLabels({ tags: ["山水", null, {}] })).toEqual(["山水"]);
  });
});
