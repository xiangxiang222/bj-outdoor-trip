import { describe, it, expect } from "vitest";
import { ROUTE_CATEGORIES, ROUTE_DIFFICULTIES, ROUTE_REGIONS, mergeOptions } from "./routeMeta";

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
