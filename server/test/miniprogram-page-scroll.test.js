const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const { createPageScroller } = require("../../miniprogram/utils/page-scroll");

function scrollHarness() {
  let time = 0;
  let nextTimer = 0;
  let active = true;
  let position = 0;
  let maxPending = 0;
  const timers = new Map();
  const pending = [];
  const calls = [];
  const scrollerOptions = {
    now: () => time,
    isActive: () => active,
    schedule(callback, delay) {
      const id = ++nextTimer;
      timers.set(id, { callback, due: time + delay });
      return id;
    },
    unschedule(id) { timers.delete(id); },
    scrollTo(command) {
      calls.push({ time, scrollTop: command.scrollTop, duration: command.duration });
      position = command.scrollTop;
      pending.push(command);
      maxPending = Math.max(maxPending, pending.length);
    },
  };
  const scroller = createPageScroller(scrollerOptions);

  return {
    scroller,
    scrollTo: scrollerOptions.scrollTo,
    createScroller(options) {
      return createPageScroller({
        ...options,
        now: scrollerOptions.now,
        schedule: scrollerOptions.schedule,
        unschedule: scrollerOptions.unschedule,
      });
    },
    calls,
    get position() { return position; },
    set position(value) { position = value; },
    set active(value) { active = value; },
    get pendingCount() { return pending.length; },
    get timerCount() { return timers.size; },
    get maxPending() { return maxPending; },
    advance(milliseconds) {
      const until = time + milliseconds;
      let iterations = 0;
      while (true) {
        const next = [...timers].filter(([, timer]) => timer.due <= until)
          .sort((a, b) => a[1].due - b[1].due || a[0] - b[0])[0];
        if (!next) break;
        assert.ok(++iterations < 1000, "timer queue should make progress");
        const [id, timer] = next;
        timers.delete(id);
        time = timer.due;
        timer.callback();
      }
      time = until;
    },
    complete({ fail = false } = {}) {
      assert.ok(pending.length, "expected a pending WeChat bridge command");
      const command = pending.shift();
      if (fail) command.fail({ errMsg: "pageScrollTo:fail" });
      command.complete();
    },
  };
}

// Load the actual navigation entrypoints together with the home controller.
// Only platform APIs, remote coupon data, and the scrolling clock are replaced.
function navigationHarness(scroll) {
  let home;
  let component;
  let app;
  let pages = [];
  const calls = { tabs: [], navigations: [], modals: [] };
  const appearance = { read: () => ({ lang: "zh", size: "normal" }), SIZES: { normal: 1 }, isDark: () => false };
  const locale = { translate: (text) => text };
  const context = vm.createContext({
    Page(definition) { home = { ...definition, route: "pages/index/index" }; },
    Component(definition) { component = definition; },
    App(definition) { app = definition; },
    getCurrentPages: () => pages,
    getApp: () => app,
    wx: {
      pageScrollTo: scroll.scrollTo,
      switchTab({ url }) { calls.tabs.push(url); },
      navigateTo({ url }) { calls.navigations.push(url); },
      showModal(options) { calls.modals.push(options); },
      setNavigationBarTitle() {},
      showToast() {},
      showActionSheet() {},
    },
    setTimeout,
    clearTimeout,
  });
  const load = (relative) => {
    const filename = path.resolve(__dirname, "../../miniprogram", relative);
    const localRequire = createRequire(filename);
    const requireNative = (id) => {
      if (id.endsWith("/appearance")) return appearance;
      if (id.endsWith("/locale")) return locale;
      if (id.endsWith("/page-scroll")) return { createPageScroller: (options) => scroll.createScroller(options) };
      if (id.endsWith("/request")) return { request: async () => ({ data: [{ name: "测试优惠券" }] }) };
      if (id.endsWith("/coupon-time")) return { unusedCoupons: (rows) => rows, couponCountdown: () => null };
      return localRequire(id);
    };
    const execute = vm.runInContext("(function (require) {\n" + fs.readFileSync(filename, "utf8") + "\n})", context, { filename, lineOffset: -1 });
    execute(requireNative);
  };
  load("pages/index/index.js");
  pages = [home];
  load("custom-tab-bar/index.js");
  load("app.js");
  app.globalData.token = "test-token";

  return {
    home,
    calls,
    setCurrentPage(page) { pages = [page]; },
    selectTab(url) { component.methods.switchTab({ currentTarget: { dataset: { path: url } } }); },
    async couponPrompt() {
      app.onShow();
      await Promise.resolve();
      assert.equal(calls.modals.length, 1, "app should present the unused coupon prompt");
      return calls.modals[0];
    },
  };
}

describe("mini-program interruptible page scrolling", () => {
  it("eases into and out of the journey list and finishes without a native animation", () => {
    const h = scrollHarness();
    h.scroller.start({ from: 200, to: 1200, duration: 160 });
    assert.equal(h.calls.length, 0, "starting should not cause an immediate jump");

    for (let frame = 0; frame < 10; frame++) {
      h.advance(16);
      assert.equal(h.pendingCount, 1);
      h.complete();
    }

    const positions = [200, ...h.calls.map((call) => call.scrollTop)];
    const distances = positions.slice(1).map((value, index) => value - positions[index]);
    assert.ok(distances[0] > 0 && distances[0] < distances[4], "begin with a gentle movement");
    assert.ok(distances.at(-1) > 0 && distances.at(-1) < distances[4], "slow down near the destination");
    assert.ok(distances.every((distance) => distance > 0), "move toward the list without reversing");
    assert.equal(h.position, 1200);
    assert.ok(h.calls.every((call) => call.duration === 0), "never leave an uninterruptible native animation running");
    assert.equal(h.maxPending, 1);
    assert.equal(h.timerCount, 0);
    let idle = false;
    h.scroller.whenIdle(() => { idle = true; });
    assert.equal(idle, true, "completed scrolling releases navigation immediately");
    h.advance(1000);
    assert.equal(h.calls.length, 10, "finishing leaves no future movement");
  });

  it("waits for the bridge before scheduling another movement, even across a long stall", () => {
    const h = scrollHarness();
    h.scroller.start({ from: 0, to: 1000, duration: 400 });
    h.advance(16);
    h.advance(1000);
    assert.equal(h.calls.length, 1);
    assert.equal(h.pendingCount, 1);
    assert.equal(h.timerCount, 0, "do not build up frames behind a slow bridge");

    h.complete();
    h.advance(15);
    assert.equal(h.calls.length, 1);
    h.advance(1);
    assert.equal(h.calls.length, 2);
    assert.equal(h.position, 1000, "resume using elapsed time rather than replaying obsolete frames");
    h.complete();
    h.advance(1000);
    assert.equal(h.maxPending, 1);
    assert.equal(h.calls.length, 2);
    assert.equal(h.timerCount, 0);
  });

  it("cancels before the first movement without issuing a position correction", () => {
    const h = scrollHarness();
    h.scroller.start({ from: 0, to: 1000, duration: 400 });
    h.position = 280;
    h.scroller.cancel();
    h.advance(1000);
    assert.deepEqual(h.calls, []);
    assert.equal(h.position, 280, "keep the position chosen by the user's gesture");
    assert.equal(h.timerCount, 0);
  });

  it("a touch cancels future movement without writing an old position back after completion", () => {
    const h = scrollHarness();
    h.scroller.start({ from: 0, to: 1000, duration: 400 });
    h.advance(16);
    h.position = 350;
    h.scroller.cancel();
    h.advance(1000);
    assert.equal(h.calls.length, 1, "cancellation must not issue a corrective scroll");
    h.complete();
    h.advance(1000);
    assert.equal(h.calls.length, 1, "an old complete callback must not restart movement");
    assert.equal(h.position, 350);
    assert.equal(h.timerCount, 0);
    assert.equal(h.pendingCount, 0);
  });

  it("a touch between bridge calls removes the scheduled next movement", () => {
    const h = scrollHarness();
    h.scroller.start({ from: 0, to: 1000, duration: 400 });
    h.advance(16);
    h.complete();
    assert.equal(h.timerCount, 1);
    h.scroller.cancel();
    h.position = 410;
    h.advance(1000);
    assert.equal(h.calls.length, 1);
    assert.equal(h.position, 410);
    assert.equal(h.timerCount, 0);
  });

  it("waits for an issued bridge call to finish before navigating away", () => {
    const h = scrollHarness();
    const navigations = [];
    h.scroller.start({ from: 0, to: 1000, duration: 900 });
    h.advance(16);
    h.scroller.cancel();
    h.scroller.whenIdle(() => {
      navigations.push("route-detail");
      h.active = false;
    });
    h.advance(1000);
    assert.deepEqual(navigations, [], "the outstanding command must finish on the home page");
    assert.equal(h.calls.length, 1, "waiting for navigation must not issue another scroll");
    h.complete();
    assert.deepEqual(navigations, ["route-detail"]);
    h.advance(1000);
    assert.equal(h.calls.length, 1);
    assert.equal(h.timerCount, 0);
  });

  it("stops when the home page becomes inactive before a scheduled movement", () => {
    const h = scrollHarness();
    h.scroller.start({ from: 0, to: 1000, duration: 400 });
    h.advance(16);
    h.complete();
    h.active = false;
    h.advance(1000);
    assert.equal(h.calls.length, 1);
    assert.equal(h.timerCount, 0);
  });

  it("does not schedule another movement when completion arrives after leaving home", () => {
    const h = scrollHarness();
    h.scroller.start({ from: 0, to: 1000, duration: 400 });
    h.advance(16);
    h.active = false;
    h.complete();
    h.advance(1000);
    assert.equal(h.calls.length, 1);
    assert.equal(h.timerCount, 0);
  });

  it("only measures and starts the latest replacement request after the old command completes", () => {
    const h = scrollHarness();
    const measurements = [];
    h.scroller.start({ from: 0, to: 1000, duration: 400 });
    h.advance(16);
    const replace = (name, destination) => {
      h.scroller.cancel();
      h.scroller.whenIdle(() => {
        measurements.push({ name, position: h.position });
        h.scroller.start({ from: h.position, to: destination, duration: 160 });
      });
    };
    replace("obsolete destination", 800);
    replace("latest destination", 1200);
    h.position = 300;
    h.advance(1000);
    assert.deepEqual(measurements, [], "geometry must not be sampled while an older command is pending");
    assert.equal(h.calls.length, 1);
    h.complete();
    assert.deepEqual(measurements, [{ name: "latest destination", position: 300 }]);
    h.advance(16);
    assert.ok(h.position > 300 && h.position < 400, "start gently from the fresh position");
    assert.equal(h.maxPending, 1);
    h.complete();
    h.scroller.cancel();
    h.advance(1000);
    assert.equal(h.calls.length, 2);
    assert.equal(h.timerCount, 0);
  });

  it("cancelling a pending idle action prevents an obsolete navigation", () => {
    const h = scrollHarness();
    let navigations = 0;
    h.scroller.start({ from: 0, to: 1000, duration: 400 });
    h.advance(16);
    h.scroller.cancel();
    h.scroller.whenIdle(() => { navigations++; });
    h.scroller.cancel();
    h.complete();
    h.advance(1000);
    assert.equal(navigations, 0);
    assert.equal(h.calls.length, 1);
    assert.equal(h.timerCount, 0);
  });

  it("stops after a failed bridge command and releases idle callbacks", () => {
    const h = scrollHarness();
    h.scroller.start({ from: 0, to: 1000, duration: 400 });
    h.advance(16);
    h.complete({ fail: true });
    h.advance(1000);
    assert.equal(h.calls.length, 1, "do not retry a failed page scroll indefinitely");
    assert.equal(h.pendingCount, 0);
    assert.equal(h.timerCount, 0);
    let idle = false;
    h.scroller.whenIdle(() => { idle = true; });
    assert.equal(idle, true);
  });
});

describe("real mini-program navigation entrypoints during home scrolling", () => {
  it("the custom Tab bar waits for the pending home scroll before switching tabs", () => {
    const scroll = scrollHarness();
    const navigation = navigationHarness(scroll);
    navigation.home.homeScroller().start({ from: 0, to: 1000, duration: 900 });
    scroll.advance(16);
    assert.equal(scroll.pendingCount, 1);
    assert.equal(scroll.calls[0].duration, 0);

    navigation.selectTab("/pages/orders/orders");
    scroll.advance(1000);
    assert.deepEqual(navigation.calls.tabs, [], "the real Tab handler must use the home navigation guard");
    assert.equal(scroll.calls.length, 1, "navigation cancels all future home movement");
    scroll.complete();
    assert.deepEqual(navigation.calls.tabs, ["/pages/orders/orders"]);
    scroll.advance(1000);
    assert.equal(scroll.calls.length, 1);
    assert.equal(scroll.timerCount, 0);
  });

  it("the custom Tab bar switches immediately from another page", () => {
    const scroll = scrollHarness();
    const navigation = navigationHarness(scroll);
    navigation.setCurrentPage({ route: "pages/activities/activities" });
    navigation.selectTab("/pages/orders/orders");
    assert.deepEqual(navigation.calls.tabs, ["/pages/orders/orders"]);
    assert.equal(scroll.calls.length, 0);
    assert.equal(scroll.timerCount, 0);
  });

  it("the app's coupon prompt waits for the pending home scroll before opening coupons", async () => {
    const scroll = scrollHarness();
    const navigation = navigationHarness(scroll);
    navigation.home.homeScroller().start({ from: 0, to: 1000, duration: 900 });
    scroll.advance(16);
    const prompt = await navigation.couponPrompt();
    prompt.success({ confirm: true });
    scroll.advance(1000);
    assert.deepEqual(navigation.calls.navigations, [], "the real app modal must use the home navigation guard");
    assert.equal(scroll.calls.length, 1);
    assert.equal(scroll.calls[0].duration, 0);
    scroll.complete();
    assert.deepEqual(navigation.calls.navigations, ["/pages/coupons/coupons"]);
    scroll.advance(1000);
    assert.equal(scroll.calls.length, 1);
    assert.equal(scroll.timerCount, 0);
  });

  it("the app's coupon prompt opens coupons immediately from another page", async () => {
    const scroll = scrollHarness();
    const navigation = navigationHarness(scroll);
    const prompt = await navigation.couponPrompt();
    // A global modal may be confirmed after the user has moved to another page.
    navigation.setCurrentPage({ route: "pages/mine/mine" });
    prompt.success({ confirm: true });
    assert.deepEqual(navigation.calls.navigations, ["/pages/coupons/coupons"]);
    assert.equal(scroll.calls.length, 0);
    assert.equal(scroll.timerCount, 0);
  });
});
