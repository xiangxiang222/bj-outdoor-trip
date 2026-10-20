const dayjs = require("dayjs");
const { getDb } = require("../db");
const { lotteryState } = require("./lottery");
const { listReviews, reviewedScheduleIds } = require("./reviews");

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

function joinedEnrollment(userId, scheduleId) {
  return getDb()
    .prepare("SELECT * FROM enrollments WHERE user_id=? AND schedule_id=? AND status='joined'")
    .get(userId, scheduleId);
}

function tripEnded(sch) {
  const end = sch.end_date || sch.start_date;
  return !dayjs(end).isAfter(dayjs(), "day");
}

function completeSchedule(scheduleId, actor = {}) {
  const db = getDb();
  const sid = Number(scheduleId);
  const sch = db.prepare("SELECT * FROM schedules WHERE id=?").get(sid);
  if (!sch) fail(404, "行程不存在");
  if (sch.status === "cancelled") fail(400, "本团已解散");
  if (sch.completed_at) return { completedAt: sch.completed_at, already: true, count: 0 };
  if (!tripEnded(sch)) fail(400, "行程还没结束");
  const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
  const role = actor.role === "guide" ? "guide" : "admin";
  const count = db.transaction(() => {
    db.prepare("UPDATE schedules SET completed_at=?, completed_by=?, completed_by_id=? WHERE id=?").run(
      now,
      role,
      Number(actor.id) || 0,
      sid
    );
    const info = db
      .prepare(
        "UPDATE enrollments SET completed_at=? WHERE schedule_id=? AND status='joined' AND (completed_at IS NULL OR completed_at='')"
      )
      .run(now, sid);
    return info.changes;
  })();
  return { completedAt: now, already: false, count };
}

function afterTripState(userId, scheduleId) {
  const db = getDb();
  const sid = Number(scheduleId);
  const sch = db.prepare("SELECT * FROM schedules WHERE id=?").get(sid);
  if (!sch) fail(404, "行程不存在");
  const route = db.prepare("SELECT title FROM routes WHERE id=?").get(sch.route_id);
  const en = userId ? joinedEnrollment(userId, sid) : null;
  const lottery = userId ? lotteryState(userId, sid) : { pre: null, post: null, canPre: false, canPost: false, canClaim: false };
  const reviews = listReviews({ scheduleId: sid });
  return {
    scheduleId: sid,
    title: route?.title || "",
    startDate: sch.start_date,
    joined: !!en,
    completed: !!(en && (en.completed_at || sch.completed_at)),
    completedAt: en?.completed_at || sch.completed_at || "",
    canComplete: false,
    reviewedByMe: !!(userId && reviewedScheduleIds(userId).has(sid)),
    lottery,
    reviews,
  };
}

module.exports = { completeSchedule, afterTripState, joinedEnrollment, tripEnded };
