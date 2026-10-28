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
    async function pageFor(role = "user", width = 390, look = {}) {
      const page = await browser.newPage({ viewport: { width, height: width > 700 ? 1000 : 844 }, deviceScaleFactor: 1 });
      page.setDefaultTimeout(5000);
      page.on("pageerror", (e) => report.errors.push({ url: page.url(), message: e.message }));
      await page.addInitScript(({ values, look }) => {
        for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value);
        localStorage.setItem("bj_look", JSON.stringify({ night: "day", size: 1, lang: "zh", ...look }));
      }, { values: auth[role] || {}, look });
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
        await more.click();
        await p.getByRole("tab", { name: "出发日期", exact: true }).waitFor();
        assert.equal(await p.locator(".filter-panel .offer-chip").count(), 0);
        await p.getByRole("tab", { name: "优惠与范围", exact: true }).click();
        assert.ok(await p.locator(".filter-panel .offer-chip").count() > 0);
        assert.equal(await p.locator(".filter-months").count(), 0);
        await p.getByRole("tab", { name: "出发日期", exact: true }).click();
        assert.equal(await p.locator(".filter-months").count(), 1);
        await p.screenshot({ path: path.join(output, "home-advanced-filters.png"), fullPage: false });
        await p.getByRole("button", { name: "收起", exact: true }).waitFor();
        await p.getByRole("button", { name: "收起", exact: true }).click();
        await p.getByRole("button", { name: "看校园团 ›", exact: true }).click();
        assert.ok(await p.getByRole("button", { name: "更多筛选", exact: true }).isVisible());
        assert.match(await p.getByRole("button", { name: "高校", exact: true }).getAttribute("class"), /\bon\b/);
        await p.screenshot({ path: path.join(output, "home-filters.png"), fullPage: true });
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
    // These are rendering checks; transactional flows are covered by API E2E and tests above.
    const mobile = ["/m", "/m/activities", "/m/official", "/m/student", "/m/group", "/m/leader", "/m/photo-apply", "/m/route-apply", "/m/feedback", "/m/lottery", "/m/after/1", "/m/route/1", "/m/schedule/1", "/m/enroll/1", "/m/open/0", "/m/publish", "/m/chain", "/m/mine", "/m/settings", "/m/settings/font", "/m/settings/night", "/m/settings/lang", "/m/profile", "/m/wallet", "/m/signin", "/m/wallet/cards", "/m/wallet/pin", "/m/login", "/m/member", "/m/orders", "/m/favorites", "/m/notices", "/m/views", "/m/companions", "/m/follows", "/m/stats/1", "/m/guides", "/m/guide/1", "/m/user/1"];
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
