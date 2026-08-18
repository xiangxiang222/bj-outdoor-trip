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
    assert.equal(config.points.redeemRate, 100);
    assert.equal(config.points.maxOffsetRatio, 0.2);
    assert.equal(config.member.annualFee, 199);
  });
});
