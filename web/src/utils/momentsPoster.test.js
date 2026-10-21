import { describe, expect, it } from "vitest";
import { buildLineup, lineupHeight } from "./momentsPoster";

function trip(extra) {
  return {
    startDate: "2026-10-24",
    meetupPoint: "通州",
    route: {
      title: "秋林铺-百花山",
      difficulty: "进阶",
      distanceKm: 11,
      days: 1,
      subtitle: "被打翻的调色盘",
      category: "登山",
      cover: "/static/cover.jpg",
    },
    ...extra,
  };
}

describe("moments lineup poster", () => {
  it("groups the visible trips by day and keeps the meeting points", () => {
    const model = buildLineup([
      trip(),
      trip({
        meetupPoint: "芍药居",
        route: { title: "白瀑寺", difficulty: "休闲", distanceKm: 14, days: 1, subtitle: "了思台上", category: "文化" },
      }),
      trip({
        startDate: "2026-10-25",
        meetupPoint: "通州",
        route: { title: "日光山谷", difficulty: "休闲", distanceKm: 7, days: 1, subtitle: "", category: "山水" },
      }),
    ], { city: "通州区" });
    expect(model.title).toBe("通州徒步活动");
    expect(model.subtitle).toBe("——通州、芍药居集合");
    expect(model.groups.map((group) => group.md)).toEqual(["10.24", "10.25"]);
    expect(model.groups[0].week).toBe("Sat.周六");
    expect(model.groups[0].items[0].stats).toBe("路线  距离 11KM");
    expect(model.groups[0].items[0].pitch).toContain("被打翻的调色盘");
    expect(model.groups[1].items[0].pitch).toBe("看点  山水");
    expect(model.cover).toBe("/static/cover.jpg");
    expect(lineupHeight(model)).toBeGreaterThan(900);
    const many = Array.from({ length: 5 }, () => trip());
    const plain = buildLineup(many);
    const coded = buildLineup(many);
    coded.qr = "data:image/png;base64,xx";
    expect(lineupHeight(coded)).toBe(lineupHeight(plain) + 144);
  });

  it("stops at six trips and uses a general title when no district is chosen", () => {
    const rows = Array.from({ length: 8 }, (_, i) => trip({
      startDate: `2026-10-${String(24 + (i % 2)).padStart(2, "0")}`,
      route: { title: `线路${i}`, difficulty: "休闲", distanceKm: 0, days: 2, subtitle: "", category: "长城" },
    }));
    const model = buildLineup(rows);
    expect(model.count).toBe(6);
    expect(model.title).toBe("北京周边徒步");
    expect(model.groups[0].items[0].stats).toBe("路线  2日");
  });
});
