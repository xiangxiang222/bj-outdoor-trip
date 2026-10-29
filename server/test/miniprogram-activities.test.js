const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");

// Device-free checks of the public discovery controller. No database or network writes.
function harness(options = {}) {
  const filename = path.resolve(__dirname, "../../miniprogram/pages/activities/activities.js");
  const localRequire = createRequire(filename);
  const app = { globalData: { token: options.token === undefined ? "user-token" : options.token, baseUrl: "https://example.test", user: {} } };
  const calls = { requests: [], navigations: [], stopped: 0 };
  let definition;
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    require(id) {
      if (id === "../../utils/request") return { request(...args) { calls.requests.push(args); return options.request ? options.request(...args) : Promise.resolve({ data: [] }); } };
      if (id === "../../utils/appearance") return { isDark: () => false };
      if (id === "../../utils/media") return { absMedia: (url) => url && url.startsWith("/") ? app.globalData.baseUrl + url : url };
      return localRequire(id);
    },
    Page(value) { definition = value; },
    getApp() { return app; },
    wx: {
      navigateTo(value) { calls.navigations.push(value); },
      stopPullDownRefresh() { calls.stopped++; },
    },
    setTimeout, clearTimeout,
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
  return { page, calls, app };
}
function activity(id, patch = {}) {
  return {
    id, channel: "activity", status: "recruiting", reviewStatus: "approved",
    startDate: "2099-10-29", meetupTime: "19:30", city: "朝阳", meetupPoint: "公园南门",
    enrolled: 2, remain: 10, maxSeats: 12, minGroupSize: 4,
    quote: { tripPrice: 0 }, route: { title: "周末夜跑", category: "跑步", cover: "/static/run.png" },
    ...patch,
  };
}
const tap = (key) => ({ currentTarget: { dataset: { key } } });

describe("native activity discovery", () => {
  it("accepts only supported category deep links and preserves the selected kind through guest login", () => {
    const { page, calls } = harness({ token: "" });
    page.onLoad({ kind: encodeURIComponent("跑步") });
    assert.equal(page.data.kind, "跑步");
    page.goPublish();
    const target = new URL(calls.navigations[0].url, "https://example.test");
    assert.equal(target.pathname, "/pages/login/login");
    const redirect = new URL(target.searchParams.get("redirect"), "https://example.test");
    assert.equal(redirect.pathname, "/pages/publish/publish");
    assert.equal(redirect.searchParams.get("channel"), "activity");
    assert.equal(redirect.searchParams.get("kind"), "跑步");
    for (const kind of ["不支持的玩法", "%E0%A4%A"]) {
      const fresh = harness().page;
      fresh.onLoad({ kind });
      assert.equal(fresh.data.kind, "");
    }
  });

  it("uses the saved category when rendering cards and offers the current category when publishing", async () => {
    const { page, calls } = harness({ request: () => Promise.resolve({ data: [activity(1, { route: { title: "跑友一起看电影", category: "电影" } }), activity(2)] }) });
    page.onLoad({});
    await page.onShow();
    page.setKind(tap("电影"));
    assert.deepEqual(Array.from(page.data.list, (item) => item.id), [1]);
    assert.equal(page.data.list[0].kindLabel, "电影");
    page.goPublish();
    assert.equal(new URL(calls.navigations[0].url, "https://example.test").searchParams.get("kind"), "电影");
    page.setKind(tap("未知"));
    assert.equal(page.data.kind, "电影");
    page.setKind(tap("电影"));
    assert.equal(page.data.kind, "");
    assert.equal(page.data.list.length, 2);
  });

  it("keeps cached cards after a failed refresh and retries instead of reporting a false empty feed", async () => {
    let attempt = 0;
    const { page, calls } = harness({ request: () => {
      attempt++;
      return attempt === 2 ? Promise.reject(new Error("offline")) : Promise.resolve({ data: [activity(attempt)] });
    } });
    await page.onShow();
    assert.equal(page.data.list[0].id, 1);
    await page.load();
    assert.equal(page.data.loading, false);
    assert.equal(page.data.loadError, true);
    assert.equal(page.data.rows[0].id, 1);
    assert.equal(page.data.list[0].id, 1);
    await page.retry();
    assert.equal(calls.requests.length, 3);
    assert.equal(page.data.loadError, false);
    assert.equal(page.data.list[0].id, 3);
  });

  it("deduplicates an in-flight refresh and ignores a response after the page is unloaded", async () => {
    let resolve;
    const waiting = new Promise((done) => { resolve = done; });
    const { page, calls } = harness({ request: () => waiting });
    const first = page.onShow();
    const duplicate = page.retry();
    assert.equal(calls.requests.length, 1);
    page.onUnload();
    resolve({ data: [activity(1)] });
    await Promise.all([first, duplicate]);
    assert.equal(page.data.rows.length, 0);
    assert.equal(page.data.list.length, 0);
  });

  it("clears refinements within a category and offers a separate reset to all activities", async () => {
    const { page } = harness({ request: () => Promise.resolve({ data: [activity(1), activity(2, { city: "海淀", quote: { tripPrice: 10 } })] }) });
    await page.onShow();
    page.setKind(tap("跑步"));
    page.onQuery({ detail: { value: "找不到" } });
    page.toggleFree();
    page.toggleAvailable();
    page.setSort({ detail: { value: 2 } });
    assert.equal(page.data.list.length, 0);
    assert.equal(page.data.hasRefinements, true);
    page.clearFilters();
    assert.equal(page.data.kind, "跑步");
    assert.equal(page.data.list.length, 2);
    assert.equal(page.data.hasRefinements, false);
    assert.equal(page.data.hasFilters, true);
    assert.equal(page.data.sort, "soon");
    page.showAll();
    assert.equal(page.data.kind, "");
    assert.equal(page.data.hasFilters, false);
  });

  it("keeps a selected district available after refresh even when it currently has no matching activities", async () => {
    let attempt = 0;
    const { page } = harness({ request: () => Promise.resolve({ data: [activity(++attempt, { city: attempt === 1 ? "海淀" : "朝阳" })] }) });
    await page.onShow();
    page.setCity({ detail: { value: page.data.cities.indexOf("海淀") } });
    assert.equal(page.data.city, "海淀");
    await page.load();
    assert.equal(page.data.city, "海淀");
    assert.equal(page.data.cities[page.data.cityIndex], "海淀");
    assert.equal(page.data.list.length, 0);
  });
});
