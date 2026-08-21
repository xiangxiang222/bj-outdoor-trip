const { getDb } = require("../db");
const { quoteForSchedule, enrolledCount, maybeMatchGuide } = require("./helpers");
const { firstFreeSeat, assertSeatAvailable } = require("./seats");

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

function optionsForSchedule(scheduleId, reqLimit = 8) {
  const db = getDb();
  const sch = db.prepare("SELECT * FROM schedules WHERE id=?").get(scheduleId);
  if (!sch) return { sameRoute: [], otherRecruiting: [] };
  const mapRow = (row) => ({
    id: row.id,
    startDate: row.start_date,
    title: row.title,
    enrolled: enrolledCount(row.id),
    minGroupSize: row.min_group_size,
    maxSeats: row.max_seats,
    remain: Math.max(0, row.max_seats - enrolledCount(row.id)),
  });
  const sameRoute = db
    .prepare(
      `SELECT s.*, r.title FROM schedules s JOIN routes r ON r.id=s.route_id
       WHERE s.route_id=? AND s.id!=? AND s.status!='cancelled' AND IFNULL(s.review_status,'approved')='approved'
         AND s.start_date>=date('now')
       ORDER BY s.start_date LIMIT ?`
    )
    .all(sch.route_id, sch.id, reqLimit)
    .map(mapRow);
  const otherRecruiting = db
    .prepare(
      `SELECT s.*, r.title FROM schedules s JOIN routes r ON r.id=s.route_id
       WHERE s.id!=? AND s.route_id!=? AND s.status!='cancelled' AND IFNULL(s.review_status,'approved')='approved'
         AND s.start_date>=date('now')
       ORDER BY s.start_date LIMIT ?`
    )
    .all(sch.id, sch.route_id, reqLimit)
    .map(mapRow);
  return { sameRoute, otherRecruiting };
}

function setFallbacks(enrollmentId, userId, { scheduleIds, autoAlt } = {}) {
  const db = getDb();
  const en = db.prepare("SELECT * FROM enrollments WHERE id=?").get(enrollmentId);
  if (!en) fail(404, "报名不存在");
  if (Number(en.user_id) !== Number(userId)) fail(403, "只能设置自己的候选团");
  db.prepare("UPDATE enrollments SET auto_alt=? WHERE id=?").run(autoAlt ? 1 : 0, en.id);
  db.prepare("DELETE FROM enrollment_fallbacks WHERE enrollment_id=?").run(en.id);
  const ids = Array.isArray(scheduleIds) ? scheduleIds.map(Number).filter((n) => n && n !== Number(en.schedule_id)) : [];
  const seen = new Set();
  for (const id of ids.slice(0, 6)) {
    if (seen.has(id)) continue;
    const sch = db.prepare("SELECT * FROM schedules WHERE id=? AND status!='cancelled'").get(id);
    if (!sch) continue;
    seen.add(id);
    db.prepare("INSERT INTO enrollment_fallbacks (enrollment_id, schedule_id, kind) VALUES (?,?,?)").run(
      en.id,
      id,
      Number(sch.route_id) === Number(db.prepare("SELECT route_id FROM schedules WHERE id=?").get(en.schedule_id).route_id)
        ? "alt"
        : "candidate"
    );
  }
  return listFallbacks(en.id);
}

function listFallbacks(enrollmentId) {
  return getDb()
    .prepare(
      `SELECT f.schedule_id AS id, f.kind, s.start_date AS startDate, r.title
       FROM enrollment_fallbacks f
       JOIN schedules s ON s.id=f.schedule_id
       JOIN routes r ON r.id=s.route_id
       WHERE f.enrollment_id=? ORDER BY f.kind, s.start_date`
    )
    .all(enrollmentId);
}

function copyJoin(en, target) {
  const db = getDb();
  if (enrolledCount(target.id) >= Number(target.max_seats)) return null;
  const dup = db
    .prepare("SELECT id FROM enrollments WHERE schedule_id=? AND user_id=? AND status!='cancelled'")
    .get(target.id, en.user_id);
  if (dup) return null;
  if (en.id_card) {
    const sameCard = db
      .prepare("SELECT id FROM enrollments WHERE schedule_id=? AND upper(id_card)=? AND status!='cancelled'")
      .get(target.id, String(en.id_card).toUpperCase());
    if (sameCard) return null;
  }
  let seat = null;
  try {
    seat = en.seat_no ? assertSeatAvailable(target.id, target.max_seats, en.seat_no) : firstFreeSeat(target.id, target.max_seats);
  } catch {
    seat = firstFreeSeat(target.id, target.max_seats);
  }
  if (!seat) return null;
  const user = db.prepare("SELECT * FROM users WHERE id=?").get(en.user_id);
  const quote = quoteForSchedule(target, enrolledCount(target.id) + 1, user);
  const oldPay = Number(en.pay_amount || 0);
  const newPay = Number(quote.price || 0);
  const paid = en.pay_status === "paid" && oldPay > 0;
  let payStatus = paid ? "paid" : en.pay_status === "company_pending" ? "company_pending" : "unpaid";
  let payAmount = newPay;
  let extraPay = 0;
  let refund = 0;
  if (paid) {
    if (newPay > oldPay) {
      payStatus = "unpaid";
      extraPay = newPay - oldPay;
      payAmount = newPay;
    } else if (newPay < oldPay) {
      refund = oldPay - newPay;
      payAmount = newPay;
    }
  }
  const info = db
    .prepare(
      `INSERT INTO enrollments (schedule_id,user_id,traveler_name,traveler_phone,id_card,gender,birthday,hometown,traveler_type,pay_status,pay_amount,join_mode,status,seat_no,insurance_code,insurance_fee,emergency_name,emergency_phone,waiver_accepted_at,health_declared_at,auto_alt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      target.id,
      en.user_id,
      en.traveler_name,
      en.traveler_phone,
      en.id_card,
      en.gender,
      en.birthday,
      en.hometown,
      en.traveler_type || "adult",
      payStatus,
      payAmount,
      "fallback",
      "joined",
      seat,
      en.insurance_code || "none",
      en.insurance_fee || 0,
      en.emergency_name,
      en.emergency_phone,
      en.waiver_accepted_at,
      en.health_declared_at,
      0
    );
  maybeMatchGuide(target.id);
  return {
    enrollmentId: Number(info.lastInsertRowid),
    scheduleId: target.id,
    title: db.prepare("SELECT title FROM routes WHERE id=?").get(target.route_id)?.title || "",
    startDate: target.start_date,
    extraPay,
    refund,
    payStatus,
  };
}

function tryTransfer(en) {
  const db = getDb();
  const user = db.prepare("SELECT * FROM users WHERE id=?").get(en.user_id);
  if (user && user.is_virtual) return null;
  const picks = listFallbacks(en.id);
  for (const pick of picks) {
    const target = db.prepare("SELECT * FROM schedules WHERE id=? AND status!='cancelled'").get(pick.id);
    if (!target) continue;
    const hit = copyJoin(en, target);
    if (hit) return { ...hit, kind: pick.kind };
  }
  if (Number(en.auto_alt)) {
    const origin = db.prepare("SELECT * FROM schedules WHERE id=?").get(en.schedule_id);
    if (!origin) return null;
    const alts = db
      .prepare(
        `SELECT * FROM schedules WHERE route_id=? AND id!=? AND status!='cancelled'
         AND IFNULL(review_status,'approved')='approved' AND start_date>=date('now')
         ORDER BY start_date`
      )
      .all(origin.route_id, origin.id);
    for (const target of alts) {
      const hit = copyJoin(en, target);
      if (hit) return { ...hit, kind: "alt" };
    }
  }
  return null;
}

function transferDissolved(enrollments) {
  const out = [];
  for (const en of enrollments || []) {
    const hit = tryTransfer(en);
    if (hit) out.push({ fromEnrollmentId: en.id, ...hit });
  }
  return out;
}

module.exports = { optionsForSchedule, setFallbacks, listFallbacks, tryTransfer, transferDissolved, fail };
