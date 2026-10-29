const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");

const root = path.resolve(__dirname, "../../miniprogram");
function harness(pageName, options = {}) {
  const store = options.store || new Map();
  const calls = [];
  const app = { globalData: { token: "test-token", user: {} } };
  const wx = {
    getStorageSync(key) { if (options.storageThrows) throw new Error("storage unavailable"); return store.get(key); },
    setStorageSync(key, value) { if (options.storageThrows) throw new Error("storage full"); store.set(key, value); },
    pageScrollTo() {},
    navigateTo() {},
  };
  const request = (...args) => {
    calls.push(args);
    if (args[0] === "/play-tags") return Promise.resolve({ data: [] });
    return options.request ? options.request(...args) : Promise.resolve({ data: [] });
  };
  function load(relative) {
    const filename = path.join(root, relative);
    const localRequire = createRequire(filename);
    const module = { exports: {} };
    let definition;
    vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
      module, exports: module.exports, wx, getApp: () => app, setTimeout, clearTimeout,
      Page(value) { definition = value; },
      require(id) {
        if (id === "./request" || id === "../../utils/request") return { request };
        if (id === "../../utils/appearance") return { isDark: () => false };
        if (id === "./route-presentation" || id === "../../utils/route-presentation") return load("utils/route-presentation.js");
        if (id === "../../utils/route-catalog") return load("utils/route-catalog.js");
        return localRequire(id);
      },
    }, { filename });
    return definition || module.exports;
  }
  const definition = load(`pages/${pageName}/${pageName}.js`);
  const page = { ...definition, data: structuredClone(definition.data) };
  page.setData = function (patch) {
    for (const [key, value] of Object.entries(patch)) {
      const parts = key.replace(/\[(\d+)\]/g, ".$1").split(".");
      let target = this.data;
      for (const part of parts.slice(0, -1)) target = target[part] ||= {};
      target[parts.at(-1)] = value;
    }
  };
  return { page, calls, store, helper: load("utils/route-presentation.js") };
}
function route(id, patch = {}) {
  return { id, title: "周末山野 " + id, region: "北京怀柔", days: 1, fromPrice: 99, memberFromPrice: 95, cover: "/static/test.jpg", ...patch };
}
function pending() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
const choose = (mode) => ({ currentTarget: { dataset: { mode } } });
const pages = [
  { name: "routes", list: "list", error: "err", loading: "loading", load: "search", filters: { q: "长城", days: 2, tag: "摄影" } },
  { name: "index", list: "routeList", error: "routeErr", loading: "routeLoading", load: "loadRoutes", filters: { query: "长城", routeDays: 2, routeTag: "摄影", routeTags: [{ id: 1, name: "摄影" }] } },
];

describe("native route presentation", () => {
  it("shares the selected view between the homepage and the dedicated catalog without changing filters", async () => {
    const store = new Map();
    const home = harness("index", { store });
    home.page.setData(pages[1].filters);
    home.page.setRouteMode(choose("grid"));
    assert.equal(store.get("bj_route_view"), "grid");
    assert.equal(home.page.data.query, "长城");
    assert.equal(home.page.data.routeDays, 2);
    assert.equal(home.page.data.routeTag, "摄影");
    const dedicated = harness("routes", { store });
    await dedicated.page.onShow();
    assert.equal(dedicated.page.data.routeMode, "grid");
    dedicated.page.setRouteMode(choose("list"));
    home.page.onShow();
    assert.equal(home.page.data.routeMode, "list");
    assert.equal(home.page.data.query, "长城");
    assert.equal(home.page.data.routeDays, 2);
    home.page.setRouteMode(choose("unknown"));
    assert.equal(home.page.data.routeMode, "list");
  });

  it("uses poster for invalid stored modes and still allows view changes when storage throws", async () => {
    for (const item of pages) {
      const invalid = harness(item.name, { store: new Map([["bj_route_view", "unknown"]]) });
      await invalid.page.onShow();
      assert.equal(invalid.page.data.routeMode, "poster");
      const broken = harness(item.name, { storageThrows: true });
      await broken.page.onShow();
      assert.equal(broken.page.data.routeMode, "poster");
      assert.doesNotThrow(() => broken.page.setRouteMode(choose("grid")));
      assert.equal(broken.page.data.routeMode, "grid");
    }
  });

  for (const item of pages) {
    it(`${item.name}: keeps only the latest query response even when requests finish out of order`, async () => {
      const first = pending();
      const second = pending();
      let requestCount = 0;
      const { page } = harness(item.name, { request: () => (++requestCount === 1 ? first.promise : second.promise) });
      page.setData({ ...item.filters, tags: [{ id: 1, name: "摄影" }] });
      const old = page[item.load]();
      page.setData(item.name === "index" ? { query: "草原" } : { q: "草原" });
      const latest = page[item.load]();
      second.resolve({ data: [route(2)] });
      await latest;
      first.resolve({ data: [route(1)] });
      await old;
      assert.equal(page.data[item.list][0].id, 2);
      assert.equal(page.data[item.loading], false);
    });

    it(`${item.name}: retains cards on refresh failure, exposes the error and recovers on retry`, async () => {
      let attempt = 0;
      const { page } = harness(item.name, { request: () => {
        attempt++;
        return attempt === 2 ? Promise.reject(new Error("offline")) : Promise.resolve({ data: [route(attempt)] });
      } });
      page.setData({ ...item.filters, tags: [{ id: 1, name: "摄影" }] });
      await page[item.load]();
      assert.equal(page.data[item.list][0].id, 1);
      await page[item.load]();
      assert.equal(page.data[item.list][0].id, 1);
      assert.equal(page.data[item.error], "offline");
      assert.equal(page.data[item.loading], false);
      await page[item.load]();
      assert.equal(page.data[item.list][0].id, 3);
      assert.equal(page.data[item.error], "");
    });

    it(`${item.name}: ignores catalog responses after unloading`, async () => {
      const delayed = pending();
      const { page } = harness(item.name, { request: () => delayed.promise });
      page.setData({ ...item.filters, tags: [{ id: 1, name: "摄影" }] });
      const request = page[item.load]();
      page.onUnload();
      delayed.resolve({ data: [route(1)] });
      await request;
      assert.equal(page.data[item.list].length, 0);
    });
  }

  it("preserves a real zero price while missing or malformed prices stay unpriced", () => {
    const { helper } = harness("routes");
    const free = helper.decorateRoute(route(1, { memberFromPrice: 0 }));
    assert.equal(free.viewFacts.hasPrice, true);
    assert.equal(free.viewFacts.price, 0);
    assert.equal(free.viewFacts.free, true);
    for (const value of [undefined, null, "", " ", "bad", -2, Infinity, false, []]) {
      const unpriced = helper.decorateRoute(route(1, { memberFromPrice: value, fromPrice: value }));
      assert.equal(unpriced.viewFacts.hasPrice, false, `unpriced: ${String(value)}`);
    }
    assert.equal(helper.decorateRoute(route(1, { memberFromPrice: "", fromPrice: "29.5" })).viewFacts.price, 29.5);
  });

  it("advertises only real upcoming dates using Beijing's calendar and ignores null or impossible dates", () => {
    const { helper } = harness("routes");
    const facts = helper.routeUpcomingFacts({ upcoming: [
      null,
      { start_date: "2026-02-30" },
      { start_date: "2026-10-28" },
      { startDate: "2026-10-29", status: "finished" },
      { startDate: "2026-10-29", status: "cancelled" },
      { start_date: "2026-10-30", status: "recruiting" },
      { start_date: "2026-10-29", status: "recruiting" },
    ] }, new Date("2026-10-28T16:01:00Z"));
    assert.equal(facts.count, 2);
    assert.equal(facts.date, "2026-10-29");
  });
});
