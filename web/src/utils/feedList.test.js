import { describe, it, expect } from "vitest";
import { cycleSort, hostFacets, isListable, matchesQuery, processFeed, sortFeed, sortLabel } from "./feedList";

const rows = [
  { id: 3, status: "recruiting", reviewStatus: "approved", channel: "trip", city: "怀柔", startDate: "2026-09-20", meetupTime: "07:00", enrolled: 2, maxSeats: 30, remain: 28, route: { title: "慕田峪长城" }, organizerName: "林北野", organizerType: "individual", playTags: [{ name: "徒步" }] },
  { id: 1, status: "recruiting", reviewStatus: "approved", channel: "trip", city: "密云", startDate: "2026-09-10", meetupTime: "07:00", enrolled: 16, maxSeats: 30, remain: 14, route: { title: "司马台长城" }, organizerName: "林北野", organizerType: "company", companyName: "北京华创科技有限公司" },
  { id: 2, status: "recruiting", reviewStatus: "approved", channel: "trip", city: "怀柔", startDate: "2026-09-12", meetupTime: "08:00", enrolled: 30, maxSeats: 30, remain: 0, route: { title: "黄花城水长城" }, organizerName: "张三", organizerType: "individual", eligibility: { enabled: true, studentOnly: true, schools: ["北京大学"] } },
  { id: 4, status: "recruiting", reviewStatus: "approved", channel: "trip", city: "海淀", startDate: "2026-09-22", meetupTime: "07:30", enrolled: 6, maxSeats: 30, remain: 24, route: { title: "香山秋日" }, organizerName: "李四", organizerType: "campus", companyName: "清华大学" },
  { id: 9, status: "cancelled", channel: "trip", city: "怀柔", startDate: "2026-09-11", remain: 10, route: { title: "已解散" } },
  { id: 8, status: "recruiting", reviewStatus: "pending", channel: "trip", city: "怀柔", startDate: "2026-09-11", remain: 10, route: { title: "审核中" } },
];

describe("processFeed", () => {
  it("keeps full trips for waitlist instead of dropping remain=0", () => {
    const list = processFeed(rows, { channel: "trip", sort: "soon" });
    expect(list.map((r) => r.id)).toEqual([1, 2, 3, 4]);
  });

  it("drops cancelled and pending review", () => {
    expect(isListable(rows.find((r) => r.id === 9))).toBe(false);
    expect(isListable(rows.find((r) => r.id === 8))).toBe(false);
  });

  it("searches title, city and host", () => {
    expect(processFeed(rows, { query: "司马" }).map((r) => r.id)).toEqual([1]);
    expect(processFeed(rows, { query: "怀柔", sort: "soon" }).map((r) => r.id)).toEqual([2, 3]);
    expect(processFeed(rows, { query: "清华" }).map((r) => r.id)).toEqual([4]);
    expect(matchesQuery(rows[0], "林北")).toBe(true);
  });

  it("sorts by soon, filling, newest", () => {
    expect(sortFeed(rows.slice(0, 3), "soon").map((r) => r.id)).toEqual([1, 2, 3]);
    expect(sortFeed(rows.slice(0, 3), "filling").map((r) => r.id)).toEqual([2, 1, 3]);
    expect(sortFeed(rows.slice(0, 3), "new").map((r) => r.id)).toEqual([3, 2, 1]);
  });

  it("filters company, campus and a named school", () => {
    expect(processFeed(rows, { hostKind: "company" }).map((r) => r.id)).toEqual([1]);
    expect(processFeed(rows, { hostKind: "campus" }).map((r) => r.id)).toEqual([2, 4]);
    expect(processFeed(rows, { hostKind: "individual" }).map((r) => r.id)).toEqual([3]);
    expect(processFeed(rows, { hostKind: "campus", school: "北京大学" }).map((r) => r.id)).toEqual([2]);
    expect(processFeed(rows, { hostKind: "campus", school: "清华大学" }).map((r) => r.id)).toEqual([4]);
    expect(processFeed(rows, { companyName: "北京华创科技有限公司" }).map((r) => r.id)).toEqual([1]);
    expect(hostFacets(rows).companies).toEqual(["北京华创科技有限公司"]);
    expect(hostFacets(rows).schools).toEqual(["北京大学", "清华大学"]);
    expect(matchesQuery(rows[1], "华创")).toBe(true);
    expect(matchesQuery(rows[2], "北京大学")).toBe(true);
  });

  it("cycles sort labels", () => {
    expect(cycleSort("soon")).toBe("filling");
    expect(cycleSort("filling")).toBe("new");
    expect(cycleSort("new")).toBe("soon");
    expect(sortLabel("filling")).toBe("快满员");
  });
});
