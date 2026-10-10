import { describe, expect, it } from "vitest";
import { filterRoutes } from "./routeFilters";

const rows = [
  {
    id: 1,
    code: "R-QY",
    title: "青崖子",
    subtitle: "峡谷瀑布",
    days: 1,
    region: "北京 · 密云",
    category: "山水",
    difficulty: "休闲",
    season: "4-10月",
    tags: ["徒步", "玩水"],
    status: "on",
    reviewStatus: "approved",
  },
  {
    id: 2,
    code: "R-HT",
    title: "海坨南大梁",
    subtitle: "高山草甸",
    days: 2,
    region: "北京 · 延庆",
    category: "登山",
    difficulty: "进阶",
    season: "6-9月",
    tags: ["登山"],
    status: "off",
    reviewStatus: "pending",
  },
];

describe("filterRoutes", () => {
  it("keeps every row when nothing is selected", () => {
    expect(filterRoutes(rows, {}).map((row) => row.id)).toEqual([1, 2]);
  });

  it("combines keyword, days, status and review", () => {
    expect(
      filterRoutes(rows, { q: "崖", days: 1, status: "on", review: "approved" }).map((row) => row.id)
    ).toEqual([1]);
    expect(filterRoutes(rows, { q: "崖", status: "off" })).toEqual([]);
  });

  it("matches title, code, region and tags, and ignores empty selects", () => {
    expect(filterRoutes(rows, { q: "r-ht", status: null, days: "", category: null }).map((row) => row.id)).toEqual([2]);
    expect(filterRoutes(rows, { region: "延庆", tag: "登山", difficulty: "进阶", season: "6-9月" }).map((row) => row.id)).toEqual([2]);
  });
});
