import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import * as webTrips from "./trips";
import { orderBadge as webOrderBadge } from "./orderView";

const require = createRequire(import.meta.url);
const miniTrips = require("../../../miniprogram/utils/trips.js");
const { orderBadge: miniOrderBadge } = require("../../../miniprogram/utils/order-view.js");
const today = "2026-10-29";
const formed = { status: "joined", channel: "trip", pay_status: "paid", schedule_status: "confirmed", start_date: "2026-10-27", end_date: "2026-10-28", route_id: 1 };

describe.each([
  ["H5", webTrips, webOrderBadge],
  ["小程序", miniTrips, miniOrderBadge],
])("%s 行程生命周期", (_name, trips, orderBadge) => {
  it("uses the Beijing day across UTC midnight boundaries", () => {
    expect(trips.todayYmd(new Date("2026-10-28T15:59:59Z"))).toBe("2026-10-28");
    expect(trips.todayYmd(new Date("2026-10-28T16:00:00Z"))).toBe("2026-10-29");
    expect(trips.todayYmd(new Date("2026-10-29T02:00:00-07:00"))).toBe(today);
  });

  it("keeps a multi-day journey active until its actual end date passes", () => {
    const row = { ...formed, end_date: "2026-10-30", canReview: true };
    expect(trips.isUpcomingTrip(row, today)).toBe(true);
    expect(trips.isEndedTrip(row, today)).toBe(false);
    expect(trips.isReviewTrip(row, today)).toBe(false);
    expect(trips.isEndedTrip({ ...row, end_date: today }, today)).toBe(false);
    expect(trips.isEndedTrip({ ...row, end_date: "2026-10-28" }, today)).toBe(true);
  });

  it.each([
    { completed: true },
    { completed_at: "2026-10-29 10:00:00" },
    { completedAt: "2026-10-29 10:00:00" },
    { schedule_status: "finished" },
    { schedule_status: "completed" },
    { schedule_status: "ended" },
  ])("respects explicit completion even on the departure day: %j", (completion) => {
    const row = { ...formed, start_date: today, end_date: today, schedule_status: "recruiting", ...completion };
    expect(trips.isEndedTrip(row, today)).toBe(true);
    expect(trips.isUpcomingTrip(row, today)).toBe(false);
    expect(trips.isRecruitingTrip(row, today)).toBe(false);
    expect(orderBadge(row, today)).toEqual({ key: "done", label: "已结束" });
  });

  it("keeps completion out of the old overdue-unformed badge", () => {
    const row = { ...formed, schedule_status: "recruiting", completed: true };
    expect(orderBadge(row, today).label).toBe("已结束");
    expect(orderBadge({ ...row, canReview: true }, today).label).toBe("待评价");
  });

  it.each([
    { status: "cancelled" },
    { status: "applied" },
    { status: "waitlist" },
    { schedule_status: "cancelled" },
    { scheduleStatus: "cancelled" },
    { pay_status: "refunded" },
  ])("does not turn cancellation, confirmation or refund records into ended trips: %j", (state) => {
    expect(trips.isEndedTrip({ ...formed, completed: true, ...state }, today)).toBe(false);
  });

  it("keeps never-formed outdoor groups out of ended and review", () => {
    const row = { ...formed, schedule_status: "recruiting", guaranteed: false, joinedCount: 1, minGroupSize: 5, canReview: true };
    expect(trips.isEndedTrip(row, today)).toBe(false);
    expect(trips.isReviewTrip(row, today)).toBe(false);
    expect(orderBadge(row, today).label).toBe("待处理");
  });

  it("retains genuinely completed journeys with a partial refund record", () => {
    const row = { ...formed, completed: true, refundProgress: { amount: 10, text: "部分退款 ¥10" } };
    expect(trips.isEndedTrip(row, today)).toBe(true);
    expect(trips.deskTrips([row], today).ended).toHaveLength(1);
  });

  it("allows review to overlap ended, without leaking completion into departure", () => {
    const completed = { ...formed, id: 1, start_date: today, end_date: today, completed: true, canReview: true };
    const older = { ...formed, id: 2 };
    const next = { ...formed, id: 3, start_date: "2026-11-02", end_date: "2026-11-03" };
    const desk = trips.deskTrips([older, next, completed], today);
    expect(desk.ended.map((row) => row.id)).toEqual([1, 2]);
    expect(desk.review.map((row) => row.id)).toEqual([1]);
    expect(desk.depart.map((row) => row.id)).toEqual([3]);
    expect(desk.past.map((row) => row.id)).toEqual([2, 1]);
  });

  it("validates calendar dates and falls back from an impossible end date", () => {
    expect(trips.tripEndDay({ startDate: today, endDate: "2026-10-30" })).toBe("2026-10-30");
    expect(trips.tripEndDay({ start_date: today, end_date: "2026-02-30" })).toBe(today);
    expect(trips.tripEndDay({ start_date: today, end_date: "2026-10-01" })).toBe(today);
    expect(trips.isEndedTrip({ ...formed, start_date: "2026-02-30", end_date: "invalid" }, today)).toBe(false);
    expect(trips.isUpcomingTrip({ status: "joined", start_date: "invalid" }, today)).toBe(false);
  });

  it("normalizes old links without treating arbitrary values as a valid tab", () => {
    for (const alias of ["ended", "completed", "finished", "past"]) expect(trips.normalizeTripTab(alias)).toBe("ended");
    expect(trips.normalizeTripTab("upcoming")).toBe("depart");
    expect(trips.normalizeTripTab("refund")).toBe("refund");
    expect(trips.normalizeTripTab("unknown")).toBe("");
  });
});

function nativeOrdersPage(request) {
  let config;
  runInNewContext(readFileSync(new URL("../../../miniprogram/pages/orders/orders.js", import.meta.url), "utf8"), {
    require: (id) => {
      if (id === "../../utils/request") return { request, showError: vi.fn() };
      if (id === "../../utils/trips") return miniTrips;
      if (id === "../../utils/order-view") return require("../../../miniprogram/utils/order-view.js");
      if (id === "../../utils/appearance") return { isDark: () => false };
      throw new Error("Unexpected dependency " + id);
    },
    Page: (page) => { config = page; },
    getApp: () => ({ globalData: { token: "test-token" } }),
    wx: {},
  });
  const page = { ...config, data: structuredClone(config.data) };
  page.setData = (patch) => Object.assign(page.data, patch);
  return page;
}

describe("小程序行程交互回归", () => {
  it("shows actionable state details in the card copy while ordinary journeys keep their brand copy", async () => {
    const request = vi.fn().mockResolvedValue({ data: [
      { ...formed, id: 1, start_date: "2000-01-01", end_date: "2000-01-01", schedule_status: "recruiting", guaranteed: false, minGroupSize: 5, joinedCount: 1 },
      { ...formed, id: 2, start_date: "2099-01-01", end_date: "2099-01-01", schedule_status: "recruiting", minGroupSize: 5, joinedCount: 1, shortfall: 4, pay_amount: 80 },
      { ...formed, id: 3, pay_status: "refunded", refundProgress: { text: "已原路退回微信 ¥80" } },
      { ...formed, id: 4 },
      { ...formed, id: 5, channel: "activity" },
    ] });
    const page = nativeOrdersPage(request);
    page.onLoad({ tab: "all" });
    await page.load();
    expect(page.data.list.map((row) => row.cardCopy)).toEqual([
      "出发日已过，等并团或解散退款", "已支付 ¥80 · 还差 4 人", "已原路退回微信 ¥80",
      "走进山野，和同频的人同行", "同城相遇，一起赴约",
    ]);
    const template = readFileSync(new URL("../../../miniprogram/pages/orders/orders.wxml", import.meta.url), "utf8");
    expect(template).toContain("tr.t(item.cardCopy,lang)");
  });

  it.each(["past", "completed", "finished"])("preserves the %s deep link when orders arrive", async (tab) => {
    const request = vi.fn().mockResolvedValue({ data: [{ ...formed, completed: true, id: 4 }] });
    const page = nativeOrdersPage(request);
    page.onLoad({ tab });
    await page.load();
    expect(page.data.tab).toBe("ended");
    expect(page.data.shown.map((row) => row.id)).toEqual([4]);
    expect(page.data.statusTabs.some((item) => item.key === "ended")).toBe(true);
  });

  it("retains existing journeys on refresh failure and replaces them on retry", async () => {
    const request = vi.fn().mockResolvedValueOnce({ data: [{ ...formed, id: 4 }] }).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ data: [{ ...formed, id: 5 }] });
    const page = nativeOrdersPage(request);
    page.onLoad({ tab: "all" });
    await page.load();
    await page.load();
    expect(page.data.loadError).toBe(true);
    expect(page.data.list.map((row) => row.id)).toEqual([4]);
    expect(page.data.shown.map((row) => row.id)).toEqual([4]);
    expect(page.data.loading).toBe(false);
    await page.load();
    expect(page.data.loadError).toBe(false);
    expect(page.data.list.map((row) => row.id)).toEqual([5]);
  });

  it("does not show a false empty state when the initial request fails", async () => {
    const page = nativeOrdersPage(vi.fn().mockRejectedValue(new Error("offline")));
    await page.load();
    expect(page.data.ready).toBe(false);
    expect(page.data.loadError).toBe(true);
    expect(page.data.loading).toBe(false);
  });

  it("keeps an inverted date range in the filter sheet until corrected", () => {
    const page = nativeOrdersPage(vi.fn());
    page.setData({ sheet: true, tab: "all", draftTab: "ended", draftStart: "2026-10-29", draftEnd: "2026-10-01" });
    page.applyFilter();
    expect(page.data.sheet).toBe(true);
    expect(page.data.filterError).toBe("起始时间不能晚于终止时间");
    expect(page.data.tab).toBe("all");
    page.setEnd({ detail: { value: "2026-10-31" } });
    page.applyFilter();
    expect(page.data.sheet).toBe(false);
    expect(page.data.filterError).toBe("");
    expect(page.data.tab).toBe("ended");
    expect(page.data.end).toBe("2026-10-31");
  });

  it("ignores a delayed response after the page has unloaded", async () => {
    let resolve;
    const request = vi.fn(() => new Promise((done) => { resolve = done; }));
    const page = nativeOrdersPage(request);
    const pending = page.load();
    expect(page.load()).toBe(pending);
    page.onUnload();
    resolve({ data: [{ ...formed, id: 4 }] });
    await pending;
    expect(page.data.ready).toBe(false);
    expect(page.data.list).toEqual([]);
    expect(request).toHaveBeenCalledTimes(1);
  });
});
