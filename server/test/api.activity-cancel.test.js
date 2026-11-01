const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { harness, auth } = require("./http");
const { signUser } = require("../src/middleware/auth");

const NOW = Date.parse("2026-10-25T16:30:00Z"); // Beijing 2026-10-26 00:30.

describe("activity cancellation before its start", () => {
  let agent, seed;
  beforeEach(() => { ({ agent, seed } = harness()); });
  function token(id = seed.userId) {
    return signUser(seed.db.prepare("SELECT * FROM users WHERE id=?").get(id));
  }
  function configure(patch = {}) {
    const values = {
      channel: "activity", review_status: "approved", status: "recruiting",
      start_date: "2026-10-26", end_date: "2026-10-26", meetup_time: "01:00",
      started_at: null, completed_at: null, offer_type: "free", heat_mode: "off",
      ...patch,
    };
    seed.db.prepare(`UPDATE schedules SET ${Object.keys(values).map((key) => key + "=?").join(",")} WHERE id=?`)
      .run(...Object.values(values), seed.individualScheduleId);
  }
  async function join() {
    const result = await agent.post("/api/enroll").set(auth(token())).send({
      scheduleId: seed.individualScheduleId, travelerName: "参与者", travelerPhone: "13800138000",
    }).expect(200);
    return result.body.data.enrollmentId;
  }
  async function order(id) {
    const result = await agent.get(`/api/orders/${id}`).set(auth(token())).expect(200);
    return result.body.data;
  }
  async function publish(patch = {}) {
    const result = await agent.post("/api/trips").set(auth(token())).send({
      channel: "activity", activityKind: "掼蛋", title: "周一掼蛋局", startDate: "2026-10-26",
      meetupTime: "01:00", meetupPoint: "社区咖啡馆", originPrice: 0, ...patch,
    }).expect(200);
    return result.body.data.id;
  }

  for (const payStatus of ["free", "unpaid"]) {
    it(`cancels a ${payStatus} order on the activity day before meetup and releases its seat`, async (t) => {
      t.mock.method(Date, "now", () => NOW);
      configure();
      const id = await join();
      seed.db.prepare("UPDATE enrollments SET pay_status=?,pay_amount=? WHERE id=?").run(payStatus, payStatus === "unpaid" ? 100 : 0, id);
      const before = await order(id);
      assert.equal(before.canCancel, true);
      assert.match(before.refundHint, /活动开始前可取消/);
      const result = await agent.post(`/api/orders/${id}/cancel`).set(auth(token())).expect(200);
      assert.equal(result.body.data.status, "cancelled");
      assert.equal(result.body.data.refundAmount, 0);
      assert.equal(result.body.data.refunded, false);
      assert.equal(seed.db.prepare("SELECT COUNT(*) AS n FROM enrollments WHERE schedule_id=? AND status='joined'").get(seed.individualScheduleId).n, 0);
      assert.equal(seed.db.prepare("SELECT COUNT(*) AS n FROM payments WHERE enrollment_id=? AND status='refunded'").get(id).n, 0);
      assert.equal((await order(id)).canCancel, false);
    });
  }

  it("refunds every collected portion to its original payer even while the order remains partly unpaid", async (t) => {
    t.mock.method(Date, "now", () => NOW);
    configure();
    const id = await join();
    seed.db.prepare("UPDATE enrollments SET pay_status='unpaid',pay_amount=120 WHERE id=?").run(id);
    const walletBefore = seed.db.prepare("SELECT id,wallet_balance FROM users WHERE id IN (?,?) ORDER BY id").all(seed.userId, seed.companyUserId);
    const charge = seed.db.prepare("INSERT INTO payments (enrollment_id,user_id,schedule_id,amount,channel,status,trade_no,scene) VALUES (?,?,?,?,?,'success',?,'enrollment')");
    charge.run(id, seed.userId, seed.individualScheduleId, 70, "wallet", "ACTIVITY-SELF");
    charge.run(id, seed.companyUserId, seed.individualScheduleId, 30, "wallet", "ACTIVITY-HELPER");
    const before = await order(id);
    assert.equal(before.canCancel, true);
    assert.equal(before.refundPercent, 100);
    assert.equal(before.refundAmount, 100);
    const result = await agent.post(`/api/orders/${id}/cancel`).set(auth(token())).expect(200);
    assert.equal(result.body.data.refundAmount, 100);
    assert.equal(result.body.data.payStatus, "refunded");
    assert.deepEqual(result.body.data.refunds.map((row) => [row.userId, row.amount, row.channel]), [
      [seed.userId, 70, "wallet"], [seed.companyUserId, 30, "wallet"],
    ]);
    const walletAfter = seed.db.prepare("SELECT id,wallet_balance FROM users WHERE id IN (?,?) ORDER BY id").all(seed.userId, seed.companyUserId);
    for (let i = 0; i < walletBefore.length; i += 1) {
      assert.equal(walletAfter[i].wallet_balance - walletBefore[i].wallet_balance, walletBefore[i].id === seed.userId ? 70 : 30);
    }
    assert.deepEqual(seed.db.prepare("SELECT refunded_amount FROM payments WHERE enrollment_id=? AND status='success' ORDER BY id").all(id).map((row) => row.refunded_amount), [70, 30]);
    await agent.post(`/api/orders/${id}/cancel`).set(auth(token())).expect(400);
  });

  it("keeps a WeChat payment refund tied to its original charge", async (t) => {
    t.mock.method(Date, "now", () => NOW);
    configure();
    const id = await join();
    seed.db.prepare("UPDATE enrollments SET pay_status='paid',pay_amount=20 WHERE id=?").run(id);
    const charge = seed.db.prepare("INSERT INTO payments (enrollment_id,user_id,schedule_id,amount,channel,status,trade_no,scene) VALUES (?,?,?,20,'wechat','success','ACTIVITY-WECHAT','enrollment')")
      .run(id, seed.userId, seed.individualScheduleId).lastInsertRowid;
    const result = await agent.post(`/api/orders/${id}/cancel`).set(auth(token())).expect(200);
    assert.equal(result.body.data.refundPercent, 100);
    assert.equal(result.body.data.refundAmount, 20);
    assert.equal(result.body.data.refunds[0].originalTradeNo, "ACTIVITY-WECHAT");
    assert.equal(result.body.data.refunds[0].channel, "wechat");
    const refund = seed.db.prepare("SELECT amount,channel,refund_of FROM payments WHERE enrollment_id=? AND status='refunded'").get(id);
    assert.deepEqual(refund, { amount: 20, channel: "wechat", refund_of: Number(charge) });
  });

  it("blocks order cancellation at the start minute or after explicit start and completion without payment changes", async (t) => {
    t.mock.method(Date, "now", () => NOW);
    configure();
    const id = await join();
    seed.db.prepare("UPDATE enrollments SET pay_status='paid',pay_amount=20 WHERE id=?").run(id);
    const before = seed.db.prepare("SELECT * FROM enrollments WHERE id=?").get(id);
    for (const patch of [
      { meetup_time: "00:30" }, { start_date: "2026-10-25" },
      { started_at: "2026-10-26 00:00" }, { completed_at: "2026-10-26 00:00" },
      { status: "finished" }, { status: "completed" }, { status: "ended" },
    ]) {
      configure(patch);
      assert.equal((await order(id)).canCancel, false);
      const result = await agent.post(`/api/orders/${id}/cancel`).set(auth(token())).expect(400);
      assert.match(result.body.message, /活动已开始或结束/);
      assert.deepEqual(seed.db.prepare("SELECT * FROM enrollments WHERE id=?").get(id), before);
      assert.equal(seed.db.prepare("SELECT COUNT(*) AS n FROM payments WHERE enrollment_id=?").get(id).n, 0);
    }
  });

  for (const reviewStatus of ["pending", "rejected"]) {
    it(`allows the host to withdraw a ${reviewStatus} submission even when its proposed date passed`, async (t) => {
      t.mock.method(Date, "now", () => NOW);
      const id = await publish({ startDate: "2026-10-25" });
      seed.db.prepare("UPDATE schedules SET review_status=? WHERE id=?").run(reviewStatus, id);
      const mine = await agent.get(`/api/schedules/${id}`).set(auth(token())).expect(200);
      assert.equal(mine.body.data.canDissolve, true);
      const result = await agent.post(`/api/schedules/${id}/dissolve`).set(auth(token())).send({ reason: "时间安排有变，撤回活动" }).expect(200);
      assert.equal(result.body.data.status, "cancelled");
      const detail = await agent.get(`/api/schedules/${id}`).set(auth(token())).expect(200);
      assert.equal(detail.body.data.canDissolve, false);
      assert.equal(detail.body.data.status, "cancelled");
    });
  }

  it("allows the host to cancel an approved activity before meetup and refunds its paid participant", async (t) => {
    t.mock.method(Date, "now", () => NOW);
    const id = await publish();
    seed.db.prepare("UPDATE schedules SET review_status='approved' WHERE id=?").run(id);
    const enrollmentId = seed.db.prepare("INSERT INTO enrollments (schedule_id,user_id,traveler_name,traveler_phone,status,pay_status,pay_amount,pay_channel) VALUES (?,?,?,?,'joined','paid',20,'wallet')")
      .run(id, seed.companyUserId, "参与者", "13900139000").lastInsertRowid;
    const walletBefore = seed.db.prepare("SELECT wallet_balance FROM users WHERE id=?").get(seed.companyUserId).wallet_balance;
    const mine = await agent.get(`/api/schedules/${id}`).set(auth(token())).expect(200);
    assert.equal(mine.body.data.canDissolve, true);
    const outsider = await agent.get(`/api/schedules/${id}`).set(auth(token(seed.companyUserId))).expect(200);
    assert.equal(outsider.body.data.canDissolve, false);
    await agent.post(`/api/schedules/${id}/dissolve`).set(auth(token(seed.companyUserId))).send({ reason: "不能取消别人的活动" }).expect(403);
    const result = await agent.post(`/api/schedules/${id}/dissolve`).set(auth(token())).send({ reason: "场地临时关闭" }).expect(200);
    assert.equal(result.body.data.refundAmount, 20);
    assert.equal(result.body.data.refunded, 1);
    assert.deepEqual(seed.db.prepare("SELECT status,pay_status FROM enrollments WHERE id=?").get(enrollmentId), { status: "cancelled", pay_status: "refunded" });
    assert.equal(seed.db.prepare("SELECT wallet_balance FROM users WHERE id=?").get(seed.companyUserId).wallet_balance - walletBefore, 20);
  });

  it("blocks host cancellation after activity start or completion, including stale review flags", async (t) => {
    t.mock.method(Date, "now", () => NOW);
    for (const patch of [
      { meetup_time: "00:30" }, { started_at: "2026-10-26 00:00" },
      { completed_at: "2026-10-26 00:00" }, { status: "finished" },
      { review_status: "pending", started_at: "2026-10-26 00:00" },
    ]) {
      configure(patch);
      const detail = await agent.get(`/api/schedules/${seed.individualScheduleId}`).set(auth(token())).expect(200);
      assert.equal(detail.body.data.canDissolve, false);
      const before = seed.db.prepare("SELECT * FROM schedules WHERE id=?").get(seed.individualScheduleId);
      const result = await agent.post(`/api/schedules/${seed.individualScheduleId}/dissolve`).set(auth(token())).send({ reason: "开场后不能取消" }).expect(400);
      assert.match(result.body.message, /活动已开始或结束/);
      assert.deepEqual(seed.db.prepare("SELECT * FROM schedules WHERE id=?").get(seed.individualScheduleId), before);
    }
  });
});
