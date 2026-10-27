import { describe, expect, it } from "vitest";
import { filterGuideRoster, guideCheckedIn, isHistoricalGuideTrip } from "./guideWorkspace";

describe("guide trip service queue", () => {
  const today = "2026-10-27";
  it("keeps an overnight trip in service until its last day", () => {
    expect(isHistoricalGuideTrip({ startDate: "2026-10-26", endDate: "2026-10-28" }, today)).toBe(false);
    expect(isHistoricalGuideTrip({ startDate: "2026-10-24", endDate: "2026-10-26" }, today)).toBe(true);
  });
  it("keeps a started trip visible until the guide closes it", () => {
    expect(isHistoricalGuideTrip({ startDate: "2026-10-26", startedAt: "2026-10-26 08:00" }, today)).toBe(false);
  });
  it("moves cancelled and completed trips out of the service queue", () => {
    expect(isHistoricalGuideTrip({ startDate: "2026-10-28", status: "cancelled" }, today)).toBe(true);
    expect(isHistoricalGuideTrip({ startDate: today, startedAt: "08:00", completedAt: "18:00" }, today)).toBe(true);
  });
});

describe("field attendance roster", () => {
  const roster = [
    { id: 1, name: "林同学", seatNo: "1A", phone: "138****1234", emergencyName: "林先生", checkinAt: "08:00", sessionChecked: false },
    { id: 2, name: "小陈", seatNo: "2B", phone: "139****5678", checkinAt: "08:01", sessionChecked: true },
    { id: 3, name: "王同学", seatNo: "1B", phone: "137****1234", checkinAt: "", sessionChecked: false },
  ];
  it("counts only the current round after a new check-in starts", () => {
    expect(guideCheckedIn(roster[0], false)).toBe(true);
    expect(guideCheckedIn(roster[0], true)).toBe(false);
    expect(filterGuideRoster(roster, { state: "unchecked", hasOpenSession: true }).map((p) => p.id)).toEqual([1, 3]);
  });
  it("combines phone suffix and attendance filters", () => {
    expect(filterGuideRoster(roster, { query: "1234", state: "unchecked" }).map((p) => p.id)).toEqual([3]);
  });
  it("finds a seat without depending on capitalization", () => {
    expect(filterGuideRoster(roster, { query: " 1a " }).map((p) => p.id)).toEqual([1]);
  });
  it("searches a traveler's name or emergency contact", () => {
    expect(filterGuideRoster(roster, { query: "林先生" }).map((p) => p.id)).toEqual([1]);
    expect(filterGuideRoster(roster, { query: "同学" }).map((p) => p.id)).toEqual([1, 3]);
  });
  it("handles an empty roster and returns no unmatched records", () => {
    expect(filterGuideRoster(null)).toEqual([]);
    expect(filterGuideRoster(roster, { query: "不存在" })).toEqual([]);
  });
});
