const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { allocateByShare, parsePayYuan, remarkForPay } = require("../src/services/pay-ledger");

describe("pay ledger helpers", () => {
  it("splits a refund across payers with largest remainder", () => {
    assert.deepEqual(allocateByShare([100, 99], 159), [80, 79]);
    assert.deepEqual(allocateByShare([100], 80), [80]);
    assert.deepEqual(allocateByShare([50, 50], 1), [1, 0]);
    assert.deepEqual(allocateByShare([80, 119], 159), [64, 95]);
    assert.deepEqual(allocateByShare([0, 10], 10), [0, 10]);
    assert.deepEqual(allocateByShare([], 10), []);
  });

  it("parses integer pay amounts against remaining", () => {
    assert.equal(parsePayYuan(null, 199), 199);
    assert.equal(parsePayYuan("", 80), 80);
    assert.equal(parsePayYuan(50, 80), 50);
    assert.throws(() => parsePayYuan(0, 80), /大于 0/);
    assert.throws(() => parsePayYuan(90, 80), /超过待付余额/);
    assert.throws(() => parsePayYuan(1.5, 80), /整数元/);
  });

  it("labels self pay, proxy pay and crowdfund", () => {
    assert.equal(remarkForPay({ payerId: 1, enrolleeId: 1, amount: 199, remainingBefore: 199 }), "自己支付");
    assert.equal(remarkForPay({ payerId: 1, enrolleeId: 1, amount: 80, remainingBefore: 199 }), "自己支付（分摊）");
    assert.equal(remarkForPay({ payerId: 2, enrolleeId: 1, amount: 199, remainingBefore: 199 }), "他人代付");
    assert.equal(remarkForPay({ payerId: 2, enrolleeId: 1, amount: 50, remainingBefore: 199 }), "众筹分摊");
    assert.equal(
      remarkForPay({ payerId: 1, enrolleeId: 1, amount: 199, remainingBefore: 199, channel: "wallet" }),
      "自己支付（余额）"
    );
  });
});
