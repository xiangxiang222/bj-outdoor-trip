const { getDb } = require("../db");
const { addPoints, clawActivityPoints } = require("./helpers");
const { reverseEnrollReferral } = require("./referral");
const { buildCancelSms, sendSms } = require("./sms");
const { releaseCouponByEnrollment } = require("./coupons");
const { refundableOf } = require("./pay-ledger");
const { refundEnrollmentToPayers } = require("./payment");

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

async function dissolveSchedule(scheduleId, { reason, actor, actorId } = {}) {
  const db = getDb();
  const sch = db.prepare("SELECT * FROM schedules WHERE id=?").get(scheduleId);
  if (!sch) fail(400, "拼团不存在");
  if (sch.status === "cancelled") fail(400, "该拼团已解散");
  const trimmed = String(reason || "").trim();
  if (!trimmed) fail(400, "请填写解散理由");
  if (trimmed.length > 200) fail(400, "解散理由请控制在 200 字以内");
  if (actor === "organizer") {
    if (!sch.organizer_id || Number(sch.organizer_id) !== Number(actorId)) {
      fail(403, "只有发起人可以解散拼团");
    }
  }

  const route = db.prepare("SELECT title FROM routes WHERE id=?").get(sch.route_id);
  const enrollments = db.prepare("SELECT * FROM enrollments WHERE schedule_id=? AND status!='cancelled'").all(sch.id);
  const title = route?.title || "活动";
  let refunded = 0;
  let refundAmount = 0;
  let smsCount = 0;
  const refunds = [];

  for (const en of enrollments) {
    const money = refundableOf(en);
    if (money > 0) {
      clawActivityPoints(en.user_id, en.id, money, money);
      const rows = await refundEnrollmentToPayers(en, { amount: money, remark: `解散退款：${trimmed}` });
      refunds.push(...rows.map((row) => ({ ...row, enrollmentId: en.id })));
      refunded += 1;
      refundAmount += money;
    }
    reverseEnrollReferral(en.id);
  }

  const run = db.transaction(() => {
    db.prepare(
      `UPDATE schedules SET status='cancelled', cancel_reason=?, cancelled_at=datetime('now','localtime'), cancelled_by=?, cancelled_by_id=? WHERE id=?`
    ).run(trimmed, actor || "organizer", actorId || 0, sch.id);

    if (sch.guide_id) {
      db.prepare("UPDATE guides SET status='idle' WHERE id=? AND status='assigned'").run(sch.guide_id);
      db.prepare("UPDATE schedules SET guide_id=NULL WHERE id=?").run(sch.id);
    }

    for (const en of enrollments) {
      const hasRefund = refunds.some((row) => Number(row.enrollmentId) === Number(en.id));
      const nextPay = hasRefund || (en.pay_status === "paid" && Number(en.pay_amount || 0) > 0) ? "refunded" : en.pay_status;
      db.prepare("UPDATE enrollments SET status='cancelled', pay_status=? WHERE id=?").run(nextPay, en.id);
      releaseCouponByEnrollment(en.id);
      if (en.points_used && hasRefund) addPoints(en.user_id, en.points_used, "解散退还积分", "enrollment", en.id);
      const content = buildCancelSms({
        title,
        date: sch.start_date,
        reason: trimmed,
        refunded: hasRefund,
      });
      const sms = sendSms({
        phone: en.traveler_phone,
        scene: "cancel",
        content,
        refType: "schedule",
        refId: sch.id,
      });
      if (sms.status === "sent") smsCount += 1;
    }
  });
  run();

  const { transferDissolved } = require("./fallback");
  const transferred = transferDissolved(enrollments);

  return {
    scheduleId: sch.id,
    reason: trimmed,
    cancelled: enrollments.length,
    refunded,
    refundAmount,
    smsCount,
    refunds,
    status: "cancelled",
    transferred,
  };
}

async function dissolveAllSchedules({ reason, actorId } = {}) {
  const trimmed = String(reason || "").trim();
  if (!trimmed) fail(400, "请填写解散理由");
  if (trimmed.length > 200) fail(400, "解散理由请控制在 200 字以内");
  const ids = getDb()
    .prepare("SELECT id FROM schedules WHERE status!='cancelled' ORDER BY id")
    .all()
    .map((row) => row.id);
  if (!ids.length) fail(400, "当前没有可解散的拼团");
  const results = [];
  for (const id of ids) {
    results.push(await dissolveSchedule(id, { reason: trimmed, actor: "admin", actorId }));
  }
  return {
    count: results.length,
    cancelled: results.reduce((sum, row) => sum + row.cancelled, 0),
    refunded: results.reduce((sum, row) => sum + row.refunded, 0),
    refundAmount: results.reduce((sum, row) => sum + row.refundAmount, 0),
    smsCount: results.reduce((sum, row) => sum + row.smsCount, 0),
    reason: trimmed,
  };
}

module.exports = { dissolveSchedule, dissolveAllSchedules };
