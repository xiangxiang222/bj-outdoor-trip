const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_TIERS,
  normalizeTiers,
  remainingDays,
  matchPercent,
  refundAmount,
  policyCopy,
  cancelQuote,
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
    assert.equal(refundAmount(1, 50), 1);
    assert.equal(refundAmount(1, 80), 1);
    assert.equal(refundAmount(1, 0), 0);
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

  it("quotes the kept percent and yuan when a formed trip is close to departure", () => {
    const start = new Date();
    const today = [start.getFullYear(), String(start.getMonth() + 1).padStart(2, "0"), String(start.getDate()).padStart(2, "0")].join("-");
    const soon = cancelQuote(
      { status: "joined", pay_status: "paid", pay_amount: 200 },
      { status: "confirmed", startDate: today, channel: "trip", minGroupSize: 1, realEnrolled: 1 }
    );
    assert.equal(soon.percent, 50);
    assert.equal(soon.deductPercent, 50);
    assert.equal(soon.amount, 100);
    assert.equal(soon.deductAmount, 100);
    assert.match(soon.hint, /扣除 50%（¥100）/);
    const full = cancelQuote(
      { status: "joined", pay_status: "paid", pay_amount: 200 },
      { status: "confirmed", startDate: "2099-01-01", channel: "trip", minGroupSize: 1, realEnrolled: 1 }
    );
    assert.equal(full.percent, 100);
    assert.equal(full.deductAmount, 0);
  });

  it("writes proportion copy from the default ladder", () => {
    const copy = policyCopy(DEFAULT_TIERS);
    assert.match(copy.summary, /10 天前退 100%/);
    assert.match(copy.lines[0].text, /10 天及以上：退 100%/);
    assert.match(copy.lines.at(-1).text, /正式开团后/);
  });
});
