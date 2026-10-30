const { getDb } = require("../db");
const { isStudent, isAlumni } = require("./helpers");
const { checkEnrollLimit, enrollLimitOf } = require("./eligibility");
const { assertComboEnroll } = require("./combo");
const { paymentBlocksFor } = require("./campus-payment-blockers");

function conflict(message = "认证状态已变化，请刷新后重试") {
  const error = new Error(message);
  error.status = 409;
  error.code = "student_revision_conflict";
  return error;
}
function assertRevision(user, revision, { optionalInitial = false } = {}) {
  if (optionalInitial && revision == null && Number(user.student_revision || 0) === 0 && !isStudent(user) && !isAlumni(user)) return;
  if (!Number.isSafeInteger(revision) || revision !== Number(user.student_revision || 0)) throw conflict();
}
function historyFor(user, action) {
  let history;
  try { history = JSON.parse(user.student_history_json || "[]"); } catch { history = []; }
  if (!Array.isArray(history)) history = [];
  history.push({ revision:Number(user.student_revision || 0) + 1, action, previousStatus:user.student_status || "", at:new Date().toISOString() });
  return JSON.stringify(history.slice(-50));
}
function activeEnrollments(userId) {
  return getDb().prepare(`SELECT e.* FROM enrollments e JOIN schedules s ON s.id=e.schedule_id
    WHERE e.user_id=? AND e.status IN ('joined','applied','waitlist') AND s.status!='cancelled'
      AND IFNULL(s.completed_at,'')='' AND s.status NOT IN ('finished','completed','ended')
      AND COALESCE(NULLIF(s.end_date,''),s.start_date)>=date('now','+8 hours')`).all(userId);
}
function management(user) {
  const impact = { paidConfirmed:0, unpaid:0, applied:0, waitlist:0 };
  for (const en of activeEnrollments(user.id)) {
    if (en.status === "joined" && en.pay_status === "paid") impact.paidConfirmed += 1;
    if (en.status === "joined" && !["paid","refunded"].includes(en.pay_status)) impact.unpaid += 1;
    if (en.status === "applied") impact.applied += 1;
    if (en.status === "waitlist") impact.waitlist += 1;
  }
  return { revision:Number(user.student_revision || 0), status:user.student_status || "", impact, paymentBlocks:paymentBlocksFor(user), priceReviews:historicalPriceReviews(user) };
}
function snapshotFor(user, schedule, { usedStudentPrice, bookedTripPrice, ordinaryTripPrice, priceBasis } = {}) {
  const hasPrices = Number.isFinite(bookedTripPrice) && bookedTripPrice >= 0 && Number.isFinite(ordinaryTripPrice) && ordinaryTripPrice >= 0;
  const studentPrice = hasPrices
    ? isStudent(user) && bookedTripPrice > 0 && bookedTripPrice < ordinaryTripPrice && usedStudentPrice !== false
    : typeof usedStudentPrice === "boolean" ? usedStudentPrice : null;
  return JSON.stringify({
    revision:Number(user.student_revision || 0),
    studentPrice,
    priceBasis:priceBasis || (hasPrices ? "booking" : studentPrice == null ? "unknown" : "recorded"),
    ...(hasPrices ? { bookedTripPrice, ordinaryTripPrice } : {}),
  });
}

function recordedStudentPrice(enrollment, schedule) {
  const tripPay = Number(enrollment.pay_amount || 0) - Number(enrollment.insurance_fee || 0) - Number(enrollment.supplies_fee || 0);
  if (tripPay <= 0 || schedule.organizer_type === "company" || ["assistant","photographer"].includes(enrollment.join_mode)) return false;
  let snapshot;
  try { snapshot = JSON.parse(enrollment.campus_snapshot_json || "{}"); } catch { snapshot = {}; }
  // These prices were captured together at booking. A schedule's current price,
  // student-price switch or coupon settings cannot establish a past quote.
  if (snapshot && snapshot.priceBasis === "booking" && Number.isFinite(snapshot.ordinaryTripPrice) && Number.isFinite(snapshot.bookedTripPrice)) {
    return snapshot.studentPrice === true && tripPay > 0 && tripPay < snapshot.ordinaryTripPrice;
  }
  return snapshot && typeof snapshot.studentPrice === "boolean" ? snapshot.studentPrice : null;
}

function historicalPriceReviews(user) {
  if (!isStudent(user)) return [];
  const db = getDb();
  // Ended schedules can still have payable bookings; use the same outstanding
  // enrollment set as identity mutation rather than the future-trip preview.
  const enrollments = db.prepare("SELECT e.* FROM enrollments e JOIN schedules s ON s.id=e.schedule_id WHERE e.user_id=? AND e.status IN ('joined','applied','waitlist') AND s.status!='cancelled'").all(user.id);
  return enrollments.flatMap((en) => {
    if (en.status === "joined" && en.pay_status === "paid") return [];
    if (en.pay_status === "refunded") return [];
    const schedule = db.prepare("SELECT * FROM schedules WHERE id=?").get(en.schedule_id);
    if (recordedStudentPrice(en, schedule) !== null) return [];
    return [{ enrollmentId:en.id, scheduleId:en.schedule_id, message:"历史报名缺少当时普通价记录，无法核实是否使用学生价。请先完成或取消原报名，或联系客服核实后再管理认证" }];
  });
}
// Existing orders need their old identity captured before the user changes it.
// New orders are captured when booked, so this never rewrites their price basis.
function beforeIdentityChange(user) {
  const db = getDb();
  const enrollments = db.prepare("SELECT e.* FROM enrollments e JOIN schedules s ON s.id=e.schedule_id WHERE e.user_id=? AND e.status IN ('joined','applied','waitlist') AND s.status!='cancelled'").all(user.id);
  const paymentBlocks = paymentBlocksFor(user);
  if (paymentBlocks.length) {
    const error = new Error(paymentBlocks[0].message);
    error.status = 409;
    error.code = "campus_payment_unresolved";
    error.extra = { paymentBlocks };
    throw error;
  }
  const priceReviews = historicalPriceReviews(user);
  if (priceReviews.length) {
    const error = new Error(priceReviews[0].message);
    error.status = 409;
    error.code = "legacy_price_unknown";
    throw error;
  }
  for (const en of enrollments) {
    if (en.campus_snapshot_json) continue;
    const schedule = db.prepare("SELECT * FROM schedules WHERE id=?").get(en.schedule_id);
    const usedStudentPrice = recordedStudentPrice(en, schedule);
    db.prepare("UPDATE enrollments SET campus_snapshot_json=? WHERE id=?").run(snapshotFor(user, schedule, { usedStudentPrice }), en.id);
  }
}
function campusEnrollmentCheck(enrollment, schedule) {
  const user = getDb().prepare("SELECT * FROM users WHERE id=?").get(enrollment.user_id);
  // Paid, confirmed seats are a fulfilled booking commitment, not a new claim.
  if (enrollment.status === "joined" && enrollment.pay_status === "paid") return { ok:true };
  const limit = checkEnrollLimit(user, enrollLimitOf(schedule));
  if (!limit.ok) return { ok:false, reason:"校园身份已变化，请重新认证，或取消报名后按当前资格重新报名" };
  try { assertComboEnroll(user, schedule); } catch (error) {
    if (error.status !== 400) throw error;
    return { ok:false, reason:"校园身份已变化，请重新认证，或取消报名后按当前资格重新报名" };
  }
  let snapshot;
  try { snapshot = JSON.parse(enrollment.campus_snapshot_json || "{}"); } catch { snapshot = {}; }
  if (snapshot && snapshot.studentPrice && !isStudent(user)) return { ok:false, reason:"原报名使用了学生价，请重新认证，或取消报名后按当前价格重新报名" };
  return { ok:true };
}
function assertCampusEnrollment(enrollment, schedule) {
  const check = campusEnrollmentCheck(enrollment, schedule);
  if (!check.ok) {
    const error = new Error(check.reason);
    error.status = 409;
    error.code = "campus_eligibility_changed";
    throw error;
  }
}
module.exports = { conflict, assertRevision, historyFor, management, beforeIdentityChange, snapshotFor, historicalPriceReviews, campusEnrollmentCheck, assertCampusEnrollment };
