const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { couponedTripPay, campaignLabel } = require("../src/services/coupons");

describe("coupon math", () => {
  it("applies percent as pay rate with cap", () => {
    assert.equal(couponedTripPay(199, { kind: "percent", value: 80, cap_amount: 100 }), 159);
    assert.equal(couponedTripPay(199, { kind: "percent", value: 80, cap_amount: 20 }), 179);
    assert.equal(campaignLabel({ kind: "percent", value: 80 }), "8折");
    assert.equal(campaignLabel({ kind: "percent", value: 85 }), "8.5折");
  });

  it("applies amount off and floor", () => {
    assert.equal(couponedTripPay(199, { kind: "amount", value: 30 }), 169);
    assert.equal(couponedTripPay(199, { kind: "amount", value: 30, floor_price: 180 }), 180);
    assert.equal(couponedTripPay(20, { kind: "amount", value: 50 }), 0);
    assert.equal(campaignLabel({ kind: "amount", value: 30 }), "减¥30");
  });
});
