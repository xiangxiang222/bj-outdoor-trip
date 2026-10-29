const assert = require("node:assert/strict");
const path = require("node:path");
const { weekendRange } = require("../miniprogram/utils/departure-dates");

// These fixtures and the app under test use ui-smoke's isolated temporary database.
module.exports = async function discoveryCases({ test, pageFor, goto, db, seed, output }) {
  const next = weekendRange("nextweekend");
  const fixtures = [
    ["山风来信 · 怀柔慢徒步", 79, "mutianyu_06.jpg"],
    ["长城脚下，留一个周末", 119, "mutianyu_06.jpg"],
    ["湖边留白 · 自在一日", 159, "shidu_02.jpg"],
    ["去山里，等一阵风", 189, "zhangbei_06.jpg"],
    ["一起走走 · 怀柔公益徒步", 0, "mutianyu_06.jpg"],
  ];
  const ids = [];
  for (const [index, [title, price, photo]] of fixtures.entries()) {
    const routeId = Number(db.prepare("INSERT INTO routes (code,title,subtitle,days,difficulty,category,region,cover,min_group_size,description,fee_include,fee_exclude,status,review_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run("UI-DISCOVERY-" + index, title, "和同频的人，把日常走成风景。", 1, "休闲", "徒步", "北京怀柔", "/static/photos/" + photo, 1, "浏览器测试专用线路", "往返交通、领队服务", "午餐及个人消费", "on", "approved").lastInsertRowid);
    db.prepare("INSERT INTO route_price_tiers (route_id,min_people,price,member_price) VALUES (?,?,?,?)").run(routeId, 1, price, price);
    ids.push(Number(db.prepare("INSERT INTO schedules (route_id,start_date,end_date,organizer_type,organizer_id,organizer_name,bus_type_id,min_group_size,max_seats,meetup_point,meetup_time,status,review_status,channel,offer_type,city) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .run(routeId, next.start, next.start, "official", seed.userId, "同行者众", "coaster30", 1, 18, "东直门地铁站 C 口", "07:30", "recruiting", "approved", "trip", price === 0 ? "free" : "full", "怀柔").lastInsertRowid));
  }
  const endpoint = "**/api/discovery/search";
  async function search(p, message = "下周末去怀柔，团费200元以内，轻松一点") {
    await p.getByTestId("discovery-message").fill(message);
    const done = p.waitForResponse((r) => r.url().endsWith("/api/discovery/search") && r.request().method() === "POST");
    await p.getByTestId("discovery-submit").click();
    const response = await done;
    assert.equal(response.status(), 200);
    const body = await response.json();
    await p.getByTestId("discovery-results").waitFor();
    await p.waitForFunction(() => !document.querySelector('[data-testid="discovery-submit"]').disabled);
    return body.data;
  }

  await test("one-sentence discovery uses real matches, stable pagination, factual comparison and the existing detail", async () => {
    const p = await pageFor("guest");
    try {
      await goto(p, "/m");
      await p.getByTestId("home-discovery-entry").click();
      await p.waitForURL((url) => url.pathname === "/m/discover");
      const body = await search(p);
      assert.equal(body.mode, "rules", "offline rules must not pretend a model was called");
      assert.equal(body.filters.time, "nextweekend");
      assert.equal(body.filters.budgetMax, 200);
      assert.equal(body.filters.destination, "怀柔");
      assert.equal(body.results.length, 3);
      assert.ok(body.total >= 5);
      assert.ok(body.results.every((row) => ids.includes(row.id) && row.startDate === next.start && row.price.amount <= 200));
      assert.equal(await p.getByTestId("discovery-card").count(), 3);
      await p.getByTestId("discovery-compare").click();
      const comparison = p.getByRole("region", { name: "真实方案对比" });
      await comparison.waitFor();
      assert.match(await comparison.innerText(), /午餐及个人消费/);
      assert.doesNotMatch(await comparison.innerText(), /步行距离/);
      await p.getByRole("button", { name: "关闭对比", exact: true }).click();
      const moreRequest = p.waitForRequest((r) => r.url().endsWith("/api/discovery/search") && r.postDataJSON()?.offset > 0);
      await p.getByTestId("discovery-more").click();
      const payload = (await moreRequest).postDataJSON();
      assert.deepEqual(payload.filters, body.filters);
      await p.waitForFunction(() => document.querySelectorAll('[data-testid="discovery-card"]').length >= 5);
      const firstId = body.results[0].id;
      await p.getByTestId("discovery-card").first().locator("a").first().click();
      await p.waitForURL((url) => url.pathname === "/m/schedule/" + firstId);
    } finally { await p.close(); }
  });

  await test("discovery edits preserve an explicit zero budget and empty results never widen constraints", async () => {
    const p = await pageFor("guest");
    try {
      await goto(p, "/m/discover");
      await search(p);
      await p.getByTestId("discovery-edit").click();
      await p.locator("#discovery-budget").fill("0");
      const done = p.waitForResponse((r) => r.url().endsWith("/api/discovery/search"));
      await p.getByTestId("discovery-apply-filters").click();
      const data = (await (await done).json()).data;
      assert.equal(data.filters.budgetMax, 0);
      assert.equal(data.total, 1);
      assert.equal(data.results[0].price.amount, 0);
      await p.waitForFunction(() => document.querySelectorAll('[data-testid="discovery-card"]').length === 1);
      await p.getByTestId("discovery-edit").click();
      await p.locator("#discovery-destination").fill("不存在的目的地");
      const empty = p.waitForResponse((r) => r.url().endsWith("/api/discovery/search"));
      await p.getByTestId("discovery-apply-filters").click();
      const emptyData = (await (await empty).json()).data;
      assert.equal(emptyData.total, 0);
      assert.equal(emptyData.filters.budgetMax, 0);
      await p.locator(".discovery-empty").waitFor();
      assert.equal(await p.getByTestId("discovery-card").count(), 0);
      assert.match(await p.locator(".discovery-conditions").innerText(), /不存在的目的地/);
    } finally { await p.close(); }
  });

  await test("discovery failure keeps the previous results and input, then retries the same request", async () => {
    const p = await pageFor("guest");
    let failed;
    let retried;
    try {
      await goto(p, "/m/discover");
      await search(p);
      const previous = await p.getByTestId("discovery-card").first().innerText();
      await p.route(endpoint, (route) => { failed = route.request().postDataJSON(); return route.fulfill({ status:503, contentType:"application/json", body:JSON.stringify({ ok:false, message:"找团暂时不可用，请稍后重试" }) }); });
      await p.getByTestId("discovery-message").fill("本周末去密云");
      await p.getByTestId("discovery-submit").click();
      await p.getByTestId("discovery-retry").waitFor();
      assert.equal(await p.getByTestId("discovery-card").first().innerText(), previous);
      assert.equal(await p.getByTestId("discovery-message").inputValue(), "本周末去密云");
      await p.unroute(endpoint);
      await p.route(endpoint, (route) => { retried = route.request().postDataJSON(); return route.continue(); });
      const retryDone = p.waitForResponse((r) => r.url().endsWith("/api/discovery/search"));
      await p.getByTestId("discovery-retry").click();
      await retryDone;
      await p.getByTestId("discovery-retry").waitFor({ state:"hidden" });
      assert.deepEqual(retried, failed);
    } finally { await p.close(); }
  });

  await test("discovery asks about unsupported hard constraints instead of claiming an all-inclusive or activity match", async () => {
    const p = await pageFor("guest");
    try {
      await goto(p, "/m/discover");
      const data = await search(p, "下周末两个人一共500元全包，还想去跑步");
      assert.equal(data.total, 0);
      assert.ok(data.question);
      await p.locator("#discovery-filter-form").waitFor();
      assert.equal(await p.getByTestId("discovery-card").count(), 0);
      assert.match(await p.locator(".discovery-question").innerText(), /预算|团费|活动|确认/);
    } finally { await p.close(); }
  });

  await test("discovery routes package-trip verification to the real participation rules", async () => {
    const p = await pageFor("guest");
    try {
      db.prepare("UPDATE schedules SET offer_type='combo',combo_rule_json=? WHERE id=?").run(JSON.stringify({ require:"group" }), ids[0]);
      await goto(p, "/m/discover");
      const data = await search(p);
      assert.equal(data.results.find((row) => row.id === ids[0]).participation.status, "verify");
      const trip = p.getByTestId("discovery-card").filter({ hasText:fixtures[0][0] });
      const link = trip.getByRole("link", { name:/核对参与条件/ });
      assert.equal(await link.getAttribute("href"), "/m/schedule/" + ids[0]);
      assert.equal(await trip.locator('a[href^="/m/student"]').count(), 0);
      await link.click();
      await p.waitForURL((url) => url.pathname === "/m/schedule/" + ids[0]);
    } finally {
      db.prepare("UPDATE schedules SET offer_type='full',combo_rule_json=NULL WHERE id=?").run(ids[0]);
      await p.close();
    }
  });

  await test("discovery fits narrow, large-type, dark, English and desktop screens", async () => {
    for (const [width, night, size, lang] of [[390,"day",1,"zh"],[320,"day",4,"zh"],[390,"dark",1,"zh"],[320,"day",1,"en"],[1440,"day",1,"zh"]]) {
      const p = await pageFor("guest", width, { night, size, lang });
      try {
        await goto(p, "/m/discover");
        const introFile = path.join(output, `discovery-intro-${width}-${night}-${size}-${lang}.png`);
        await p.screenshot({path:introFile,fullPage:true});
        await search(p);
        if (width === 390 && night === "day") await p.getByTestId("discovery-card").first().screenshot({ path:path.join(output,"discovery-trip-card.png") });
        assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `discovery results overflow ${width}/${night}/${size}/${lang}`);
        await p.getByTestId("discovery-edit").click();
        assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `discovery filter overflow ${width}/${night}/${size}/${lang}`);
        await p.getByTestId("discovery-edit").click();
        await p.getByTestId("discovery-compare").click();
        await p.locator(".discovery-comparison").evaluate((element) => element.scrollIntoView({ behavior:"instant",block:"start" }));
        assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `comparison overflows page ${width}/${night}/${size}/${lang}`);
        const file = path.join(output, `discovery-results-${width}-${night}-${size}-${lang}.png`);
        await p.screenshot({path:file,fullPage:true});
      } finally { await p.close(); }
    }
  });
};
