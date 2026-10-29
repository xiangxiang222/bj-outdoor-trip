import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import * as web from "./activityKind";

const require = createRequire(import.meta.url);
const native = require("../../../miniprogram/utils/activity-kind.js");
const now = new Date("2026-10-28T10:30:00Z"); // 18:30 in Beijing, independent of the test machine.
function row(id, overrides = {}) {
  return {
    id, channel: "activity", status: "recruiting", reviewStatus: "approved",
    startDate: "2026-10-29", meetupTime: "19:30", city: "朝阳",
    meetupPoint: "公园南门", minGroupSize: 4, maxSeats: 12, enrolled: 2, remain: 10,
    quote: { originPrice: 20, tripPrice: 20 }, route: { title: "同城电影夜", category: "电影" },
    ...overrides,
  };
}
const ids = (rows) => rows.map((item) => item.id);
const clients = [["H5", web, web.activityKindOf], ["native", native, native.kindOf]];

for (const [name, api, kindOf] of clients) {
  describe(`${name} activity discovery`, () => {
    it("uses the saved category before incidental words in a title or note", () => {
      expect(kindOf(row(1, { route: { category: "电影", title: "跑步伙伴一起看电影" }, notes: "上周一起玩掼蛋" }))?.key).toBe("电影");
      expect(kindOf(row(2, { route: { title: "掼蛋朋友见面" }, playTags: [{ name: "跑步" }] }))?.key).toBe("跑步");
      expect(kindOf(row(3, { route: { title: "一起夜跑" } }))?.key).toBe("跑步");
      expect(kindOf(row(4, { route: { category: "社团", title: "电影社迎新" } }))?.key).toBe("招募");
      expect(kindOf(row(5, { route: { title: "书店闲坐" } }))).toBe(null);
    });

    it("keeps only approved upcoming activities, without leaking a trip or an ended event", () => {
      const rows = [
        row(1),
        row(2, { reviewStatus: "pending" }),
        row(3, { reviewStatus: "rejected" }),
        row(4, { status: "cancelled" }),
        row(5, { channel: "trip" }),
        row(6, { status: "finished" }),
        row(7, { startedAt: "2026-10-28 08:00:00" }),
        row(8, { completed_at: "2026-10-28 09:00:00" }),
        row(9, { startDate: "2026-10-27" }),
        row(10, { startDate: "2026-10-28", meetupTime: "18:30" }),
        row(11, { startDate: "2026-10-28", meetupTime: "19:00" }),
      ];
      expect(ids(api.activityRows(rows, {}, now))).toEqual([11, 1]);
      expect(api.activityRows(null, {}, now)).toEqual([]);
    });

    it("combines kind, district, search, price and available-place filters", () => {
      const rows = [
        row(1, { city: "海淀", meetupPoint: "书店二层", quote: { tripPrice: 0 } }),
        row(2, { city: "海淀", meetupPoint: "书店一层", quote: { tripPrice: 30 } }),
        row(3, { city: "海淀", meetupPoint: "书店二层", quote: { tripPrice: 0 }, enrolled: 12, remain: 0 }),
        row(4, { city: "朝阳", meetupPoint: "书店二层", quote: { tripPrice: 0 } }),
        row(5, { city: "海淀", meetupPoint: "书店二层", quote: { tripPrice: 0 }, route: { title: "夜跑", category: "跑步" } }),
      ];
      expect(ids(api.activityRows(rows, { kind: "电影", city: "海淀", query: "书店", freeOnly: true, availableOnly: true }, now))).toEqual([1]);
      expect(ids(api.activityRows(rows, { availableOnly: true }, now))).not.toContain(3);
      expect(ids(api.activityRows(rows, {}, now))).toContain(3); // A full event still offers a waitlist.
      expect(rows[0].id).toBe(1); // Sorting and filtering do not reorder the source feed.
    });

    it("filters today's and this week's activities by Beijing calendar dates", () => {
      const rows = [row(1, { startDate: "2026-10-28", meetupTime: "19:00" }), row(2, { startDate: "2026-10-29" }), row(3, { startDate: "2026-11-02" })];
      expect(ids(api.activityRows(rows, { time: "today" }, now))).toEqual([1]);
      expect(ids(api.activityRows(rows, { time: "week" }, now))).toEqual([1, 2]);
      const monday = new Date("2026-10-25T16:01:00Z");
      expect(api.isThisWeek("2026-10-25", monday)).toBe(false);
      expect(api.isThisWeek("2026-10-26", monday)).toBe(true);
      expect(api.isThisWeek("2026-11-01", monday)).toBe(true);
      expect(api.isThisWeek("2026-11-02", monday)).toBe(false);
    });

    it("uses the upcoming weekend, including the current Beijing Sunday", () => {
      const sunday = new Date("2026-10-31T16:01:00Z");
      const rows = [row(1, { startDate: "2026-11-01" }), row(2, { startDate: "2026-11-07" }), row(3, { startDate: "2026-11-08" })];
      expect(ids(api.activityRows(rows, { time: "weekend" }, sunday))).toEqual([1]);
      expect(ids(api.activityRows(rows, { time: "weekend" }, new Date("2026-11-02T01:00:00Z")))).toEqual([2, 3]);
    });

    it("distinguishes the minimum to form a group from spare capacity", () => {
      const forming = api.activityFacts(row(1), now);
      expect(forming.phase).toContain("2");
      expect(forming.remaining).toBe(10);
      const formed = api.activityFacts(row(2, { enrolled: 4, remain: 8 }), now);
      expect(formed.phase).toBe("已成局");
      expect(formed.remaining).toBe(8);
      expect(formed.full).toBe(false);
      const full = api.activityFacts(row(3, { enrolled: 12, remain: 0 }), now);
      expect(full.full).toBe(true);
      expect(full.capacity).toContain("候补");
      expect(full.remaining).toBe(0);
      expect(api.activityFacts(row(4, { quote: { originPrice: 30, tripPrice: 0 } }), now).free).toBe(true);
      expect(api.activityFacts(row(5, { quote: { originPrice: 30, tripPrice: 20 } }), now).price).toBe(20);
    });

    it("sorts using actual date, occupancy and publication id without mutating the source", () => {
      const rows = [row(3, { startDate: "2026-10-31", enrolled: 11, remain: 1 }), row(1, { startDate: "2026-10-29" }), row(2, { startDate: "2026-10-30", enrolled: 8, remain: 4 })];
      expect(ids(api.activityRows(rows, { sort: "soon" }, now))).toEqual([1, 2, 3]);
      expect(ids(api.activityRows(rows, { sort: "filling" }, now))).toEqual([3, 2, 1]);
      expect(ids(api.activityRows(rows, { sort: "new" }, now))).toEqual([3, 2, 1]);
      expect(ids(rows)).toEqual([3, 1, 2]);
    });
  });
}

describe("activity discovery parity", () => {
  it("returns matching results and saved-key compatibility on both clients", () => {
    expect(web.ACTIVITY_KINDS.map((kind) => kind.key)).toEqual(["掼蛋", "跑步", "电影", "招募"]);
    expect(native.KINDS.map((kind) => kind.key)).toEqual(web.ACTIVITY_KINDS.map((kind) => kind.key));
    const rows = [row(1), row(2, { route: { category: "跑步", title: "跑友见面" } }), row(3, { startDate: "2026-10-31" })];
    for (const options of [{}, { kind: "跑步" }, { time: "weekend" }, { freeOnly: true }, { query: "公园" }, { sort: "filling" }]) {
      expect(ids(web.activityRows(rows, options, now))).toEqual(ids(native.activityRows(rows, options, now)));
    }
    expect(web.activityFacts(rows[0], now)).toEqual(native.activityFacts(rows[0], now));
  });
});

for (const [name, api] of clients) {
  describe(`${name} activity publishing details`, () => {
    const definitions = name === "H5" ? api.ACTIVITY_KINDS : api.KINDS;
    it("round-trips all four kinds' real details and free-form introduction", () => {
      for (const kind of definitions) {
        const details = Object.fromEntries(kind.fields.map((field, index) => [field.key, `安排 ${index + 1}`]));
        const text = api.composeActivityDescription(kind.key, details, "  欢迎第一次来的朋友。\n请按时集合。  ");
        const event = row(1, { route: { title: "周末见面", category: kind.key, description: text } });
        expect(api.activityDetails(event)).toEqual(kind.fields.map((field, index) => ({ label: field.label, value: `安排 ${index + 1}` })));
        expect(api.activityBody(event)).toBe("欢迎第一次来的朋友。\n请按时集合。");
      }
    });

    it("requires kind-specific facts without mistaking an example placeholder for submitted data", () => {
      for (const kind of definitions) {
        expect(api.validateActivityDetails(kind.key, {})).not.toBe("");
        const required = Object.fromEntries(kind.fields.filter((field) => field.required).map((field) => [field.key, "实际安排"]));
        expect(api.validateActivityDetails(kind.key, required)).toBe("");
        const description = api.composeActivityDescription(kind.key, required, "");
        expect(description).not.toContain("例如：");
        expect(api.activityDetails({ route: { category: kind.key, description } })).toHaveLength(kind.fields.filter((field) => field.required).length);
        const first = kind.fields.find((field) => field.required);
        expect(api.validateActivityDetails(kind.key, { ...required, [first.key]: " " })).toContain(first.label);
        expect(api.validateActivityDetails(kind.key, { ...required, [first.key]: "长".repeat(121) })).not.toBe("");
      }
    });

    it("preserves legacy plain introductions and does not interpret unrecognized metadata as a fact", () => {
      const legacy = row(1, { route: { category: "电影", description: "票务安排由发起人说明。\n请勿误以为报名即购票。" } });
      expect(api.activityDetails(legacy)).toEqual([]);
      expect(api.activityBody(legacy)).toBe(legacy.route.description);
      const unknown = row(2, { route: { category: "电影", description: "【活动信息】\n编造的自动出票：已完成\n\n旧描述" } });
      expect(api.activityDetails(unknown)).toEqual([]);
      expect(api.activityBody(unknown)).toBe(unknown.route.description);
    });

    it("does not allow a multiline field value to become a second structured fact", () => {
      const text = api.composeActivityDescription("电影", { film: "作品A\n购票方式：平台代购", session: "19:00" }, "自由介绍");
      const facts = api.activityDetails(row(1, { route: { category: "电影", description: text } }));
      expect(facts).toHaveLength(2);
      expect(facts[0].value).toBe("作品A 购票方式：平台代购");
      expect(facts.some((fact) => fact.label === "购票方式")).toBe(false);
    });
  });
}
