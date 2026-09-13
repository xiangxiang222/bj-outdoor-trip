const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const config = require("../src/config");

describe("config env overrides", () => {
  it("uses isolated temp dirs injected by setup-env", () => {
    assert.ok(config.dataDir.includes("bj-ut-"));
    assert.ok(config.dbFile.endsWith("app.sqlite"));
    assert.ok(config.publicDir.includes("bj-ut-"));
    assert.equal(config.demoSmsCode, "888888");
    assert.equal(config.wechat.mock, true);
    assert.equal(config.wechat.appId, "wx205ca387929c002a");
    assert.equal(config.wechat.mchId, "17501360384");
    assert.equal(config.points.redeemRate, 100);
    assert.equal(config.points.maxOffsetRatio, 0.2);
    assert.equal(config.member.annualFee, 99);
    assert.equal(config.insurance.plans.length, 3);
    assert.equal(config.ai.apiKey, "");
    assert.equal(config.ai.model, "gpt-4o-mini");
    assert.match(config.ai.baseUrl, /openai/);
  });
});
