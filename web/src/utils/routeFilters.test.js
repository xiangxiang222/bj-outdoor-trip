import { describe, expect, it } from "vitest";
import { filterRoutes, matchesRoutePreference, matchingRoutePreferences } from "./routeFilters";

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
    source: "bot",
  },
];

describe("filterRoutes", () => {
  const preferences = [
    { key: "hiking", name: "徒步登山", status: "on", sortOrder: 20, categories: ["登山"], tags: ["徒步"] },
    { key: "water", name: "玩水", status: "on", sortOrder: 10, categories: [], tags: ["玩水"] },
    { key: "coast", name: "海边", status: "on", sortOrder: 30, categories: ["海滨"], tags: ["海边"] },
    { key: "disabled", name: "旧偏好", status: "off", categories: ["登山"], tags: ["徒步"] },
  ];

  it("matches configured categories or exact tag members without using titles, places or substrings", () => {
    expect(matchesRoutePreference(rows[0], preferences[0])).toBe(true);
    expect(matchesRoutePreference(rows[1], preferences[0])).toBe(true);
    expect(matchesRoutePreference({ category:"文化", title:"海边旅行", region:"北京海淀", tags:["海边摄影"] }, preferences[2])).toBe(false);
    expect(matchesRoutePreference({ category:"文化", tags:["海边"] }, preferences[2])).toBe(true);
    expect(matchesRoutePreference({ category:"海滨", tags:{} }, preferences[2])).toBe(true);
    expect(matchesRoutePreference(null, preferences[0])).toBe(false);
    expect(matchingRoutePreferences(rows[0], preferences).map(item => item.key)).toEqual(["water", "hiking"]);
  });

  it("combines a front-end preference with management filters and rejects disabled or missing configurations", () => {
    expect(filterRoutes(rows, { preference:"hiking", days:1, review:"approved", tag:"玩水" }, preferences).map(row => row.id)).toEqual([1]);
    expect(filterRoutes(rows, { preference:"water", category:"登山" }, preferences)).toEqual([]);
    expect(filterRoutes(rows, { preference:"disabled" }, preferences)).toEqual([]);
    expect(filterRoutes(rows, { preference:"missing" }, preferences)).toEqual([]);
    expect(filterRoutes(rows, { preference:"" }, preferences)).toEqual(rows);
  });

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

  it("filters machine drafts, user applications and official routes", () => {
    expect(filterRoutes(rows, { source: "bot" }).map((row) => row.id)).toEqual([2]);
    expect(filterRoutes(rows, { source: "official" }).map((row) => row.id)).toEqual([1]);
    expect(filterRoutes([{ ...rows[0], submittedBy: 9, source: "" }], { source: "user" }).map((row) => row.id)).toEqual([1]);
  });
});
