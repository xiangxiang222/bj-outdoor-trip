import { describe, it, expect } from "vitest";
import { boardedLine, coverMark, coverOf, feedWhen, hostName, isFreeOffer, taglineOf } from "./feedCard";

describe("feedCard", () => {
  it("formats date time like a feed line", () => {
    expect(feedWhen("2026-09-11", "08:00")).toMatch(/9\/11/);
    expect(feedWhen("2026-09-11", "08:00")).toMatch(/周/);
    expect(feedWhen("2026-09-11", "08:00")).toContain("08:00");
  });

  it("prefers boarded count, then remaining seats", () => {
    expect(boardedLine({ enrolled: 12, remain: 3 })).toBe("12人已上车");
    expect(boardedLine({ enrolled: 4, remain: 8 }, "activity")).toBe("4人已报名");
    expect(boardedLine({ enrolled: 30, remain: 0 })).toBe("已满·可候补");
    expect(boardedLine({ enrolled: 0, remain: 5 })).toBe("余 5 座");
  });

  it("picks host, cover, tagline and free price", () => {
    expect(hostName({ organizerType: "company", companyName: "青旅", organizerName: "张三" })).toBe("青旅");
    expect(hostName({ organizerType: "campus", companyName: "北京大学", organizerName: "张三" })).toBe("北京大学");
    expect(hostName({ organizerName: "李四" })).toBe("李四");
    expect(coverOf({ route: { cover: "/a.jpg" } })).toBe("/a.jpg");
    expect(coverOf({ gallery: [{ thumb: "/t.jpg" }] })).toBe("/t.jpg");
    expect(taglineOf({ playTags: [{ name: "徒步" }, { name: "摄影" }] })).toBe("徒步 · 摄影");
    expect(isFreeOffer({ offerType: "free", quote: { originPrice: 99 } })).toBe(true);
    expect(isFreeOffer({ quote: { originPrice: 0 } })).toBe(true);
    expect(isFreeOffer({ quote: { originPrice: 199 } })).toBe(false);
    expect(coverMark({ route: { title: "夜跑" } })).toBe("夜");
    expect(coverMark({})).toBe("局");
  });
});
