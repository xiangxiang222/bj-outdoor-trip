const { getDb } = require("../db");
const { lifeStageFromPerson } = require("./idcard");
const { maskName } = require("./biz");
const { attachAssetHost } = require("./helpers");
const { publicUserProfile } = require("./profile");
const { payEnrollment } = require("./payment");

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
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
    applied: e.status === "applied",
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
