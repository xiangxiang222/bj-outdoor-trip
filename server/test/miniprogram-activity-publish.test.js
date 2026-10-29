const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");

// Run the real native controller with device and transport boundaries replaced.
// No business database, network, or WeChat account is used.
function harness(options = {}) {
  const filename = path.resolve(__dirname, "../../miniprogram/pages/publish/publish.js");
  const localRequire = createRequire(filename);
  const calls = { requests: [], redirects: [], errors: [], scrolls: [] };
  let definition;
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    require(id) {
      if (id === "../../utils/request") return {
        request(...args) {
          calls.requests.push(args);
          if (args[0] === "/trips") return options.post ? options.post(...args) : Promise.resolve({ data: { id: 53 } });
          return Promise.resolve({ data: [] });
        },
        showError(...args) { calls.errors.push(args); },
      };
      if (id === "../../utils/appearance") return { isDark: () => false };
      return localRequire(id);
    },
    Page(value) { definition = value; },
    getApp() { return { globalData: { token: "test-token", user: {} } }; },
    wx: {
      redirectTo(value) { calls.redirects.push(value); },
      pageScrollTo(value) { calls.scrolls.push(value); },
      showLoading() {}, hideLoading() {},
    },
  }, { filename });
  const page = { ...definition, data: structuredClone(definition.data) };
  page.setData = function (patch, callback) {
    for (const [key, value] of Object.entries(patch)) {
      const parts = key.split(".");
      let target = this.data;
      for (const part of parts.slice(0, -1)) target = target[part] ||= {};
      target[parts.at(-1)] = value;
    }
    if (callback) callback();
  };
  return { page, calls };
}

const CASES = [
  ["掼蛋", { level: "新手友好", rules: "四人轮换", duration: "2 小时", cost: "茶位自理" }, ["经验要求：新手友好", "打法规则：四人轮换", "预计时长：2 小时", "费用说明：茶位自理"]],
  ["跑步", { distance: "5 公里", pace: "7分/公里", route: "公园环线", equipment: "跑鞋和饮水" }, ["跑步距离：5 公里", "参考配速：7分/公里", "跑步路线：公园环线", "装备提示：跑鞋和饮水"]],
  ["电影", { film: "具体影片", session: "影院一号厅 19:30", tickets: "自行购票", agreement: "提前20分钟集合" }, ["影片名称：具体影片", "影院与场次：影院一号厅 19:30", "购票方式：自行购票", "观影约定：提前20分钟集合"]],
  ["招募", { organization: "校园摄影社", audience: "在校师生", content: "作品交流", requirements: "手机即可" }, ["社团名称：校园摄影社", "招募对象：在校师生", "参与内容：作品交流", "报名要求：手机即可"]],
];
const tap = (key) => ({ currentTarget: { dataset: { key } } });
const input = (key, value) => ({ currentTarget: { dataset: { k: key, key } }, detail: { value } });
const posts = (calls) => calls.requests.filter(([url, method]) => url === "/trips" && method === "POST");
function prepare(kind = "跑步", options) {
  const result = harness(options);
  result.page.onLoad({ channel: "activity", kind: encodeURIComponent(kind) });
  result.page.setData({ "form.title": "周末同好见面", "form.meetupPoint": "公园南门", "form.description": "  请按时赴约。  " });
  return result;
}
function fill(page, details) {
  for (const [key, value] of Object.entries(details)) page.setActivityField(input(key, value));
}

describe("native activity publishing", () => {
  for (const [kind, values, lines] of CASES) {
    it(`requires ${kind} facts and persists the real arrangements in canonical description`, async () => {
      const { page, calls } = prepare(kind);
      await page.submit();
      assert.equal(posts(calls).length, 0);
      assert.match(page.data.errors.activityDetails, /^请填写/);
      fill(page, values);
      await page.submit();
      assert.equal(posts(calls).length, 1);
      const body = posts(calls)[0][2];
      assert.equal(body.activityKind, kind);
      assert.equal(body.channel, "activity");
      assert.equal(body.organizerType, "individual");
      assert.equal(body.offerType, "free");
      assert.equal(body.originPrice, 0);
      assert.equal(body.description, "【活动信息】\n" + lines.join("\n") + "\n\n请按时赴约。");
      assert.equal(calls.redirects[0].url, "/pages/schedule/schedule?id=53&posted=1");
    });
  }

  it("starts with visible zero and blocks an explicitly cleared fee before any publish request", async () => {
    const { page, calls } = prepare();
    assert.equal(page.data.form.originPrice, 0);
    fill(page, CASES[1][1]);
    page.setField(input("originPrice", ""));
    await page.submit();
    assert.equal(posts(calls).length, 0);
    assert.equal(page.data.errors.originPrice, "请填写有效费用，免费活动填 0");
    page.setField(input("originPrice", "0"));
    await page.submit();
    assert.equal(posts(calls)[0][2].originPrice, 0);
    assert.equal(posts(calls)[0][2].offerType, "free");
  });

  it("turns a positive activity fee into a paid offer instead of retaining the default free type", async () => {
    const { page, calls } = prepare("电影");
    fill(page, CASES[2][1]);
    page.setField(input("originPrice", "29.50"));
    await page.submit();
    assert.equal(posts(calls)[0][2].originPrice, 29.5);
    assert.equal(posts(calls)[0][2].offerType, "full");
  });

  it("restores each interest's own draft and keeps a custom title while switching interests", () => {
    const { page } = prepare("跑步");
    fill(page, CASES[1][1]);
    page.pickKind(tap("电影"));
    assert.equal(Object.keys(page.data.form.activityDetails).length, 0);
    assert.equal(page.data.form.title, "周末同好见面");
    fill(page, CASES[2][1]);
    page.pickKind(tap("跑步"));
    assert.deepEqual({ ...page.data.form.activityDetails }, CASES[1][1]);
    assert.equal(page.data.activityFields[0].key, "distance");
    page.pickKind(tap("电影"));
    assert.deepEqual({ ...page.data.form.activityDetails }, CASES[2][1]);
    page.pickKind(tap("unknown"));
    assert.equal(page.data.form.activityKind, "电影");
    page.setActivityField(input("not-a-field", "ignored"));
    assert.equal(page.data.form.activityDetails["not-a-field"], undefined);
  });

  it("locks a pending publish request against a rapid second submission", async () => {
    let resolve;
    const pending = new Promise((done) => { resolve = done; });
    const { page, calls } = prepare("跑步", { post: () => pending });
    fill(page, CASES[1][1]);
    const first = page.submit();
    assert.equal(page.data.submitting, true);
    await page.submit();
    assert.equal(posts(calls).length, 1);
    resolve({ data: { id: 75 } });
    await first;
    assert.equal(page.data.submitting, false);
    assert.equal(calls.redirects.length, 1);
  });

  it("safely opens malformed category links and literal percent titles", () => {
    const { page } = harness();
    assert.doesNotThrow(() => page.onLoad({ channel: "activity", kind: "%E0%A4%A", title: "周末 50% 优惠约局" }));
    assert.equal(page.data.form.activityKind, "掼蛋");
    assert.equal(page.data.form.title, "周末 50% 优惠约局");
    const encoded = harness().page;
    encoded.onLoad({ channel: "activity", kind: encodeURIComponent("跑步"), title: encodeURIComponent("一起跑步") });
    assert.equal(encoded.data.form.activityKind, "跑步");
    assert.equal(encoded.data.form.title, "一起跑步");
  });
});
