const { getDb } = require("../db");
const { addPoints } = require("./helpers");
const { buildCancelSms, sendSms } = require("./sms");
const { releaseCouponByEnrollment } = require("./coupons");

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

function dissolveSchedule(scheduleId, { reason, actor, actorId } = {}) {
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

  const run = db.transaction(() => {
    db.prepare(
      `UPDATE schedules SET status='cancelled', cancel_reason=?, cancelled_at=datetime('now','localtime'), cancelled_by=?, cancelled_by_id=? WHERE id=?`
    ).run(trimmed, actor || "organizer", actorId || 0, sch.id);

    if (sch.guide_id) {
      db.prepare("UPDATE guides SET status='idle' WHERE id=? AND status='assigned'").run(sch.guide_id);
      db.prepare("UPDATE schedules SET guide_id=NULL WHERE id=?").run(sch.id);
    }

    for (const en of enrollments) {
      const paid = en.pay_status === "paid" && Number(en.pay_amount || 0) > 0;
      db.prepare("UPDATE enrollments SET status='cancelled', pay_status=? WHERE id=?").run(paid ? "refunded" : en.pay_status, en.id);
      releaseCouponByEnrollment(en.id);
      if (paid) {
        refunded += 1;
        refundAmount += Number(en.pay_amount);
        db.prepare(
          `INSERT INTO payments (enrollment_id,user_id,schedule_id,amount,channel,status,trade_no,remark) VALUES (?,?,?,?,?,?,?,?)`
        ).run(
          en.id,
          en.user_id,
          sch.id,
          en.pay_amount,
          en.pay_channel || "wechat",
          "refunded",
          `R${Date.now()}${en.id}`,
          `解散退款：${trimmed}`
        );
        if (en.points_used) addPoints(en.user_id, en.points_used, "解散退还积分", "enrollment", en.id);
      }
      const content = buildCancelSms({
        title,
        date: sch.start_date,
        reason: trimmed,
        refunded: paid,
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
    status: "cancelled",
    transferred,
  };
}

function dissolveAllSchedules({ reason, actorId } = {}) {
  const trimmed = String(reason || "").trim();
  if (!trimmed) fail(400, "请填写解散理由");
  if (trimmed.length > 200) fail(400, "解散理由请控制在 200 字以内");
  const ids = getDb()
    .prepare("SELECT id FROM schedules WHERE status!='cancelled' ORDER BY id")
    .all()
    .map((row) => row.id);
  if (!ids.length) fail(400, "当前没有可解散的拼团");
  const results = ids.map((id) => dissolveSchedule(id, { reason: trimmed, actor: "admin", actorId }));
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
