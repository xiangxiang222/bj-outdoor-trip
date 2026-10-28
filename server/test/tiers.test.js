const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { memberState } = require("../src/services/tiers");

describe("membership growth tiers", () => {
  it("keeps the current tier and remaining growth accurate at a boundary", () => {
    const almost = memberState({ growth: 499 });
    assert.equal(almost.level, 1);
    assert.equal(almost.nextCode, "V2");
    assert.equal(almost.progress, 499 / 500);

    const reached = memberState({ growth: 500 });
    assert.equal(reached.level, 2);
    assert.equal(reached.nextCode, "V3");
    assert.equal(reached.progress, 0);
    assert.equal(reached.levels.find((level) => level.current).code, "V2");
  });

  it("treats the highest tier as complete and preserves manual tier display", () => {
    const top = memberState({ growth: 20000 });
    assert.equal(top.level, 5);
    assert.equal(top.nextCode, "");
    assert.equal(top.progress, 1);

    const manual = memberState({ growth: 0, member_level: 4 });
    assert.equal(manual.level, 4);
    assert.equal(manual.manual, true);
    assert.equal(manual.levels.find((level) => level.current).code, "V4");
  });
});
