import { describe, it, expect } from "vitest";
import { canShowEnroll, dockPrice, enrollCta, peopleLine, ticketState, timeLine, trustChips } from "./scanFacts";

describe("scanFacts", () => {
  it("keeps full trips as waitlist people line", () => {
    expect(peopleLine({ enrolled: 30, maxSeats: 30, remain: 0, waitlistCount: 2 })).toBe("已满 · 可候补 2 人");
    expect(peopleLine({ enrolled: 4, maxSeats: 8, remain: 4, channel: "activity" })).toBe("还缺 4 人 · 已有 4/8");
  });

  it("shows pay / cancel / insurance chips", () => {
    expect(trustChips({ channel: "trip" })).toEqual(["先报名后付款", "出发日前可取消", "山野可加购意外险"]);
    expect(trustChips({ channel: "activity" })).toEqual(["先报名后付款", "出发日前可取消", "到场找发起人"]);
  });

  it("builds dock price and enroll CTA", () => {
    expect(dockPrice({ quote: { originPrice: 0, tripPrice: 0 } }).free).toBe(true);
    expect(dockPrice({ quote: { originPrice: 199, memberPrice: 189 } })).toEqual({ free: false, main: "¥199", sub: "会员 ¥189" });
    expect(enrollCta({ remain: 0, channel: "trip" })).toBe("已满员，去候补");
    expect(enrollCta({ remain: 3, channel: "activity" })).toBe("报名本局");
    expect(canShowEnroll({ myEnrollment: { status: "joined" } })).toBe(false);
    expect(canShowEnroll({ status: "recruiting", reviewStatus: "approved" })).toBe(true);
  });

  it("turns enroll and publish into ticket states", () => {
    expect(ticketState({ reviewStatus: "pending", isOrganizer: true }).kind).toBe("posted");
    expect(ticketState({ myEnrollment: { status: "waitlist" } }).title).toBe("候补票");
    expect(ticketState({ channel: "activity", myEnrollment: { status: "joined" } }).title).toBe("已报名");
    expect(ticketState({ channel: "trip" }, { joined: "1" }).kind).toBe("joined");
    expect(ticketState({ channel: "trip" })).toBe(null);
  });

  it("joins date and meetup time", () => {
    expect(timeLine({ startDate: "2026-09-12", meetupTime: "07:30" })).toBe("2026-09-12 07:30");
    expect(timeLine({ channel: "activity", startDate: "2026-09-12", meetupTime: "19:30" })).toBe("09-12 19:30");
  });
});
