const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { getDb } = require("../src/db");
const { repairSkippedWalletRefunds } = require("../src/services/payment");
const { harness, loginUser, auth, ID, enrollPayload } = require("./http");

describe("wallet API", () => {
  let agent;
  let seed;

  beforeEach(() => {
    ({ agent, seed } = harness());
  });

  it("shows zero balance and accepts wechat mock topup", async () => {
    const token = await loginUser(agent);
    const me = await agent.get("/api/me").set(auth(token)).expect(200);
    assert.equal(me.body.data.walletBalance, 0);
    assert.equal(me.body.data.walletPinSet, false);
    assert.equal(me.body.data.realNamed, true);

    const bad = await agent.post("/api/me/wallet/topup").set(auth(token)).send({ amount: 0.5 });
    assert.equal(bad.status, 400);

    const top = await agent.post("/api/me/wallet/topup").set(auth(token)).send({ amount: 200 }).expect(200);
    assert.equal(top.body.data.needPay, false);
    assert.equal(top.body.data.balance, 200);
    assert.equal(top.body.data.user.walletBalance, 200);

    const wallet = await agent.get("/api/me/wallet").set(auth(token)).expect(200);
    assert.equal(wallet.body.data.balance, 200);
    assert.equal(wallet.body.data.bills[0].scene, "topup");
    assert.equal(wallet.body.data.bills[0].delta, 200);
  });

  it("rejects bank cards and withdraws to wechat with a pin", async () => {
    const token = await loginUser(agent);
    await agent.post("/api/me/wallet/topup").set(auth(token)).send({ amount: 300 }).expect(200);
    const card = await agent
      .post("/api/me/wallet/cards")
      .set(auth(token))
      .send({ holderName: "林北野", bankName: "招商银行", cardNo: "6222021234567890123" });
    assert.equal(card.status, 400);

    const needPin = await agent.post("/api/me/wallet/withdraw").set(auth(token)).send({ amount: 50, pin: "258369" });
    assert.equal(needPin.status, 400);

    await agent.post("/api/me/wallet/pin").set(auth(token)).send({ pin: "258369" }).expect(200);
    const wrong = await agent.post("/api/me/wallet/withdraw").set(auth(token)).send({ amount: 50, pin: "000000" });
    assert.equal(wrong.status, 400);

    const out = await agent.post("/api/me/wallet/withdraw").set(auth(token)).send({ amount: 50, pin: "258369" }).expect(200);
    assert.equal(out.body.data.amount, 50);
    assert.equal(out.body.data.balance, 250);
    assert.equal(out.body.data.channel, "wechat");
    assert.equal(out.body.data.user.walletBalance, 250);

    const wallet = await agent.get("/api/me/wallet").set(auth(token)).expect(200);
    assert.equal(wallet.body.data.withdrawChannel, "wechat");
    assert.equal(wallet.body.data.bills[0].scene, "withdraw");
    assert.equal(wallet.body.data.bills[0].reason, "提现到微信零钱");
    assert.equal(wallet.body.data.withdrawRule.maxYuan, 2000);
    assert.equal(wallet.body.data.withdrawRule.minYuan, 0);
    assert.equal(wallet.body.data.withdrawRule.dailyMax, 0);
    assert.equal(wallet.body.data.withdrawRule.unlimited, true);
    assert.equal(wallet.body.data.withdrawRule.todayRemain, null);
    assert.equal(wallet.body.data.withdrawRule.todayCount, 1);
  });

  it("withdraws with a pin when the account is not real-name verified", async () => {
    const token = await loginUser(agent);
    seed.db.prepare("UPDATE users SET id_verified=0 WHERE id=?").run(seed.userId);
    await agent.post("/api/me/wallet/topup").set(auth(token)).send({ amount: 80 }).expect(200);
    await agent.post("/api/me/wallet/pin").set(auth(token)).send({ pin: "258369" }).expect(200);
    const out = await agent.post("/api/me/wallet/withdraw").set(auth(token)).send({ amount: 20, pin: "258369" }).expect(200);
    assert.equal(out.body.data.amount, 20);
    assert.equal(out.body.data.balance, 60);
  });

  it("does not cap daily withdrawals and still splits at the wechat 2000 yuan channel max", async () => {
    const token = await loginUser(agent);
    await agent.post("/api/me/wallet/topup").set(auth(token)).send({ amount: 5000 }).expect(200);
    await agent.post("/api/me/wallet/pin").set(auth(token)).send({ pin: "258369" }).expect(200);
    const over = await agent.post("/api/me/wallet/withdraw").set(auth(token)).send({ amount: 2001, pin: "258369" });
    assert.equal(over.status, 400);
    assert.match(String(over.body.message || ""), /2000/);
    for (let i = 0; i < 4; i += 1) {
      await agent.post("/api/me/wallet/withdraw").set(auth(token)).send({ amount: 1, pin: "258369" }).expect(200);
    }
    const wallet = await agent.get("/api/me/wallet").set(auth(token)).expect(200);
    assert.equal(wallet.body.data.withdrawRule.dailyMax, 0);
    assert.equal(wallet.body.data.withdrawRule.unlimited, true);
    assert.equal(wallet.body.data.withdrawRule.todayCount, 4);
    assert.equal(wallet.body.data.withdrawRule.todayRemain, null);
    assert.equal(wallet.body.data.balance, 4996);
  });

  it("does not debit the wallet when live wechat transfer is not configured", async () => {
    const config = require("../src/config");
    const token = await loginUser(agent);
    await agent.post("/api/me/wallet/topup").set(auth(token)).send({ amount: 80 }).expect(200);
    await agent.post("/api/me/wallet/pin").set(auth(token)).send({ pin: "258369" }).expect(200);
    const prev = config.wechat.mock;
    config.wechat.mock = false;
    try {
      const out = await agent.post("/api/me/wallet/withdraw").set(auth(token)).send({ amount: 80, pin: "258369" });
      assert.equal(out.status, 400);
      assert.match(String(out.body.message || ""), /证书|微信登录/);
      const wallet = await agent.get("/api/me/wallet").set(auth(token)).expect(200);
      assert.equal(wallet.body.data.balance, 80);
    } finally {
      config.wechat.mock = prev;
    }
  });

  it("tells a zero-balance account to top up instead of blocking with a minimum", async () => {
    const token = await loginUser(agent);
    await agent.post("/api/me/wallet/pin").set(auth(token)).send({ pin: "258369" }).expect(200);
    const empty = await agent.post("/api/me/wallet/withdraw").set(auth(token)).send({ amount: 1, pin: "258369" });
    assert.equal(empty.status, 400);
    assert.match(String(empty.body.message || ""), /充值/);
    const wallet = await agent.get("/api/me/wallet").set(auth(token)).expect(200);
    assert.equal(wallet.body.data.withdrawRule.minYuan, 0);
    assert.equal(wallet.body.data.withdrawRule.available, 0);
  });

  it("pays enrollment from wallet and refunds back on cancel", async () => {
    const token = await loginUser(agent);
    const short = await agent
      .post("/api/enroll")
      .set(auth(token))
      .send(
        enrollPayload({
          scheduleId: seed.individualScheduleId,
          travelerName: "林北野",
          travelerPhone: "13800138000",
          idCard: ID.maleBj,
        })
      )
      .expect(200);
    const enrollmentId = short.body.data.enrollmentId;
    const remain = Number(short.body.data.quote?.payAmount || short.body.data.payAmount || 0);
    assert.ok(remain > 0);
    const broke = await agent
      .post("/api/pay/for-enrollment")
      .set(auth(token))
      .send({ enrollmentId, channel: "wallet" });
    assert.equal(broke.status, 400);

    await agent.post("/api/me/wallet/topup").set(auth(token)).send({ amount: 500 }).expect(200);
    const paid = await agent
      .post("/api/pay/for-enrollment")
      .set(auth(token))
      .send({ enrollmentId, channel: "wallet" })
      .expect(200);
    assert.equal(paid.body.data.payStatus, "paid");
    assert.equal(paid.body.data.channel, "wallet");
    assert.equal(paid.body.data.walletBalance, 500 - remain);
    const charge = seed.db.prepare("SELECT channel FROM payments WHERE enrollment_id=? AND status='success'").get(enrollmentId);
    assert.equal(charge.channel, "wallet");

    const cancelled = await agent.post("/api/orders/" + enrollmentId + "/cancel").set(auth(token)).expect(200);
    assert.equal(cancelled.body.data.payStatus, "refunded");
    const me = await agent.get("/api/me").set(auth(token)).expect(200);
    assert.equal(me.body.data.walletBalance, 500 - remain + Number(cancelled.body.data.refundAmount || 0));
  });

  it("returns a 1 yuan wallet payment instead of rounding the ladder down to zero", async () => {
    const token = await loginUser(agent);
    await agent.post("/api/me/wallet/topup").set(auth(token)).send({ amount: 10 }).expect(200);
    const enrolled = await agent
      .post("/api/enroll")
      .set(auth(token))
      .send(
        enrollPayload({
          scheduleId: seed.individualScheduleId,
          travelerName: "林北野",
          travelerPhone: "13800138000",
          idCard: ID.maleBj,
        })
      )
      .expect(200);
    const enrollmentId = enrolled.body.data.enrollmentId;
    seed.db.prepare("UPDATE enrollments SET pay_amount=1 WHERE id=?").run(enrollmentId);
    seed.db
      .prepare("UPDATE schedules SET start_date=date('now','localtime'), min_group_size=1 WHERE id=?")
      .run(seed.individualScheduleId);
    const paid = await agent
      .post("/api/pay/for-enrollment")
      .set(auth(token))
      .send({ enrollmentId, channel: "wallet", amount: 1 })
      .expect(200);
    assert.equal(paid.body.data.walletBalance, 9);
    const cancelled = await agent.post("/api/orders/" + enrollmentId + "/cancel").set(auth(token)).expect(200);
    assert.equal(cancelled.body.data.refundPercent, 50);
    assert.equal(cancelled.body.data.refundAmount, 1);
    assert.equal(cancelled.body.data.payStatus, "refunded");
    const me = await agent.get("/api/me").set(auth(token)).expect(200);
    assert.equal(me.body.data.walletBalance, 10);
    const credit = seed.db
      .prepare("SELECT delta FROM wallet_ledger WHERE user_id=? AND scene='refund' AND ref_id=?")
      .get(seed.userId, enrollmentId);
    assert.equal(credit.delta, 1);
  });

  it("puts back a wallet charge that was cancelled without a refund credit", () => {
    seed.db.prepare("UPDATE users SET wallet_balance=3 WHERE id=?").run(seed.userId);
    const info = seed.db
      .prepare(
        `INSERT INTO enrollments (schedule_id,user_id,traveler_name,traveler_phone,pay_status,pay_amount,pay_channel,status)
         VALUES (?,?,?,?,?,?,?,?)`
      )
      .run(seed.individualScheduleId, seed.userId, "林北野", "13800138000", "refunded", 1, "wallet", "cancelled");
    const enrollmentId = Number(info.lastInsertRowid);
    seed.db
      .prepare(
        `INSERT INTO payments (enrollment_id,user_id,schedule_id,amount,channel,status,trade_no,remark,scene)
         VALUES (?,?,?,?,?,?,?,?,?)`
      )
      .run(enrollmentId, seed.userId, seed.individualScheduleId, 1, "wallet", "success", "P-stuck", "自己支付（余额）", "enrollment");
    seed.db.prepare("DELETE FROM settings WHERE key='wallet_cancel_refund_repair'").run();
    assert.equal(repairSkippedWalletRefunds(), 1);
    assert.equal(seed.db.prepare("SELECT wallet_balance FROM users WHERE id=?").get(seed.userId).wallet_balance, 4);
    const refund = seed.db.prepare("SELECT channel, amount FROM payments WHERE refund_of>0 AND enrollment_id=?").get(enrollmentId);
    assert.equal(refund.channel, "wallet");
    assert.equal(refund.amount, 1);
    assert.equal(repairSkippedWalletRefunds(), 0);
  });

  it("credits referral rebate and personal bounty into the wallet", async () => {
    const token = await loginUser(agent);
    const card = await agent.get("/api/me/referral").set(auth(token)).expect(200);
    const company = await loginUser(agent, "13900139000", "123456");
    const joined = await agent
      .post("/api/enroll")
      .set(auth(company))
      .send(
        enrollPayload({
          scheduleId: seed.individualScheduleId,
          travelerName: "华创同事",
          travelerPhone: "13900139000",
          idCard: ID.maleHb,
          referrerCode: card.body.data.code,
        })
      )
      .expect(200);
    await agent
      .post("/api/pay/for-enrollment")
      .set(auth(company))
      .send({ enrollmentId: joined.body.data.enrollmentId })
      .expect(200);
    const after = await agent.get("/api/me/referral").set(auth(token)).expect(200);
    assert.ok(after.body.data.earned >= 1);
    const me = await agent.get("/api/me").set(auth(token)).expect(200);
    assert.equal(me.body.data.walletBalance, after.body.data.earned);

    const start = require("dayjs")().add(8, "day").format("YYYY-MM-DD");
    const personal = await agent
      .post("/api/schedules")
      .set(auth(token))
      .send({
        routeId: seed.routeId,
        startDate: start,
        busTypeId: "coaster10",
        minGroupSize: 1,
        meetupPoint: "丽泽桥西南角",
        meetupTime: "08:00",
        organizerType: "individual",
      })
      .expect(200);
    const self = await agent
      .post("/api/enroll")
      .set(auth(token))
      .send(
        enrollPayload({
          scheduleId: personal.body.data.id,
          travelerName: "林北野",
          travelerPhone: "13800138000",
          idCard: ID.maleBj,
        })
      )
      .expect(200);
    await agent
      .post("/api/pay/for-enrollment")
      .set(auth(token))
      .send({ enrollmentId: self.body.data.enrollmentId })
      .expect(200);
    const paid = getDb().prepare("SELECT * FROM users WHERE id=?").get(seed.userId);
    assert.equal(Number(paid.wallet_balance), after.body.data.earned + 200);
  });
});
