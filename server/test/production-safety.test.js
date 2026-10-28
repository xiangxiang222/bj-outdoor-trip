const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { harness, loginUser, auth, ID } = require("./http");
const config = require("../src/config");
const { buyMembership, buyWalletTopup, payCompanySchedule, payEnrollment, refundEnrollmentToPayers } = require("../src/services/payment");
const { refundOrder } = require("../src/services/wechat");
const { withdraw } = require("../src/services/wallet");
const { cancelEnrollment } = require("../src/services/enroll");
const { dissolveSchedule } = require("../src/services/dissolve");
const { addPoints } = require("../src/services/helpers");
const { requireLivePaymentInProduction } = require("../src/services/wechat");

function productionWithMockProviders() {
  const nodeEnv = process.env.NODE_ENV;
  const wechat = { ...config.wechat };
  const sms = { ...config.sms };
  process.env.NODE_ENV = "production";
  config.wechat.mock = true;
  config.wechat.appId = "wx_demo_app";
  config.wechat.appSecret = "wx_demo_secret";
  config.wechat.mchKey = "";
  Object.keys(config.sms).forEach((key) => { config.sms[key] = ""; });
  return () => {
    if (nodeEnv == null) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = nodeEnv;
    Object.assign(config.wechat, wechat);
    Object.assign(config.sms, sms);
  };
}

describe("production integrations fail closed", () => {
  let agent;
  let seed;

  beforeEach(() => {
    ({ agent, seed } = harness());
  });

  it("does not issue identities or expose demo codes when login and SMS providers are unavailable", async () => {
    const restore = productionWithMockProviders();
    try {
      const originalUsers = seed.db.prepare("SELECT COUNT(*) AS n FROM users").get().n;
      await agent.post("/api/auth/wechat-phone").send({ loginCode: "attacker", phone: "13800138000" }).expect(503);
      await agent.post("/api/auth/wechat").send({ code: "attacker", nickname: "伪造账号" }).expect(503);

      seed.db.prepare("INSERT INTO sms_codes (phone,code,scene,expire_at) VALUES (?,?,?,datetime('now','localtime','+10 minutes'))")
        .run("13800138000", "888888", "login");
      await agent.post("/api/auth/login-sms").send({ phone: "13800138000", code: "888888" }).expect(400);
      const meta = await agent.get("/api/meta").expect(200);
      assert.equal(meta.body.data.smsDemoCode, "");
      assert.equal(seed.db.prepare("SELECT COUNT(*) AS n FROM users").get().n, originalUsers);
      assert.equal(seed.db.prepare("SELECT used FROM sms_codes WHERE phone=? ORDER BY id DESC LIMIT 1").get("13800138000").used, 0);
    } finally {
      restore();
    }
  });

  it("does not record mock purchases, withdrawals, refunds, or mock-success in production", async () => {
    const restore = productionWithMockProviders();
    try {
      const token = await loginUser(agent);
      const enrolled = await agent.post("/api/enroll").set(auth(token)).send({
        scheduleId: seed.individualScheduleId,
        travelerName: "林北野",
        travelerPhone: "13800138000",
        idCard: "110101199205121219",
        emergencyName: "联系人",
        emergencyPhone: "13700000002",
        waiverAccepted: true,
        healthOk: true,
      }).expect(200);
      const beforePayments = seed.db.prepare("SELECT COUNT(*) AS n FROM payments").get().n;
      const beforeLedger = seed.db.prepare("SELECT COUNT(*) AS n FROM wallet_ledger").get().n;

      await agent.post("/api/me/wallet/topup").set(auth(token)).send({ amount: 20 }).expect(503);
      await agent.post("/api/pay/for-enrollment").set(auth(token)).send({ enrollmentId: enrolled.body.data.enrollmentId }).expect(503);
      await agent.post("/api/pay/company-settle").set(auth(token)).send({ scheduleId: seed.companyScheduleId }).expect(503);
      await agent.post("/api/pay/mock-success").set(auth(token)).send({ tradeNo: "missing" }).expect(403);

      await assert.rejects(buyMembership(seed.userId), { status: 503 });
      await assert.rejects(buyWalletTopup(seed.userId, { amount: 20 }), { status: 503 });
      await assert.rejects(payCompanySchedule(seed.companyUserId, seed.companyScheduleId), { status: 503 });
      await assert.rejects(payEnrollment(enrolled.body.data.enrollmentId, seed.userId), { status: 503 });
      await assert.rejects(withdraw(seed.userId, { amount: 1, pin: "258369" }), { status: 503 });
      await assert.rejects(refundOrder({ tradeNo: "x", refundNo: "y", totalFen: 100, refundFen: 100 }), { status: 503 });
      await assert.rejects(refundEnrollmentToPayers({ id: 999, pay_status: "paid", pay_amount: 20, user_id: seed.userId }, { amount: 20 }), { status: 503 });

      assert.equal(seed.db.prepare("SELECT COUNT(*) AS n FROM payments").get().n, beforePayments);
      assert.equal(seed.db.prepare("SELECT COUNT(*) AS n FROM wallet_ledger").get().n, beforeLedger);
      assert.equal(seed.db.prepare("SELECT wallet_balance FROM users WHERE id=?").get(seed.userId).wallet_balance, 0);
    } finally {
      restore();
    }
  });

  it("preserves earned points and enrollment state when cancellation or dissolution cannot refund", async () => {
    const token = await loginUser(agent);
    const enrolled = await agent.post("/api/enroll").set(auth(token)).send({
      scheduleId: seed.individualScheduleId,
      travelerName: "林北野",
      travelerPhone: "13800138000",
      idCard: "110101199205121219",
      emergencyName: "联系人",
      emergencyPhone: "13700000002",
      waiverAccepted: true,
      healthOk: true,
    }).expect(200);
    const enrollmentId = enrolled.body.data.enrollmentId;
    seed.db.prepare("UPDATE enrollments SET pay_status='paid',pay_amount=20 WHERE id=?").run(enrollmentId);
    addPoints(seed.userId, 20, "参加活动积分", "enrollment", enrollmentId);
    const originalPoints = seed.db.prepare("SELECT points FROM users WHERE id=?").get(seed.userId).points;
    const originalLedger = seed.db.prepare("SELECT COUNT(*) AS n FROM points_ledger").get().n;
    const restore = productionWithMockProviders();
    try {
      await assert.rejects(cancelEnrollment(enrollmentId, seed.userId, { admin: true }), { status: 503 });
      await assert.rejects(dissolveSchedule(seed.individualScheduleId, { reason: "测试退款失败", actor: "admin" }), { status: 503 });
      assert.equal(seed.db.prepare("SELECT points FROM users WHERE id=?").get(seed.userId).points, originalPoints);
      assert.equal(seed.db.prepare("SELECT COUNT(*) AS n FROM points_ledger").get().n, originalLedger);
      assert.deepEqual(seed.db.prepare("SELECT status,pay_status FROM enrollments WHERE id=?").get(enrollmentId), {
        status: "joined", pay_status: "paid",
      });
      assert.equal(seed.db.prepare("SELECT status FROM schedules WHERE id=?").get(seed.individualScheduleId).status, "recruiting");
    } finally {
      restore();
    }
  });

  it("preflights every dissolve refund before crediting wallet payments", async () => {
    const userToken = await loginUser(agent);
    const first = await agent.post("/api/enroll").set(auth(userToken)).send({
      scheduleId: seed.individualScheduleId,
      travelerName: "林北野",
      travelerPhone: "13800138000",
      idCard: ID.maleBj,
      emergencyName: "联系人甲",
      emergencyPhone: "13700000002",
      waiverAccepted: true,
      healthOk: true,
    }).expect(200);
    const walletEnrollmentId = first.body.data.enrollmentId;
    const wechatEnrollmentId = Number(seed.db.prepare(
      "INSERT INTO enrollments (schedule_id,user_id,traveler_name,traveler_phone,id_card,status,pay_status,pay_amount,pay_channel) VALUES (?,?,?,?,?,'joined','paid',30,'wechat')"
    ).run(seed.individualScheduleId, seed.companyUserId, "华创团建", "13900139000", "11010519880108121X").lastInsertRowid);
    seed.db.prepare("UPDATE enrollments SET pay_status='paid',pay_amount=20,pay_channel='wallet' WHERE id=?").run(walletEnrollmentId);
    seed.db.prepare("UPDATE enrollments SET pay_status='paid',pay_amount=30,pay_channel='wechat' WHERE id=?").run(wechatEnrollmentId);
    seed.db.prepare(
      "INSERT INTO payments (enrollment_id,user_id,schedule_id,amount,channel,status,trade_no,remark,scene) VALUES (?,?,?,?,?,?,?,?,?)"
    ).run(wechatEnrollmentId, seed.companyUserId, seed.individualScheduleId, 30, "wechat", "success", "WX-PREFLIGHT", "自己支付", "enrollment");
    addPoints(seed.userId, 20, "参加活动积分", "enrollment", walletEnrollmentId);

    const beforeBalance = seed.db.prepare("SELECT wallet_balance FROM users WHERE id=?").get(seed.userId).wallet_balance;
    const beforeLedger = seed.db.prepare("SELECT COUNT(*) AS n FROM wallet_ledger").get().n;
    const beforePayments = seed.db.prepare("SELECT COUNT(*) AS n FROM payments").get().n;
    const beforePoints = seed.db.prepare("SELECT points FROM users WHERE id=?").get(seed.userId).points;
    const restore = productionWithMockProviders();
    try {
      await assert.rejects(
        dissolveSchedule(seed.individualScheduleId, { reason: "微信退款未接通", actor: "admin" }),
        { status: 503 }
      );
      assert.equal(seed.db.prepare("SELECT wallet_balance FROM users WHERE id=?").get(seed.userId).wallet_balance, beforeBalance);
      assert.equal(seed.db.prepare("SELECT COUNT(*) AS n FROM wallet_ledger").get().n, beforeLedger);
      assert.equal(seed.db.prepare("SELECT COUNT(*) AS n FROM payments").get().n, beforePayments);
      assert.equal(seed.db.prepare("SELECT points FROM users WHERE id=?").get(seed.userId).points, beforePoints);
      assert.deepEqual(seed.db.prepare("SELECT status,pay_status FROM enrollments WHERE id IN (?,?) ORDER BY id").all(walletEnrollmentId, wechatEnrollmentId), [
        { status: "joined", pay_status: "paid" },
        { status: "joined", pay_status: "paid" },
      ]);
      assert.equal(seed.db.prepare("SELECT status FROM schedules WHERE id=?").get(seed.individualScheduleId).status, "recruiting");
    } finally {
      restore();
    }
  });

  it("keeps actual wallet payments and refunds available without external payment credentials", async () => {
    const token = await loginUser(agent);
    const enrolled = await agent.post("/api/enroll").set(auth(token)).send({
      scheduleId: seed.individualScheduleId,
      travelerName: "林北野",
      travelerPhone: "13800138000",
      idCard: "110101199205121219",
      emergencyName: "联系人",
      emergencyPhone: "13700000002",
      waiverAccepted: true,
      healthOk: true,
    }).expect(200);
    seed.db.prepare("UPDATE users SET wallet_balance=500 WHERE id=?").run(seed.userId);
    const restore = productionWithMockProviders();
    try {
      const paid = await payEnrollment(enrolled.body.data.enrollmentId, seed.userId, { channel: "wallet" });
      assert.equal(paid.payStatus, "paid");
      assert.equal(paid.channel, "wallet");
      assert.ok(paid.walletBalance < 500);
      await cancelEnrollment(enrolled.body.data.enrollmentId, seed.userId, { admin: true });
      assert.equal(seed.db.prepare("SELECT wallet_balance FROM users WHERE id=?").get(seed.userId).wallet_balance, 500);

      // Production validation accepts live configuration without invoking the provider.
      Object.assign(config.wechat, { mock: false, appId: "wx_live_app", mchId: "live-merchant", mchKey: "live-key" });
      assert.doesNotThrow(requireLivePaymentInProduction);
    } finally {
      restore();
    }
  });
});
