const assert = require("node:assert/strict");
const path = require("node:path");

module.exports = async function tripRefreshCases({ test, pageFor, goto, db, seed, output, origin, userToken }) {
  const headers = { authorization: `Bearer ${userToken}`, "content-type": "application/json" };
  async function navigate(p, target) {
    const expected = new URL(origin + target);
    await p.evaluate(url => document.querySelector("#app").__vue_app__.config.globalProperties.$router.push(url), target);
    await p.waitForURL(url => url.pathname + url.search === expected.pathname + expected.search);
  }
  async function waitForUnpaidCount(p, count) {
    await p.waitForFunction(expected => {
      const button = [...document.querySelectorAll(".account-shortcuts button")].find(el => el.textContent.includes("待付款"));
      return Boolean(button) && Number(button.querySelector("em")?.textContent || 0) === expected;
    }, count);
  }

  await test("outdoor enrollment refreshes previously visited journey and account pages after reaching payment", async () => {
    const title = "户外报名返回页面刷新验收";
    const bus = db.prepare("SELECT id FROM bus_types ORDER BY id LIMIT 1").get();
    const user = db.prepare("SELECT nickname,phone,id_card FROM users WHERE id=?").get(seed.userId);
    const response = await fetch(origin + "/api/trips", {
      method: "POST", headers,
      body: JSON.stringify({ channel: "trip", title, startDate: "2099-11-01", meetupTime: "07:30", meetupPoint: "北土城地铁站", busTypeId: bus.id, minGroupSize: 1, originPrice: 60, offerType: "full" }),
    });
    const published = await response.json();
    assert.equal(response.status, 200, published.message);
    const trip = published.data;
    db.prepare("UPDATE schedules SET review_status='approved' WHERE id=?").run(trip.id);
    const routeId = trip.routeId || db.prepare("SELECT route_id FROM schedules WHERE id=?").get(trip.id).route_id;
    db.prepare("UPDATE routes SET status='on',review_status='approved' WHERE id=?").run(routeId);

    const p = await pageFor();
    try {
      await goto(p, "/m/orders");
      await p.getByTestId("order-tab-all").waitFor();
      assert.equal(await p.getByTestId("order-tab-all").getAttribute("aria-selected"), "true");
      const session = await p.evaluate(() => window.__tripRefreshSession = String(Math.random()));
      await p.getByTestId("order-tab-ended").click();
      await p.locator('.mp-tab a[href="/m/mine"]').click();
      await p.locator(".account-orders").waitFor();
      const wallet = await (await fetch(origin + "/api/me/wallet", { headers })).json();
      const before = Number(wallet.data.unpaidCount || 0);
      await waitForUnpaidCount(p, before);

      await navigate(p, "/m/enroll/" + trip.id);
      const submit = p.getByRole("button", { name: "加入报名（暂不付款）", exact: true });
      await submit.waitFor();
      await p.getByPlaceholder("与身份证一致", { exact: true }).fill(user.nickname);
      await p.getByPlaceholder("接收集合通知", { exact: true }).fill(user.phone);
      await p.getByPlaceholder("18位身份证号，末位数字或X", { exact: true }).fill(user.id_card);
      await p.getByPlaceholder("家人或同伴姓名", { exact: true }).fill("测试紧急联系人");
      await p.getByPlaceholder("不能与出行人同一号码", { exact: true }).fill("13700000002");
      await p.getByRole("checkbox", { name: /本人身体健康/ }).check();
      await p.getByRole("checkbox", { name: /已阅读风险告知与退改说明/ }).check();
      const enrolled = p.waitForResponse(res => new URL(res.url()).pathname === "/api/enroll" && res.request().method() === "POST");
      await submit.click();
      const enrolledResponse = await enrolled;
      const result = await enrolledResponse.json();
      assert.equal(enrolledResponse.status(), 200, result.message);
      assert.equal(result.data.status, "joined");
      assert.equal(result.data.payStatus, "unpaid");
      await p.waitForURL(url => url.pathname === "/m/pay/" + result.data.payShareToken);
      await p.locator(".pay-trip h1").filter({ hasText: title }).waitFor();
      assert.match(await p.locator(".pay-summary").innerText(), /还需支付/);

      await navigate(p, "/m/orders");
      const order = p.getByTestId("order-card").filter({ hasText: title });
      await order.waitFor();
      assert.equal(await p.getByTestId("order-tab-all").getAttribute("aria-selected"), "true");
      assert.match(await order.innerText(), /待付款/);
      assert.equal(await order.getByRole("button", { name: "去支付", exact: true }).count(), 1);
      await p.screenshot({ path: path.join(output, "journey-after-outdoor-enrollment.png"), fullPage: true });
      await p.locator('.mp-tab a[href="/m/mine"]').click();
      await waitForUnpaidCount(p, before + 1);
      assert.equal(await p.evaluate(() => window.__tripRefreshSession), session, "all return navigation must stay in the same SPA session");
      await p.screenshot({ path: path.join(output, "mine-after-outdoor-enrollment.png"), fullPage: true });
      await p.locator(".account-shortcuts button").filter({ hasText: "待付款" }).click();
      await p.getByTestId("order-card").filter({ hasText: title }).waitFor();
      assert.equal(await p.getByTestId("order-tab-unpaid").getAttribute("aria-selected"), "true");
      const saved = db.prepare("SELECT status,pay_status,schedule_id FROM enrollments WHERE id=?").get(result.data.enrollmentId);
      assert.equal(saved.schedule_id, trip.id);
      assert.equal(saved.status, "joined");
      assert.equal(saved.pay_status, "unpaid");
    } finally { await p.close(); }
  });
};
