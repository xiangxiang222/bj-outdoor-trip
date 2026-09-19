const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { getDb } = require("../src/db");
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

  it("credits referral rebate and personal bounty into the wallet", async () => {
    const token = await loginUser(agent);
    const card = await agent.get("/api/me/referral").set(auth(token)).expect(200);
    const company = await loginUser(agent, "13900139000", "123456");
    await agent
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
    await agent
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
    const paid = getDb().prepare("SELECT * FROM users WHERE id=?").get(seed.userId);
    assert.equal(Number(paid.wallet_balance), after.body.data.earned + 200);
  });
});
