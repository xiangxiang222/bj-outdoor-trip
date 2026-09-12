import { describe, it, expect } from "vitest";
import {
  ROUTE_CATEGORIES,
  ROUTE_DIFFICULTIES,
  ROUTE_REGIONS,
  mergeOptions,
  memberPriceOf,
  defaultPriceTiers,
  normalizePriceTiers,
  serializePriceTiers,
  serializeMeetupPoints,
} from "./routeMeta";

describe("routeMeta", () => {
  it("lists the types and difficulties used by existing routes", () => {
    expect(ROUTE_CATEGORIES).toEqual(["长城", "登山", "山水", "玩水", "文化", "草原", "海滨"]);
    expect(ROUTE_DIFFICULTIES).toEqual(["休闲", "进阶"]);
    expect(ROUTE_REGIONS).toContain("北京怀柔");
    expect(ROUTE_REGIONS).toContain("北京周边");
  });

  it("keeps preset order and appends extras already on a route", () => {
    expect(mergeOptions(["长城", "登山"], ["登山", "滑雪"], "长城")).toEqual(["长城", "登山", "滑雪"]);
    expect(mergeOptions(["休闲"], "", null, "进阶")).toEqual(["休闲", "进阶"]);
  });
});

describe("route price tiers", () => {
  it("fills member price at 95 percent", () => {
    expect(memberPriceOf(199)).toBe(189);
    expect(memberPriceOf(179)).toBe(170);
  });

  it("starts a new route with four people brackets", () => {
    expect(defaultPriceTiers().map((t) => t.minPeople)).toEqual([10, 20, 30, 50]);
    expect(defaultPriceTiers()[0].memberPrice).toBe(189);
  });

  it("reads both camelCase and snake_case rows and drops empty people", () => {
    expect(
      serializePriceTiers([
        { min_people: 10, price: 299, member_price: 275 },
        { minPeople: 0, price: 0 },
      ])
    ).toEqual([{ minPeople: 10, maxPeople: null, price: 299, memberPrice: 275 }]);
    expect(normalizePriceTiers([{ minPeople: 20, price: 180 }])[0].memberPrice).toBe(171);
  });

  it("keeps meetup name and drops blank rows", () => {
    expect(
      serializeMeetupPoints([
        { id: "dzm", name: "东直门东方银座C口", timeHint: "07:30", geo: "C口", _key: "x" },
        { name: "  " },
      ])
    ).toEqual([{ id: "dzm", name: "东直门东方银座C口", timeHint: "07:30", geo: "C口" }]);
  });
});
