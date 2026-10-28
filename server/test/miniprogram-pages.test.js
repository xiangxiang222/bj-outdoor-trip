const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");

// Exercise the native page controllers without a device or a business database.
function pageHarness(pageName, options = {}) {
  const filename = path.resolve(__dirname, "../../miniprogram/pages", pageName, `${pageName}.js`);
  const localRequire = createRequire(filename);
  const app = options.app || { globalData: { token: "test-token", user: {} } };
  const calls = { redirects: [], scrolls: [], titles: [] };
  let definition;
  const context = {
    require(id) {
      if (id === "../../utils/request") return { request: options.request || (() => Promise.resolve({ data: {} })), setAuth() {} };
      return localRequire(id);
    },
    Page(value) { definition = value; },
    getApp() { return app; },
    wx: {
      redirectTo(value) { calls.redirects.push(value); },
      pageScrollTo(value) { calls.scrolls.push(value); },
      setNavigationBarTitle(value) { calls.titles.push(value); },
    },
    setTimeout,
    clearTimeout,
  };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), context, { filename });
  const page = { ...definition, data: structuredClone(definition.data) };
  page.setData = function (patch) {
    for (const [key, value] of Object.entries(patch)) {
      const keys = key.split(".");
      let target = this.data;
      for (const part of keys.slice(0, -1)) target = target[part] ||= {};
      target[keys[keys.length - 1]] = value;
    }
  };
  return { page, calls };
}

describe("native mini-program page behavior", () => {
  it("opens campus discovery with a clean filter and keeps advanced filters collapsed", () => {
    const { page, calls } = pageHarness("index");
    page.setData({
      view: "routes", "fold.extra": true, query: "长城", city: "怀柔", date: "2026-10-31",
      tag: "登山", offerFilter: "deal", festivalKey: "holiday", monthPicked: true,
      companyName: "公司", school: "某大学",
    });
    page.quickHost({ currentTarget: { dataset: { kind: "campus" } } });

    assert.equal(page.data.view, "trips");
    assert.equal(page.data.hostKind, "campus");
    assert.equal(page.data.fold.extra, false);
    for (const key of ["query", "city", "date", "tag", "offerFilter", "festivalKey", "companyName", "school"]) {
      assert.equal(page.data[key], "", `clears competing ${key} filter`);
    }
    assert.equal(page.data.monthPicked, false);
    assert.deepEqual(Array.from(page.data.picked, (item) => item.key), ["host"]);
    assert.equal(calls.scrolls[0].selector, "#explore");
  });

  it("switches advanced filter sections without applying queries or clearing selected filters", () => {
    const { page } = pageHarness("index");
    assert.equal(page.data.filterSection, "date");
    let queryRuns = 0;
    page.applyGroups = () => { queryRuns++; };
    page.setData({
      "fold.extra": true, filterSection: "date", date: "2026-10-31", monthKey: "2026-10",
      monthPicked: true, festivalKey: "new-year", offerFilter: "free", hostKind: "campus", school: "某大学",
      groups: [{ id: 27 }], picked: [{ key: "date", label: "10-31" }, { key: "offer", label: "免费团" }],
    });

    page.setFilterSection({ currentTarget: { dataset: { section: "options" } } });
    assert.equal(page.data.filterSection, "options");
    page.setFilterSection({ currentTarget: { dataset: { section: "date" } } });
    assert.equal(page.data.filterSection, "date");
    assert.equal(queryRuns, 0);
    assert.equal(page.data.date, "2026-10-31");
    assert.equal(page.data.monthPicked, true);
    assert.equal(page.data.festivalKey, "new-year");
    assert.equal(page.data.offerFilter, "free");
    assert.equal(page.data.school, "某大学");
    assert.deepEqual(Array.from(page.data.picked, (item) => item.key), ["date", "offer"]);

    page.toggleFold({ currentTarget: { dataset: { key: "extra" } } });
    assert.equal(page.data.fold.extra, false);
    assert.equal(page.data.date, "2026-10-31");
    assert.equal(page.data.offerFilter, "free");
    page.toggleFold({ currentTarget: { dataset: { key: "extra" } } });
    assert.equal(page.data.filterSection, "date");
    assert.equal(page.data.date, "2026-10-31");
  });

  it("previews a higher membership tier without changing the current badge or real progress", () => {
    const { page } = pageHarness("member");
    const card = {
      level: 1, code: "V1", name: "初见会员", growth: 250, progress: 0.5,
      nextCode: "V2", nextGrowth: 500,
      levels: [
        { level: 1, code: "V1", name: "初见会员", growth: 0, perks: ["基础权益"] },
        { level: 2, code: "V2", name: "同行会员", growth: 500, perks: ["升级权益"] },
      ],
    };
    page.showCard(card, 1);
    const actualBadge = page.data.mark;
    page.focusLevel({ currentTarget: { dataset: { level: "2" } } });

    assert.equal(page.data.focus.level, 2);
    assert.equal(page.data.card.level, 1);
    assert.equal(page.data.card.progress, 0.5);
    assert.equal(page.data.card.growth, 250);
    assert.equal(page.data.mark, actualBadge);
    assert.match(page.data.mark, /\/static\/member\/v1\.png$/);
    assert.equal(page.data.perkItems[0].label, "升级权益");
  });

  it("keeps a companion visible and reports a failed delete", async () => {
    const { page } = pageHarness("companions", {
      request() { return Promise.reject(new Error("网络暂不可用")); },
    });
    page.setData({ list: [{ id: 4, name: "同行者" }] });

    await page.remove({ currentTarget: { dataset: { id: 4 } } });

    assert.deepEqual(Array.from(page.data.list, (item) => item.id), [4]);
    assert.equal(page.data.msg, "删除失败，请稍后重试");
  });

  it("ends the enrollment spinner on a failed request and recovers through a tap retry", async () => {
    let attempts = 0;
    const requested = [];
    const { page, calls } = pageHarness("enroll", {
      request(url) {
        requested.push(url);
        if (++attempts === 1) return Promise.reject(new Error("network offline"));
        return Promise.resolve({ data: { id: 17, channel: "activity", quote: { price: 0 }, refundPolicy: { summary: "活动退款规则" } } });
      },
    });
    page.setData({ id: "17" });
    await page.loadSchedule("17");
    assert.equal(page.data.detailLoading, false);
    assert.equal(page.data.s, null);
    assert.ok(page.data.detailError);
    assert.equal(page._detailLoading, false);

    // bindtap passes an event object, so retries must use the stored schedule id.
    await page.loadSchedule({ currentTarget: { dataset: {} } });
    assert.deepEqual(requested, ["/schedules/17", "/schedules/17"]);
    assert.equal(page.data.detailLoading, false);
    assert.equal(page.data.detailError, "");
    assert.equal(page.data.s.id, 17);
    assert.equal(page.data.isActivity, true);
    assert.equal(page.data.form.insuranceCode, "none");
    assert.equal(page.data.cancelSummary, "活动退款规则");
    assert.equal(calls.titles[0].title, "报名本局");
  });

  it("does not duplicate enrollment detail requests during repeated retry taps", async () => {
    let calls = 0;
    let resolveRequest;
    const { page } = pageHarness("enroll", {
      request() {
        calls++;
        return new Promise((resolve) => { resolveRequest = resolve; });
      },
    });
    page.setData({ id: "19" });
    const first = page.loadSchedule("19");
    await page.loadSchedule({});
    assert.equal(calls, 1);
    assert.equal(page.data.detailLoading, true);
    resolveRequest({ data: { id: 19, channel: "activity" } });
    await first;
    assert.equal(page._detailLoading, false);
    assert.equal(page.data.s.id, 19);
  });

  it("preserves enrollment invite and coupon data through a required login", () => {
    const { page, calls } = pageHarness("enroll", { app: { globalData: { token: "" } } });
    page.onLoad({ id: "23", ref: "leader", coupon: "a b", joinCode: "同学123" });
    assert.equal(calls.redirects.length, 1);
    const loginUrl = new URL(calls.redirects[0].url, "https://test.invalid");
    const returnUrl = new URL(loginUrl.searchParams.get("redirect"), "https://test.invalid");
    assert.equal(returnUrl.pathname, "/pages/enroll/enroll");
    assert.equal(returnUrl.searchParams.get("id"), "23");
    assert.equal(returnUrl.searchParams.get("ref"), "leader");
    assert.equal(returnUrl.searchParams.get("coupon"), "a b");
    assert.equal(returnUrl.searchParams.get("joinCode"), "同学123");
  });

  it("shows a failed trip recap request and retries without losing an action result", async () => {
    let offline = true;
    const requested = [];
    const { page } = pageHarness("after", {
      request(url) {
        requested.push(url);
        if (offline) return Promise.reject(new Error("网络暂不可用"));
        return Promise.resolve({ data: url.endsWith("/after") ? { id: 31, completed: true, title: "已完成行程" } : [{ id: 2 }] });
      },
    });
    page.onLoad({ id: "31" });
    await page.load();
    assert.equal(page.data.loading, false);
    assert.equal(page.data.s, null);
    assert.equal(page.data.loadError, "网络暂不可用");
    assert.equal(page._loading, false);

    offline = false;
    page.setData({ msg: "评价已提交" });
    await page.load({ currentTarget: { dataset: {} } });
    assert.equal(page.data.loading, false);
    assert.equal(page.data.loadError, "");
    assert.equal(page.data.s.id, 31);
    assert.equal(page.data.posts[0].id, 2);
    assert.equal(page.data.msg, "评价已提交");
    assert.deepEqual(requested, ["/schedules/31/after", "/schedules/31/contest", "/schedules/31/after", "/schedules/31/contest"]);
  });

  it("does not leave a trip recap spinner running without a schedule id", async () => {
    let requests = 0;
    const { page } = pageHarness("after", { request() { requests++; return Promise.resolve({ data: {} }); } });
    page.onLoad({});
    await page.load();
    assert.equal(requests, 0);
    assert.equal(page.data.loading, false);
    assert.match(page.data.loadError, /缺少行程信息/);
  });

  it("deduplicates recap retries and preserves existing content on a refresh failure", async () => {
    let requests = 0;
    let rejectAfter;
    const { page } = pageHarness("after", {
      request(url) {
        requests++;
        return url.endsWith("/after")
          ? new Promise((_resolve, reject) => { rejectAfter = reject; })
          : Promise.resolve({ data: [] });
      },
    });
    page.setData({ id: "42", s: { id: 42, title: "已有行程" }, posts: [{ id: 1 }] });
    const first = page.load();
    await page.load();
    assert.equal(requests, 2);
    rejectAfter(new Error("服务器暂不可用"));
    await first;
    assert.equal(page.data.s.title, "已有行程");
    assert.equal(page.data.posts[0].id, 1);
    assert.equal(page.data.loading, false);
    assert.equal(page.data.loadError, "服务器暂不可用");
  });
});
