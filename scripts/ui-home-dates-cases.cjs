const assert = require("node:assert/strict");
const path = require("node:path");
const { chinaDay, weekendRange } = require("../miniprogram/utils/departure-dates");

module.exports = async function homeDateCases({ test, pageFor, goto, output }) {
  const today = chinaDay();
  const weekend = weekendRange("weekend"), next = weekendRange("nextweekend");
  const later = (day, n) => new Date(Date.parse(day + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
  const custom = Array.from({ length: 12 }, (_, n) => later(today, n + 1)).find((day) => {
    const d = new Date(day + "T00:00:00Z").getUTCDay();
    return d > 0 && d < 6;
  });
  const rows = [
    [9101, weekend.start, "山风来信 · 周末轻徒步", "怀柔"],
    [9102, weekend.end, "在水长城，慢下来", "怀柔"],
    [9103, next.start, "下一站，去看草原", "怀柔"],
    [9104, next.end, "湖边留白 · 自在一日", "密云"],
    [9105, custom, "工作日的山野假期", "怀柔"],
  ].map(([id, date, title, city]) => ({
    id, startDate: date, endDate: date, meetupTime: "23:59", meetupPoint: "东直门地铁站", status: "recruiting", reviewStatus: "approved", channel: "trip", organizerType: "official", kind: "official", organizerName: "同行者众", city, enrolled: 8, maxSeats: 20, remain: 12, minGroupSize: 6,
    playTags: [{ name: "徒步" }], quote: { originPrice:199, memberPrice:189, price:199 },
    route: { id:1, title, subtitle:"跟着山风，去过一个轻松的周末", cover:"/static/photos/mutianyu_06.jpg", region:city, days:1 },
  }));
  async function prepare(page, departures = rows) {
    await page.route("**/api/schedules?**", (route) => {
      const url = new URL(route.request().url());
      return url.searchParams.get("channel") === "trip" ? route.fulfill({ contentType:"application/json", body:JSON.stringify({ ok:true, data:departures }) }) : route.continue();
    });
    await goto(page, "/m");
    await page.getByTestId("home-time-bar").scrollIntoViewIfNeeded();
    await page.waitForFunction((n) => document.querySelectorAll('.feed-card').length === n, Math.min(departures.length, 8));
  }
  async function count(page, number) { await page.waitForFunction((n) => document.querySelectorAll('.feed-card').length === n, number); }
  async function dayInSheet(page, date) {
    const target = page.getByTestId("departure-day-" + date);
    for (let attempts = 0; attempts < 12 && !(await target.count()); attempts++) await page.getByRole("button", { name:"下个月", exact:true }).click();
    await target.click();
  }

  await test("homepage quick dates stay visible and replace time without clearing city or trip filters", async () => {
    const p = await pageFor();
    try {
      await prepare(p);
      assert.equal(await p.getByRole("dialog").count(), 0);
      await p.getByTestId("time-weekend").click();
      await count(p, 2);
      await p.getByTestId("time-nextweekend").click();
      await count(p, 2);
      assert.match(await p.locator('.feed-card').first().innerText(), /草原/);
      await p.locator('.city-bar').getByText("怀柔", { exact:true }).first().click();
      await count(p, 1);
      await p.getByTestId("time-any").click();
      await count(p, 4);
      await p.getByTestId("time-calendar").click();
      await dayInSheet(p, custom);
      await p.getByTestId("departure-apply").click();
      await count(p, 1);
      assert.match(await p.locator('.feed-card').innerText(), /工作日/);
      await p.getByTestId("time-weekend").click();
      await count(p, 2);
    } finally { await p.close(); }
  });

  await test("departure calendar confirms drafts, cancels edits, aligns weekdays and keeps truthful counts", async () => {
    const p = await pageFor();
    try {
      await prepare(p);
      await p.getByTestId("time-weekend").click();
      await count(p, 2);
      await p.getByTestId("time-calendar").click();
      const dialog = p.getByRole("dialog", { name:"选择出发日期", exact:true });
      await dayInSheet(p, custom);
      await dialog.getByRole("button", { name:"关闭日期选择", exact:true }).click();
      await count(p, 2);
      assert.equal(await p.getByTestId("time-weekend").getAttribute("aria-pressed"), "true");
      await p.getByTestId("time-calendar").click();
      await dayInSheet(p, custom);
      assert.equal(await p.getByTestId("departure-day-" + custom).getAttribute("data-count"), "1");
      const cells = await p.getByTestId("departure-month-grid").evaluate((grid) => [...grid.children].map((cell) => { const r = cell.getBoundingClientRect(); return { x:r.x, y:r.y }; }));
      assert.equal(new Set(cells.slice(0, 7).map((cell) => Math.round(cell.x))).size, 7);
      assert.equal(new Set(cells.slice(0, 7).map((cell) => Math.round(cell.y))).size, 1);
      assert.ok(cells[7].y > cells[0].y, "calendar must form seven columns rather than stack dates");
      await p.screenshot({ path:path.join(output,"home-date-calendar.png"),fullPage:true });
      assert.match(await p.getByTestId("departure-apply").innerText(), /1/);
      await p.getByTestId("departure-apply").click();
      await count(p, 1);
      await p.getByTestId("time-any").click();
      await count(p, 5);
      await p.getByTestId("home-time-bar").scrollIntoViewIfNeeded();
      await p.screenshot({ path:path.join(output,"home-date-shortcuts.png"),fullPage:true });
    } finally { await p.close(); }
  });

  await test("updating the departure clock preserves expanded homepage results", async () => {
    const p = await pageFor();
    try {
      await p.clock.install({ time:new Date() });
      await prepare(p, Array.from({ length:12 }, (_, i) => ({ ...rows[2], id:9200+i })));
      await p.getByRole("button", { name:/继续发现/ }).click();
      await count(p, 12);
      await p.clock.fastForward(61000);
      await count(p, 12);
    } finally { await p.close(); }
  });

  await test("homepage date controls and calendar fit small, large-type, dark, English and desktop screens", async () => {
    for (const [width,night,size,lang] of [[320,"day",4,"zh"],[390,"dark",1,"zh"],[320,"day",1,"en"],[1440,"day",1,"zh"]]) {
      const p = await pageFor("user",width,{night,size,lang});
      try {
        await prepare(p);
        await p.getByTestId("time-calendar").click();
        await p.getByRole("dialog").waitFor();
        assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),`date overflow ${width}/${night}/${size}/${lang}`);
        const apply = await p.getByTestId("departure-apply").boundingBox();
        assert.ok(apply && apply.y >= 0 && apply.y + apply.height <= p.viewportSize().height, `date confirmation stays visible ${width}/${night}/${size}/${lang}`);
        await p.screenshot({ path:path.join(output,`home-date-${width}-${night}-${size}-${lang}.png`),fullPage:true });
      } finally { await p.close(); }
    }
  });
};
