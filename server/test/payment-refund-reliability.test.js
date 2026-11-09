const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const https = require("node:https");
const dayjs = require("dayjs");

// Use the suite's temporary SQLite database and block every payment provider.
// Provider outcomes below are injected stubs, never merchant API calls.
process.env.NODE_ENV = "test";
process.env.WX_PAY_MOCK = "1";
process.env.WX_APPSECRET = "wx_demo_secret";
for (const key of [
  "WX_MCH_KEY", "WX_MCH_CERT_PATH", "WX_MCH_KEY_PATH", "WX_MCH_CERT_PASS",
  "ALIYUN_ACCESS_KEY_ID", "ALIYUN_ACCESS_KEY_SECRET",
  "TENCENT_SECRET_ID", "TENCENT_SECRET_KEY", "TENCENT_SMS_SDK_APP_ID",
  "TENCENT_SMS_SIGN", "TENCENT_SMS_TEMPLATE_ID", "AI_API_KEY", "OPENAI_API_KEY",
]) process.env[key] = "";
process.env.ROUTE_I18N_AUTO = "0";
process.env.AI_DISCOVERY_DAILY_LIMIT = "0";

const { harness, loginUser, auth, ID } = require("./http");
const { refundEnrollmentToPayers } = require("../src/services/payment");
const { cancelEnrollment } = require("../src/services/enroll");
const { dissolveSchedule } = require("../src/services/dissolve");

describe("refund reliability", () => {
  let agent;
  let seed;
  let networkAttempts;

  beforeEach((t) => {
    networkAttempts = [];
    const rejectNetwork = (...args) => {
      networkAttempts.push(String(args[0] || "unknown"));
      throw new Error("Refund regression tests prohibit external network calls");
    };
    t.mock.method(globalThis, "fetch", rejectNetwork);
    t.mock.method(https, "request", rejectNetwork);
    ({ agent, seed } = harness());
  });

  afterEach(() => {
    seed?.db.exec("DROP TRIGGER IF EXISTS qa_reject_refund_ledger");
    seed?.db.exec("DROP TRIGGER IF EXISTS qa_reject_dissolve_update");
    assert.deepEqual(networkAttempts, [], "No real payment, SMS, or authentication provider may be contacted");
  });

  function paidEnrollment({ amounts = [40, 59], channel = "wechat", formed = false } = {}) {
    const total = amounts.reduce((sum, amount) => sum + amount, 0);
    const id = Number(seed.db.prepare(
      `INSERT INTO enrollments
       (schedule_id,user_id,traveler_name,traveler_phone,id_card,status,pay_status,pay_amount,pay_channel)
       VALUES (?,?,?,?,?,'joined','paid',?,?)`
    ).run(seed.individualScheduleId, seed.userId, "退款回归旅客", "13800138000", ID.maleBj, total, channel).lastInsertRowid);
    if (formed) seed.db.prepare("UPDATE schedules SET status='confirmed' WHERE id=?").run(seed.individualScheduleId);
    const charges = amounts.map((amount, index) => {
      const tradeNo = `QA_CHARGE_${id}_${index}`;
      const info = seed.db.prepare(
        `INSERT INTO payments
         (enrollment_id,user_id,schedule_id,amount,channel,status,trade_no,remark,scene)
         VALUES (?,?,?,?,?,'success',?,'退款回归付款','enrollment')`
      ).run(id, seed.userId, seed.individualScheduleId, amount, channel, tradeNo);
      return { id: Number(info.lastInsertRowid), amount, tradeNo };
    });
    return { id, total, charges, enrollment: () => seed.db.prepare("SELECT * FROM enrollments WHERE id=?").get(id) };
  }

  function refundRows(id) {
    return seed.db.prepare("SELECT * FROM payments WHERE enrollment_id=? AND status='refunded' ORDER BY id").all(id);
  }

  function assertBalancedRefund(fixture, expectedTotal) {
    const refunds = refundRows(fixture.id);
    assert.equal(refunds.reduce((sum, row) => sum + Number(row.amount), 0), expectedTotal);
    assert.equal(new Set(refunds.map((row) => row.trade_no)).size, refunds.length);
    for (const charge of fixture.charges) {
      const original = seed.db.prepare("SELECT * FROM payments WHERE id=?").get(charge.id);
      const children = refunds.filter((row) => row.refund_of === charge.id);
      assert.equal(original.refunded_amount, children.reduce((sum, row) => sum + Number(row.amount), 0));
      assert.ok(original.refunded_amount >= 0 && original.refunded_amount <= original.amount);
      for (const refund of children) {
        assert.equal(refund.user_id, seed.userId);
        assert.equal(refund.enrollment_id, fixture.id);
        assert.ok(refund.trade_no.length <= 32);
      }
    }
    return refunds;
  }

  function rejectRefundLedger() {
    seed.db.exec(`CREATE TEMP TRIGGER qa_reject_refund_ledger
      BEFORE INSERT ON payments WHEN NEW.status='refunded'
      BEGIN SELECT RAISE(ABORT, 'QA refund ledger unavailable'); END;`);
  }

  it("gives the same payer's two refunds unique numbers in the same millisecond", async (t) => {
    const fixture = paidEnrollment();
    const now = Date.now();
    t.mock.method(Date, "now", () => now);
    const providerCalls = [];
    await refundEnrollmentToPayers(fixture.enrollment(), {
      amount: fixture.total,
      refundWechat: async (request) => { providerCalls.push(request); },
    });
    assert.equal(providerCalls.length, 2);
    assert.equal(new Set(providerCalls.map((call) => call.refundNo)).size, 2);
    assert.deepEqual(providerCalls.map((call) => [call.tradeNo, call.totalFen, call.refundFen]), [
      [fixture.charges[0].tradeNo, 4000, 4000],
      [fixture.charges[1].tradeNo, 5900, 5900],
    ]);
    assertBalancedRefund(fixture, 99);
  });

  it("cancels split payments consistently and rejects repeat cancellation without another refund", async (t) => {
    const fixture = paidEnrollment();
    const token = await loginUser(agent);
    const now = Date.now();
    t.mock.method(Date, "now", () => now);
    const cancelled = await agent.post(`/api/orders/${fixture.id}/cancel`).set(auth(token)).expect(200);
    assert.equal(cancelled.body.data.refundAmount, 99);
    assert.equal(cancelled.body.data.refundPercent, 100);
    assert.equal(fixture.enrollment().status, "cancelled");
    assert.equal(fixture.enrollment().pay_status, "refunded");
    const beforeRepeat = assertBalancedRefund(fixture, 99);
    await agent.post(`/api/orders/${fixture.id}/cancel`).set(auth(token)).expect(400);
    assert.deepEqual(refundRows(fixture.id), beforeRepeat);
    assertBalancedRefund(fixture, 99);
  });

  it("retries only the failed provider slice and keeps successful refunds accounted for", async () => {
    const fixture = paidEnrollment();
    const accepted = [];
    let failSecond = true;
    const refundWechat = async (request) => {
      if (request.tradeNo === fixture.charges[1].tradeNo && failSecond) {
        failSecond = false;
        throw new Error("QA second refund temporarily unavailable");
      }
      accepted.push(request);
    };
    await assert.rejects(refundEnrollmentToPayers(fixture.enrollment(), { amount: 99, refundWechat }), /temporarily unavailable/);
    assertBalancedRefund(fixture, 40);
    assert.equal(fixture.enrollment().status, "joined");
    await refundEnrollmentToPayers(fixture.enrollment(), { amount: 99, refundWechat });
    assert.equal(accepted.filter((request) => request.tradeNo === fixture.charges[0].tradeNo).length, 1);
    assert.equal(accepted.reduce((sum, request) => sum + request.refundFen, 0), 9900);
    assertBalancedRefund(fixture, 99);
  });

  it("keeps the original percentage and refund target when a partial cancellation retries", async () => {
    const fixture = paidEnrollment({ formed: true });
    const today = dayjs().format("YYYY-MM-DD");
    seed.db.prepare("UPDATE schedules SET start_date=?,end_date=? WHERE id=?")
      .run(today, today, seed.individualScheduleId);
    const accepted = [];
    const attempted = [];
    let failSecond = true;
    const refundWechat = async (request) => {
      attempted.push(request);
      if (request.tradeNo === fixture.charges[1].tradeNo && failSecond) {
        failSecond = false;
        throw new Error("QA partial cancellation interrupted");
      }
      accepted.push(request);
    };
    await assert.rejects(cancelEnrollment(fixture.id, seed.userId, { refundWechat }), /partial cancellation interrupted/);
    assert.equal(fixture.enrollment().status, "joined");
    assert.equal(fixture.enrollment().pay_status, "paid");
    assertBalancedRefund(fixture, 20);

    const cancelled = await cancelEnrollment(fixture.id, seed.userId, { refundWechat });
    // The ladder rounds half of the original 99 yuan down to 49. Reapplying it
    // to the remaining 79 yuan would incorrectly change the original target.
    assert.equal(cancelled.refundPercent, 50);
    assert.equal(cancelled.refundAmount, 49);
    assert.equal(fixture.enrollment().status, "cancelled");
    assert.equal(fixture.enrollment().pay_status, "refunded");
    assertBalancedRefund(fixture, 49);
    assert.deepEqual(accepted.map((request) => request.refundFen), [2000, 2900]);
    const secondAttempts = attempted.filter((request) => request.tradeNo === fixture.charges[1].tradeNo);
    assert.equal(secondAttempts.length, 2);
    assert.equal(secondAttempts[0].refundNo, secondAttempts[1].refundNo);
    const callCount = attempted.length;
    await assert.rejects(cancelEnrollment(fixture.id, seed.userId, { refundWechat }), { status: 400 });
    assert.equal(attempted.length, callCount);
    assertBalancedRefund(fixture, 49);
  });

  it("reuses the external refund idempotency key after the provider succeeds but local booking fails", async () => {
    const fixture = paidEnrollment({ amounts: [99] });
    const requests = [];
    const providerRefunds = new Map();
    const refundWechat = async (request) => {
      requests.push(request);
      // A real provider also treats the merchant refund number as an
      // idempotency key. A retry with a new number would refund twice.
      providerRefunds.set(request.refundNo, request.refundFen);
    };
    rejectRefundLedger();
    await assert.rejects(refundEnrollmentToPayers(fixture.enrollment(), { amount: 99, refundWechat }), /QA refund ledger unavailable/);
    assert.equal(requests.length, 1, "The injected failure happens after the provider accepted the refund");
    assertBalancedRefund(fixture, 0);
    seed.db.exec("DROP TRIGGER qa_reject_refund_ledger");
    await refundEnrollmentToPayers(fixture.enrollment(), { amount: 99, refundWechat });
    assert.equal(new Set(requests.map((request) => request.refundNo)).size, 1);
    assert.equal([...providerRefunds.values()].reduce((sum, amount) => sum + amount, 0), 9900);
    assertBalancedRefund(fixture, 99);
  });

  it("rolls back wallet credit, wallet ledger, and source refund amount when refund booking fails", async () => {
    const fixture = paidEnrollment({ amounts: [99], channel: "wallet" });
    seed.db.prepare("UPDATE users SET wallet_balance=137 WHERE id=?").run(seed.userId);
    rejectRefundLedger();
    await assert.rejects(refundEnrollmentToPayers(fixture.enrollment(), { amount: 99 }), /QA refund ledger unavailable/);
    assert.equal(seed.db.prepare("SELECT wallet_balance FROM users WHERE id=?").get(seed.userId).wallet_balance, 137);
    assert.equal(seed.db.prepare("SELECT COUNT(*) AS n FROM wallet_ledger WHERE scene='refund' AND ref_id=?").get(fixture.id).n, 0);
    assertBalancedRefund(fixture, 0);
    seed.db.exec("DROP TRIGGER qa_reject_refund_ledger");
    await refundEnrollmentToPayers(fixture.enrollment(), { amount: 99 });
    assert.equal(seed.db.prepare("SELECT wallet_balance FROM users WHERE id=?").get(seed.userId).wallet_balance, 236);
    assert.equal(seed.db.prepare("SELECT COUNT(*) AS n FROM wallet_ledger WHERE scene='refund' AND ref_id=?").get(fixture.id).n, 1);
    assertBalancedRefund(fixture, 99);
  });

  it("blocks dissolution while an unfinished percentage cancellation would otherwise reduce its refund", async () => {
    const fixture = paidEnrollment({ formed: true });
    const today = dayjs().format("YYYY-MM-DD");
    seed.db.prepare("UPDATE schedules SET start_date=?,end_date=? WHERE id=?")
      .run(today, today, seed.individualScheduleId);
    await assert.rejects(cancelEnrollment(fixture.id, seed.userId, {
      refundWechat: async (request) => {
        if (request.tradeNo === fixture.charges[1].tradeNo) throw new Error("QA pending percentage cancellation");
      },
    }), /pending percentage cancellation/);
    const beforeRefunds = assertBalancedRefund(fixture, 20);
    const beforeEnrollment = fixture.enrollment();
    const beforeSchedule = seed.db.prepare("SELECT * FROM schedules WHERE id=?").get(seed.individualScheduleId);
    await assert.rejects(dissolveSchedule(seed.individualScheduleId, {
      reason: "QA天气原因解散",
      actor: "organizer",
      actorId: seed.userId,
    }), (error) => {
      assert.equal(error.status, 409);
      assert.match(error.message, /先完成.*取消|取消.*完成/);
      return true;
    });
    assert.deepEqual(refundRows(fixture.id), beforeRefunds);
    assert.deepEqual(fixture.enrollment(), beforeEnrollment);
    assert.deepEqual(seed.db.prepare("SELECT * FROM schedules WHERE id=?").get(seed.individualScheduleId), beforeSchedule);
    assertBalancedRefund(fixture, 20);
  });

  it("resumes the full dissolution plan through a refund failure and a later final-status failure", async () => {
    const fixture = paidEnrollment({ channel: "wallet" });
    seed.db.prepare("UPDATE users SET wallet_balance=137 WHERE id=?").run(seed.userId);
    const options = { reason: "QA人数不足解散", actor: "organizer", actorId: seed.userId };
    seed.db.exec(`CREATE TEMP TRIGGER qa_reject_refund_ledger
      BEFORE INSERT ON payments WHEN NEW.status='refunded' AND NEW.refund_of=${fixture.charges[1].id}
      BEGIN SELECT RAISE(ABORT, 'QA second dissolution refund unavailable'); END;`);
    await assert.rejects(dissolveSchedule(seed.individualScheduleId, options), /second dissolution refund unavailable/);
    assertBalancedRefund(fixture, 40);
    assert.equal(fixture.enrollment().status, "joined");
    assert.equal(seed.db.prepare("SELECT wallet_balance FROM users WHERE id=?").get(seed.userId).wallet_balance, 177);

    seed.db.exec("DROP TRIGGER qa_reject_refund_ledger");
    seed.db.exec(`CREATE TEMP TRIGGER qa_reject_dissolve_update
      BEFORE UPDATE OF status ON schedules WHEN NEW.status='cancelled'
      BEGIN SELECT RAISE(ABORT, 'QA dissolution status temporarily unavailable'); END;`);
    await assert.rejects(dissolveSchedule(seed.individualScheduleId, options), /dissolution status temporarily unavailable/);
    const completeRefunds = assertBalancedRefund(fixture, 99);
    const walletRefunds = seed.db.prepare("SELECT * FROM wallet_ledger WHERE scene='refund' AND ref_id=? ORDER BY id").all(fixture.id);
    assert.equal(walletRefunds.length, 2);
    assert.equal(fixture.enrollment().status, "joined");
    assert.equal(seed.db.prepare("SELECT status FROM schedules WHERE id=?").get(seed.individualScheduleId).status, "recruiting");
    assert.equal(seed.db.prepare("SELECT wallet_balance FROM users WHERE id=?").get(seed.userId).wallet_balance, 236);

    seed.db.exec("DROP TRIGGER qa_reject_dissolve_update");
    const dissolved = await dissolveSchedule(seed.individualScheduleId, options);
    assert.equal(dissolved.status, "cancelled");
    assert.equal(dissolved.cancelled, 1);
    assert.equal(dissolved.refunded, 1);
    assert.equal(dissolved.refundAmount, 99);
    assert.equal(dissolved.refunds.length, 2);
    assert.equal(fixture.enrollment().status, "cancelled");
    assert.equal(fixture.enrollment().pay_status, "refunded");
    assert.deepEqual(refundRows(fixture.id), completeRefunds);
    assert.deepEqual(seed.db.prepare("SELECT * FROM wallet_ledger WHERE scene='refund' AND ref_id=? ORDER BY id").all(fixture.id), walletRefunds);
    assert.equal(seed.db.prepare("SELECT wallet_balance FROM users WHERE id=?").get(seed.userId).wallet_balance, 236);
    assertBalancedRefund(fixture, 99);
  });
});
