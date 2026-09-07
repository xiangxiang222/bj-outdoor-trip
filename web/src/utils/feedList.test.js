import { describe, it, expect } from "vitest";
import { cycleSort, isListable, matchesQuery, processFeed, sortFeed, sortLabel } from "./feedList";

const rows = [
  { id: 3, status: "recruiting", reviewStatus: "approved", channel: "trip", city: "怀柔", startDate: "2026-09-20", meetupTime: "07:00", enrolled: 2, maxSeats: 30, remain: 28, route: { title: "慕田峪长城" }, organizerName: "林北野", playTags: [{ name: "徒步" }] },
  { id: 1, status: "recruiting", reviewStatus: "approved", channel: "trip", city: "密云", startDate: "2026-09-10", meetupTime: "07:00", enrolled: 16, maxSeats: 30, remain: 14, route: { title: "司马台长城" }, organizerName: "林北野" },
  { id: 2, status: "recruiting", reviewStatus: "approved", channel: "trip", city: "怀柔", startDate: "2026-09-12", meetupTime: "08:00", enrolled: 30, maxSeats: 30, remain: 0, route: { title: "黄花城水长城" }, organizerName: "张三" },
  { id: 9, status: "cancelled", channel: "trip", city: "怀柔", startDate: "2026-09-11", remain: 10, route: { title: "已解散" } },
  { id: 8, status: "recruiting", reviewStatus: "pending", channel: "trip", city: "怀柔", startDate: "2026-09-11", remain: 10, route: { title: "审核中" } },
];

describe("processFeed", () => {
  it("keeps full trips for waitlist instead of dropping remain=0", () => {
    const list = processFeed(rows, { channel: "trip", sort: "soon" });
    expect(list.map((r) => r.id)).toEqual([1, 2, 3]);
  });

  it("drops cancelled and pending review", () => {
    expect(isListable(rows[3])).toBe(false);
    expect(isListable(rows[4])).toBe(false);
  });

  it("searches title, city and host", () => {
    expect(processFeed(rows, { query: "司马" }).map((r) => r.id)).toEqual([1]);
    expect(processFeed(rows, { query: "怀柔", sort: "soon" }).map((r) => r.id)).toEqual([2, 3]);
    expect(matchesQuery(rows[0], "林北")).toBe(true);
  });

  it("sorts by soon, filling, newest", () => {
    expect(sortFeed(rows.slice(0, 3), "soon").map((r) => r.id)).toEqual([1, 2, 3]);
    expect(sortFeed(rows.slice(0, 3), "filling").map((r) => r.id)).toEqual([2, 1, 3]);
    expect(sortFeed(rows.slice(0, 3), "new").map((r) => r.id)).toEqual([3, 2, 1]);
  });

  it("cycles sort labels", () => {
    expect(cycleSort("soon")).toBe("filling");
    expect(cycleSort("filling")).toBe("new");
    expect(cycleSort("new")).toBe("soon");
    expect(sortLabel("filling")).toBe("快满员");
  });
});
