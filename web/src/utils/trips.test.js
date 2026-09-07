import { describe, it, expect } from "vitest";
import { isUpcomingTrip, splitTrips, tripKindLabel } from "./trips";

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

  it("labels activity vs outdoor", () => {
    expect(tripKindLabel({ channel: "activity" })).toBe("同城局");
    expect(tripKindLabel({ channel: "trip" })).toBe("山野团");
    expect(tripKindLabel({})).toBe("山野团");
  });
});
