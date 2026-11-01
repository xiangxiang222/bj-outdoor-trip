const assert = require("node:assert/strict");
const path = require("node:path");

module.exports = async function journeyCases({ test, pageFor, goto, db, seed, output, origin, userToken }) {
  const base = {
    id: 9201, schedule_id: 9201, route_id: 1, title: "周末山野同行", status: "joined",
    schedule_status: "confirmed", channel: "trip", kind: "official", pay_status: "paid",
    payAmount: 30, pay_amount: 30, paidAmount: 30, remainAmount: 0,
    start_date: "2099-11-01", end_date: "2099-11-01", meetup_time: "19:30",
    meetup_point: "北土城地铁站", traveler_name: "林北野", traveler_phone: "13800138000",
    created_at: "2026-10-31 10:39:00", canCancel: false, canPay: false, canReview: false,
  };
  const rows = [base,
    { ...base, id: 9202, title: "尚待支付的山野团", pay_status: "unpaid", paidAmount: 10, remainAmount: 20, canPay: true, canCancel: true },
    { ...base, id: 9203, title: "已结束的新手掼蛋", category: "掼蛋", channel: "activity", kind: "activity", start_date: "2020-11-01", end_date: "2020-11-01", schedule_status: "finished", completed: true, created_at: "2020-10-31 10:39:00" },
  ];
  const respond = (route, data) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, data }) });

  await test("journey summary highlights the active filter and sheet choices survive closing", async () => {
    const p = await pageFor();
    try {
      await p.route("**/api/orders", route => respond(route, rows));
      await goto(p, "/m/orders");
      await p.locator(".journey-summary button").filter({ hasText: "待付款" }).click();
      assert.equal(await p.locator(".journey-summary button.on").getAttribute("aria-pressed"), "true");
      assert.match(await p.locator(".journey-summary button.on").innerText(), /待付款/);
      assert.equal(await p.getByTestId("order-card").count(), 1);
      await p.screenshot({ path: path.join(output, "journey-unpaid-selected.png"), fullPage: true });
      await p.locator(".od-filter").click();
      const dialog = p.getByRole("dialog");
      await dialog.getByRole("button", { name: "已结束", exact: true }).click();
      await dialog.getByRole("button", { name: "关闭筛选", exact: true }).click();
      assert.match(await p.getByTestId("order-card").innerText(), /已结束的新手掼蛋/);
      assert.match(await p.getByTestId("order-card").locator(".od-ph svg path").getAttribute("d"), /^M16 10 9 9/, "card activities use their own card icon instead of the outdoor mountain icon");
      assert.equal(await p.getByRole("button", { name: /再次报名|查看其他团期/ }).count(), 0);
      await p.locator(".od-filter").click();
      assert.equal(await dialog.getByRole("button", { name: "已结束", exact: true }).getAttribute("aria-pressed"), "true");
      await dialog.getByRole("button", { name: "重置", exact: true }).click();
      await dialog.locator('input[aria-label="起始时间"]').fill("2026-10-01");
      await dialog.locator('input[aria-label="起始时间"]').blur();
      await dialog.getByRole("button", { name: "关闭筛选", exact: true }).click();
      assert.equal(await p.getByTestId("order-card").count(), 2);
      assert.match(await p.locator(".journey-chips").innerText(), /2026-10-01/);
      await p.locator(".od-filter").click();
      assert.equal(await dialog.locator('input[aria-label="起始时间"]').inputValue(), "2026-10-01");
      await dialog.getByRole("button", { name: "关闭筛选", exact: true }).click();
      await p.screenshot({ path: path.join(output, "journey-applied-filters.png"), fullPage: true });
    } finally { await p.close(); }
  });

  await test("order layouts cover payment, upcoming and terminal states on narrow and large-text screens", async () => {
    const variants = [
      ["unpaid", { ...rows[1] }],
      ["depart", { ...base }],
      ["waitlist", { ...base, status: "waitlist" }],
      ["cancelled", { ...base, status: "cancelled" }],
      ["refund", { ...base, status: "cancelled", pay_status: "refunded" }],
      ["done", { ...rows[2] }],
      ["review", { ...rows[2], canReview: true }],
    ];
    for (const [width, size, night] of [[320, 4, "day"], [390, 1, "day"], [390, 1, "dark"]]) {
      const p = await pageFor("user", width, { size, night });
      try {
        let current;
        await p.route("**/api/orders/*", route => respond(route, current));
        for (const [name, order] of variants) {
          current = order;
          await goto(p, "/m/orders/" + order.id);
          await p.locator(".ed-status.state-" + name).waitFor();
          assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `order overflow: ${name}/${width}/${size}/${night}`);
          assert.equal(await p.getByRole("button", { name: "再次报名", exact: true }).count(), 0);
          if (name === "unpaid") {
            assert.match(await p.locator(".ed-total").innerText(), /剩余待付\s*¥20/);
            assert.equal(await p.getByRole("button", { name: "去支付", exact: true }).count(), 1);
          }
          if (name === "done") assert.equal(await p.locator(".ed-dock").count(), 0);
          if (name === "review") {
            await p.getByRole("button", { name: "去评价", exact: true }).click();
            assert.equal(await p.locator(".ed-review").count(), 1);
            assert.equal(await p.locator(".ed-dock").count(), 0, "an open review must not leave an empty fixed footer");
          }
          if (["unpaid", "depart", "done"].includes(name)) await p.screenshot({ path: path.join(output, `order-${name}-${width}-${night}.png`), fullPage: true });
        }
      } finally { await p.close(); }
    }
  });

  await test("real order ledger keeps partial fees, activity identity and reusable travel dates distinct", async () => {
    const tripSchedule = Number(db.prepare("INSERT INTO schedules (route_id,start_date,end_date,organizer_type,organizer_id,organizer_name,bus_type_id,min_group_size,max_seats,meetup_point,meetup_time,status,review_status,channel) SELECT route_id,'2099-11-01','2099-11-01',organizer_type,organizer_id,organizer_name,bus_type_id,min_group_size,max_seats,meetup_point,meetup_time,'confirmed','approved','trip' FROM schedules WHERE id=?").run(seed.individualScheduleId).lastInsertRowid);
    const orderId = Number(db.prepare("INSERT INTO enrollments (schedule_id,user_id,traveler_name,traveler_phone,status,pay_status,pay_amount,pay_share_token,seat_no,campus_snapshot_json) VALUES (?,?,?,?,?,?,?,?,?,?)").run(tripSchedule, seed.userId, "林北野", "13800138000", "joined", "unpaid", 3, "browser-journey-partial", "2D", JSON.stringify({ studentPrice: false })).lastInsertRowid);
    db.prepare("INSERT INTO payments (enrollment_id,user_id,schedule_id,amount,channel,status,trade_no,scene) VALUES (?,?,?,?,?,?,?,?)").run(orderId, seed.companyUserId, tripSchedule, 1, "wallet", "success", "browser-journey-partial-payment", "enrollment");
    const headers = { authorization: `Bearer ${userToken}`, "content-type": "application/json" };
    const p = await pageFor();
    try {
      const order = await (await fetch(origin + "/api/orders/" + orderId, { headers })).json();
      assert.equal(order.data.payAmount, 3);
      assert.equal(order.data.paidAmount, 1);
      assert.equal(order.data.remainAmount, 2);
      await goto(p, "/m/orders/" + orderId);
      await p.locator(".ed-status.state-unpaid").waitFor();
      assert.match(await p.locator(".ed-total").innerText(), /剩余待付\s*¥2/);
      assert.match(await p.locator(".ed-arrangement").innerText(), /座位\s*2D/);
      await p.screenshot({ path: path.join(output, "order-real-partial-1-of-3.png"), fullPage: true });

      db.prepare("UPDATE enrollments SET pay_status='paid' WHERE id=?").run(orderId);
      db.prepare("UPDATE schedules SET status='finished',start_date='2020-11-01',end_date='2020-11-01',completed_at='2020-11-01 20:00:00' WHERE id=?").run(tripSchedule);
      await goto(p, "/m/orders/" + orderId);
      await p.getByRole("button", { name: "查看其他团期", exact: true }).waitFor();
      assert.equal(await p.getByRole("button", { name: "再次报名", exact: true }).count(), 0);
      await p.screenshot({ path: path.join(output, "order-travel-other-dates.png"), fullPage: true });
      await p.getByRole("button", { name: "查看其他团期", exact: true }).click();
      const routeId = db.prepare("SELECT route_id FROM schedules WHERE id=?").get(tripSchedule).route_id;
      await p.waitForURL(url => url.pathname === "/m/route/" + routeId);

      const published = await fetch(origin + "/api/trips", { method: "POST", headers, body: JSON.stringify({ channel: "activity", activityKind: "掼蛋", title: "真实订单：结束的掼蛋局", startDate: "2099-11-02", meetupTime: "19:30", meetupPoint: "社区咖啡馆", minGroupSize: 1, maxSeats: 12, originPrice: 0 }) });
      const result = await published.json();
      assert.equal(published.status, 200, result.message);
      const activity = result.data;
      const activityOrderId = Number(db.prepare("INSERT INTO enrollments (schedule_id,user_id,traveler_name,status,pay_status,pay_amount,seat_no) VALUES (?,?,?,?,?,?,?)").run(activity.id, seed.userId, "林北野", "joined", "paid", 0, "1A").lastInsertRowid);
      db.prepare("UPDATE schedules SET status='finished',review_status='approved',start_date='2020-11-01',end_date='2020-11-01',completed_at='2020-11-01 20:00:00' WHERE id=?").run(activity.id);
      await goto(p, "/m/orders/" + activityOrderId);
      await p.locator(".ed-eyebrow").filter({ hasText: "同城活动报名" }).waitFor();
      assert.match(await p.locator(".ed-arrangement").innerText(), /活动时间.*活动地点/s);
      assert.doesNotMatch(await p.locator(".ed-arrangement").innerText(), /座位|1A/);
      assert.equal(await p.getByRole("button", { name: /再次报名|查看其他团期/ }).count(), 0);
      assert.match(await p.locator(".ed-total").innerText(), /免费/);
      await p.getByRole("button", { name: "本场活动", exact: true }).click();
      await p.waitForURL(url => url.pathname === "/m/schedule/" + activity.id);
      await p.locator(".city-status strong").filter({ hasText: "活动已结束" }).waitFor();
      assert.equal(await p.getByRole("button", { name: /报名本局|选择座位|再次报名/ }).count(), 0);
      assert.equal(await p.locator(".seat-grid,.seat-map").count(), 0);
      assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await p.screenshot({ path: path.join(output, "activity-ended-detail.png"), fullPage: true });
      const synthetic = await fetch(origin + "/api/routes/" + activity.routeId, { headers });
      assert.equal(synthetic.status, 404, "one-off activities have no reusable route page");
    } finally { await p.close(); }
  });

  await test("message filters and mark-all-read update real server counts and lists", async () => {
    db.prepare("DELETE FROM user_notices WHERE user_id=?").run(seed.userId);
    const insert = db.prepare("INSERT INTO user_notices (user_id,kind,title,body,read_at) VALUES (?,?,?,?,?)");
    insert.run(seed.userId, "system", "新的活动进展", "请查看本场活动", null);
    insert.run(seed.userId, "system", "已经查看的进展", "历史记录", "2026-10-31 10:00:00");
    for (let i = 1; i <= 52; i++) insert.run(seed.userId, "system", "未读进展 " + i, "分页回归记录 " + i, null);
    const p = await pageFor();
    try {
      await goto(p, "/m/notices");
      await p.locator(".notice-card").first().waitFor();
      assert.equal(await p.locator(".notice-card").count(), 50);
      assert.match(await p.locator(".notice-tabs").innerText(), /全部\s*54/);
      await p.getByRole("button", { name: "加载更多消息", exact: true }).click();
      await p.waitForFunction(() => document.querySelectorAll(".notice-card").length === 54);
      assert.equal(await p.locator(".notice-card").evaluateAll(cards => new Set(cards.map(card => card.textContent)).size), 54);
      await p.getByText("已显示全部消息", { exact: true }).waitFor();
      await p.locator(".notice-tabs button").filter({ hasText: /^未读/ }).click();
      await p.waitForFunction(() => document.querySelectorAll(".notice-card").length === 50);
      assert.equal(await p.locator(".notice-card.is-unread").count(), 50);
      await p.locator(".notice-card").first().click();
      await p.waitForFunction(() => document.querySelectorAll(".notice-card").length === 49);
      assert.match(await p.locator(".notice-tabs").innerText(), /未读\s*52/);
      await p.screenshot({ path: path.join(output, "notices-unread-filter.png"), fullPage: false });
      await p.getByRole("button", { name: "全部标为已读", exact: true }).click();
      await p.getByText("暂时没有未读消息", { exact: true }).waitFor();
      assert.equal(await p.getByRole("button", { name: "全部标为已读", exact: true }).isDisabled(), true);
      await p.locator(".notice-tabs button").filter({ hasText: /^已读/ }).click();
      await p.waitForFunction(() => document.querySelectorAll(".notice-card").length === 50);
      await p.getByRole("button", { name: "加载更多消息", exact: true }).click();
      await p.waitForFunction(() => document.querySelectorAll(".notice-card").length === 54);
      assert.equal(await p.locator(".notice-card.is-unread").count(), 0);
      assert.equal(db.prepare("SELECT COUNT(*) AS c FROM user_notices WHERE user_id=? AND read_at IS NULL").get(seed.userId).c, 0);
      await p.screenshot({ path: path.join(output, "notices-read-filter.png"), fullPage: false });
    } finally { await p.close(); }
  });
};
