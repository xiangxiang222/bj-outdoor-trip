const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_TIERS,
  normalizeTiers,
  remainingDays,
  matchPercent,
  refundAmount,
  policyCopy,
} = require("../src/services/refund");

describe("refund rules", () => {
  it("matches default tiers by days left before start", () => {
    assert.equal(remainingDays("2026-09-23", "2026-09-13"), 10);
    assert.equal(matchPercent(DEFAULT_TIERS, 10), 100);
    assert.equal(matchPercent(DEFAULT_TIERS, 9), 80);
    assert.equal(matchPercent(DEFAULT_TIERS, 3), 80);
    assert.equal(matchPercent(DEFAULT_TIERS, 2), 50);
    assert.equal(matchPercent(DEFAULT_TIERS, 0), 50);
    assert.equal(matchPercent(DEFAULT_TIERS, -1), 0);
    assert.equal(matchPercent(DEFAULT_TIERS, 20, { startedAt: "2026-09-01 08:00" }), 0);
    assert.equal(refundAmount(199, 80), 159);
    assert.equal(refundAmount(199, 100), 199);
  });

  it("rejects incomplete or duplicate tiers", () => {
    assert.throws(() => normalizeTiers([]), /至少/);
    assert.throws(() => normalizeTiers([{ minDays: 10, percent: 100 }]), /0 天/);
    assert.throws(
      () => normalizeTiers([
        { minDays: 3, percent: 80 },
        { minDays: 3, percent: 50 },
        { minDays: 0, percent: 0 },
      ]),
      /重复/
    );
    const tiers = normalizeTiers([
      { minDays: 0, percent: 40 },
      { minDays: 5, percent: 90 },
    ]);
    assert.deepEqual(
      tiers.map((t) => t.minDays),
      [5, 0]
    );
  });

  it("writes proportion copy from the default ladder", () => {
    const copy = policyCopy(DEFAULT_TIERS);
    assert.match(copy.summary, /10 天前退 100%/);
    assert.match(copy.lines[0].text, /10 天及以上：退 100%/);
    assert.match(copy.lines.at(-1).text, /正式开团后/);
  });
});
