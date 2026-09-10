const dayjs = require("dayjs");
const { getDb } = require("../db");
const { enrolledCount, maybeMatchGuide } = require("./helpers");
const { firstFreeSeat, parseLockedSeats } = require("./seats");
const { flagOn } = require("./offer");
const { sendSms } = require("./sms");
const { redeemHeldForEnrollment } = require("./coupons");
const { recordEnrollReferral } = require("./referral");

const OVERSUB_COPY = "车位有限。报名人数超过座位时，将抽签决定出行人；未超过则全部确认。";
const OVERSUB_LABEL = "报超会抽";

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

function isOversub(schedule) {
  return flagOn(schedule && schedule.oversub, false);
}

function isOversubPending(schedule) {
  return isOversub(schedule) && !schedule.drawn_at;
}

function shuffle(list, rng = Math.random) {
  const a = Array.isArray(list) ? list.slice() : [];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
  return a;
}

function appliedCount(scheduleId) {
  return getDb()
    .prepare("SELECT COUNT(*) AS c FROM enrollments WHERE schedule_id=? AND status='applied'")
    .get(scheduleId).c;
}

function oversubView(schedule) {
  const enabled = isOversub(schedule);
  const drawn = !!(schedule && schedule.drawn_at);
  const over = !!Number(schedule && schedule.draw_over);
  const applied = schedule ? appliedCount(schedule.id) : 0;
  return {
    enabled,
    pending: enabled && !drawn,
    drawn,
    over,
    applied,
    seats: Number((schedule && schedule.max_seats) || 0),
    drawnAt: (schedule && schedule.drawn_at) || "",
    copy: enabled ? OVERSUB_COPY : "",
    label: enabled ? (drawn ? (over ? "已抽签" : "已全员确认") : OVERSUB_LABEL) : "",
  };
}

function drawSeatCount(schedule) {
  const locked = parseLockedSeats(schedule);
  const taken = enrolledCount(schedule.id);
  return Math.max(0, Number(schedule.max_seats) - locked.length - taken);
}

function listApplicants(scheduleId) {
  return getDb()
    .prepare(
      `SELECT e.* FROM enrollments e
       LEFT JOIN users u ON u.id=e.user_id
       WHERE e.schedule_id=? AND e.status='applied'
         AND IFNULL(u.is_virtual,0)=0
         AND IFNULL(e.join_mode,'chain') NOT IN ('assistant','photographer')
       ORDER BY e.id`
    )
    .all(scheduleId);
}

function resetDraw(scheduleId) {
  const db = getDb();
  db.prepare(
    `UPDATE enrollments SET status='applied', seat_no=NULL, waitlisted_at=NULL, promoted_at=NULL, draw_rank=NULL
     WHERE schedule_id=? AND status IN ('applied','waitlist','joined')
       AND IFNULL(join_mode,'chain') NOT IN ('assistant','photographer')
       AND IFNULL(user_id,0) NOT IN (SELECT id FROM users WHERE IFNULL(is_virtual,0)=1)`
  ).run(scheduleId);
  db.prepare("UPDATE schedules SET drawn_at=NULL, draw_over=NULL WHERE id=?").run(scheduleId);
}

function confirmEnrollment(en, rank, seat) {
  const db = getDb();
  db.prepare(
    "UPDATE enrollments SET status='joined', seat_no=?, draw_rank=?, waitlisted_at=NULL, promoted_at=NULL WHERE id=?"
  ).run(seat, rank, en.id);
  redeemHeldForEnrollment(en.id);
  if (en.referrer_user_id) recordEnrollReferral(en.referrer_user_id, en.id, en.pay_amount);
}

function waitlistEnrollment(en, rank, now) {
  getDb()
    .prepare(
      "UPDATE enrollments SET status='waitlist', seat_no=NULL, waitlisted_at=?, draw_rank=? WHERE id=?"
    )
    .run(now, rank, en.id);
}

function notifyDraw(sch, routeTitle, winners, losers, over) {
  const title = routeTitle || "活动";
  for (const en of winners) {
    sendSms({
      phone: en.traveler_phone,
      scene: "draw",
      content: over
        ? `【同行者众】您报名的「${title}」${sch.start_date}已确认出行${en.seat_no ? "，座位 " + en.seat_no : ""}。请留意集合通知。`
        : `【同行者众】您报名的「${title}」${sch.start_date}报名未超过座位，已全部确认出行。`,
      refType: "enrollment",
      refId: en.id,
    });
  }
  for (const en of losers) {
    sendSms({
      phone: en.traveler_phone,
      scene: "draw",
      content: `【同行者众】您报名的「${title}」${sch.start_date}因报名超过座位，本次未抽中，已进入候补。有人取消后按抽签顺序递补。`,
      refType: "enrollment",
      refId: en.id,
    });
  }
}

function drawOversub(scheduleId, { force = false, rng = Math.random } = {}) {
  const db = getDb();
  const sch = db.prepare("SELECT * FROM schedules WHERE id=?").get(scheduleId);
  if (!sch) fail(404, "排期不存在");
  if (sch.status === "cancelled") fail(400, "该拼团已解散");
  if (!isOversub(sch)) fail(400, "本团不是报超会抽");
  if (sch.drawn_at && !force) fail(400, "出行名单已确认");
  if (sch.drawn_at && force) resetDraw(sch.id);

  const current = db.prepare("SELECT * FROM schedules WHERE id=?").get(scheduleId);
  const applicants = listApplicants(current.id);
  const seats = drawSeatCount(current);
  const shuffled = shuffle(applicants, rng);
  const winnerRows = shuffled.slice(0, seats);
  const loserRows = shuffled.slice(seats);
  const over = applicants.length > seats;
  const now = dayjs().format("YYYY-MM-DD HH:mm:ss");

  const run = db.transaction(() => {
    winnerRows.forEach((en, i) => {
      const seat = firstFreeSeat(current.id, current.max_seats);
      confirmEnrollment(en, i + 1, seat);
      en.seat_no = seat;
    });
    loserRows.forEach((en, i) => {
      waitlistEnrollment(en, winnerRows.length + i + 1, now);
    });
    const leftovers = listApplicants(current.id);
    leftovers.forEach((en, i) => {
      waitlistEnrollment(en, winnerRows.length + loserRows.length + i + 1, now);
    });
    db.prepare("UPDATE schedules SET drawn_at=?, draw_over=? WHERE id=?").run(now, over ? 1 : 0, current.id);
  });
  run();

  maybeMatchGuide(current.id);
  const route = db.prepare("SELECT title FROM routes WHERE id=?").get(current.route_id);
  notifyDraw(current, route?.title, winnerRows, loserRows, over);

  return {
    scheduleId: current.id,
    applied: applicants.length,
    seats,
    winnerCount: winnerRows.length,
    waitlistCount: loserRows.length,
    over,
    drawnAt: now,
  };
}

module.exports = {
  OVERSUB_COPY,
  OVERSUB_LABEL,
  isOversub,
  isOversubPending,
  shuffle,
  appliedCount,
  oversubView,
  drawSeatCount,
  drawOversub,
};
