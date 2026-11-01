const { describe, it, mock } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");

function harness(row) {
  const filename = path.resolve(__dirname, "../../miniprogram/pages/schedule/schedule.js");
  const localRequire = createRequire(filename);
  const calls = [];
  const navigations = [];
  const toasts = [];
  let definition;
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    require(id) {
      if (id === "../../utils/request") return { request(url) { calls.push(url); return Promise.resolve({ data: url === "/schedules/10" ? structuredClone(row) : {} }); } };
      return localRequire(id);
    },
    Date,
    Page(value) { definition = value; },
    getApp() { return { globalData: { baseUrl: "https://example.test", token: "test" } }; },
    wx: { setNavigationBarTitle() {}, nextTick(fn) { fn(); }, navigateTo(value) { navigations.push(value); }, showToast(value) { toasts.push(value); } },
  }, { filename });
  const page = { ...definition, data: structuredClone(definition.data) };
  page.data.id = 10;
  page.prepareShare = () => {};
  page.setData = function (patch, callback) { Object.assign(this.data, patch); if (callback) callback(); };
  return { page, calls, navigations, toasts };
}
const future = "2099-01-01";
function activity(patch = {}) {
  return { id: 10, channel: "activity", startDate: future, endDate: future, meetupTime: "19:30", meetupPoint: "太古里", maxSeats: 12, enrolled: 1, remain: 11, status: "recruiting", reviewStatus: "approved", quote: { price: 0, originPrice: 0 }, routeId: 99, route: { id: 99, category: "掼蛋", title: "新手局", cover: "/static/activity/cards.png", packingList: ["登山杖"], equipment: "冲锋衣", highlights: ["登山观景"] }, ...patch };
}
async function load(row) {
  const result = harness(row);
  result.page.load();
  await new Promise((done) => setImmediate(done));
  return result;
}

describe("native city activity details", () => {
  it("keeps a one-off activity separate from its internal route and bus seats", async () => {
    const { page, calls } = await load(activity());
    assert.equal(page.data.loadErr, "");
    assert.equal(page.data.activityKind.slug, "cards");
    assert.equal(page.data.showEnroll, true);
    assert.equal(page.data.activityTitle, "招募中");
    assert.equal(page.data.equipment, "");
    assert.deepEqual(Array.from(page.data.packing), []);
    assert.equal(calls.some((url) => url.startsWith("/routes/")), false);
    assert.equal(calls.some((url) => url.endsWith("/seats")), false);
    assert.ok(calls.includes("/schedules/10/reviews"));
  });
  it("shows an ended attendance record without inviting the participant to attend or share", async () => {
    const { page } = await load(activity({ startDate: "2020-01-01", endDate: "2020-01-01", myEnrollment: { status: "joined", payStatus: "paid", remainAmount: 0 } }));
    assert.equal(page.data.showEnroll, false);
    assert.equal(page.data.activityClosed, true);
    assert.equal(page.data.ticket.title, "活动已结束");
    assert.equal(page.data.ticket.trips, true);
    assert.equal(page.data.ticket.share, false);
    assert.doesNotMatch(page.data.ticket.sub, /到场|赴约/);
    assert.doesNotMatch(page.data.peopleText, /余|候补|成局/);
    assert.doesNotMatch(page.data.activityGroupEmpty, /到场|确认参加并完成支付后/);
    assert.doesNotMatch(page.data.activityGroupHint, /见面前/);
  });
  it("checks the current clock again when a previously open activity is tapped after its start time", async () => {
    const clock = mock.method(Date, "now", () => Date.parse("2026-11-01T19:29:00+08:00"));
    try {
      const { page, navigations, toasts } = await load(activity({ startDate: "2026-11-01", endDate: "2026-11-01" }));
      assert.equal(page.data.showEnroll, true);
      clock.mock.mockImplementation(() => Date.parse("2026-11-01T19:30:00+08:00"));
      page.enroll();
      assert.equal(navigations.length, 0);
      assert.equal(toasts[0].title, "本次活动已关闭报名");
      await new Promise((done) => setImmediate(done));
      assert.equal(page.data.activityTitle, "活动已开始");
      assert.equal(page.data.showEnroll, false);
    } finally { clock.mock.restore(); }
  });
  for (const [en, expected] of [
    [{ status: "waitlist", remainAmount: 0 }, "候补中"],
    [{ status: "applied", remainAmount: 0 }, "报名待确认"],
    [{ status: "joined", remainAmount: 20, payStatus: "unpaid" }, "待付款"],
    [{ status: "joined", remainAmount: 0, payStatus: "paid" }, "已报名"],
  ]) it(`distinguishes ${expected} from confirmed attendance`, async () => {
    const { page } = await load(activity({ myEnrollment: en }));
    assert.equal(page.data.activityTitle, expected);
    assert.equal(page.data.ticket.title, expected);
    assert.equal(page.data.showEnroll, false);
  });
  it("does not invite registrations for a cancelled or pending activity", async () => {
    const cancelled = (await load(activity({ status: "cancelled" }))).page.data;
    assert.equal(cancelled.activityTitle, "活动已取消");
    assert.equal(cancelled.showEnroll, false);
    const pending = (await load(activity({ reviewStatus: "pending", isOrganizer: true }))).page.data;
    assert.equal(pending.activityTitle, "审核中");
    assert.equal(pending.ticket.title, "审核中");
    assert.equal(pending.showEnroll, false);
  });
  it("lets an organizer cancel a pending activity independently of enrollment controls and honors server restrictions", async () => {
    const { page } = await load(activity({ isOrganizer: true, reviewStatus: "pending", startDate: "2020-01-01", canDissolve: true }));
    assert.equal(page.data.showEnroll, false);
    assert.equal(page.data.canDissolve, true);
    page.toggleDissolve();
    assert.equal(page.data.showDissolve, true);
    const denied = (await load(activity({ isOrganizer: true, canDissolve: false }))).page;
    denied.toggleDissolve();
    assert.equal(denied.data.showDissolve, false);
  });
  it("rejects generated QR fallbacks and removes an uploaded QR after a load failure", async () => {
    const missing = (await load(activity({ consultGroupQr: "/api/qr?text=官方微信群" }))).page;
    assert.equal(missing.data.activityGroupQr, "");
    const uploaded = "https://example.test/static/uploads/activity-group.png";
    const { page } = await load(activity({ consultGroupQr: uploaded }));
    assert.equal(page.data.activityGroupQr, uploaded);
    page.groupQrError();
    assert.equal(page.data.activityGroupQr, "");
    assert.equal(page.data.activityGroupQrError, true);
    page.retryGroupQr();
    assert.equal(page.data.activityGroupQr, uploaded);
    assert.equal(page.data.activityGroupQrError, false);
  });
});
