const assert = require("node:assert/strict");
const path = require("node:path");

module.exports = async function activityCancellationCases({ test, pageFor, goto, db, seed, output, origin, userToken }) {
  const headers = { authorization: `Bearer ${userToken}`, "content-type": "application/json" };
  async function post(url, data) {
    const response = await fetch(origin + "/api" + url, { method: "POST", headers, body: JSON.stringify(data) });
    const result = await response.json();
    assert.equal(response.status, 200, result.message);
    return result.data;
  }
  async function publish(title, reviewStatus = "approved", date = "2099-11-01", time = "19:30") {
    const activity = await post("/trips", { channel: "activity", activityKind: "掼蛋", title, startDate: date, meetupTime: time, meetupPoint: "社区咖啡馆", minGroupSize: 1, maxSeats: 12, originPrice: 0 });
    db.prepare("UPDATE schedules SET review_status=? WHERE id=?").run(reviewStatus, activity.id);
    if (reviewStatus === "approved") db.prepare("UPDATE routes SET status='on',review_status='approved' WHERE id=?").run(activity.routeId);
    return activity;
  }
  async function navigate(p, path) {
    const target = new URL(origin + path);
    await p.evaluate(url => document.querySelector("#app").__vue_app__.config.globalProperties.$router.push(url), path);
    await p.waitForURL(url => url.pathname + url.search === target.pathname + target.search);
  }

  await test("organizer can cancel pending and approved city activities without an uploaded group QR", async () => {
    const p = await pageFor();
    try {
      for (const review of ["pending", "approved"]) {
        const activity = await publish("取消入口验收：" + review, review);
        await goto(p, "/m/schedule/" + activity.id);
        await p.getByRole("button", { name: "取消活动", exact: true }).waitFor();
        assert.equal(await p.locator(".city-group-qr").count(), 0);
        assert.match(await p.locator(".city-group-empty").innerText(), /暂未提供群信息/);
        await p.getByRole("button", { name: "取消活动", exact: true }).click();
        const dialog = p.getByRole("dialog", { name: "取消本次活动", exact: true });
        await dialog.getByRole("button", { name: "确认取消活动", exact: true }).click();
        await dialog.getByRole("alert").getByText("请填写取消原因", { exact: true }).waitFor();
        await dialog.locator("#dissolve-reason").fill("时间安排变化，取消本次活动");
        await p.screenshot({ path: path.join(output, `activity-cancel-${review}.png`), fullPage: true });
        await dialog.getByRole("button", { name: "确认取消活动", exact: true }).click();
        await p.locator(".city-status strong").filter({ hasText: "活动已取消" }).waitFor();
        assert.equal(await p.getByRole("button", { name: "取消活动", exact: true }).count(), 0);
        assert.equal(db.prepare("SELECT status FROM schedules WHERE id=?").get(activity.id).status, "cancelled");
      }
    } finally { await p.close(); }
  });

  await test("an upcoming city activity can be cancelled from its order detail", async () => {
    const beijing = new Date(Date.now() + 8 * 3600000).toISOString();
    const date = beijing.slice(11, 16) < "23:59" ? beijing.slice(0, 10) : "2099-11-01";
    const activity = await publish("当天开场前取消报名", "approved", date, "23:59");
    const enrollment = await post("/enroll", { scheduleId: activity.id, travelerName: "林北野", travelerPhone: "13800138000" });
    const p = await pageFor();
    try {
      await goto(p, "/m/orders/" + enrollment.enrollmentId);
      await p.getByRole("button", { name: "取消报名", exact: true }).waitFor();
      p.once("dialog", dialog => dialog.accept());
      await p.getByRole("button", { name: "取消报名", exact: true }).click();
      await p.locator(".ed-status.state-cancelled").waitFor();
      assert.equal(await p.getByRole("button", { name: "取消报名", exact: true }).count(), 0);
      assert.equal(db.prepare("SELECT status FROM enrollments WHERE id=?").get(enrollment.enrollmentId).status, "cancelled");
      await p.screenshot({ path: path.join(output, "activity-order-cancelled.png"), fullPage: true });
    } finally { await p.close(); }
  });

  await test("enrollment refreshes previously visited journey and account pages during tab navigation", async () => {
    const activity = await publish("报名返回页面刷新验收");
    const p = await pageFor();
    try {
      await goto(p, "/m/orders");
      await p.getByTestId("order-tab-all").waitFor();
      assert.equal(await p.getByTestId("order-tab-all").getAttribute("aria-selected"), "true");
      await p.getByTestId("order-tab-ended").click();
      await p.locator('.mp-tab a[href="/m/mine"]').click();
      await p.locator(".account-orders").waitFor();
      const wallet = await (await fetch(origin + "/api/me/wallet", { headers })).json();
      const before = Number(wallet.data.departCount || 0);
      await p.waitForFunction(previous => {
        const button = [...document.querySelectorAll(".account-shortcuts button")].find(el => el.textContent.includes("待出行"));
        return Number(button?.querySelector("em")?.textContent || 0) === previous;
      }, before);
      await navigate(p, "/m/enroll/" + activity.id);
      await p.getByRole("button", { name: "报名本局", exact: true }).waitFor();
      const inputs = p.locator("input.input");
      await inputs.nth(0).fill("林北野");
      await inputs.nth(1).fill("13800138000");
      await p.getByRole("button", { name: "报名本局", exact: true }).click();
      await p.waitForURL(url => url.pathname === "/m/schedule/" + activity.id);
      await p.locator(".city-status strong").filter({ hasText: "已报名" }).waitFor();
      await navigate(p, "/m/orders");
      await p.getByTestId("order-card").filter({ hasText: "报名返回页面刷新验收" }).waitFor();
      assert.equal(await p.getByTestId("order-tab-all").getAttribute("aria-selected"), "true");
      await p.locator('.mp-tab a[href="/m/mine"]').click();
      await p.waitForFunction(previous => {
        const button = [...document.querySelectorAll(".account-shortcuts button")].find(el => el.textContent.includes("待出行"));
        return Number(button?.querySelector("em")?.textContent || 0) === previous + 1;
      }, before);
      await p.screenshot({ path: path.join(output, "mine-after-enrollment.png"), fullPage: true });
      await p.locator(".account-all").click();
      await p.getByTestId("order-card").filter({ hasText: "报名返回页面刷新验收" }).waitFor();
      assert.equal(await p.getByTestId("order-tab-all").getAttribute("aria-selected"), "true");
    } finally { await p.close(); }
  });
};
