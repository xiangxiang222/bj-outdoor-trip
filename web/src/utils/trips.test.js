import { describe, it, expect } from "vitest";
import { deskTrips, isUpcomingTrip, splitTrips, tripKindLabel } from "./trips";

describe("splitTrips", () => {
  const today = "2026-09-05";

  it("puts future joined trips in upcoming, cancelled and past in history", () => {
    const { upcoming, past } = splitTrips(
      [
        { id: 1, title: "夜跑", start_date: "2026-09-08", status: "joined", channel: "activity" },
        { id: 2, title: "慕田峪", start_date: "2026-08-01", status: "joined", channel: "trip" },
        { id: 3, title: "电影", start_date: "2026-09-20", status: "cancelled", channel: "activity" },
      ],
      today
    );
    expect(upcoming.map((r) => r.id)).toEqual([1]);
    expect(past.map((r) => r.id)).toEqual([2, 3]);
  });

  it("keeps waitlist out of 待出行", () => {
    const { upcoming, waitlist, past } = splitTrips(
      [
        { id: 1, start_date: "2026-09-08", status: "joined" },
        { id: 4, start_date: "2026-09-09", status: "waitlist" },
        { id: 5, start_date: "2026-08-01", status: "waitlist" },
      ],
      today
    );
    expect(upcoming.map((r) => r.id)).toEqual([1]);
    expect(waitlist.map((r) => r.id)).toEqual([4]);
    expect(past.map((r) => r.id)).toEqual([5]);
  });

  it("treats today as upcoming", () => {
    expect(isUpcomingTrip({ start_date: today, status: "joined" }, today)).toBe(true);
  });

  it("keeps a paid unformed trip in 招募中, even after the start date", () => {
    const desk = deskTrips(
      [
        { id: 1, title: "青崖子", start_date: "2026-09-08", status: "joined", pay_status: "paid", pay_amount: 3, minGroupSize: 10, joinedCount: 2, shortfall: 8, guaranteed: false, canReview: false },
        { id: 2, title: "已成团", start_date: "2026-09-09", status: "joined", pay_status: "paid", pay_amount: 100, minGroupSize: 2, joinedCount: 2, guaranteed: true },
        { id: 3, title: "过期未成团", start_date: "2026-08-01", status: "joined", pay_status: "paid", pay_amount: 20, minGroupSize: 8, joinedCount: 1, shortfall: 7, guaranteed: false, canReview: true },
        { id: 4, title: "待付", start_date: "2026-09-10", status: "joined", pay_status: "unpaid", pay_amount: 159, minGroupSize: 10, joinedCount: 1, guaranteed: false },
      ],
      today
    );
    expect(desk.recruiting.map((r) => r.id)).toEqual([3, 1]);
    expect(desk.depart.map((r) => r.id)).toEqual([2]);
    expect(desk.unpaid.map((r) => r.id)).toEqual([4]);
    expect(desk.past.map((r) => r.id)).toEqual([]);
    expect(desk.review.map((r) => r.id)).toEqual([]);
  });

  it("treats a paid recruiting trip as 招募中 even without a headcount", () => {
    const desk = deskTrips(
      [
        { id: 8, start_date: "2026-08-01", status: "joined", pay_status: "paid", pay_amount: 3, channel: "trip", schedule_status: "recruiting", canReview: true },
        { id: 9, start_date: "2026-09-12", status: "joined", pay_status: "paid", pay_amount: 80, channel: "trip", schedule_status: "confirmed" },
        { id: 10, start_date: "2026-08-02", status: "joined", pay_status: "paid", pay_amount: 0, channel: "activity", schedule_status: "recruiting", canReview: true },
      ],
      today
    );
    expect(desk.recruiting.map((r) => r.id)).toEqual([8]);
    expect(desk.depart.map((r) => r.id)).toEqual([9]);
    expect(desk.past.map((r) => r.id)).toEqual([10]);
    expect(desk.review.map((r) => r.id)).toEqual([10]);
  });

  it("labels activity vs organizer type", () => {
    expect(tripKindLabel({ channel: "activity" })).toBe("同城局");
    expect(tripKindLabel({ channel: "trip", organizerType: "official" })).toBe("官方团");
    expect(tripKindLabel({ channel: "trip", kind: "company" })).toBe("公司团");
    expect(tripKindLabel({ channel: "trip" })).toBe("个人拼团");
    expect(tripKindLabel({})).toBe("个人拼团");
  });
});
