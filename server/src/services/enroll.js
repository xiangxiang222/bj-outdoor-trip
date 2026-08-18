const dayjs = require("dayjs");
const { getDb } = require("../db");
const { parseIdCard } = require("./idcard");
const { calcPayable } = require("./biz");
const { addPoints, enrolledCount, waitlistCount, quoteForSchedule, maybeMatchGuide } = require("./helpers");
const { sendSms } = require("./sms");
const config = require("../config");

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

function enrollUser({ userId, scheduleId, travelerName, travelerPhone, idCard, travelerType }) {
  const db = getDb();
  const user = db.prepare("SELECT * FROM users WHERE id=?").get(userId);
  if (!user) fail(401, "请先登录");
  const sch = db.prepare("SELECT * FROM schedules WHERE id=?").get(scheduleId);
  if (!sch) fail(400, "排期不存在");
  if (sch.status === "cancelled") fail(400, "该拼团已解散，无法报名");
  if (!travelerName || !travelerPhone) fail(400, "请填写出行人姓名和手机");
  if (!idCard) fail(400, "请填写身份证号，用于实名与籍贯统计");
  const parsed = parseIdCard(idCard);
  if (!parsed.valid) fail(400, parsed.error || "身份证号不正确");
  const exist = db
    .prepare("SELECT id FROM enrollments WHERE schedule_id=? AND upper(id_card)=? AND status!='cancelled'")
    .get(sch.id, parsed.idCard);
  if (exist) fail(400, "该身份证已在本团报名");

  const occupied = enrolledCount(sch.id);
  const waitlisted = occupied >= Number(sch.max_seats);
  const quote = quoteForSchedule(sch, Math.max(waitlisted ? occupied : occupied + 1, 1), user);
  const payable = calcPayable({
    basePrice: quote.originPrice,
    memberPrice: quote.memberPrice,
    isMember: quote.isMember,
    points: 0,
    pointsConfig: config.points,
  });

  const company = sch.organizer_type === "company";
  const payStatus = company ? "company_pending" : "unpaid";
  const status = waitlisted ? "waitlist" : "joined";
  const info = db
    .prepare(
      `INSERT INTO enrollments (schedule_id,user_id,traveler_name,traveler_phone,id_card,gender,birthday,hometown,traveler_type,pay_status,pay_amount,points_used,pay_channel,join_mode,status,waitlisted_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      sch.id,
      user.id,
      travelerName,
      travelerPhone,
      parsed.idCard,
      parsed.gender,
      parsed.birthday,
      parsed.hometown,
      travelerType || "adult",
      payStatus,
      company ? 0 : payable.payAmount,
      0,
      "",
      "chain",
      status,
      waitlisted ? dayjs().format("YYYY-MM-DD HH:mm:ss") : null
    );
  const enrollmentId = Number(info.lastInsertRowid);
  if (!waitlisted) maybeMatchGuide(sch.id);
  const position = waitlisted ? waitlistCount(sch.id) : 0;
  return {
    enrollmentId,
    payStatus,
    status,
    waitlisted,
    waitlistPosition: position,
    needPay: false,
    message: waitlisted
      ? `本车已满，已加入候补（第 ${position} 位），有人取消后自动递补`
      : company
        ? "已加入公司团，费用由公司统一支付"
        : "已报名占座，费用待出行前支付",
    quote: payable,
  };
}

function promoteWaitlist(scheduleId) {
  const db = getDb();
  const sch = db.prepare("SELECT * FROM schedules WHERE id=?").get(scheduleId);
  if (!sch || sch.status === "cancelled") return null;
  if (enrolledCount(scheduleId) >= Number(sch.max_seats)) return null;
  const next = db
    .prepare("SELECT * FROM enrollments WHERE schedule_id=? AND status='waitlist' ORDER BY id LIMIT 1")
    .get(scheduleId);
  if (!next) return null;
  db.prepare("UPDATE enrollments SET status='joined', promoted_at=datetime('now','localtime') WHERE id=?").run(next.id);
  maybeMatchGuide(scheduleId);
  const route = db.prepare("SELECT title FROM routes WHERE id=?").get(sch.route_id);
  sendSms({
    phone: next.traveler_phone,
    scene: "waitlist",
    content: `【北野行】您候补的「${route?.title || "活动"}」${sch.start_date}已有空位，已为您递补占座。请留意集合通知。`,
    refType: "enrollment",
    refId: next.id,
  });
  return { enrollmentId: next.id, userId: next.user_id };
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
  const wasJoined = en.status === "joined";

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

  const promoted = wasJoined ? promoteWaitlist(sch.id) : null;

  return {
    enrollmentId: en.id,
    status: "cancelled",
    payStatus: nextPay,
    refunded: paid,
    refundAmount: paid ? Number(en.pay_amount) : 0,
    promoted: promoted ? { enrollmentId: promoted.enrollmentId } : null,
  };
}

function canCancelEnrollment(en, scheduleStatus, startDate) {
  return (
    en.status !== "cancelled" &&
    scheduleStatus !== "cancelled" &&
    !dayjs(startDate).isBefore(dayjs(), "day")
  );
}

module.exports = { enrollUser, promoteWaitlist, cancelEnrollment, canCancelEnrollment };
