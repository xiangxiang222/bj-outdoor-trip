#!/usr/bin/env node
// Runs against an isolated temporary database and the local production web build.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const { chromium } = require("playwright-core");

const root = path.resolve(__dirname, "..");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bj-browser-"));
const output = process.env.UI_ARTIFACT_DIR || fs.mkdtempSync(path.join(os.tmpdir(), "bj-browser-results-"));
fs.mkdirSync(output, { recursive: true });
process.env.MMC_DATA_DIR = dir;
process.env.MMC_DB_FILE = path.join(dir, "app.sqlite");
process.env.MMC_PUBLIC_DIR = path.join(dir, "public");
process.env.MMC_WEB_DIST_DIR = path.join(root, "web/dist");
process.env.MMC_SKIP_WEB = "0";
process.env.ROUTE_I18N_AUTO = "0";
// Provider behavior has dedicated local HTTP tests; browser regressions stay offline.
process.env.AI_DISCOVERY_DAILY_LIMIT = "0";
process.env.NODE_ENV = "test";

async function main() {
  assert.ok(fs.existsSync(path.join(process.env.MMC_WEB_DIST_DIR, "index.html")), "Run npm run build before test:ui");
  const { seedMinimal } = require("../server/test/helpers");
  const { createApp } = require("../server/src/app");
  const { signUser, signAdmin, signGuide } = require("../server/src/middleware/auth");
  const seed = seedMinimal();
  const db = seed.db;
  db.prepare("UPDATE schedules SET guide_id=? WHERE id=?").run(seed.guideId, seed.individualScheduleId);
  const rowUser = db.prepare("SELECT * FROM users WHERE id=?").get(seed.userId);
  const admin = db.prepare("SELECT * FROM admin_users WHERE id=?").get(seed.adminId);
  const guide = db.prepare("SELECT * FROM guides WHERE id=?").get(seed.guideId);
  const bcrypt = require(require.resolve("bcryptjs", { paths: [path.join(root, "server")] }));
  const photoId = Number(db.prepare("INSERT INTO admin_users (username,password_hash,name,role,status) VALUES (?,?,?,?,?)").run("photo-test", bcrypt.hashSync("photo123", 8), "测试摄影", "photographer", "on").lastInsertRowid);
  const photographer = db.prepare("SELECT * FROM admin_users WHERE id=?").get(photoId);
  const app = createApp();
  // Test fixtures write only to temp; media fallback reads existing assets without changing them.
  const express = require(require.resolve("express", { paths: [path.join(root, "server")] }));
  app.use("/static", express.static(path.join(root, "server/public/static")));
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const executablePath = process.env.CHROME_PATH || (process.platform === "darwin"
    ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    : ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"].find(fs.existsSync));
  let browser;
  const report = { cases: [], pages: [], errors: [], artifacts: output };
  try {
    assert.ok(executablePath && fs.existsSync(executablePath), "Set CHROME_PATH to a Chrome/Chromium executable");
    browser = await chromium.launch({ executablePath, headless: true });
    const userToken = signUser(rowUser);
    const me = (await (await fetch(origin + "/api/me", { headers: { authorization: `Bearer ${userToken}` } })).json()).data;
    const enResponse = await fetch(origin + "/api/enroll", { method: "POST", headers: { authorization: `Bearer ${userToken}`, "content-type": "application/json" }, body: JSON.stringify({ scheduleId: seed.individualScheduleId, travelerName: "林北野", travelerPhone: rowUser.phone, idCard: rowUser.id_card, emergencyName: "测试联系人", emergencyPhone: "13700000002", waiverAccepted: true, healthOk: true }) });
    assert.equal(enResponse.status, 200, "Prepare isolated enrollment");
    const enrollment = (await enResponse.json()).data;
    const payShare = db.prepare("SELECT pay_share_token FROM enrollments WHERE id=?").get(enrollment.enrollmentId);
    db.prepare("INSERT INTO poster_lineups (code,ids_key,ids_json) VALUES (?,?,?)").run("browser01", String(seed.individualScheduleId), JSON.stringify([seed.individualScheduleId]));
    db.prepare("INSERT INTO coupon_campaigns (code,schedule_id,name,kind,value,total,status) VALUES (?,?,?,?,?,?,?)").run("browsercoupon", seed.individualScheduleId, "浏览器测试券", "fixed", 5, 10, "on");
    const auth = {
      user: { bj_token: userToken, bj_user: JSON.stringify(me) },
      admin: { bj_admin_token: signAdmin(admin), bj_admin_name: admin.name, bj_admin_role: admin.role },
      guide: { bj_guide_token: signGuide(guide), bj_guide_name: guide.name },
      photographer: { bj_admin_token: signAdmin(photographer), bj_admin_name: photographer.name, bj_admin_role: photographer.role },
    };
    async function pageFor(role = "user", width = 390, look = {}, profile) {
      const page = await browser.newPage({ viewport: { width, height: width > 700 ? 1000 : 844 }, deviceScaleFactor: 1 });
      page.setDefaultTimeout(5000);
      page.on("pageerror", (e) => report.errors.push({ url: page.url(), message: e.message }));
      await page.addInitScript(({ values, look }) => {
        for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value);
        localStorage.setItem("bj_look", JSON.stringify({ night: "day", size: 1, lang: "zh", ...look }));
      }, { values: { ...(auth[role] || {}), ...(profile ? { bj_user: JSON.stringify(profile) } : {}) }, look });
      // Weather is an external integration, intentionally unavailable in this offline UI suite.
      await page.route("**/api/weather?**", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false, message: "天气暂不可用" }) }));
      return page;
    }
    async function goto(page, url) {
      await page.goto(origin + url, { waitUntil: "domcontentloaded", timeout: 15000 });
      await page.waitForFunction(() => (document.querySelector("#app")?.textContent || "").trim().length > 15);
    }
    async function test(name, fn) {
      try { await fn(); report.cases.push({ name, pass: true }); console.log(`PASS ${name}`); }
      catch (e) { report.cases.push({ name, pass: false, error: e.message }); console.error(`FAIL ${name}: ${e.message}`); }
    }
    const activityDate = new Date(Date.now() + 86400000 + 8 * 3600000).toISOString().slice(0, 10);
    const activityFixtures = [
      { kind: "掼蛋", title: "下班后的新手掼蛋局", city: "海淀", place: "五道口咖啡馆", price: 28 },
      { kind: "跑步", title: "朝阳公园 5 公里轻松跑", city: "朝阳", place: "朝阳公园南门", price: 0 },
      { kind: "电影", title: "周末一起看一场电影", city: "朝阳", place: "三里屯电影院大厅", price: 0 },
      { kind: "招募", title: "校园摄影社新朋友见面会", city: "海淀", place: "校园图书馆东门", price: 0 },
    ];
    for (const fixture of activityFixtures) {
      const response = await fetch(origin + "/api/trips", {
        method: "POST", headers: { authorization: `Bearer ${userToken}`, "content-type": "application/json" },
        body: JSON.stringify({ channel: "activity", activityKind: fixture.kind, title: fixture.title, startDate: activityDate, meetupTime: "19:30", meetupPoint: fixture.place, city: fixture.city, minGroupSize: 4, maxSeats: 12, originPrice: fixture.price, offerType: fixture.price ? "full" : "free", description: "浏览器隔离测试活动" }),
      });
      assert.equal(response.status, 200, "Create isolated activity fixture");
      fixture.id = (await response.json()).data.id;
      const schedule = db.prepare("SELECT route_id FROM schedules WHERE id=?").get(fixture.id);
      db.prepare("UPDATE schedules SET review_status='approved' WHERE id=?").run(fixture.id);
      db.prepare("UPDATE routes SET status='on' WHERE id=?").run(schedule.route_id);
    }
    await test("activity discovery filters by interest, search, city and real price", async () => {
      const p = await pageFor();
      try {
        await goto(p, "/m/activities");
        await p.locator(".activity-card").first().waitFor();
        assert.equal(await p.locator(".activity-card").count(), 4);
        assert.equal(await p.locator(".activity-more-filters").count(), 0, "advanced options start collapsed");
        await p.getByRole("button", { name: /掼蛋.*牌桌见朋友/ }).click();
        assert.equal(new URL(p.url()).searchParams.get("kind"), "掼蛋");
        await p.waitForFunction(() => document.querySelectorAll(".activity-card").length === 1);
        assert.match(await p.locator(".activity-card").innerText(), /下班后的新手掼蛋局/);
        assert.match(await p.locator(".activity-card-price").innerText(), /28/);
        await p.getByRole("button", { name: /清空筛选/ }).click();
        await p.getByRole("searchbox", { name: "搜索活动", exact: true }).fill("朝阳公园");
        await p.waitForFunction(() => document.querySelectorAll(".activity-card").length === 1);
        assert.match(await p.locator(".activity-card").innerText(), /5 公里轻松跑/);
        await p.getByRole("searchbox", { name: "搜索活动", exact: true }).fill("");
        await p.locator(".activity-filter-toggle").click();
        await p.getByRole("combobox", { name: "所在城区", exact: true }).selectOption("海淀");
        await p.waitForFunction(() => document.querySelectorAll(".activity-card").length === 2);
        await p.getByRole("button", { name: /只看免费/ }).click();
        await p.waitForFunction(() => document.querySelectorAll(".activity-card").length === 1);
        assert.match(await p.locator(".activity-card").innerText(), /摄影社/);
        assert.match(await p.locator(".activity-result-count").innerText(), /1 场可参与/);
        await p.getByRole("button", { name: /清空筛选/ }).click();
        await p.getByRole("button", { name: /跑步.*跑出好心情/ }).click();
        await p.screenshot({ path: path.join(output, "activity-running.png"), fullPage: true });
      } finally { await p.close(); }
    });
    await test("guest activity publishing preserves the selected interest after login", async () => {
      const p = await pageFor("guest");
      try {
        await goto(p, "/m/activities?kind=" + encodeURIComponent("电影"));
        await p.locator(".activity-theme").waitFor();
        await p.getByRole("button", { name: /发起观影/ }).first().click();
        await p.waitForURL((url) => url.pathname === "/m/login");
        assert.equal(new URL(p.url()).searchParams.get("redirect"), "/m/publish?channel=activity&kind=" + encodeURIComponent("电影"));
      } finally { await p.close(); }
    });
    await test("activity loading failure retries without losing the selected interest", async () => {
      const p = await pageFor();
      const endpoint = "**/api/schedules?channel=activity";
      try {
        await p.route(endpoint, (route) => route.abort("failed"));
        await goto(p, "/m/activities?kind=" + encodeURIComponent("跑步"));
        await p.getByText("活动加载失败", { exact: true }).waitFor();
        assert.equal(await p.locator(".activity-empty").count(), 0, "network errors are not empty search results");
        await p.unroute(endpoint);
        await p.getByRole("button", { name: "重新加载", exact: true }).click();
        await p.locator(".activity-card").first().waitFor();
        assert.equal(await p.locator(".activity-card").count(), 1);
        assert.match(await p.locator(".activity-card").innerText(), /5 公里轻松跑/);
        assert.equal(new URL(p.url()).searchParams.get("kind"), "跑步");
      } finally { await p.close(); }
    });
    await test("running activity publishes canonical details once and shows them on its review page", async () => {
      const p = await pageFor();
      try {
        await goto(p, "/m/publish?channel=activity&kind=" + encodeURIComponent("跑步"));
        await p.locator("#publish-title").fill("浏览器验证：晨光中的 5 公里");
        await p.locator("#publish-date").fill(activityDate);
        await p.locator("#publish-time").fill("08:00");
        await p.getByRole("button", { name: /下一步/ }).click();
        await p.locator("#publish-place").fill("朝阳公园南门旁的地图前");
        await p.locator("#publish-activity-min").fill("3");
        await p.locator("#publish-max").fill("8");
        assert.equal(await p.locator("#publish-price").inputValue(), "0");
        await p.locator("#publish-price").fill("");
        await p.getByRole("button", { name: /下一步/ }).click();
        await p.getByRole("alert").getByText("请填写有效费用，免费活动填 0", { exact: true }).waitFor();
        await p.locator("#publish-price").fill("0");
        await p.getByRole("button", { name: /下一步/ }).click();
        await p.getByRole("button", { name: /下一步/ }).click();
        await p.getByRole("alert").getByText("请填写跑步距离", { exact: true }).waitFor();
        await p.locator("#activity-distance").fill("5 公里，新手可提前结束");
        await p.locator("#activity-pace").fill("7分/公里，不竞速");
        await p.locator("#activity-route").fill("南门出发，沿园内湖畔环线");
        await p.locator("#activity-equipment").fill("跑鞋、饮水");
        await p.locator("#publish-description").fill("先热身十分钟，小雨改期。 ");
        await p.getByRole("button", { name: /下一步/ }).click();
        assert.match(await p.locator(".publish-activity-summary").innerText(), /5 公里.*新手可提前结束/s);
        let posts = 0;
        p.on("request", (request) => { if (new URL(request.url()).pathname === "/api/trips" && request.method() === "POST") posts++; });
        const posted = p.waitForResponse((response) => new URL(response.url()).pathname === "/api/trips" && response.request().method() === "POST");
        await p.evaluate(() => { const form = document.querySelector(".publish-page form"); form.requestSubmit(); form.requestSubmit(); });
        const response = await posted;
        assert.equal(response.status(), 200);
        const id = (await response.json()).data.id;
        await p.waitForURL((url) => url.pathname === `/m/schedule/${id}`);
        await p.getByText("本团正在审核，通过后才会出现在活动页，暂不能报名。", { exact: true }).waitFor();
        const saved = db.prepare("SELECT r.category,r.description,s.review_status,s.channel,s.max_seats FROM schedules s JOIN routes r ON r.id=s.route_id WHERE s.id=?").get(id);
        assert.equal(posts, 1, "double submit is deduplicated");
        assert.equal(saved.category, "跑步");
        assert.equal(saved.channel, "activity");
        assert.equal(saved.review_status, "pending");
        assert.equal(saved.max_seats, 8);
        assert.match(saved.description, /^【活动信息】\n跑步距离：5 公里，新手可提前结束\n参考配速：7分\/公里，不竞速\n跑步路线：南门出发，沿园内湖畔环线\n装备提示：跑鞋、饮水\n\n先热身十分钟，小雨改期。$/);
        assert.match(await p.locator(".activity-detail-brief").innerText(), /跑步距离.*5 公里/s);
        await p.getByRole("tab", { name: "活动介绍", exact: true }).click();
        assert.match(await p.locator(".activity-description-card").innerText(), /先热身十分钟，小雨改期/);
        await p.screenshot({ path: path.join(output, "activity-running-detail.png"), fullPage: true });
      } finally { await p.close(); }
    });
    await test("all activity interests expose their own required publishing information", async () => {
      for (const [kind, ids] of [["掼蛋", ["level", "rules", "duration", "cost"]], ["电影", ["film", "session", "tickets", "agreement"]], ["招募", ["organization", "audience", "content", "requirements"]]]) {
        const p = await pageFor();
        try {
          await goto(p, "/m/publish?channel=activity&kind=" + encodeURIComponent(kind));
          await p.locator("#publish-title").fill(`${kind}浏览器验证`);
          await p.getByRole("button", { name: /下一步/ }).click();
          await p.locator("#publish-place").fill("测试集合地");
          await p.getByRole("button", { name: /下一步/ }).click();
          assert.equal(await p.locator(".publish-activity-field").count(), 4);
          for (const id of ids) assert.ok(await p.locator("#activity-" + id).isVisible(), `${kind}: ${id}`);
          await p.getByRole("button", { name: /下一步/ }).click();
          assert.ok(await p.getByRole("alert").isVisible(), `${kind} requires its core information`);
          if (kind === "电影") await p.screenshot({ path: path.join(output, "activity-movie-publish.png"), fullPage: true });
        } finally { await p.close(); }
      }
    });
    await test("activity layout fits narrow phones, large type, desktop and dark appearance", async () => {
      for (const [width, night, size, lang] of [[320, "day", 1, "zh"], [390, "day", 1, "zh"], [1440, "day", 1, "zh"], [320, "dark", 4, "zh"], [320, "day", 1, "en"]]) {
        const p = await pageFor("user", width, { night, size, lang });
        try {
          await goto(p, "/m/activities");
          await p.locator(".activity-card").first().waitFor();
          await p.locator(".activity-filter-toggle").click();
          assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `activity overflow at ${width}/${night}/${size}/${lang}`);
          await p.screenshot({ path: path.join(output, `activity-${width}-${night}-${size}-${lang}.png`), fullPage: true });
          if (width === 390 && night === "day" && lang === "zh") {
            await p.locator(".activity-list").scrollIntoViewIfNeeded();
            await p.screenshot({ path: path.join(output, "activity-list.png"), fullPage: true });
          }
        } finally { await p.close(); }
      }
    });
    await test("membership preview preserves owned tier and real progress", async () => {
      const p = await pageFor();
      try {
        await goto(p, "/m/member");
        await p.locator(".member-hero").waitFor();
        const hero = await p.locator(".member-hero").innerText();
        const mark = await p.locator(".member-mark").getAttribute("src");
        const progress = await p.locator(".member-track").getAttribute("aria-valuenow");
        await p.getByRole("button", { name: /V5 .*查看权益/ }).click();
        assert.equal(await p.locator(".member-hero").innerText(), hero);
        assert.equal(await p.locator(".member-mark").getAttribute("src"), mark);
        assert.equal(await p.locator(".member-track").getAttribute("aria-valuenow"), progress);
        assert.match(await p.locator(".member-benefits").innerText(), /预览等级，不代表已获得/);
        assert.equal(await p.locator(".member-perk").count(), 2);
        await p.screenshot({ path: path.join(output, "member-preview.png"), fullPage: true });
      } finally { await p.close(); }
    });
    await test("homepage keeps common filters visible and calendar collapsed", async () => {
      const p = await pageFor();
      try {
        await goto(p, "/m");
        const more = p.getByRole("button", { name: "更多筛选", exact: true });
        await more.waitFor();
        assert.equal(await p.locator(".calendar").count(), 0);
        assert.ok(await p.getByRole("button", { name: "高校", exact: true }).isVisible());
        assert.ok(await p.getByTestId("time-weekend").isVisible());
        await p.getByTestId("time-weekend").click();
        await more.click();
        await p.getByRole("heading", { name: "优惠与范围", exact: true }).waitFor();
        assert.ok(await p.locator(".filter-panel .offer-chip").count() > 0);
        assert.equal(await p.locator(".filter-months").count(), 0);
        assert.equal(await p.getByRole("dialog").count(), 0);
        assert.equal(await p.getByTestId("time-weekend").getAttribute("aria-pressed"), "true");
        await p.screenshot({ path: path.join(output, "home-advanced-filters.png"), fullPage: false });
        await p.getByRole("button", { name: "收起", exact: true }).waitFor();
        await p.getByRole("button", { name: "收起", exact: true }).click();
        await p.locator(".journey-shortcuts").getByRole("button", { name: /校园搭子/ }).click();
        assert.ok(await p.getByRole("button", { name: "更多筛选", exact: true }).isVisible());
        assert.match(await p.getByRole("button", { name: "高校", exact: true }).getAttribute("class"), /\bon\b/);
        await p.screenshot({ path: path.join(output, "home-filters.png"), fullPage: true });
      } finally { await p.close(); }
    });
    await test("campus discovery stays public and verification preserves the login return path", async () => {
      const p = await pageFor("guest");
      try {
        await goto(p, "/m");
        const campusShortcut = p.locator(".journey-shortcuts button").nth(3);
        assert.equal(await campusShortcut.locator("strong").innerText(), "校园搭子");
        assert.equal(await campusShortcut.locator("small").innerText(), "发现跨校旅程");
        assert.equal(await p.locator("a.destination-caption").getAttribute("href"), "/m/guides");
        assert.match(await p.locator("a.destination-caption").innerText(), /专业领队/);
        const verification = p.getByRole("region", { name: "校园认证", exact: true }).locator("a.campus-cta");
        assert.equal(await verification.count(), 1);
        assert.equal(await verification.getAttribute("href"), "/m/student");
        assert.match(await verification.innerText(), /去认证/);

        await campusShortcut.click();
        assert.equal(new URL(p.url()).pathname, "/m");
        assert.equal(await p.getByRole("tab", { name: "即将出发", exact: true }).getAttribute("aria-selected"), "true");
        assert.match(await p.getByRole("button", { name: "高校", exact: true }).getAttribute("class"), /\bon\b/);
        assert.ok(await p.getByRole("button", { name: "更多筛选", exact: true }).isVisible());
        assert.equal(await p.evaluate(() => localStorage.getItem("bj_token")), null);

        await verification.click();
        await p.waitForURL((url) => url.pathname === "/m/student");
        // The public verification form requests login when submitted, not when opened.
        await p.getByRole("button", { name: "提交校园认证", exact: true }).click();
        await p.waitForURL((url) => url.pathname === "/m/login");
        assert.equal(new URL(p.url()).searchParams.get("redirect"), "/m/student");
      } finally { await p.close(); }
    });
    await test("alumni certification submits optional fields once and returns to campus discovery", async () => {
      const photo = "/static/campus-test-document.png";
      const profile = { ...me, campusKind: "alumni", isStudent: false, isAlumni: false, studentStatus: "", school: "", college: "", major: "", studentNo: "", studentCardUrl: photo };
      const pending = { ...profile, studentStatus: "pending" };
      const p = await pageFor("user", 390, {}, profile);
      let submissions = 0;
      let release;
      const gate = new Promise((resolve) => { release = resolve; });
      await p.route("**/api/me", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: profile }) }));
      await p.route("**/static/campus-test-document.png", (route) => route.fulfill({ status: 200, contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64") }));
      await p.route("**/api/me/student", async (route) => {
        submissions++;
        await gate;
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: pending }) });
      });
      try {
        const returnPath = `/m/enroll/${seed.individualScheduleId}?ref=campus&coupon=campus-test`;
        await goto(p, "/m/student?redirect=" + encodeURIComponent(returnPath));
        await p.locator(".student-form").waitFor();
        await p.waitForFunction(() => !document.querySelector(".student-refresh"));
        assert.equal(await p.locator(".student-identity-options button").nth(1).getAttribute("aria-pressed"), "true");
        assert.equal(await p.locator("#student-number").count(), 0);
        const posted = p.waitForRequest((request) => new URL(request.url()).pathname === "/api/me/student");
        await p.evaluate(() => {
          const form = document.querySelector(".student-form");
          form.requestSubmit();
          form.requestSubmit();
        });
        const payload = (await posted).postDataJSON();
        await p.waitForFunction(() => document.querySelector(".student-submit")?.disabled === true);
        assert.equal(submissions, 1);
        assert.equal(payload.campusKind, "alumni");
        for (const key of ["school", "college", "major", "studentNo"]) assert.equal(payload[key], "");
        assert.equal(payload.studentCardUrl, photo);
        release();
        await p.locator(".student-result").waitFor();
        assert.match(await p.locator(".student-status").innerText(), /等待审核/);
        assert.equal(await p.locator(".student-form, .student-photo img, #student-card").count(), 0);
        assert.equal(await p.locator(".student-result .student-back").getAttribute("href"), returnPath);
        await p.locator(".student-result .student-primary").click();
        await p.waitForURL((url) => url.pathname === "/m" && url.searchParams.get("host") === "campus");
        await p.waitForFunction(() => [...document.querySelectorAll("button")].some((button) => button.textContent.trim() === "高校" && button.classList.contains("on")));
        assert.equal(submissions, 1);
      } finally { release(); await p.close(); }
    });
    await test("cached campus review survives refresh failure and retry updates it to approved", async () => {
      const profile = { ...me, campusKind: "student", isStudent: false, isAlumni: false, studentStatus: "pending", school: "北京大学", college: "", major: "", studentNo: "123456", studentCardUrl: "/static/campus-test-document.png" };
      const approved = { ...profile, isStudent: true, studentStatus: "approved" };
      const p = await pageFor("user", 390, {}, profile);
      let refreshes = 0;
      await p.route("**/api/me", (route) => {
        refreshes++;
        return route.fulfill({ status: refreshes === 1 ? 503 : 200, contentType: "application/json", body: JSON.stringify(refreshes === 1 ? { ok: false, message: "测试认证状态暂不可用" } : { ok: true, data: approved }) });
      });
      try {
        await goto(p, "/m/student");
        await p.locator(".student-refresh.has-error").waitFor();
        assert.match(await p.locator(".student-status").innerText(), /等待审核/);
        assert.equal(await p.locator(".student-form, .student-photo img, #student-card").count(), 0);
        await p.locator(".student-refresh").getByRole("button", { name: "重试", exact: true }).click();
        await p.waitForFunction(() => document.querySelector(".pass-status")?.textContent.includes("已认证"));
        assert.equal(refreshes, 2);
        assert.equal(await p.locator(".student-refresh").count(), 0);
        assert.match(await p.locator(".student-status").innerText(), /校园身份已认证/);
        assert.equal(await p.locator(".student-form, .student-photo img, #student-card").count(), 0);
        assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem("bj_user")).studentStatus), "approved");
      } finally { await p.close(); }
    });
    await test("enrollment network failure offers a working retry", async () => {
      const p = await pageFor();
      try {
        const match = `**/api/schedules/${seed.individualScheduleId}`;
        await p.route(match, (route) => route.abort("failed"));
        await goto(p, "/m/enroll/" + seed.individualScheduleId);
        await p.getByText("行程暂不可用", { exact: true }).waitFor();
        await p.unroute(match);
        await p.getByRole("button", { name: "重新加载", exact: true }).click();
        await p.getByText("出行人姓名", { exact: true }).waitFor();
        assert.equal(await p.getByText("行程暂不可用", { exact: true }).count(), 0);
      } finally { await p.close(); }
    });
    await test("guide login verifies SMS without asking for a second image captcha", async () => {
      const p = await pageFor("guest");
      try {
        await goto(p, "/g/login");
        await p.waitForResponse((r) => r.url().includes("/auth/captcha") && r.status() === 200).catch(() => {});
        const cap = db.prepare("SELECT code FROM captchas WHERE used=0 ORDER BY id DESC LIMIT 1").get();
        assert.ok(cap);
        await p.locator("#guide-phone").fill(guide.phone);
        await p.locator("#guide-captcha").fill(cap.code);
        await p.getByRole("button", { name: "获取验证码", exact: true }).click();
        await p.getByText("演示环境验证码为 888888", { exact: true }).waitFor();
        await p.waitForFunction(() => document.querySelector("#guide-captcha")?.value === "");
        assert.equal(await p.locator("#guide-captcha").inputValue(), "");
        await p.locator("#guide-sms").fill("888888");
        await p.getByRole("button", { name: "进入工作台", exact: true }).click();
        await p.waitForURL(origin + "/g");
      } finally { await p.close(); }
    });
    await test("future departures cannot unlock guide contact details", async () => {
      const p = await pageFor("guide");
      try {
        await goto(p, "/g/schedule/" + seed.individualScheduleId);
        await p.getByText("请在出发当天正式开团", { exact: true }).waitFor();
        assert.ok(await p.getByRole("button", { name: "正式开团", exact: true }).isDisabled());
        assert.ok(!(await p.locator(".guide-roster").innerText()).includes(rowUser.phone));
        await p.screenshot({ path: path.join(output, "guide.png"), fullPage: true });
      } finally { await p.close(); }
    });
    await test("trip review and demographics recover after a network error", async () => {
      for (const [url, api, heading] of [[`/m/after/${seed.individualScheduleId}`, `**/api/schedules/${seed.individualScheduleId}/after`, "行程回顾暂不可用"], [`/m/stats/${seed.individualScheduleId}`, `**/api/schedules/${seed.individualScheduleId}/demographics`, "出行画像暂不可用"]]) {
        const p = await pageFor();
        try {
          await p.route(api, (route) => route.abort("failed"));
          await goto(p, url);
          await p.getByText(heading, { exact: true }).waitFor();
          await p.unroute(api);
          await p.getByRole("button", { name: "重新加载", exact: true }).click();
          await p.getByText(heading, { exact: true }).waitFor({ state: "hidden" });
          if (url.includes("/stats/")) await p.locator("canvas").first().waitFor();
        } finally { await p.close(); }
      }
    });
    await test("restricted staff can change own password without staff management access", async () => {
      const p = await pageFor("photographer");
      try {
        await goto(p, "/admin/schedules");
        await p.locator(".admin-user").click();
        await p.getByTestId("admin-change-password").click();
        await p.getByTestId("admin-password-form").waitFor();
        assert.equal(await p.locator('a[href="/admin/staff"]').count(), 0);
        await p.locator("#admin-current-password").fill("photo123");
        await p.locator("#admin-new-password").fill("photo456");
        await p.locator("#admin-confirm-password").fill("wrong456");
        await p.getByTestId("admin-password-submit").click();
        await p.getByText("两次输入的新密码不一致", { exact: true }).waitFor();
        await p.locator("#admin-confirm-password").fill("photo456");
        await p.getByTestId("admin-password-submit").click();
        await p.getByTestId("admin-password-form").waitFor({ state: "hidden" });
        const login = await fetch(origin + "/api/admin/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "photo-test", password: "photo456" }) });
        assert.equal(login.status, 200);
      } finally { await p.close(); }
    });
    await test("membership layout fits narrow phones, desktop and dark appearance", async () => {
      for (const [width, night] of [[320, "day"], [390, "day"], [1440, "day"], [390, "dark"]]) {
        const p = await pageFor("user", width, { night });
        try {
          await goto(p, "/m/member");
          await p.locator(".member-perk").first().waitFor();
          assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `horizontal overflow at ${width}/${night}`);
          await p.screenshot({ path: path.join(output, `member-${width}-${night}.png`), fullPage: true });
        } finally { await p.close(); }
      }
    });
    await require("./ui-catalog-cases.cjs")({ test, pageFor, goto, db, seed, output });
    await require("./ui-home-dates-cases.cjs")({ test, pageFor, goto, output });
    await require("./ui-discovery-cases.cjs")({ test, pageFor, goto, db, seed, output });
    // These are rendering checks; transactional flows are covered by API E2E and tests above.
    const mobile = ["/m", "/m/discover", "/m/activities", "/m/official", "/m/student", "/m/group", "/m/leader", "/m/photo-apply", "/m/route-apply", "/m/feedback", "/m/lottery", "/m/after/1", "/m/route/1", "/m/schedule/1", "/m/enroll/1", "/m/open/0", "/m/publish", "/m/chain", "/m/mine", "/m/settings", "/m/settings/font", "/m/settings/night", "/m/settings/lang", "/m/profile", "/m/wallet", "/m/signin", "/m/wallet/cards", "/m/wallet/pin", "/m/login", "/m/member", "/m/orders", "/m/favorites", "/m/notices", "/m/views", "/m/companions", "/m/follows", "/m/stats/1", "/m/guides", "/m/guide/1", "/m/user/1"];
    const adminPages = ["/admin", "/admin/routes", "/admin/schedules", "/admin/enrollments", "/admin/coupons", "/admin/lottery", "/admin/users", "/admin/verify", "/admin/feedback", "/admin/tags", "/admin/refund", "/admin/staff"];
    mobile.push(`/m/orders/${enrollment.enrollmentId}`, `/m/pay/${payShare.pay_share_token}`, "/m/lineup/browser01", "/m/coupon/browsercoupon", "/m/publish?organizer=campus", "/m/publish?organizer=company", "/m/publish?channel=activity");
    for (const [role, paths] of [["user", mobile], ["admin", adminPages], ["guide", ["/g", "/g/schedule/1", `/g/schedule/${seed.individualScheduleId}/traveler/${enrollment.enrollmentId}`]]]) {
      const p = await pageFor(role, role === "admin" ? 1440 : 390);
      try {
        for (const url of paths) {
          await goto(p, url);
          await p.waitForTimeout(180);
          const text = (await p.locator("#app").innerText()).trim();
          report.pages.push({ url, rendered: text.length > 15, width: await p.evaluate(() => document.documentElement.scrollWidth), viewport: role === "admin" ? 1440 : 390 });
          assert.ok(text.length > 15, `blank page: ${url}`);
          await p.screenshot({ path: path.join(output, url.replace(/^\//, "").replace(/[^a-zA-Z0-9_-]/g, "-") + ".png") });
        }
      } finally { await p.close(); }
    }
    assert.equal(report.errors.length, 0, JSON.stringify(report.errors));
    assert.equal(report.cases.filter((c) => !c.pass).length, 0, "Some browser cases failed");
    console.log(`Browser regression: ${report.cases.length} cases and ${report.pages.length} route rendering checks passed. Artifacts: ${output}`);
  } finally {
    fs.writeFileSync(path.join(output, "report.json"), JSON.stringify(report, null, 2));
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
    require("../server/src/db").resetDb();
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => fs.rmSync(dir, { recursive: true, force: true }));
