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

function completeTrip(userId, scheduleId) {
  const db = getDb();
  const sid = Number(scheduleId);
  const sch = db.prepare("SELECT * FROM schedules WHERE id=?").get(sid);
  if (!sch) fail(404, "行程不存在");
  if (sch.status === "cancelled") fail(400, "本团已解散");
  const en = joinedEnrollment(userId, sid);
  if (!en) fail(400, "只有报名成功的出行人可以完成活动");
  if (dayjs(sch.start_date).isAfter(dayjs(), "day")) fail(400, "活动还没开始，回来大巴上再点完成");
  if (en.completed_at) {
    return { completedAt: en.completed_at, already: true };
  }
  const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
  db.prepare("UPDATE enrollments SET completed_at=? WHERE id=?").run(now, en.id);
  return { completedAt: now, already: false };
}

function afterTripState(userId, scheduleId) {
  const db = getDb();
  const sid = Number(scheduleId);
  const sch = db.prepare("SELECT * FROM schedules WHERE id=?").get(sid);
  if (!sch) fail(404, "行程不存在");
  const route = db.prepare("SELECT title FROM routes WHERE id=?").get(sch.route_id);
  const en = userId ? joinedEnrollment(userId, sid) : null;
  const lottery = userId ? lotteryState(userId, sid) : { pre: null, post: null, canPre: false, canPost: false };
  if (userId && en && en.completed_at && !lottery.post) lottery.canPost = true;
  const reviews = listReviews({ scheduleId: sid });
  return {
    scheduleId: sid,
    title: route?.title || "",
    startDate: sch.start_date,
    joined: !!en,
    completed: !!(en && en.completed_at),
    completedAt: en?.completed_at || "",
    canComplete: !!(en && !en.completed_at && !dayjs(sch.start_date).isAfter(dayjs(), "day")),
    reviewedByMe: !!(userId && reviewedScheduleIds(userId).has(sid)),
    lottery,
    reviews,
  };
}

module.exports = { completeTrip, afterTripState, joinedEnrollment };
