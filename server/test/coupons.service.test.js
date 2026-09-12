const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const dayjs = require("dayjs");
const { couponedTripPay, campaignLabel, decideCouponPrice, couponExpiresAt } = require("../src/services/coupons");

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

  it("takes the lower of coupon and member unless stacking", () => {
    const quote = { tripPrice: 199, price: 189, memberPrice: 189, isMember: true, isStudent: false };
    const noStack = decideCouponPrice({
      quote,
      user: { member_gift_left: 0 },
      campaign: { kind: "amount", value: 10, stack_member: 0 },
    });
    assert.equal(noStack.couponPay, 189);
    assert.equal(noStack.applyCoupon, false);
    const stacked = decideCouponPrice({
      quote,
      user: { member_gift_left: 0 },
      campaign: { kind: "amount", value: 10, stack_member: 1 },
    });
    assert.equal(stacked.couponPay, 179);
    assert.equal(stacked.applyCoupon, true);
  });

  it("sets expiry from valid hours", () => {
    const from = dayjs("2026-09-12 10:00:00");
    assert.equal(couponExpiresAt({ valid_hours: 0 }, from), null);
    assert.equal(couponExpiresAt({ valid_hours: 24 }, from), "2026-09-13 10:00:00");
  });
});
