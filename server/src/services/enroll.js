const dayjs = require("dayjs");
const { getDb } = require("../db");
const { addPoints, enrolledCount } = require("./helpers");

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

function cancelEnrollment(enrollmentId, userId, options = {}) {
  const db = getDb();
  const en = db.prepare("SELECT * FROM enrollments WHERE id=?").get(enrollmentId);
  if (!en) fail(404, "报名不存在");
  if (!options.admin && Number(en.user_id) !== Number(userId)) fail(403, "只能取消自己的报名");
  if (en.status === "cancelled") fail(400, "该报名已取消");

  const sch = db.prepare("SELECT * FROM schedules WHERE id=?").get(en.schedule_id);
  if (!sch) fail(400, "排期不存在");
  if (sch.status === "cancelled" && !options.force) fail(400, "拼团已解散，报名已取消");
  if (!options.force && !options.admin && dayjs(sch.start_date).isBefore(dayjs(), "day")) {
    fail(400, "活动已开始，无法取消报名");
  }

  const paid = en.pay_status === "paid" && Number(en.pay_amount || 0) > 0;
  const nextPay = paid ? "refunded" : en.pay_status;

  const run = db.transaction(() => {
    db.prepare("UPDATE enrollments SET status='cancelled', pay_status=? WHERE id=?").run(nextPay, en.id);
    if (paid) {
      db.prepare(
        `INSERT INTO payments (enrollment_id,user_id,schedule_id,amount,channel,status,trade_no,remark) VALUES (?,?,?,?,?,?,?,?)`
      ).run(
        en.id,
        en.user_id,
        sch.id,
        en.pay_amount,
        en.pay_channel || "wechat",
        "refunded",
        `C${Date.now()}${en.id}`,
        options.admin ? "后台取消报名退款" : "用户取消报名退款"
      );
      if (en.points_used) addPoints(en.user_id, en.points_used, "取消报名退还积分", "enrollment", en.id);
    }
    const n = enrolledCount(sch.id);
    if (n < sch.min_group_size && sch.guide_id) {
      db.prepare("UPDATE guides SET status='idle' WHERE id=? AND status='assigned'").run(sch.guide_id);
      db.prepare("UPDATE schedules SET guide_id=NULL, status='recruiting' WHERE id=?").run(sch.id);
    }
  });
  run();

  return {
    enrollmentId: en.id,
    status: "cancelled",
    payStatus: nextPay,
    refunded: paid,
    refundAmount: paid ? Number(en.pay_amount) : 0,
  };
}

function canCancelEnrollment(en, scheduleStatus, startDate) {
  return (
    en.status !== "cancelled" &&
    scheduleStatus !== "cancelled" &&
    !dayjs(startDate).isBefore(dayjs(), "day")
  );
}

module.exports = { cancelEnrollment, canCancelEnrollment };
