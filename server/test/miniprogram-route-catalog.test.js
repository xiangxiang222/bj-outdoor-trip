const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");

const root = path.resolve(__dirname, "../../miniprogram");
const PREFERENCES = [
  { key: "great-wall", name: "长城", primary: true, count: 3 },
  { key: "hiking", name: "徒步登山", primary: true, count: 0 },
  { key: "coast", name: "海边", primary: true, count: 1 },
  { key: "family", name: "亲子", primary: false, count: 2 },
  { key: "photography", name: "摄影", primary: false, count: 0 },
];
const preferencePayload = (options = PREFERENCES, total = 8) => ({ data: { options, total } });
const event = (dataset) => ({ currentTarget: { dataset } });
const routeRequests = (calls) => calls.filter(([url]) => /^\/routes(?:\?|$)/.test(url));
const preferenceRequests = (calls) => calls.filter(([url]) => /^\/route-preferences(?:\?|$)/.test(url));
const lastParams = (calls) => new URL(routeRequests(calls).at(-1)[0], "https://test.invalid").searchParams;
function harness(pageName, options = {}) {
  const store = options.store || new Map();
  const calls = [];
  const app = { globalData: { token: "test-token", user: {} } };
  const wx = {
    getStorageSync(key) { if (options.storageThrows) throw new Error("storage unavailable"); return store.get(key); },
    setStorageSync(key, value) { if (options.storageThrows) throw new Error("storage full"); store.set(key, value); },
    pageScrollTo() {},
    navigateTo() {},
    nextTick: options.nextTick,
  };
  const request = (...args) => {
    calls.push(args);
    if (/^\/route-preferences(?:\?|$)/.test(args[0])) return options.preferencesRequest ? options.preferencesRequest(...args) : Promise.resolve(preferencePayload());
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
  return { page, calls, store, app, helper: load("utils/route-presentation.js"), catalog: load("utils/route-catalog.js") };
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
  { name: "routes", list: "list", error: "err", loading: "loading", load: "search", filters: { q: "长城", days: 2 } },
  { name: "index", list: "routeList", error: "routeErr", loading: "routeLoading", load: "loadRoutes", filters: { query: "长城", routeDays: 2 } },
];

describe("native route presentation", () => {
  for (const item of pages) {
    it(`${item.name}: switches one preference while retaining keyword, duration and departure date without scrolling`, async () => {
      const { page, calls } = harness(item.name);
      page.setData({ ...item.filters, date: "2099-04-08", routeTag: "摄影", tag: "亲子", routeCategory: "海滨", category: "长城" });
      let scrolls = 0;
      page.explore = () => { scrolls++; };
      await page[item.load]();
      for (const preference of ["great-wall", "hiking", "coast", "family", ""]) {
        await page.setRoutePreference(event({ preference }));
        const params = lastParams(calls);
        assert.equal(params.get("preference") || "", preference);
        assert.equal(params.get("q"), "长城");
        assert.equal(params.get("days"), "2");
        assert.equal(params.has("tag"), false);
        assert.equal(params.has("category"), false);
        assert.equal(page.data.date, "2099-04-08");
        assert.equal(page.data.routePreferenceScroll, "route-pref-" + (preference || "all"));
        if (item.name === "index") {
          assert.equal(page.data.routePicked.find((pick) => pick.key === "preference")?.value || "", PREFERENCES.find((row) => row.key === preference)?.name || "");
          assert.deepEqual(Array.from(page.data.routePicked.filter((pick) => pick.key !== "preference"), (pick) => pick.key), ["q", "days"]);
        }
      }
      assert.equal(preferenceRequests(calls).length, 1, "a preference change reuses counts for the same keyword/day baseline");
      const before = calls.length;
      await page.setRoutePreference(event({ preference: "" }));
      await page.setRoutePreference(event({ preference: "invalid" }));
      assert.equal(calls.length, before);
      assert.equal(scrolls, 0);
      await page.setRoutePreference(event({ preference: "coast" }));
      await page.clearRouteFilters();
      assert.equal(lastParams(calls).toString(), "");
    });

    it(`${item.name}: keeps a selected extra preference visible when collapsed, including a new zero count`, async () => {
      const { page } = harness(item.name);
      page.setData({ routePreferences: PREFERENCES, routePreference: "photography" });
      page.refreshPreferenceView();
      assert.equal(page.data.routePrimaryPreferences.at(-1).key, "photography");
      page.toggleRoutePreferences();
      assert.equal(page.data.routeMoreOpen, true);
      assert.ok(!page.data.routePrimaryPreferences.some((row) => row.key === "photography"));
      assert.ok(page.data.routeMorePreferences.some((row) => row.key === "photography"));
      page.toggleRoutePreferences();
      assert.equal(page.data.routePrimaryPreferences.at(-1).key, "photography");
    });

    it(`${item.name}: retains the chosen display name after an operator disables or removes its option`, () => {
      const { page } = harness(item.name);
      page.setData({ routePreferences: [{ key: "custom-trip", name: "林间摄影", primary: false, count: 1 }], routePreference: "custom-trip" });
      page.refreshPreferenceView();
      page.setData({ routePreferences: [] });
      page.refreshPreferenceView();
      const name = item.name === "index" ? page.data.routePicked.find((pick) => pick.key === "preference").value : page.data.routePreferenceName;
      assert.equal(name, "林间摄影");
    });

    it(`${item.name}: reveals a relocated selected option after rendering and ignores stale or unloaded callbacks`, () => {
      const ticks = [];
      const { page } = harness(item.name, { nextTick: (callback) => ticks.push(callback) });
      page.setData({ routePreferences: PREFERENCES, routePreference: "family" });
      page.refreshPreferenceView();
      assert.equal(page.data.routePreferenceScroll, "");
      ticks.shift()();
      assert.equal(page.data.routePreferenceScroll, "route-pref-family");
      page.toggleRoutePreferences();
      assert.equal(page.data.routePreferenceScroll, "");
      ticks.shift()();
      assert.equal(page.data.routePreferenceScroll, "route-pref-family");
      page.setData({ routePreference: "great-wall" });
      page.refreshPreferenceView();
      page.setData({ routePreference: "coast" });
      page.refreshPreferenceView();
      ticks.shift()();
      assert.equal(page.data.routePreferenceScroll, "");
      ticks.shift()();
      assert.equal(page.data.routePreferenceScroll, "route-pref-coast");
      page.refreshPreferenceView();
      page.onUnload();
      ticks.shift()();
      assert.equal(page.data.routePreferenceScroll, "");
    });

    it(`${item.name}: invalidates counts on a base change and rejects stale count responses`, async () => {
      const first = pending();
      const second = pending();
      let requests = 0;
      const { page } = harness(item.name, { preferencesRequest: () => (++requests === 1 ? first.promise : second.promise) });
      page.setData({ ...item.filters, routePreferences: PREFERENCES, routePreference: "family" });
      const old = page.loadPreferences();
      assert.equal(page.data.routePreferenceTotal, null);
      assert.ok(page.data.routePreferences.every((row) => row.count === null));
      assert.equal(page.data.routePreferenceLoading, true);
      page.setData(item.name === "index" ? { query: "草原" } : { q: "草原" });
      const latest = page.loadPreferences();
      second.resolve(preferencePayload(PREFERENCES.map((row) => ({ ...row, count: row.key === "family" ? 1 : 0 })), 1));
      await latest;
      first.resolve(preferencePayload());
      await old;
      assert.equal(page.data.routePreferenceTotal, 1);
      assert.equal(page.data.routePreferences.find((row) => row.key === "family").count, 1);
      assert.equal(page.data.routePreferenceLoading, false);
    });

    it(`${item.name}: reports count failures without inventing zeros and retries counts without changing route results`, async () => {
      let requests = 0;
      const { page, calls } = harness(item.name, { preferencesRequest: () => {
        requests++;
        return requests === 2 ? Promise.reject(new Error("counts offline")) : Promise.resolve(preferencePayload());
      } });
      await page[item.load]();
      page.setData(item.name === "index" ? { routeDays: 2 } : { days: 2 });
      await page.loadPreferences();
      assert.equal(page.data.routePreferenceTotal, null);
      assert.equal(page.data.routePreferenceErr, "counts offline");
      assert.equal(page.data.routePreferenceLoading, false);
      assert.ok(page.data.routePreferences.every((row) => row.count === null));
      const routeCount = routeRequests(calls).length;
      await page.reloadRoutePreferences();
      assert.equal(page.data.routePreferenceTotal, 8);
      assert.equal(page.data.routePreferenceErr, "");
      assert.equal(routeRequests(calls).length, routeCount);
    });

    it(`${item.name}: ignores preference responses after unloading`, async () => {
      const delayed = pending();
      const { page } = harness(item.name, { preferencesRequest: () => delayed.promise });
      const loading = page.loadPreferences();
      page.onUnload();
      delayed.resolve(preferencePayload());
      await loading;
      assert.equal(page.data.routePreferences.length, 0);
      assert.equal(page.data.routePreferenceTotal, null);
    });

    it(`${item.name}: keeps an unavailable preference removable, clears stale cards and refreshes configuration`, async () => {
      const unavailable = Object.assign(new Error("该出游偏好不存在或已停用，请重新选择"), { code: "ROUTE_PREFERENCE_UNAVAILABLE" });
      const { page, calls } = harness(item.name, { request: () => Promise.reject(unavailable), preferencesRequest: () => Promise.resolve(preferencePayload(PREFERENCES.filter((row) => row.key !== "coast"))) });
      page.setData({ [item.list]: [route(1)], routePreferences: PREFERENCES, routePreference: "coast" });
      await page[item.load]();
      assert.equal(page.data[item.list].length, 0);
      assert.equal(page.data.routeErrCode, "ROUTE_PREFERENCE_UNAVAILABLE");
      assert.equal(page.data.routePreference, "coast");
      assert.match(page.data[item.error], /停用/);
      assert.ok(!page.data.routePreferences.some((row) => row.key === "coast"));
      assert.ok(preferenceRequests(calls).length >= 2);
      await page.clearRouteFilter(event({ key: "preference" }));
      assert.equal(page.data.routePreference, "");
    });
  }

  it("accepts the catalog's incoming preference without silently retaining legacy category or tag", async () => {
    const { page, calls, app } = harness("routes");
    app.globalData.routeFilter = { preference: "coast", category: "长城", q: "北戴河", days: 2, tag: "摄影" };
    await page.onShow();
    const params = lastParams(calls);
    assert.equal(params.get("preference"), "coast");
    assert.equal(params.has("category"), false);
    assert.equal(params.has("tag"), false);
    assert.equal(params.get("q"), "北戴河");
    assert.equal(params.get("days"), "2");
    assert.equal(app.globalData.routeFilter, null);
  });

  it("shows the exact active homepage filters and removes only the chosen condition", async () => {
    const { page, calls } = harness("index");
    page.setData({ query: " 北戴河 ", routePreference: "coast", routeDays: 2, date: "2099-04-08" });
    await page.loadRoutes();
    assert.deepEqual(Array.from(page.data.routePicked, (pick) => [pick.key, pick.value]), [["preference", "海边"], ["q", "北戴河"], ["days", "2日"]]);
    await page.clearRouteFilter(event({ key: "preference" }));
    assert.equal(lastParams(calls).has("preference"), false);
    assert.equal(lastParams(calls).get("days"), "2");
    assert.equal(lastParams(calls).get("q"), "北戴河");
    assert.deepEqual(Array.from(page.data.routePicked, (pick) => pick.key), ["q", "days"]);
    await page.clearRouteFilter(event({ key: "q" }));
    assert.equal(page.data.query, "");
    assert.equal(page.data.routeDays, 2);
    await page.clearRouteFilters();
    assert.equal(page.data.routePicked.length, 0);
    assert.equal(lastParams(calls).toString(), "");
    assert.equal(page.data.date, "2099-04-08");
  });

  it("only sends one preference plus base filters, including when legacy properties are supplied", async () => {
    const { calls, catalog } = harness("routes");
    await catalog.loadRouteCatalog({ q: " 长城 ", days: "multi", preference: "great-wall", tag: "摄影", category: "海滨" });
    const params = lastParams(calls);
    assert.deepEqual(Array.from(params), [["q", "长城"], ["days", "multi"], ["preference", "great-wall"]]);
    await catalog.loadRoutePreferences({ q: " 长城 ", days: "multi", preference: "great-wall", tag: "摄影" });
    const countParams = new URL(preferenceRequests(calls).at(-1)[0], "https://test.invalid").searchParams;
    assert.deepEqual(Array.from(countParams), [["q", "长城"], ["days", "multi"]]);
  });

  it("strictly rejects malformed preference payloads instead of treating them as empty or zero counts", async () => {
    const option = PREFERENCES[0];
    const malformed = [
      null, [], {}, { options: [], total: "0" }, { options: [], total: -1 }, { options: [], total: 1.5 },
      { options: {}, total: 1 }, { options: [null], total: 1 },
      ...[{ key: "" }, { key: "中文" }, { name: " " }, { primary: 1 }, { count: "1" }, { count: -1 }, { count: 1.5 }, { count: 11 }]
        .map((patch) => ({ options: [{ ...option, ...patch }], total: 10 })),
      { options: [option, option], total: 10 },
    ];
    for (const data of malformed) {
      const { catalog } = harness("routes", { preferencesRequest: () => Promise.resolve({ data }) });
      const result = await catalog.loadRoutePreferences();
      assert.equal(result.options.length, 0);
      assert.equal(result.total, null);
      assert.ok(result.err);
    }
    const { catalog } = harness("routes", { preferencesRequest: () => Promise.resolve(preferencePayload([], 0)) });
    const empty = await catalog.loadRoutePreferences();
    assert.equal(empty.err, "");
    assert.equal(empty.total, 0);
  });

  it("keeps zero-count primary and selected options while hiding irrelevant zero-count extras", () => {
    const { catalog } = harness("routes");
    const collapsed = catalog.preferenceView(PREFERENCES, "photography", false);
    assert.deepEqual(Array.from(collapsed.primary, (row) => row.key), ["great-wall", "hiking", "coast", "photography"]);
    assert.deepEqual(Array.from(collapsed.more, (row) => row.key), ["family", "photography"]);
    assert.equal(collapsed.selectedName, "摄影");
    const expanded = catalog.preferenceView(PREFERENCES, "photography", true);
    assert.deepEqual(Array.from(expanded.primary, (row) => row.key), ["great-wall", "hiking", "coast"]);
    assert.deepEqual(Array.from(catalog.preferenceView(PREFERENCES).more, (row) => row.key), ["family"]);
    assert.equal(catalog.preferenceView(PREFERENCES, "removed").selectedName, "removed");
  });

  it("shares the selected view between the homepage and the dedicated catalog without changing filters", async () => {
    const store = new Map();
    const home = harness("index", { store });
    home.page.setData(pages[1].filters);
    home.page.setRouteMode(choose("grid"));
    assert.equal(store.get("bj_route_view"), "grid");
    assert.equal(home.page.data.query, "长城");
    assert.equal(home.page.data.routeDays, 2);
    assert.equal(home.page.data.routePreference, "");
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
