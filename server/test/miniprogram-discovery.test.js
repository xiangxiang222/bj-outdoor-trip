const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const { chinaDay } = require("../../miniprogram/utils/departure-dates");

const defaults = {
  time: "any", dateFrom: "", dateTo: "", budgetMax: null, partySize: 1,
  destination: "", intensity: "any", hostKind: "any", campusScope: "any",
};
const plain = (value) => JSON.parse(JSON.stringify(value));
const event = (dataset = {}, value) => ({ currentTarget: { dataset }, detail: { value } });
function row(id, patch = {}) {
  return { id, routeId: id + 100, title: "真实团期 " + id, startDate: "2027-01-10", days: 1,
    price: { amount: 199, label: "当前人均团费" }, remain: 3,
    participation: { status: "available", label: "可查看报名" }, ...patch };
}
function response(results = [], patch = {}) {
  return { data: { mode: "rules", filters: { ...defaults }, conditions: [], warnings: [], question: "",
    results, total: results.length, hasMore: false, nextOffset: results.length, ...patch } };
}
function harness() {
  const filename = path.resolve(__dirname, "../../miniprogram/pages/discover/discover.js");
  const localRequire = createRequire(filename);
  const calls = [], pending = [], nav = [], titles = [];
  let definition;
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    Page(value) { definition = value; },
    wx: { navigateTo: (value) => nav.push(value), switchTab: (value) => nav.push(value),
      setNavigationBarTitle: (value) => titles.push(value) },
    require(id) {
      if (id === "../../utils/request") return { request(url, method, body) {
        calls.push({ url, method, body: plain(body) });
        return new Promise((resolve, reject) => pending.push({ resolve, reject }));
      } };
      if (id === "../../utils/appearance") return { isDark: () => true };
      return localRequire(id);
    },
  }, { filename });
  const page = { ...definition, data: structuredClone(definition.data) };
  page.setData = function (patch) {
    for (const [key, value] of Object.entries(patch)) {
      const parts = key.split(".");
      let target = this.data;
      for (const part of parts.slice(0, -1)) target = target[part] ||= {};
      target[parts.at(-1)] = value;
    }
  };
  page.onShow();
  return { page, calls, pending, nav, titles };
}
async function firstSearch(ctx, results, patch) {
  ctx.page.onInput(event({}, "下周末长城，团费200元内"));
  const done = ctx.page.submit();
  ctx.pending.at(-1).resolve(response(results, patch));
  await done;
}

describe("native one-sentence discovery", () => {
  it("works without a login gate, caps the input, and blocks duplicate submissions", async () => {
    const ctx = harness();
    await ctx.page.submit();
    assert.equal(ctx.calls.length, 0);
    assert.equal(ctx.page.data.error, "先说说想怎么玩");
    ctx.page.onInput(event({}, "长".repeat(450)));
    const done = ctx.page.submit();
    await ctx.page.submit();
    assert.equal(ctx.calls.length, 1);
    assert.equal(ctx.calls[0].url, "/discovery/search");
    assert.equal(ctx.calls[0].method, "POST");
    assert.equal(ctx.calls[0].body.message.length, 400);
    assert.equal(ctx.calls[0].body.filters, null);
    assert.equal(ctx.calls[0].body.limit, 3);
    ctx.pending[0].resolve(response([row(1)]));
    await done;
    assert.equal(ctx.page.data.loading, false);
    assert.equal(ctx.page.data.dark, true);
    assert.equal(ctx.titles[0].title, "一句话找团");
  });

  it("displays server conditions, warnings and clarification without inventing membership or price", async () => {
    const ctx = harness();
    await firstSearch(ctx, [row(1, { price: { amount: 0 }, remain: null, distanceKm: null,
      participation: { status: "verify", label: "需校园认证", reason: "认证后核验学校" } })], {
      filters: { ...defaults, budgetMax: 0, campusScope: "cross" },
      conditions: [{ key: "budget", label: "每人团费0元以内" }], warnings: ["费用不含餐饮"], question: "是否只看高校团？",
    });
    assert.equal(ctx.page.data.filters.budgetMax, 0);
    assert.equal(ctx.page.data.conditions[0].label, "每人团费0元以内");
    assert.equal(ctx.page.data.warnings[0], "费用不含餐饮");
    assert.equal(ctx.page.data.question, "是否只看高校团？");
    assert.equal(ctx.page.data.results[0].hasPrice, true);
    assert.equal(ctx.page.data.results[0].remain, null);
    assert.equal(ctx.page.data.results[0].distanceKm, null);
    assert.equal(ctx.page.data.results[0].participation.status, "verify");
    assert.equal(ctx.page.data.modelMode, false);
    ctx.page.onInput(event({}, "不能直接理解的描述"));
    const done = ctx.page.submit();
    ctx.pending.at(-1).resolve(response([], { question: "请确认每人团费上限" }));
    await done;
    assert.equal(ctx.page.data.total, 0);
    assert.equal(ctx.page.data.question, "请确认每人团费上限");
    assert.equal(ctx.calls.length, 2, "does not automatically relax ambiguous conditions");
  });

  it("edits the complete confirmed filters, preserves zero, and validates date and party size", async () => {
    const ctx = harness();
    await firstSearch(ctx, [row(1)], { filters: { ...defaults, destination: "长城", budgetMax: 200 } });
    ctx.page.toggleEdit();
    ctx.page.setDraft(event({ key: "budgetMax" }, "0"));
    ctx.page.setDraft(event({ key: "partySize" }, "0"));
    await ctx.page.applyFilters();
    assert.equal(ctx.calls.length, 1);
    assert.match(ctx.page.data.editError, /同行人数/);
    ctx.page.setDraft(event({ key: "partySize" }, "3"));
    ctx.page.setDraft(event({ key: "dateFrom" }, "2099-11-08"));
    ctx.page.setDraft(event({ key: "dateTo" }, "2099-11-07"));
    await ctx.page.applyFilters();
    assert.equal(ctx.calls.length, 1, "invalid range is never silently dropped");
    assert.match(ctx.page.data.editError, /日期/);
    ctx.page.setDraft(event({ key: "dateTo" }, "2099-11-09"));
    const done = ctx.page.applyFilters();
    assert.deepEqual(ctx.calls[1].body, { message: "", limit: 3, offset: 0, filters: {
      ...defaults, budgetMax: 0, partySize: 3, destination: "长城", time: "range", dateFrom: "2099-11-08", dateTo: "2099-11-09",
    } });
    ctx.pending[1].resolve(response([]));
    await done;
    assert.equal(ctx.page.data.editError, "");
    ctx.page.toggleEdit();
    ctx.page.setDraft(event({ key: "dateFrom" }, "2020-01-01"));
    ctx.page.setDraft(event({ key: "dateTo" }, "2020-01-02"));
    await ctx.page.applyFilters();
    assert.equal(ctx.calls.length, 2);
    assert.equal(ctx.page.data.editError, "出发日期不能早于今天");
    assert.equal(ctx.page.data.today, chinaDay());
  });

  it("paginates using the same full filters and server offset, retaining previous rows and selections", async () => {
    const ctx = harness();
    const filters = { ...defaults, time: "weekend", dateFrom: "2027-01-09", dateTo: "2027-01-10", budgetMax: 0, partySize: 2, campusScope: "cross" };
    await firstSearch(ctx, [row(1), row(2), row(3)], { filters, total: 5, hasMore: true, nextOffset: 3 });
    ctx.page.toggleCompare(event({ id: 1 }));
    const done = ctx.page.loadMore();
    await ctx.page.loadMore();
    assert.equal(ctx.calls.length, 2);
    assert.deepEqual(ctx.calls[1].body, { message: "", filters, limit: 3, offset: 3 });
    ctx.pending[1].resolve(response([row(3), row(4), row(5)], { filters, total: 5, nextOffset: 6 }));
    await done;
    assert.deepEqual(Array.from(ctx.page.data.results, (r) => r.id), [1, 2, 3, 4, 5]);
    assert.equal(ctx.page.data.results[0].compareSelected, true);
    assert.deepEqual(Array.from(ctx.page.data.compareIds), [1]);
    await ctx.page.loadMore();
    assert.equal(ctx.calls.length, 2);
  });

  it("aligns budget limits with the server while retaining decimal precision and empty-price unknowns", async () => {
    const ctx = harness();
    await firstSearch(ctx, [row(1, { price: { amount: "" } })]);
    assert.equal(ctx.page.data.results[0].hasPrice, false);
    for (const [input, expected] of [["0", 0], ["200.001", 200.001], ["100000", 100000], ["", null]]) {
      ctx.page.setDraft(event({ key: "budgetMax" }, input));
      assert.equal(ctx.page.normalizeDraft().budgetMax, expected);
    }
    for (const input of ["100000.1", "-1", "abc", "Infinity"]) {
      ctx.page.setDraft(event({ key: "budgetMax" }, input));
      await ctx.page.applyFilters();
      assert.match(ctx.page.data.editError, /0到100000/);
    }
    assert.equal(ctx.calls.length, 1);
  });

  it("preserves input and old results after a failure, retries the exact failed request", async () => {
    const ctx = harness();
    await firstSearch(ctx, [row(1)]);
    ctx.page.onInput(event({}, "怀柔，两个人，周末"));
    const failed = ctx.page.submit();
    const failedBody = ctx.calls[1].body;
    ctx.pending[1].reject(new Error("网络暂不可用"));
    await failed;
    assert.equal(ctx.page.data.message, "怀柔，两个人，周末");
    assert.deepEqual(Array.from(ctx.page.data.results, (r) => r.id), [1]);
    assert.equal(ctx.page.data.error, "网络暂不可用");
    const retry = ctx.page.retry();
    assert.deepEqual(ctx.calls[2].body, failedBody);
    ctx.pending[2].resolve(response([row(2)]));
    await retry;
    assert.deepEqual(Array.from(ctx.page.data.results, (r) => r.id), [2]);
    assert.equal(ctx.page.data.error, "");
  });

  it("ignores stale responses after input changes and after the page is unloaded", async () => {
    const ctx = harness();
    ctx.page.onInput(event({}, "旧输入"));
    const first = ctx.page.submit();
    ctx.page.onInput(event({}, "新输入"));
    const second = ctx.page.submit();
    ctx.pending[1].resolve(response([row(2)], { mode: "model" }));
    await second;
    ctx.pending[0].resolve(response([row(1)]));
    await first;
    assert.deepEqual(Array.from(ctx.page.data.results, (r) => r.id), [2]);
    assert.equal(ctx.page.data.modelMode, true);
    ctx.page.onInput(event({}, "将关闭页面"));
    const after = ctx.page.submit();
    ctx.page.onUnload();
    ctx.pending[2].reject(new Error("closed"));
    await after;
    assert.equal(ctx.page.data.error, "");
    assert.deepEqual(Array.from(ctx.page.data.results, (r) => r.id), [2]);
  });

  it("compares only two to three actual displayed records, and navigates by schedule id", async () => {
    const ctx = harness();
    await firstSearch(ctx, [row(1), row(2, { price: {}, distanceKm: null }), row(3), row(4)]);
    ctx.page.toggleCompare(event({ id: 999 }));
    assert.equal(ctx.page.data.compareIds.length, 0);
    ctx.page.toggleCompare(event({ id: 1 }));
    ctx.page.openCompare();
    assert.equal(ctx.page.data.comparing, false);
    for (const id of [2, 3, 4]) ctx.page.toggleCompare(event({ id }));
    assert.deepEqual(Array.from(ctx.page.data.compareIds), [1, 2, 3]);
    ctx.page.openCompare();
    assert.equal(ctx.page.data.comparing, true);
    assert.equal(ctx.page.data.compareRows[1].hasPrice, false);
    assert.equal(ctx.page.data.compareRows[1].distanceKm, null);
    ctx.page.closeCompare();
    ctx.page.openResult(event({ id: 999 }));
    ctx.page.openResult(event({ id: 1 }));
    ctx.page.backHome();
    assert.deepEqual(plain(ctx.nav), [{ url: "/pages/schedule/schedule?id=1" }, { url: "/pages/index/index" }]);
    ctx.page.onInput(event({}, "新条件"));
    const next = ctx.page.submit();
    ctx.pending[1].resolve(response([row(1)]));
    await next;
    assert.equal(ctx.page.data.compareIds.length, 0);
    assert.equal(ctx.page.data.results[0].compareSelected, false);
    assert.equal(ctx.page.data.comparing, false);
  });

  it("clears only a selected condition and never auto-expands empty results", async () => {
    const ctx = harness();
    const filters = { ...defaults, time: "date", dateFrom: "2099-11-01", dateTo: "2099-11-01", budgetMax: 0, partySize: 2, destination: "长城", hostKind: "campus", campusScope: "cross" };
    await firstSearch(ctx, [], { filters });
    assert.equal(ctx.calls.length, 1);
    const done = ctx.page.clearCondition(event({ key: "budget" }));
    assert.deepEqual(ctx.calls[1].body.filters, { ...filters, budgetMax: null });
    ctx.pending[1].resolve(response([], { filters: { ...filters, budgetMax: null } }));
    await done;
    assert.equal(ctx.calls.length, 2);
  });
});
