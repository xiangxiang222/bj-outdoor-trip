const { getDb } = require("../db");
const { parseIdCard, lifeStageFromPerson } = require("./idcard");
const { maskName } = require("./biz");
const { addPoints, isMember, quoteForSchedule, enrolledCount, maybeMatchGuide, attachAssetHost } = require("./helpers");
const config = require("../config");

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

function publicUserProfile(user, req) {
  if (!user || user.deleted_at) return null;
  const parsed = user.id_card ? parseIdCard(user.id_card) : { valid: false };
  const stage = lifeStageFromPerson({ idCard: user.id_card, birthday: user.birthday });
  const tripCount = getDb()
    .prepare("SELECT COUNT(*) AS n FROM enrollments WHERE user_id=? AND status='joined'")
    .get(user.id).n;
  return {
    id: user.id,
    nickname: user.nickname,
    avatar: attachAssetHost(req, user.avatar) || "",
    gender: user.gender || parsed.gender || "",
    lifeStage: stage.label || "",
    hometown: user.hometown || "",
    tripCount,
  };
}

function payEnrollment(enrollmentId, payerId) {
  const db = getDb();
  const en = db.prepare("SELECT * FROM enrollments WHERE id=?").get(enrollmentId);
  if (!en) fail(404, "报名不存在");
  if (en.status !== "joined") fail(400, "候补或已取消的报名不能支付");
  if (en.pay_status === "paid") fail(400, "该报名已支付");
  if (en.pay_status === "company_pending") fail(400, "公司团请由开团方统一支付");
  if (en.pay_status === "refunded") fail(400, "该报名已退款");
  const sch = db.prepare("SELECT * FROM schedules WHERE id=?").get(en.schedule_id);
  if (!sch || sch.status === "cancelled") fail(400, "该拼团已解散");
  const amount = Number(en.pay_amount || 0) || quoteForSchedule(sch, enrolledCount(sch.id), null).originPrice;
  const proxy = Number(payerId) !== Number(en.user_id);
  db.prepare("UPDATE enrollments SET pay_status='paid', pay_channel='wechat' WHERE id=?").run(en.id);
  db.prepare(
    "INSERT INTO payments (enrollment_id,user_id,schedule_id,amount,channel,status,trade_no,remark) VALUES (?,?,?,?,?,?,?,?)"
  ).run(
    en.id,
    payerId,
    sch.id,
    amount,
    "wechat",
    "success",
    `P${Date.now()}${en.id}`,
    proxy ? "行程页代付" : "行程页支付"
  );
  const traveler = db.prepare("SELECT * FROM users WHERE id=?").get(en.user_id);
  const earn = Math.floor(amount * (isMember(traveler) ? config.member.pointsBonus : 1));
  if (earn > 0 && en.user_id) addPoints(en.user_id, earn, "参加活动积分", "enrollment", en.id);
  maybeMatchGuide(en.schedule_id);
  return {
    enrollmentId: en.id,
    payStatus: "paid",
    amount,
    proxy,
  };
}

function updateScheduleTrip(scheduleId, body = {}) {
  const db = getDb();
  const sch = db.prepare("SELECT * FROM schedules WHERE id=?").get(scheduleId);
  if (!sch) fail(404, "排期不存在");
  const plateNo = body.plateNo != null ? String(body.plateNo).trim().slice(0, 16) : sch.plate_no;
  const busPhoto = body.busPhoto != null ? String(body.busPhoto).trim().slice(0, 300) : sch.bus_photo;
  const consultGroup = body.consultGroup != null ? String(body.consultGroup).trim().slice(0, 80) : sch.consult_group;
  db.prepare("UPDATE schedules SET plate_no=?, bus_photo=?, consult_group=? WHERE id=?").run(
    plateNo || "",
    busPhoto || "",
    consultGroup || "",
    scheduleId
  );
  return db.prepare("SELECT * FROM schedules WHERE id=?").get(scheduleId);
}

function chainItem(e, i, req) {
  const stage = lifeStageFromPerson({ idCard: e.id_card, birthday: e.birthday });
  return {
    index: i + 1,
    id: e.id,
    enrollmentId: e.id,
    userId: e.user_id || null,
    name: maskName(e.traveler_name),
    gender: e.gender,
    lifeStage: stage.label || "",
    avatar: attachAssetHost(req, e.avatar) || "",
    payStatus: e.pay_status,
    travelerType: e.traveler_type,
    status: e.status,
    waitlisted: e.status === "waitlist",
    seatNo: e.seat_no || "",
    createdAt: e.created_at,
    canPay: e.status === "joined" && e.pay_status === "unpaid",
  };
}

function galleryOfSchedule(route, req) {
  const list = [];
  if (route?.cover) list.push(attachAssetHost(req, route.cover));
  for (const g of route?.gallery || []) {
    const url = attachAssetHost(req, g);
    if (url && !list.includes(url)) list.push(url);
  }
  return list;
}

module.exports = {
  publicUserProfile,
  payEnrollment,
  updateScheduleTrip,
  chainItem,
  galleryOfSchedule,
  fail,
};
