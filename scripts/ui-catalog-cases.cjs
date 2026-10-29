const assert = require("node:assert/strict");
const path = require("node:path");

// Extends the UI suite's isolated database. All writes stay in its temporary directory.
module.exports = async function catalogCases({ test, pageFor, goto, db, seed, output }) {
  const day = (offset) => new Date(Date.now() + (offset * 24 + 8) * 3600000).toISOString().slice(0, 10);
  const examples = [
    { title: "山脊上的风 · 长城轻徒步", region: "北京怀柔", days: 1, photo: "mutianyu_06.jpg", price: 199 },
    { title: "草原来信 · 两日星空之旅", region: "河北张家口", days: 2, photo: "zhangbei_06.jpg", price: 399 },
    { title: "山水之间 · 周末自在行", region: "北京房山", days: 1, photo: "shidu_02.jpg", price: 0 },
    { title: "去海边，等一场日出", region: "河北秦皇岛", days: 3, photo: "beidaihe_06.jpg", price: null },
  ];
  for (const [index, route] of examples.entries()) {
    const cover = "/static/photos/" + route.photo;
    route.id = Number(db.prepare("INSERT INTO routes (code,title,subtitle,days,difficulty,category,region,season,tags_json,cover,gallery_json,min_group_size,description,highlights_json,itinerary_json,meetup_json,status,review_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(
      "UI-CATALOG-" + index, route.title, "把日常留在身后，和同频的人一起出发。", route.days, "休闲", "山水", route.region, "四季", JSON.stringify(["徒步", "摄影"]), cover, JSON.stringify([cover]), 1, "浏览器隔离测试线路", "[]", "[]", "[]", "on", "approved"
    ).lastInsertRowid);
    if (route.price != null) db.prepare("INSERT INTO route_price_tiers (route_id,min_people,price,member_price) VALUES (?,?,?,?)").run(route.id, 1, route.price, Math.round(route.price * .95));
  }
  function order(route, patch = {}) {
    const values = { start: day(-3), end: day(-2), status: "confirmed", enrollment: "joined", pay: "paid", min: 1, completed: "", ...patch };
    const sid = Number(db.prepare("INSERT INTO schedules (route_id,start_date,end_date,organizer_type,organizer_id,organizer_name,bus_type_id,min_group_size,max_seats,meetup_point,meetup_time,status,review_status,channel,offer_type,city) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(route.id, values.start, values.end, "individual", seed.userId, "林北野", "coaster10", values.min, 10, "东直门地铁站 C 口", "07:30", values.status, "approved", "trip", "full", "怀柔").lastInsertRowid);
    return Number(db.prepare("INSERT INTO enrollments (schedule_id,user_id,traveler_name,traveler_phone,status,pay_status,pay_amount,completed_at) VALUES (?,?,?,?,?,?,?,?)").run(sid, seed.userId, "林北野", "13800138000", values.enrollment, values.pay, route.price || 0, values.completed).lastInsertRowid);
  }
  const endedId = order(examples[0], { completed: day(-2) + " 18:00:00" });
  const multiId = order(examples[1], { start: day(-1), end: day(1) });
  const cancelledId = order(examples[2], { status: "cancelled", enrollment: "cancelled", pay: "refunded" });
  const unformedId = order(examples[3], { status: "recruiting", min: 8 });
  const endedId2 = order(examples[2], { start: day(-8), end: day(-7) });

  await test("route modes keep filters, use two columns, persist preference and open the correct route", async () => {
    const p = await pageFor();
    try {
      await goto(p, "/m?view=routes");
      const catalog = p.getByTestId("route-catalog");
      await catalog.getByTestId("route-card").first().waitFor();
      await p.getByTestId("route-mode-grid").click();
      assert.equal(await catalog.getAttribute("data-mode"), "grid");
      const cards = catalog.getByTestId("route-card");
      const a = await cards.nth(0).boundingBox(), b = await cards.nth(1).boundingBox();
      assert.ok(Math.abs(a.y - b.y) < 2 && b.x > a.x + a.width - 1, "grid renders two cards in a row");
      await catalog.getByRole("button", { name: "2日", exact: true }).click();
      await p.waitForFunction(() => document.querySelectorAll('[data-testid="route-card"]').length === 1);
      assert.match(await cards.innerText(), /草原来信/);
      await p.getByTestId("route-mode-list").click();
      assert.equal(await catalog.getByRole("button", { name: "2日", exact: true }).getAttribute("aria-pressed"), "true");
      assert.equal(await p.evaluate(() => localStorage.getItem("bj_route_view")), "list");
      await p.reload({ waitUntil: "domcontentloaded" });
      await cards.first().waitFor();
      assert.equal(await catalog.getAttribute("data-mode"), "list");
      const target = catalog.getByTestId("route-card").filter({ hasText: examples[1].title });
      await target.click();
      await p.waitForURL((url) => url.pathname === "/m/route/" + examples[1].id);
    } finally { await p.close(); }
  });

  await test("route failure offers retry and a slow older filter response cannot replace the latest results", async () => {
    const p = await pageFor();
    let delayResolve;
    let pendingOld;
    let signalOldReady;
    const oldReady = new Promise((resolve) => { signalOldReady = resolve; });
    try {
      await p.route("**/api/routes?**", async (route) => {
        const url = new URL(route.request().url());
        if (url.searchParams.get("days") === "2") {
          const response = await route.fetch();
          pendingOld = new Promise((resolve) => {
            let released = false;
            delayResolve = async () => { if (!released) { released = true; await route.fulfill({ response }); resolve(); } };
          });
          signalOldReady();
          await pendingOld;
        } else await route.continue();
      });
      await goto(p, "/m?view=routes");
      const catalog = p.getByTestId("route-catalog");
      await catalog.getByTestId("route-card").first().waitFor();
      await catalog.getByRole("button", { name: "2日", exact: true }).click();
      await Promise.race([oldReady, new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error("Older route request was not intercepted")), 5000); timer.unref(); })]);
      await catalog.getByRole("button", { name: "3日", exact: true }).click();
      await p.waitForFunction(() => document.querySelectorAll('[data-testid="route-card"]').length === 1 && document.querySelector('[data-testid="route-card"]').textContent.includes('去海边'));
      if (delayResolve) { await delayResolve(); await pendingOld; }
      assert.match(await catalog.getByTestId("route-card").innerText(), /去海边/);
      await catalog.getByText("价格待确认", { exact: true }).waitFor();
      await p.unroute("**/api/routes?**");
      await p.route("**/api/routes?**", (route) => route.abort("failed"));
      await catalog.getByRole("button", { name: "1日", exact: true }).click();
      await catalog.getByText("线路暂时加载失败", { exact: true }).waitFor();
      assert.match(await catalog.getByTestId("route-card").innerText(), /去海边/);
      await p.unroute("**/api/routes?**");
      await catalog.getByRole("button", { name: "重新加载", exact: true }).click();
      await catalog.getByText("线路暂时加载失败", { exact: true }).waitFor({ state: "hidden" });
      await p.waitForFunction(() => document.querySelectorAll('[data-testid="route-card"]').length >= 2);
      assert.ok(await catalog.getByTestId("route-card").count() >= 2);
    } finally { if (delayResolve) await delayResolve().catch(() => {}); await p.close(); }
  });

  await test("ended journeys exclude cancellations and unformed trips while a multi-day journey remains upcoming", async () => {
    const p = await pageFor();
    try {
      await goto(p, "/m/orders?tab=ended");
      const cards = p.locator(".od-card");
      await cards.first().waitFor();
      assert.equal(await cards.count(), 2);
      assert.match(await cards.first().innerText(), /山脊上的风/);
      assert.equal(await p.getByTestId("order-tab-ended").getAttribute("aria-selected"), "true");
      await p.getByTestId("order-tab-depart").click();
      await p.waitForFunction(() => document.querySelectorAll('.od-card').length === 1);
      assert.match(await cards.innerText(), /草原来信/);
      await p.getByTestId("order-tab-ended").click();
      await cards.filter({ hasText: examples[0].title }).locator(".journey-card-main").click();
      await p.waitForURL((url) => url.pathname === "/m/orders/" + endedId);
      await p.getByRole("button", { name: "去评价", exact: true }).waitFor();
      for (const alias of ["past", "completed", "finished"]) {
        await goto(p, "/m/orders?tab=" + alias);
        await cards.first().waitFor();
        assert.equal(await cards.count(), 2);
      }
      assert.ok(endedId2 && multiId && cancelledId && unformedId);
      await p.screenshot({ path: path.join(output, "journeys-ended.png"), fullPage: true });
    } finally { await p.close(); }
  });

  await test("journey date range rejects reversed bounds and network errors recover without a false empty state", async () => {
    const p = await pageFor();
    try {
      await p.route("**/api/orders", (route) => route.abort("failed"));
      await goto(p, "/m/orders?tab=ended");
      await p.getByRole("button", { name: "重新加载", exact: true }).waitFor();
      assert.equal(await p.getByText("还没有报名", { exact: true }).count(), 0);
      await p.unroute("**/api/orders");
      await p.getByRole("button", { name: "重新加载", exact: true }).click();
      await p.locator(".od-card").first().waitFor();
      await p.getByRole("button", { name: /筛选/ }).first().click();
      const dialog = p.getByRole("dialog");
      await dialog.getByLabel("起始时间", { exact: true }).fill(day(1));
      await dialog.getByLabel("终止时间", { exact: true }).fill(day(-1));
      await dialog.getByRole("button", { name: "确定", exact: true }).click();
      assert.ok(await dialog.getByRole("alert").isVisible());
      await p.screenshot({ path: path.join(output, "journeys-filters.png"), fullPage: true });
      await dialog.getByRole("button", { name: "关闭筛选", exact: true }).click();
      assert.equal(await p.locator(".od-card").count(), 2);
    } finally { await p.close(); }
  });

  await test("route modes and journey cards fit narrow screens, large type, desktop, dark and text appearances", async () => {
    for (const [width, night, size, lang, textMode] of [[390,"day",1,"zh",false],[320,"day",4,"zh",false],[390,"dark",1,"zh",false],[1440,"day",1,"zh",false],[320,"day",1,"en",false],[390,"day",1,"zh",true]]) {
      const p = await pageFor("user", width, { night, size, lang, textMode });
      try {
        await goto(p, "/m?view=routes");
        await p.getByTestId("route-card").first().waitFor();
        for (const mode of ["poster","grid","list"]) {
          await p.getByTestId("route-mode-" + mode).click();
          await p.getByTestId("route-catalog").scrollIntoViewIfNeeded();
          assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `route overflow ${width}/${night}/${size}/${lang}/${mode}`);
          await p.waitForFunction(() => Array.from(document.querySelectorAll('.rc-photo img')).filter((img) => {
            const box = img.getBoundingClientRect();
            return box.width && box.height && box.top < innerHeight && box.bottom > 0;
          }).every((img) => img.complete));
          if (width === 390 && !textMode || mode === "grid") await p.screenshot({ path: path.join(output, `routes-${mode}-${width}-${night}-${size}-${lang}${textMode?'-text':''}.png`), fullPage: true });
        }
        await goto(p, "/m/orders?tab=all");
        await p.locator(".od-card").first().waitFor();
        assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `journey overflow ${width}/${night}/${size}/${lang}`);
        await p.screenshot({ path: path.join(output, `journeys-${width}-${night}-${size}-${lang}${textMode?'-text':''}.png`), fullPage: true });
        if (width === 390 && night === "day" && !textMode) await p.locator(".od-card").first().screenshot({ path:path.join(output,"journey-card.png") });
      } finally { await p.close(); }
    }
  });
};
