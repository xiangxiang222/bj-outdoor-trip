const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const dates = require("../../miniprogram/utils/departure-dates");

function harness(response = {}) {
  const filename = path.resolve(__dirname, "../../miniprogram/pages/index/index.js");
  const localRequire = createRequire(filename);
  const calls = [];
  let definition;
  const wx = { getStorageSync() {}, setStorageSync() {}, pageScrollTo() {}, showToast() {} };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    wx, getApp: () => ({ globalData: {} }), setTimeout, clearTimeout,
    Page(value) { definition = value; },
    require(id) {
      if (id === "../../utils/request") return { request(url) { calls.push(url); return Promise.resolve({ data: response[url] || [] }); } };
      if (id === "../../utils/appearance") return { isDark: () => false };
      return localRequire(id);
    },
  }, { filename });
  const page = { ...definition, data: structuredClone(definition.data) };
  page.setData = function (patch) {
    for (const [key, value] of Object.entries(patch)) {
      const parts = key.replace(/\[(\d+)\]/g, ".$1").split(".");
      let target = this.data;
      for (const part of parts.slice(0, -1)) target = target[part] ||= {};
      target[parts.at(-1)] = value;
    }
  };
  return { page, calls };
}
const event = (dataset) => ({ currentTarget: { dataset } });
const weekend = dates.weekendRange("weekend");
const nextWeekend = dates.weekendRange("nextweekend");
const yesterday = new Date(Date.parse(dates.chinaDay() + "T00:00:00Z") - 86400000).toISOString().slice(0, 10);
function schedule(id, date, patch = {}) {
  return { id, startDate: date, meetupTime: "23:59", status: "recruiting", reviewStatus: "approved", channel: "trip", city: "怀柔", organizerType: "company", companyName: "山野工作室", playTags: [{ name: "徒步" }], route: { title: "周末长城 " + id }, ...patch };
}
const rows = [
  schedule(1, weekend.start), schedule(2, nextWeekend.start),
  schedule(3, nextWeekend.end, { city: "密云" }),
  schedule(4, weekend.start, { channel: "activity" }),
  schedule(5, weekend.start, { reviewStatus: "pending" }),
  schedule(6, weekend.start, { status: "cancelled" }),
  schedule(7, yesterday), schedule(8, nextWeekend.start, { status: "finished" }),
];
function seed(page) {
  page.setData({ allSchedules: rows, city: "怀柔", tag: "徒步", hostKind: "company", companyName: "山野工作室", query: "长城" });
  page.applyGroups();
}
function ids(page) { return Array.from(page.data.groups, (row) => row.id); }
function showMonth(page, key) {
  const months = dates.departureMonths();
  const target = months.findIndex((month) => month.key === key);
  let current = months.findIndex((month) => month.key === page.data.departureMonth);
  while (current < target) { page.moveDepartureMonth(event({ offset: 1 })); current++; }
  while (current > target) { page.moveDepartureMonth(event({ offset: -1 })); current--; }
}

describe("native homepage departure selection", () => {
  it("refreshes elapsed departures when opening and closing the date sheet", (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-31T08:59:00+08:00") });
    const { page } = harness();
    page.setData({ allSchedules: [
      schedule(101, "2026-10-31", { meetupTime: "09:00" }),
      schedule(102, "2026-10-31", { meetupTime: "09:03" }),
    ] });
    page.applyGroups();
    assert.deepEqual(ids(page), [101, 102]);
    t.mock.timers.tick(120000);
    page.openDepartureDates();
    assert.deepEqual(ids(page), [102]);
    assert.equal(page.data.departureDraftCount, 1);
    assert.equal(page.data.departureCells.find((day) => day.date === "2026-10-31").count, 1);
    t.mock.timers.tick(180000);
    page.closeDepartureDates();
    assert.deepEqual(ids(page), []);
  });

  it("offers mutually exclusive weekend shortcuts without clearing non-time filters", () => {
    const { page } = harness();
    seed(page);
    assert.deepEqual(ids(page), [1, 2]);
    page.setData({ date: nextWeekend.start, monthKey: "2000-01", monthPicked: true, festivalKey: "old" });
    page.setDeparturePreset(event({ key: "weekend" }));
    assert.deepEqual(ids(page), [1]);
    assert.equal(page.data.date, "");
    assert.equal(page.data.monthPicked, false);
    assert.equal(page.data.festivalKey, "");
    page.setDeparturePreset(event({ key: "nextweekend" }));
    assert.deepEqual(ids(page), [2]);
    page.setDeparturePreset(event({ key: "any" }));
    assert.deepEqual(ids(page), [1, 2]);
    assert.equal(page.data.city, "怀柔");
    assert.equal(page.data.tag, "徒步");
    assert.equal(page.data.companyName, "山野工作室");
    assert.equal(page.data.query, "长城");
    page.setDeparturePreset(event({ key: "invalid" }));
    assert.equal(page.data.timePreset, "any");
  });

  it("keeps the calendar in draft until confirmation and counts only matching trip rows", () => {
    const { page, calls } = harness();
    seed(page);
    page.setDeparturePreset(event({ key: "weekend" }));
    page.openDepartureDates();
    showMonth(page, nextWeekend.start.slice(0, 7));
    page.selectDepartureDay(event({ date: nextWeekend.start }));
    assert.equal(page.data.departureDraftCount, 1);
    assert.equal(page.data.departureCells.find((day) => day.date === nextWeekend.start).count, 1);
    page.selectDepartureDay(event({ date: nextWeekend.start }));
    assert.equal(page.data.draftMode, "any");
    assert.equal(page.data.departureDraftCount, 2);
    page.selectDepartureDay(event({ date: nextWeekend.start }));
    assert.deepEqual(ids(page), [1]);
    page.closeDepartureDates();
    assert.deepEqual(ids(page), [1]);
    page.openDepartureDates();
    assert.equal(page.data.draftMode, "weekend");
    showMonth(page, nextWeekend.start.slice(0, 7));
    page.selectDepartureDay(event({ date: nextWeekend.start }));
    page.applyDepartureDates();
    assert.deepEqual(ids(page), [2]);
    assert.equal(page.data.date, nextWeekend.start);
    assert.equal(page.data.timePreset, "any");
    assert.equal(page.data.departurePreset, "custom");
    assert.equal(page.data.departureSheet, false);
    assert.deepEqual(calls, []);
  });

  it("aligns the calendar to weekdays, disables past dates and bounds navigation to twelve months", () => {
    const { page } = harness();
    seed(page);
    page.openDepartureDates();
    const initial = page.data.departureMonth;
    assert.equal(page.data.departureCanPrev, false);
    page.moveDepartureMonth(event({ offset: -1 }));
    assert.equal(page.data.departureMonth, initial);
    const past = page.data.departureCells.find((day) => day.date && day.date < dates.chinaDay());
    if (past) { page.selectDepartureDay(event({ date: past.date })); assert.equal(page.data.draftDate, ""); }
    page.selectDepartureDay(event({ date: "not-a-date" }));
    assert.equal(page.data.draftDate, "");
    for (let i = 0; i < 15; i++) page.moveDepartureMonth(event({ offset: 1 }));
    assert.equal(page.data.departureMonth, dates.departureMonths().at(-1).key);
    assert.equal(page.data.departureCanNext, false);
    assert.equal(page.data.departureCells.length % 7, 0);
    const first = page.data.departureCells.findIndex((day) => Boolean(day.date));
    const weekday = (new Date(page.data.departureMonth + "-01T00:00:00Z").getUTCDay() + 6) % 7;
    assert.equal(first, weekday);
  });

  it("supports entire-month selection and removes only time through the active chip", () => {
    const { page } = harness();
    seed(page);
    page.openDepartureDates();
    showMonth(page, nextWeekend.start.slice(0, 7));
    page.selectDepartureMonth();
    const selectedMonth = page.data.departureMonth;
    const expected = rows.filter((row) => [1, 2].includes(row.id) && row.startDate.startsWith(selectedMonth)).map((row) => row.id);
    assert.equal(page.data.departureDraftCount, expected.length);
    page.selectDepartureMonth();
    assert.equal(page.data.draftMode, "any");
    page.selectDepartureMonth();
    page.applyDepartureDates();
    assert.deepEqual(ids(page), expected);
    assert.equal(page.data.monthPicked, true);
    assert.equal(page.data.monthKey, selectedMonth);
    page.clearPick(event({ key: "time" }));
    assert.deepEqual(ids(page), [1, 2]);
    assert.equal(page.data.monthPicked, false);
    assert.equal(page.data.hostKind, "company");
    assert.equal(page.data.query, "长城");
  });

  it("preserves future holiday filters inside the sheet and resets only on apply", () => {
    const { page } = harness();
    seed(page);
    page.setData({ "home.festivals": [
      { key: "future", name: "假期", dates: [{ date: nextWeekend.start }] },
      { key: "past", name: "过去假期", dates: [{ date: yesterday }] },
      { key: "distant", name: "遥远假期", dates: [{ date: "2100-01-01" }] },
    ] });
    page.setDeparturePreset(event({ key: "weekend" }));
    page.openDepartureDates();
    assert.deepEqual(Array.from(page.data.departureFestivals, (item) => item.key), ["future"]);
    page.selectDepartureFestival(event({ key: "future" }));
    assert.equal(page.data.departureDraftCount, 1);
    assert.equal(page.data.departureMonth, nextWeekend.start.slice(0, 7));
    page.selectDepartureFestival(event({ key: "future" }));
    assert.equal(page.data.draftMode, "any");
    page.selectDepartureFestival(event({ key: "future" }));
    assert.deepEqual(ids(page), [1]);
    page.applyDepartureDates();
    assert.deepEqual(ids(page), [2]);
    assert.equal(page.data.festivalKey, "future");
    assert.equal(page.data.date, "");
    assert.equal(page.data.monthPicked, false);
    page.openDepartureDates();
    assert.equal(page.data.departureMonth, nextWeekend.start.slice(0, 7));
    page.resetDepartureDraft();
    assert.deepEqual(ids(page), [2]);
    page.applyDepartureDates();
    assert.deepEqual(ids(page), [1, 2]);
  });

  it("retains selected dates across refresh and resets time when opening campus groups", async () => {
    const { page } = harness({ "/home": { festivals: [], months: [{ key: "2000-01" }] }, "/schedules?channel=trip": rows });
    seed(page);
    page.setDate(event({ date: nextWeekend.start }));
    await page.load();
    assert.deepEqual(ids(page), [2]);
    assert.equal(page.data.date, nextWeekend.start);
    page.setDeparturePreset(event({ key: "nextweekend" }));
    page.quickHost(event({ kind: "campus" }));
    assert.equal(page.data.timePreset, "any");
    assert.equal(page.data.date, "");
    assert.equal(page.data.monthPicked, false);
    assert.equal(page.data.hostKind, "campus");
  });
});
