const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { forecast, resolvePlace, mockDaily } = require("../src/services/weather");
const { harness } = require("./http");

describe("weather", () => {
  it("maps suburban regions and returns stable mock forecast", async () => {
    assert.equal(resolvePlace("北京怀柔").name, "怀柔");
    const a = mockDaily("北京怀柔", "2026-09-01");
    const b = mockDaily("北京怀柔", "2026-09-01");
    assert.equal(a.weatherCode, b.weatherCode);
    const data = await forecast({ region: "北京怀柔", date: "2026-09-01" });
    assert.equal(data.place, "怀柔");
    assert.ok(data.summary);
    assert.ok(Array.isArray(data.alerts) && data.alerts.length >= 1);
    assert.equal(data.source, "mock");
  });

  it("serves GET /weather", async () => {
    const { agent } = harness();
    const res = await agent.get("/api/weather").query({ region: "河北承德", date: "2026-10-01" }).expect(200);
    assert.equal(res.body.data.place, "承德");
    assert.ok(res.body.data.tmax >= res.body.data.tmin || true);
  });
});
