const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const locale = require("../../miniprogram/utils/locale");

const miniRoot = path.resolve(__dirname, "../../miniprogram");

function harness({ supported = true, token = "", lang = "zh", request = () => Promise.resolve({ data: [] }) } = {}) {
  let app;
  const calls = { manager: 0, ready: [], failed: [], modals: [], toasts: [], requests: [], applied: 0 };
  const manager = {
    onUpdateReady(callback) { calls.ready.push(callback); },
    onUpdateFailed(callback) { calls.failed.push(callback); },
    applyUpdate() { calls.applied++; },
  };
  const wx = {
    getStorageSync(key) { return key === "bj_token" ? token : null; },
    setNavigationBarTitle() {},
    showToast(options) { calls.toasts.push(options); },
    showModal(options) { calls.modals.push(options); },
    showActionSheet() {},
  };
  if (supported) wx.getUpdateManager = () => { calls.manager++; return manager; };
  const modules = new Map();
  const stubs = {
    "./config": { baseUrl: "https://example.invalid", mediaBaseUrl: "https://example.invalid" },
    "./utils/appearance": { read: () => ({ lang }), applyChrome() {}, paint() {} },
    "./utils/locale": locale,
    "./utils/request": {
      request(...args) { calls.requests.push(args); return request(...args); },
    },
    "./utils/coupon-time": { unusedCoupons: (rows) => rows, couponCountdown: () => null },
  };
  const context = vm.createContext({
    wx,
    App(definition) { app = definition; },
    Page() {},
    getApp: () => app,
    getCurrentPages: () => [],
    console,
    setTimeout,
    clearTimeout,
  });
  function load(id) {
    if (Object.hasOwn(stubs, id)) return stubs[id];
    if (id !== "./utils/update") throw new Error("Unexpected mini program dependency: " + id);
    if (!modules.has(id)) {
      const filename = path.join(miniRoot, "utils/update.js");
      const module = { exports: {} };
      modules.set(id, module);
      const wrapper = vm.runInContext("(function(require, module, exports) {\n" + fs.readFileSync(filename, "utf8") + "\n})", context, { filename });
      wrapper(load, module, module.exports);
    }
    return modules.get(id).exports;
  }
  context.require = load;
  const filename = path.join(miniRoot, "app.js");
  vm.runInContext(fs.readFileSync(filename, "utf8"), context, { filename });
  function finishModal(result = { confirm: false, cancel: true }) {
    const options = calls.modals.at(-1);
    if (options.success) options.success(result);
    if (options.complete) options.complete(result);
  }
  function failModal() {
    const options = calls.modals.at(-1);
    const failure = { errMsg: "showModal:fail" };
    if (options.fail) options.fail(failure);
    if (options.complete) options.complete(failure);
  }
  return {
    app, calls, finishModal, failModal,
    ready() { for (const callback of calls.ready) callback(); },
    failed() { for (const callback of calls.failed) callback(); },
    update: () => load("./utils/update"),
  };
}

describe("native mini program update lifecycle", () => {
  it("keeps older clients without the update API able to launch and return to the foreground", () => {
    const { app, calls } = harness({ supported: false, token: "saved-token" });
    assert.doesNotThrow(() => {
      app.onLaunch();
      app.onShow();
      app.onHide();
      app.onShow();
    });
    assert.equal(app.globalData.token, "saved-token");
    assert.equal(calls.modals.length, 0);
    assert.equal(calls.applied, 0);
  });

  it("registers each update listener once and waits until a downloaded package is ready", () => {
    const { app, calls } = harness();
    app.onLaunch();
    app.onLaunch();
    app.onShow();
    app.onHide();
    app.onShow();
    assert.equal(calls.manager, 1);
    assert.equal(calls.ready.length, 1);
    assert.equal(calls.failed.length, 1);
    assert.equal(calls.modals.length, 0);
    assert.equal(calls.applied, 0);
  });

  it("offers a prepared foreground update once and reloads only after explicit confirmation", () => {
    const { app, calls, ready, finishModal, update } = harness();
    app.onLaunch();
    app.onShow();
    ready();
    assert.equal(calls.modals.length, 1);
    const modal = calls.modals[0];
    assert.equal(modal.title, "发现新版本");
    assert.equal(modal.content, "新版本已准备好，是否重新加载？建议先完成当前操作。");
    assert.equal(modal.confirmText, "立即更新");
    assert.equal(modal.cancelText, "稍后再说");
    assert.equal(update().isPrompting(), true);
    assert.equal(calls.applied, 0);
    ready();
    app.onShow();
    assert.equal(calls.modals.length, 1);
    finishModal({ confirm: true, cancel: false });
    assert.equal(calls.applied, 1);
    assert.equal(update().isPrompting(), false);
    app.onHide();
    app.onShow();
    ready();
    assert.equal(calls.modals.length, 1);
    assert.equal(calls.applied, 1);
  });

  it("respects cancellation or an unconfirmed result for the rest of the session", () => {
    for (const result of [{ confirm: false, cancel: true }, {}]) {
      const { app, calls, ready, finishModal, update } = harness();
      app.onLaunch();
      app.onShow();
      ready();
      finishModal(result);
      assert.equal(calls.applied, 0);
      assert.equal(update().isPrompting(), false);
      app.onHide();
      app.onShow();
      ready();
      assert.equal(calls.modals.length, 1);
      assert.equal(calls.applied, 0);
    }
  });

  it("uses the selected language and keeps translated action labels within the platform limit", () => {
    for (const lang of ["tw", "en"]) {
      const { app, calls, ready } = harness({ lang });
      app.onLaunch();
      app.onShow();
      ready();
      const modal = calls.modals[0];
      assert.equal(modal.title, locale.translate("发现新版本", lang));
      assert.equal(modal.content, locale.translate("新版本已准备好，是否重新加载？建议先完成当前操作。", lang));
      assert.ok(Array.from(modal.confirmText).length <= 4);
      assert.ok(Array.from(modal.cancelText).length <= 4);
      if (lang === "en") {
        for (const key of ["title", "content", "confirmText", "cancelText"]) {
          assert.doesNotMatch(modal[key], /[\u4e00-\u9fff]/);
        }
      }
    }
  });

  it("holds background readiness until onShow and gives its prompt priority over a new coupon request", () => {
    const { app, calls, ready } = harness();
    app.onLaunch();
    app.onShow();
    app.onHide();
    app.globalData.token = "saved-token";
    ready();
    assert.equal(calls.modals.length, 0);
    assert.equal(calls.requests.length, 0);
    app.onShow();
    assert.equal(calls.modals.length, 1);
    assert.equal(calls.requests.length, 0);
    assert.equal(calls.applied, 0);
  });

  it("defers readiness received before the first onShow until the app is visible", () => {
    const { app, calls, ready } = harness();
    app.onLaunch();
    ready();
    assert.equal(calls.modals.length, 0);
    app.onShow();
    assert.equal(calls.modals.length, 1);
    assert.equal(calls.applied, 0);
  });

  it("waits for an already displayed coupon modal to finish before offering the update", async () => {
    const { app, calls, ready, finishModal, update } = harness({
      token: "saved-token",
      request: () => Promise.resolve({ data: [{ name: "周末优惠券" }] }),
    });
    app.onLaunch();
    app.onShow();
    await Promise.resolve();
    assert.equal(calls.modals.length, 1);
    assert.equal(calls.modals[0].title, "有未使用的优惠券");
    ready();
    assert.equal(calls.modals.length, 1);
    assert.equal(update().isPrompting(), false);
    finishModal({ confirm: false, cancel: true });
    assert.equal(calls.modals.length, 2);
    assert.equal(calls.modals[1].title, "发现新版本");
    assert.equal(update().isPrompting(), true);
    assert.equal(calls.applied, 0);
  });

  it("does not let an outstanding coupon response cover the update modal", async () => {
    let resolveCoupons;
    const coupons = new Promise((resolve) => { resolveCoupons = resolve; });
    const { app, calls, ready, update } = harness({ token: "saved-token", request: () => coupons });
    app.onLaunch();
    app.onShow();
    assert.equal(calls.requests.length, 1);
    ready();
    assert.equal(calls.modals.length, 1);
    assert.equal(calls.modals[0].title, "发现新版本");
    resolveCoupons({ data: [{ name: "周末优惠券" }] });
    await Promise.resolve();
    assert.equal(calls.modals.length, 1);
    assert.equal(update().isPrompting(), true);
    assert.equal(calls.applied, 0);
  });

  it("allows the next foreground entry to retry a modal that failed to display", () => {
    const { app, calls, ready, failModal, finishModal, update } = harness();
    app.onLaunch();
    app.onShow();
    ready();
    failModal();
    assert.equal(calls.modals.length, 1);
    assert.equal(update().isPrompting(), false);
    assert.equal(calls.applied, 0);
    app.onHide();
    app.onShow();
    assert.equal(calls.modals.length, 2);
    assert.equal(update().isPrompting(), true);
    finishModal({ confirm: true, cancel: false });
    assert.equal(calls.applied, 1);
  });

  it("does not interrupt users or reload when a package download fails", () => {
    const { app, calls, failed, update } = harness();
    app.onLaunch();
    app.onShow();
    failed();
    app.onHide();
    failed();
    app.onShow();
    assert.equal(calls.modals.length, 0);
    assert.equal(calls.toasts.length, 0);
    assert.equal(calls.applied, 0);
    assert.equal(update().isPrompting(), false);
  });
});
