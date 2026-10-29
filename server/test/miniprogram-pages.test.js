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
  const calls = { redirects: [], navigations: [], scrolls: [], titles: [], requests: [], auth: [], campusPicks: [], media: [], uploads: [], modals: [], toasts: [], tabs: [], previews: [] };
  const storage = new Map(Object.entries(options.storage || {}));
  let definition;
  const context = {
    require(id) {
      if (id === "../../utils/request") return {
        request(...args) {
          calls.requests.push(args);
          return options.request ? options.request(...args) : Promise.resolve({ data: {} });
        },
        setAuth(token, user) {
          app.globalData.token = token;
          app.globalData.user = user;
          calls.auth.push({ token, user });
        },
      };
      if (id === "../../utils/appearance") return { isDark: () => !!options.dark };
      if (pageName === "student" && id === "../../utils/campus") return { openCampusPick(value) { calls.campusPicks.push(value); } };
      if (pageName === "student" && id === "../../utils/media") return { absMedia: (url) => url && url.startsWith("/") ? "https://example.test" + url : url };
      return localRequire(id);
    },
    Page(value) { definition = value; },
    getApp() { return app; },
    wx: {
      redirectTo(value) { calls.redirects.push(value); },
      navigateTo(value) { calls.navigations.push(value); },
      pageScrollTo(value) { calls.scrolls.push(value); },
      setNavigationBarTitle(value) { calls.titles.push(value); },
      chooseMedia(value) { calls.media.push(value); },
      uploadFile(value) { calls.uploads.push(value); },
      showModal(value) { calls.modals.push(value); },
      showToast(value) { calls.toasts.push(value); },
      showLoading() {},
      hideLoading() {},
      switchTab(value) { calls.tabs.push(value); },
      previewImage(value) { calls.previews.push(value); },
      getStorageSync(key) { return storage.get(key); },
      setStorageSync(key, value) { storage.set(key, value); },
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
  return { page, calls, app };
}

function studentHarness(options = {}) {
  const harness = pageHarness("student", options);
  harness.page.onLoad({});
  return harness;
}

describe("native mini-program page behavior", () => {
  it("keeps campus browsing and campus verification on separate home entrances", () => {
    const template = fs.readFileSync(path.resolve(__dirname, "../../miniprogram/pages/index/index.wxml"), "utf8");
    const shortcuts = Array.from(template.matchAll(/<view class="quick-entry"([^>]*)>/g));
    assert.equal(shortcuts.length, 4);
    assert.match(shortcuts[1][1], /bindtap="goPublish"/);
    assert.match(shortcuts[1][1], /data-kind="campus"/);
    assert.match(shortcuts[2][1], /bindtap="goPublish"/);
    assert.match(shortcuts[2][1], /data-kind="company"/);
    assert.match(shortcuts[3][1], /bindtap="quickHost"/);
    assert.match(shortcuts[3][1], /data-kind="campus"/);
    const banner = template.match(/<view\b(?=[^>]*class="campus-card(?:\s[^"]*)?")[^>]*>/);
    assert.ok(banner, "campus verification banner is present");
    assert.match(banner[0], /\bbindtap="goStudent"/);
  });

  it("opens campus discovery anonymously with a clean filter and keeps advanced filters collapsed", () => {
    const { page, calls } = pageHarness("index", { app: { globalData: { token: "", user: {} } } });
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
    assert.equal(calls.navigations.length, 0);
    assert.equal(calls.redirects.length, 0);
  });

  it("takes campus verification to login with a return path only when anonymous", () => {
    const { page, calls } = pageHarness("index", { app: { globalData: { token: "", user: {} } } });
    page.goStudent();
    assert.equal(calls.navigations.length, 1);
    const login = new URL(calls.navigations[0].url, "https://test.invalid");
    assert.equal(login.pathname, "/pages/login/login");
    assert.equal(login.searchParams.get("redirect"), "/pages/student/student");

    const signedIn = pageHarness("index");
    signedIn.page.goStudent();
    assert.equal(signedIn.calls.navigations.length, 1);
    assert.equal(signedIn.calls.navigations[0].url, "/pages/student/student");
  });

  it("refreshes the campus action when returning from verification without making requests", () => {
    const app = { globalData: { token: "test-token", user: {} } };
    let requests = 0;
    const { page } = pageHarness("index", { app, request() { requests++; return Promise.resolve({ data: {} }); } });
    assert.equal(page.data.campusAction, "去认证");
    for (const [user, expected] of [
      [{}, "去认证"],
      [{ studentStatus: "pending" }, "认证进度"],
      [{ isStudent: true, studentStatus: "pending" }, "已认证"],
      [{ isAlumni: true }, "已认证"],
      [{ studentStatus: "rejected" }, "去认证"],
      [{}, "去认证"],
    ]) {
      app.globalData.user = user;
      page.onShow();
      assert.equal(page.data.campusAction, expected);
      assert.equal(page.data.campusDark, false);
    }
    assert.equal(requests, 0);
    const dark = pageHarness("index", { dark: true });
    dark.page.onShow();
    assert.equal(dark.page.data.campusDark, true);
  });

  it("keeps more filters limited to offers and scope without changing the selected departure date", () => {
    const { page } = pageHarness("index");
    let queryRuns = 0;
    page.applyGroups = () => { queryRuns++; };
    page.setData({
      date: "2026-10-31", timePreset: "any", offerFilter: "free", hostKind: "campus", school: "某大学",
      groups: [{ id: 27 }], picked: [{ key: "time", label: "2026.10.31" }, { key: "offer", label: "免费团" }],
    });
    page.toggleFold({ currentTarget: { dataset: { key: "extra" } } });
    assert.equal(page.data.fold.extra, true);
    page.toggleFold({ currentTarget: { dataset: { key: "extra" } } });
    assert.equal(page.data.fold.extra, false);
    assert.equal(queryRuns, 0);
    assert.equal(page.data.date, "2026-10-31");
    assert.equal(page.data.offerFilter, "free");
    assert.equal(page.data.school, "某大学");
    assert.deepEqual(Array.from(page.data.picked, (item) => item.key), ["time", "offer"]);
    const template = fs.readFileSync(path.resolve(__dirname, "../../miniprogram/pages/index/index.wxml"), "utf8");
    assert.match(template, /departure-extra-panel/);
    assert.match(template, /优惠与范围/);
    assert.doesNotMatch(template, /class="(?:calendar-scroll|month-grid|filter-sections)"/);
  });

  it("keeps anonymous campus certification local until an upload or submission requires login", async () => {
    const { page, calls } = studentHarness({ app: { globalData: { token: "", user: {} } }, dark: true });
    page.onShow();
    await page.refreshStatus();
    assert.equal(page.data.dark, true);
    assert.equal(page.data.certified, false);
    assert.equal(page.data.pending, false);
    assert.equal(page.data.refreshing, false);
    assert.equal(calls.requests.length, 0);

    page.pickCard();
    await page.submit();
    assert.equal(calls.media.length, 0);
    assert.equal(calls.requests.length, 0);
    assert.equal(calls.navigations.length, 2);
    for (const navigation of calls.navigations) {
      const login = new URL(navigation.url, "https://test.invalid");
      assert.equal(login.pathname, "/pages/login/login");
      assert.equal(login.searchParams.get("redirect"), "/pages/student/student");
    }
  });

  it("preserves alumni identity, certificate and deliberate clears when campus pickers return", () => {
    const profile = { campusKind: "student", school: "旧学校", college: "旧学院", major: "旧专业", studentNo: "12345", studentCardUrl: "/static/uploads/old.png" };
    const { page, calls } = studentHarness();
    page.syncUser(profile);
    page.setKind({ currentTarget: { dataset: { kind: "alumni" } } });
    page.onNo({ detail: { value: "" } });
    page.setData({ errors: { school: "旧错误", college: "旧错误", major: "旧错误" } });
    page.pickSchool();
    calls.campusPicks.at(-1).onPick(["新学校"]);
    page.syncUser(profile);
    assert.equal(page.data.campusKind, "alumni");
    assert.equal(page.data.studentNo, "");
    assert.equal(page.data.studentCardUrl, profile.studentCardUrl);
    assert.equal(page.data.school, "新学校");
    assert.equal(page.data.college, "");
    assert.equal(page.data.major, "");
    assert.ok(!page.data.errors.school);
    assert.ok(!page.data.errors.college);
    assert.ok(!page.data.errors.major);

    page.pickCollege();
    assert.equal(calls.campusPicks.at(-1).school, "新学校");
    calls.campusPicks.at(-1).onPick(["新学院"]);
    page.pickMajor();
    assert.equal(calls.campusPicks.at(-1).college, "新学院");
    calls.campusPicks.at(-1).onPick(["新专业"]);
    page.pickSchool();
    calls.campusPicks.at(-1).onPick([]);
    page.syncUser(profile);
    for (const key of ["school", "college", "major", "studentNo"]) assert.equal(page.data[key], "", `keeps cleared ${key}`);
    assert.equal(page.data.campusKind, "alumni");
  });

  it("locks pending and approved certification against editing, uploading and resubmitting", async () => {
    for (const status of [
      { studentStatus: "pending" },
      { studentStatus: "approved", isStudent: true },
      { studentStatus: "approved", isAlumni: true, campusKind: "alumni" },
    ]) {
      const { page, calls } = studentHarness();
      page.syncUser({ school: "北京大学", studentNo: "12345", studentCardUrl: "/static/uploads/card.png", ...status });
      const before = [page.data.campusKind, page.data.school, page.data.studentNo, page.data.studentCardUrl];
      page.setKind({ currentTarget: { dataset: { kind: page.data.campusKind === "alumni" ? "student" : "alumni" } } });
      page.onNo({ detail: { value: "99999" } });
      page.pickSchool();
      page.pickCollege();
      page.pickMajor();
      page.pickCard();
      await page.submit();
      assert.deepEqual([page.data.campusKind, page.data.school, page.data.studentNo, page.data.studentCardUrl], before);
      assert.equal(calls.campusPicks.length, 0);
      assert.equal(calls.media.length, 0);
      assert.equal(calls.requests.length, 0);
    }
  });

  it("refreshes a cached pending certification once and shows the approved server record", async () => {
    let resolveRequest;
    const { page, calls, app } = studentHarness({ request: () => new Promise((resolve) => { resolveRequest = resolve; }) });
    page.syncUser({ campusKind: "student", studentStatus: "pending", school: "旧学校" });
    assert.equal(page.data.pending, true);
    const first = page.refreshStatus();
    const duplicate = page.refreshStatus();
    assert.equal(calls.requests.length, 1);
    assert.equal(calls.requests[0][0], "/me");
    assert.equal(page.data.refreshing, true);
    const approved = { campusKind: "alumni", studentStatus: "approved", isAlumni: true, school: "审核学校", studentCardUrl: "/static/uploads/approved.png" };
    resolveRequest({ data: approved });
    await first;
    await duplicate;
    assert.equal(page.data.certified, true);
    assert.equal(page.data.pending, false);
    assert.equal(page.data.campusKind, "alumni");
    assert.equal(page.data.school, "审核学校");
    assert.equal(page.data.studentCardUrl, approved.studentCardUrl);
    assert.equal(page.data.refreshing, false);
    assert.equal(page.data.refreshError, "");
    assert.equal(app.globalData.user, approved);
    assert.equal(calls.auth.length, 1);
  });

  it("hydrates an untouched empty cache with the latest rejected certification record", async () => {
    const rejected = { campusKind: "alumni", studentStatus: "rejected", school: "北京大学", college: "信息学院", major: "计算机科学", studentNo: "", studentCardUrl: "/static/uploads/rejected.png" };
    const { page, calls, app } = studentHarness({ request: () => Promise.resolve({ data: rejected }) });
    await page.onShow();
    assert.equal(calls.requests.length, 1);
    assert.equal(page.data.rejected, true);
    assert.equal(page.data.pending, false);
    assert.equal(page.data.certified, false);
    for (const key of ["campusKind", "school", "college", "major", "studentNo", "studentCardUrl"]) assert.equal(page.data[key], rejected[key]);
    assert.equal(page.data.cardPreviewUrl, "https://example.test/static/uploads/rejected.png");
    assert.equal(app.globalData.user, rejected);
  });

  it("keeps certification drafts through refresh failures and a later successful retry", async () => {
    let fail = true;
    const old = { campusKind: "student", studentStatus: "rejected", school: "旧学校", studentNo: "12345" };
    const { page, calls } = studentHarness({ request() {
      return fail ? Promise.reject(new Error("网络暂不可用")) : Promise.resolve({ data: old });
    } });
    page.syncUser(old);
    page.setKind({ currentTarget: { dataset: { kind: "alumni" } } });
    page.setData({ school: "草稿学校", college: "", major: "", studentNo: "", studentCardUrl: "/static/uploads/draft.png" });
    await page.refreshStatus();
    assert.equal(page.data.refreshing, false);
    assert.ok(page.data.refreshError);
    assert.equal(page.data.rejected, true);
    fail = false;
    await page.refreshStatus();
    assert.equal(calls.requests.length, 2);
    assert.equal(page.data.refreshError, "");
    assert.equal(page.data.campusKind, "alumni");
    assert.equal(page.data.school, "草稿学校");
    assert.equal(page.data.studentNo, "");
    assert.equal(page.data.studentCardUrl, "/static/uploads/draft.png");
  });

  it("validates student evidence and dependent campus selections before requesting review", async () => {
    for (const [patch, expected] of [
      [{ studentNo: " 123 " }, /学号/],
      [{ studentCardUrl: "" }, /上传|照片|证/],
      [{ school: "", college: "学院", major: "" }, /学校/],
      [{ school: "学校", college: "", major: "专业" }, /学院/],
    ]) {
      const { page, calls } = studentHarness();
      page.syncUser({});
      page.setData({ campusKind: "student", studentNo: "1234", studentCardUrl: "/static/uploads/card.png", school: "", college: "", major: "", ...patch });
      await page.submit();
      assert.equal(calls.requests.length, 0);
      assert.equal(page.data.loading, false);
      assert.match(JSON.stringify(page.data.errors), expected);
    }
  });

  it("submits alumni without an optional school or student number and caches the pending result", async () => {
    const pending = { campusKind: "alumni", studentStatus: "pending", school: "", college: "", major: "", studentNo: "", studentCardUrl: "/static/uploads/alumni.png" };
    const { page, calls, app } = studentHarness({ request: () => Promise.resolve({ data: pending }) });
    page.syncUser({});
    page.setData({ campusKind: "alumni", school: "", college: "", major: "", studentNo: "", studentCardUrl: pending.studentCardUrl });
    await page.submit();
    assert.equal(calls.requests.length, 1);
    assert.equal(calls.requests[0][0], "/me/student");
    assert.equal(calls.requests[0][1], "POST");
    assert.equal(calls.requests[0][2].campusKind, "alumni");
    assert.equal(calls.requests[0][2].studentNo, "");
    assert.equal(calls.requests[0][2].studentCardUrl, pending.studentCardUrl);
    assert.equal(page.data.pending, true);
    assert.equal(page.data.loading, false);
    assert.equal(app.globalData.user, pending);
    assert.equal(calls.scrolls.at(-1).selector, "#cert-result");
  });

  it("does not let an earlier status refresh overwrite a successful certification submission", async () => {
    let resolveRefresh;
    const pending = { campusKind: "alumni", studentStatus: "pending", school: "草稿学校", studentNo: "", studentCardUrl: "/static/uploads/submitted.png" };
    const { page, calls, app } = studentHarness({ request(url) {
      return url === "/me" ? new Promise((resolve) => { resolveRefresh = resolve; }) : Promise.resolve({ data: pending });
    } });
    page.syncUser({});
    const refresh = page.refreshStatus();
    page.setData({ campusKind: "alumni", school: pending.school, studentCardUrl: pending.studentCardUrl });
    await page.submit();
    assert.equal(page.data.pending, true);
    assert.equal(calls.auth.length, 1);
    resolveRefresh({ data: { campusKind: "student", studentStatus: "rejected", school: "过期资料", studentCardUrl: "/static/uploads/old.png" } });
    await refresh;
    assert.equal(page.data.pending, true);
    assert.equal(page.data.rejected, false);
    assert.equal(page.data.campusKind, "alumni");
    assert.equal(page.data.school, pending.school);
    assert.equal(page.data.studentCardUrl, pending.studentCardUrl);
    assert.equal(app.globalData.user, pending);
    assert.equal(calls.auth.length, 1);
    assert.equal(page.data.refreshing, false);
    assert.equal(page.data.refreshError, "");
  });

  it("deduplicates certification submissions and preserves the draft when review submission fails", async () => {
    let rejectRequest;
    const { page, calls } = studentHarness({ request: () => new Promise((_resolve, reject) => { rejectRequest = reject; }) });
    page.syncUser({});
    page.setData({ campusKind: "student", studentNo: "12345", studentCardUrl: "/static/uploads/card.png", school: "北京大学" });
    const first = page.submit();
    await page.submit();
    assert.equal(page.data.loading, true);
    assert.equal(calls.requests.length, 1);
    rejectRequest(new Error("提交暂不可用"));
    await first;
    assert.equal(page.data.loading, false);
    assert.match(page.data.errors.submit, /提交暂不可用/);
    assert.equal(page.data.school, "北京大学");
    assert.equal(page.data.studentNo, "12345");
    assert.equal(page.data.studentCardUrl, "/static/uploads/card.png");
    assert.equal(calls.auth.length, 0);
  });

  it("rejects oversized and unsupported certificate photos before uploading", async () => {
    for (const file of [
      { tempFilePath: "/tmp/oversized.jpg", size: 5 * 1024 * 1024 + 1 },
      { tempFilePath: "/tmp/unsupported.gif", size: 200 },
    ]) {
      const { page, calls } = studentHarness();
      page.syncUser({});
      page.pickCard();
      assert.equal(calls.media.length, 1);
      await calls.media[0].success({ tempFiles: [file] });
      assert.equal(calls.uploads.length, 0);
      assert.equal(page.data.uploading, false);
      assert.ok(page.data.errors.card || calls.modals.length || calls.toasts.length);
    }
  });

  it("blocks submission while a certificate uploads and keeps the previous photo on upload failure", async () => {
    const { page, calls } = studentHarness();
    page.syncUser({});
    page.setData({ campusKind: "student", studentNo: "12345", studentCardUrl: "/static/uploads/old.png" });
    page.pickCard();
    const selected = calls.media[0].success({ tempFiles: [{ tempFilePath: "/tmp/new.png", size: 300 }] });
    assert.equal(page.data.uploading, true);
    assert.equal(calls.uploads.length, 1);
    page.pickCard();
    await page.submit();
    assert.equal(calls.media.length, 1);
    assert.equal(calls.requests.length, 0);
    calls.uploads[0].fail({ errMsg: "uploadFile:fail offline" });
    await selected;
    assert.equal(page.data.uploading, false);
    assert.equal(page.data.studentCardUrl, "/static/uploads/old.png");
    assert.ok(page.data.errors.card || calls.modals.length || calls.toasts.length);
  });

  it("previews a newly uploaded certificate remotely while retaining its original submission URL", async () => {
    const { page, calls } = studentHarness({ app: { globalData: { token: "test-token", user: {}, baseUrl: "https://example.test" } } });
    page.syncUser({});
    page.pickCard();
    const selected = calls.media[0].success({ tempFiles: [{ tempFilePath: "/tmp/card.webp", size: 300 }] });
    const upload = calls.uploads[0];
    assert.equal(upload.url, "https://example.test/api/upload");
    assert.equal(upload.header.Authorization, "Bearer test-token");
    upload.success({ statusCode: 200, data: JSON.stringify({ ok: true, data: { url: "/static/uploads/card.webp" } }) });
    await selected;
    assert.equal(page.data.uploading, false);
    assert.equal(page.data.studentCardUrl, "/static/uploads/card.webp");
    assert.equal(page.data.cardPreviewUrl, "https://example.test/static/uploads/card.webp");
  });

  it("ignores a certification status response after the page has unloaded", async () => {
    let resolveRequest;
    const { page, calls } = studentHarness({ request: () => new Promise((resolve) => { resolveRequest = resolve; }) });
    page.syncUser({ studentStatus: "pending" });
    const first = page.refreshStatus();
    page.onUnload();
    resolveRequest({ data: { studentStatus: "approved", isStudent: true, school: "过期响应" } });
    await first;
    assert.equal(page.data.certified, false);
    assert.equal(page.data.school, "");
    assert.equal(calls.auth.length, 0);
  });

  it("returns from certification to public campus discovery without requiring verified identity", () => {
    const { page, calls, app } = studentHarness({ app: { globalData: { token: "", user: {} } } });
    page.goDiscover();
    assert.equal(app.globalData.homeCampus, true);
    assert.equal(calls.tabs.length, 1);
    assert.equal(calls.tabs[0].url, "/pages/index/index");
    assert.equal(calls.navigations.length, 0);
    const home = pageHarness("index", { app });
    home.page.setData({ view: "routes", hostKind: "company", query: "旧搜索", "fold.extra": true });
    home.page.onShow();
    assert.equal(app.globalData.homeCampus, false);
    assert.equal(home.page.data.view, "trips");
    assert.equal(home.page.data.hostKind, "campus");
    assert.equal(home.page.data.query, "");
    assert.equal(home.page.data.fold.extra, false);
    assert.equal(home.calls.scrolls.at(-1).selector, "#explore");
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
