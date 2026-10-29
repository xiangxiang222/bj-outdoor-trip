import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import * as web from "./departureDates";

const require = createRequire(import.meta.url);
const native = require("../../../miniprogram/utils/departure-dates.js");
const NOW = new Date("2026-10-29T02:00:00Z"); // 10:00 in Beijing.
const trip = (id, startDate, patch = {}) => ({ id, startDate, channel: "trip", status: "recruiting", reviewStatus: "approved", ...patch });
const dates = (rows) => rows.filter((cell) => !cell.blank).map((cell) => cell.date);

const fixtures = [
  trip(1, "2026-10-30"),
  trip(2, "2026-10-30", { status: "full" }), // Full groups remain visible for waitlisting.
  trip(3, "2026-10-30", { reviewStatus: "pending" }),
  trip(4, "2026-10-30", { reviewStatus: "rejected" }),
  trip(5, "2026-10-30", { status: "cancelled" }),
  trip(6, "2026-10-30", { status: "finished" }),
  trip(7, "2026-10-30", { channel: "activity" }),
  trip(8, "2026-10-28"),
  trip(9, "2026-02-30"),
  trip(10, "2026-10-29", { meetupTime: "10:00" }),
  trip(11, "2026-10-29", { meetupTime: "10:01" }),
  trip(12, "2026-10-29", { meetupTime: "09:59" }),
  trip(13, "2026-10-29", { meetupTime: "" }), // Missing times are not guessed.
  { id: 14, start_date: "2026-10-30", status: "confirmed", review_status: "approved" },
  { id: 15, startDate: "2026-10-30" }, // Legacy records without channel/review fields.
  trip(16, "2026-10-30", { status: "ended" }),
  trip(17, "2026-10-30", { status: "completed" }),
  { id: 18, start_date: "2026-10-30", review_status: "pending" },
  null,
  {},
];

for (const [client, helpers] of [["H5", web], ["mini-program", native]]) {
  describe(`${client} departure dates`, () => {
    it("uses the Beijing day on both sides of midnight, regardless of the device's local offset", () => {
      expect(helpers.chinaDay("2026-10-28T15:59:59.999Z")).toBe("2026-10-28");
      expect(helpers.chinaDay("2026-10-28T16:00:00Z")).toBe("2026-10-29");
      expect(helpers.chinaDay("2026-10-28T09:00:00-07:00")).toBe("2026-10-29");
      expect(helpers.chinaDay("2027-12-31T16:00:00Z")).toBe("2028-01-01");
      expect(helpers.chinaDay("not a date")).toBe("");
    });

    it("finds this and next weekend across a month boundary without treating them as one range", () => {
      expect(helpers.weekendRange("weekend", NOW)).toEqual({ start: "2026-10-31", end: "2026-11-01" });
      expect(helpers.weekendRange("nextweekend", NOW)).toEqual({ start: "2026-11-07", end: "2026-11-08" });
      expect(helpers.weekendRange("weekend", "2026-10-31T04:00:00Z")).toEqual({ start: "2026-10-31", end: "2026-11-01" });
    });

    it("keeps only the remaining Sunday in this weekend and starts a fresh week on Monday", () => {
      expect(helpers.weekendRange("weekend", "2026-11-01T04:00:00Z")).toEqual({ start: "2026-11-01", end: "2026-11-01" });
      expect(helpers.weekendRange("nextweekend", "2026-11-01T04:00:00Z")).toEqual({ start: "2026-11-07", end: "2026-11-08" });
      expect(helpers.weekendRange("weekend", "2026-11-01T16:00:00Z")).toEqual({ start: "2026-11-07", end: "2026-11-08" });
    });

    it("keeps year-end weekends and rejects unknown shortcuts", () => {
      expect(helpers.weekendRange("weekend", "2026-12-31T04:00:00Z")).toEqual({ start: "2027-01-02", end: "2027-01-03" });
      expect(helpers.weekendRange("nextweekend", "2026-12-31T04:00:00Z")).toEqual({ start: "2027-01-09", end: "2027-01-10" });
      expect(helpers.weekendRange("holiday", NOW)).toEqual({ start: "", end: "" });
      expect(helpers.weekendRange("weekend", "invalid")).toEqual({ start: "", end: "" });
    });

    it("builds exactly twelve consecutive months even when opened on the last day of a month", () => {
      const months = helpers.departureMonths("2026-08-31T04:00:00Z");
      expect(months).toHaveLength(12);
      expect(months.map((month) => month.key)).toEqual([
        "2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01",
        "2027-02", "2027-03", "2027-04", "2027-05", "2027-06", "2027-07",
      ]);
      expect(months[5]).toEqual({ key: "2027-01", label: "1月", year: 2027 });
      expect(helpers.departureMonths("2026-12-31T16:00:00Z")[0].key).toBe("2027-01");
      expect(helpers.departureMonths("invalid")).toEqual([]);
    });

    it("aligns the month to Monday–Sunday with inert leading and trailing cells", () => {
      const cells = helpers.buildDepartureMonth("2026-10", [], NOW);
      expect(cells).toHaveLength(35);
      expect(cells.slice(0, 3).every((cell) => cell.blank && cell.disabled && !cell.date)).toBe(true);
      expect(cells[3]).toMatchObject({ date: "2026-10-01", label: "1", weekday: 4, blank: false });
      expect(cells[33]).toMatchObject({ date: "2026-10-31", weekday: 6 });
      expect(cells[34]).toMatchObject({ date: "", weekday: 7, blank: true, disabled: true });
      expect(new Set(cells.map((cell) => cell.key)).size).toBe(cells.length);
      expect(dates(cells)).toHaveLength(31);
    });

    it("renders leap February, an exact four-week February and six-week months correctly", () => {
      const leap = helpers.buildDepartureMonth("2028-02", [], "2028-01-01T00:00:00Z");
      expect(dates(leap)).toHaveLength(29);
      expect(leap.find((cell) => cell.date === "2028-02-29")).toMatchObject({ weekday: 2, disabled: false });
      expect(helpers.buildDepartureMonth("2027-02", [], NOW)).toHaveLength(28);
      expect(helpers.buildDepartureMonth("2026-03", [], "2026-01-01T00:00:00Z")).toHaveLength(42);
    });

    it("disables past days using Beijing midnight while leaving zero-group future dates selectable", () => {
      const cells = helpers.buildDepartureMonth("2026-10", [], "2026-10-28T16:00:00Z");
      expect(cells.find((cell) => cell.date === "2026-10-28")).toMatchObject({ disabled: true, count: 0 });
      expect(cells.find((cell) => cell.date === "2026-10-29")).toMatchObject({ disabled: false, count: 0 });
      expect(cells.find((cell) => cell.date === "2026-10-31")).toMatchObject({ disabled: false, count: 0 });
    });

    it("counts the same real approved departures shown in the feed without mutating its data", () => {
      const before = structuredClone(fixtures);
      const available = helpers.availableDepartures(fixtures, NOW);
      expect(available.map((row) => row.id)).toEqual([1, 2, 11, 13, 14, 15]);
      const cells = helpers.buildDepartureMonth("2026-10", fixtures, NOW);
      expect(cells.find((cell) => cell.date === "2026-10-29").count).toBe(2);
      expect(cells.find((cell) => cell.date === "2026-10-30").count).toBe(4);
      expect(cells.find((cell) => cell.date === "2026-10-31").count).toBe(0);
      expect(fixtures).toEqual(before);
    });

    it("accepts legacy date/time fields and removes a departure at its actual collection time", () => {
      const rows = [
        { id: 1, start_date: "2026-10-29", meetup_time: "10:00" },
        { id: 2, start_date: "2026-10-29", meetup_time: "10:01" },
      ];
      expect(helpers.availableDepartures(rows, NOW).map((row) => row.id)).toEqual([2]);
      expect(helpers.availableDepartures(rows, "2026-10-29T01:59:00Z").map((row) => row.id)).toEqual([1, 2]);
    });

    it("matches one selected departure day or a whole calendar month", () => {
      const row = trip(1, "2026-11-01");
      expect(helpers.matchesDepartureTime(row, { date: "2026-11-01" }, NOW)).toBe(true);
      expect(helpers.matchesDepartureTime(row, { date: "2026-10-31" }, NOW)).toBe(false);
      expect(helpers.matchesDepartureTime(row, { month: "2026-11" }, NOW)).toBe(true);
      expect(helpers.matchesDepartureTime(row, { month: "2026-10" }, NOW)).toBe(false);
      expect(helpers.matchesDepartureTime(row, { preset: "any" }, NOW)).toBe(true);
    });

    it("keeps this weekend and next weekend separate, including the Sunday boundary", () => {
      const rows = ["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02", "2026-11-07", "2026-11-08", "2026-11-09"].map((day, index) => trip(index, day));
      expect(rows.filter((row) => helpers.matchesDepartureTime(row, { preset: "weekend" }, NOW)).map((row) => row.startDate)).toEqual(["2026-10-31", "2026-11-01"]);
      expect(rows.filter((row) => helpers.matchesDepartureTime(row, { preset: "nextweekend" }, NOW)).map((row) => row.startDate)).toEqual(["2026-11-07", "2026-11-08"]);
      expect(helpers.matchesDepartureTime(trip(1, "2026-10-31"), { preset: "weekend" }, "2026-11-01T04:00:00Z")).toBe(false);
    });

    it("matches configured festival dates from arrays or sets without inventing a holiday range", () => {
      const row = trip(1, "2027-01-02");
      expect(helpers.matchesDepartureTime(row, { festivalDates: ["2027-01-01", "2027-01-02"] }, NOW)).toBe(true);
      expect(helpers.matchesDepartureTime(row, { festivalDates: [{ date: "2027-01-02" }] }, NOW)).toBe(true);
      expect(helpers.matchesDepartureTime(row, { festivalDates: new Set(["2027-01-02"]) }, NOW)).toBe(true);
      expect(helpers.matchesDepartureTime(row, { festivalDates: ["2027-01-01", "2027-01-03"] }, NOW)).toBe(false);
      expect(helpers.matchesDepartureTime(row, { festivalDates: [] }, NOW)).toBe(false);
      expect(helpers.matchesDepartureTime(row, { festivalDates: new Set() }, NOW)).toBe(false);
    });

    it("rejects malformed dates and calendar months without producing an unrestricted match", () => {
      for (const value of [null, {}, "2026-02-30", "2026-13-01", "bad"]) {
        expect(helpers.matchesDepartureTime({ startDate: value }, {}, NOW)).toBe(false);
      }
      for (const month of ["", "2026-00", "2026-13", "2026-1", "2026-01-01", null]) expect(helpers.buildDepartureMonth(month, [], NOW)).toEqual([]);
      expect(helpers.matchesDepartureTime(trip(1, "2026-11-01"), { date: "invalid" }, NOW)).toBe(false);
      expect(helpers.matchesDepartureTime(trip(1, "2026-11-01"), { month: "2026-13" }, NOW)).toBe(false);
      expect(helpers.matchesDepartureTime(trip(1, "2026-11-01"), { preset: "invalid" }, NOW)).toBe(false);
      expect(helpers.availableDepartures(null, NOW)).toEqual([]);
    });
  });
}

describe("departure date client parity", () => {
  it("returns identical complete calendar data and filtered rows across month/year boundaries", () => {
    for (const now of [NOW, "2026-10-31T16:00:00Z", "2026-12-31T16:00:00Z", "2028-02-28T16:00:00Z"]) {
      expect(native.chinaDay(now)).toBe(web.chinaDay(now));
      expect(native.departureMonths(now)).toEqual(web.departureMonths(now));
      expect(native.availableDepartures(fixtures, now)).toEqual(web.availableDepartures(fixtures, now));
      for (const month of ["2026-10", "2026-11", "2027-01", "2028-02"]) {
        expect(native.buildDepartureMonth(month, fixtures, now)).toEqual(web.buildDepartureMonth(month, fixtures, now));
      }
      for (const preset of ["any", "weekend", "nextweekend"]) {
        expect(native.weekendRange(preset, now)).toEqual(web.weekendRange(preset, now));
        expect(fixtures.filter((row) => native.matchesDepartureTime(row, { preset }, now))).toEqual(fixtures.filter((row) => web.matchesDepartureTime(row, { preset }, now)));
      }
    }
  });
});
