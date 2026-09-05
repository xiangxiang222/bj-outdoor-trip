import { describe, it, expect } from "vitest";
import { activityKindOf, filterActivities, formatActivityDate, isThisWeek } from "./activityKind";

describe("activityKindOf", () => {
  it("reads kind from title or play tags", () => {
    expect(activityKindOf({ route: { title: "周五夜掼蛋局" } })?.key).toBe("掼蛋");
    expect(activityKindOf({ playTags: [{ name: "跑步" }] })?.key).toBe("跑步");
    expect(activityKindOf({ route: { title: "慕田峪长城" } })).toBe(null);
  });

  it("filters a list by kind", () => {
    const rows = [{ route: { title: "电影夜" } }, { route: { title: "夜跑" } }];
    expect(filterActivities(rows, "电影")).toHaveLength(1);
    expect(filterActivities(rows, "")).toHaveLength(2);
  });

  it("formats date blocks", () => {
    const d = formatActivityDate("2026-09-11");
    expect(d.day).toBe("11");
    expect(d.month).toBe("9月");
    expect(d.weekday).toMatch(/^周/);
  });

  it("detects dates in the current week", () => {
    const now = new Date(2026, 8, 5);
    expect(isThisWeek("2026-09-06", now)).toBe(true);
    expect(isThisWeek("2026-09-20", now)).toBe(false);
  });
});
