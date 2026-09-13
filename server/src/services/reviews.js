const { getDb } = require("../db");
const { maskName } = require("./biz");
const { idleVirtualUsers, createVirtualUser } = require("./virtual");

const REVIEW_TEMPLATES = [
  "风景很好，车接送准时，会再来。",
  "领队照顾得周到，强度合适，推荐。",
  "拍照很出片，集合点好找。",
  "一天玩得很充实，团里气氛不错。",
  "路线安排清楚，下次还走这条。",
  "强度刚刚好，适合周末出门。",
  "讲解细致，拍照点也带着停。",
];

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

function publicReview(row) {
  return {
    id: row.id,
    scheduleId: row.schedule_id,
    rating: row.rating,
    content: row.content || "",
    createdAt: row.created_at,
    name: maskName(row.traveler_name || row.nickname),
  };
}

function listReviews({ routeId, scheduleId } = {}) {
  const db = getDb();
  let sql = `SELECT rv.*, u.nickname,
    (SELECT traveler_name FROM enrollments
     WHERE user_id=rv.user_id AND schedule_id=rv.schedule_id
     ORDER BY CASE status WHEN 'joined' THEN 0 ELSE 1 END, id DESC LIMIT 1) AS traveler_name
    FROM reviews rv
    LEFT JOIN users u ON u.id=rv.user_id
    JOIN schedules s ON s.id=rv.schedule_id
    WHERE 1=1`;
  const args = [];
  if (routeId) {
    sql += " AND s.route_id=?";
    args.push(routeId);
  }
  if (scheduleId) {
    sql += " AND rv.schedule_id=?";
    args.push(scheduleId);
  }
  sql += " ORDER BY rv.id DESC";
  const list = db.prepare(sql).all(...args).map(publicReview);
  const count = list.length;
  const avg = count ? Math.round((list.reduce((sum, r) => sum + r.rating, 0) / count) * 10) / 10 : 0;
  return { list, count, avg };
}

function reviewedScheduleIds(userId) {
  return new Set(
    getDb()
      .prepare("SELECT schedule_id FROM reviews WHERE user_id=?")
      .all(userId)
      .map((r) => r.schedule_id)
  );
}

function hasJoined(userId, scheduleId) {
  return !!getDb()
    .prepare("SELECT id FROM enrollments WHERE user_id=? AND schedule_id=? AND status='joined'")
    .get(userId, scheduleId);
}

function createReview(userId, { scheduleId, rating, content } = {}) {
  const db = getDb();
  const sid = Number(scheduleId);
  if (!sid) fail(400, "请选择要评价的行程");
  const sch = db.prepare("SELECT id FROM schedules WHERE id=?").get(sid);
  if (!sch) fail(400, "排期不存在");
  const n = Number(rating);
  if (!Number.isInteger(n) || n < 1 || n > 5) fail(400, "请选择 1～5 分");
  const text = String(content || "").trim().slice(0, 500);
  if (!hasJoined(userId, sid)) fail(400, "仅报名成功的出行人可评价");
  const dup = db.prepare("SELECT id FROM reviews WHERE user_id=? AND schedule_id=?").get(userId, sid);
  if (dup) fail(400, "该行程已评价过");
  const en = db
    .prepare("SELECT traveler_name FROM enrollments WHERE user_id=? AND schedule_id=? AND status='joined' ORDER BY id DESC LIMIT 1")
    .get(userId, sid);
  try {
    const info = db
      .prepare("INSERT INTO reviews (schedule_id,user_id,rating,content) VALUES (?,?,?,?)")
      .run(sid, userId, n, text);
    const row = db
      .prepare("SELECT rv.*, u.nickname FROM reviews rv LEFT JOIN users u ON u.id=rv.user_id WHERE rv.id=?")
      .get(info.lastInsertRowid);
    return publicReview({ ...row, traveler_name: en && en.traveler_name });
  } catch (e) {
    if (e && String(e.code || "").startsWith("SQLITE_CONSTRAINT")) fail(400, "该行程已评价过");
    throw e;
  }
}

function pickReviewText(content, index) {
  const custom = String(content || "").trim().slice(0, 500);
  if (custom) return custom;
  return REVIEW_TEMPLATES[index % REVIEW_TEMPLATES.length];
}

function virtualCandidates(scheduleId) {
  const db = getDb();
  const reviewed = new Set(
    db.prepare("SELECT user_id AS id FROM reviews WHERE schedule_id=?").all(scheduleId).map((r) => Number(r.id))
  );
  const enrolled = db
    .prepare(
      `SELECT u.* FROM enrollments e
       JOIN users u ON u.id=e.user_id
       WHERE e.schedule_id=? AND e.status='joined' AND IFNULL(u.is_virtual,0)=1
       ORDER BY e.id`
    )
    .all(scheduleId)
    .filter((u) => !reviewed.has(Number(u.id)));
  const idle = idleVirtualUsers().filter((u) => !reviewed.has(Number(u.id)) && !enrolled.some((e) => Number(e.id) === Number(u.id)));
  return { reviewed, enrolled, idle };
}

function createVirtualReviews({ routeId, scheduleId, count, rating, content } = {}) {
  const db = getDb();
  let sch = null;
  if (scheduleId) sch = db.prepare("SELECT * FROM schedules WHERE id=?").get(Number(scheduleId));
  else if (routeId) {
    sch = db
      .prepare("SELECT * FROM schedules WHERE route_id=? AND status!='cancelled' ORDER BY id DESC LIMIT 1")
      .get(Number(routeId));
  }
  if (!sch) fail(400, "请指定线路或排期。该线路还没有排期时无法挂评价");
  const want = Math.floor(Number(count));
  if (!Number.isFinite(want) || want < 1) fail(400, "请填写评价人数");
  if (want > 30) fail(400, "一次最多 30 条评价");
  let fixedRating = Number(rating);
  if (rating == null || rating === "") fixedRating = null;
  else if (!Number.isInteger(fixedRating) || fixedRating < 1 || fixedRating > 5) fail(400, "请选择 1～5 分");

  const created = [];
  for (let i = 0; i < want; i += 1) {
    let { enrolled, idle } = virtualCandidates(sch.id);
    let user = enrolled[0] || idle[0];
    if (!user) {
      user = createVirtualUser();
    }
    const star = fixedRating || 4 + (i % 2);
    const text = pickReviewText(content, i);
    try {
      const info = db
        .prepare("INSERT INTO reviews (schedule_id,user_id,rating,content) VALUES (?,?,?,?)")
        .run(sch.id, user.id, star, text);
      const row = db
        .prepare("SELECT rv.*, u.nickname FROM reviews rv LEFT JOIN users u ON u.id=rv.user_id WHERE rv.id=?")
        .get(info.lastInsertRowid);
      const en = db
        .prepare("SELECT traveler_name FROM enrollments WHERE user_id=? AND schedule_id=? ORDER BY id DESC LIMIT 1")
        .get(user.id, sch.id);
      created.push(publicReview({ ...row, traveler_name: en && en.traveler_name }));
    } catch (e) {
      if (e && String(e.code || "").startsWith("SQLITE_CONSTRAINT")) continue;
      throw e;
    }
  }
  if (!created.length) fail(400, "没有可评价的虚拟用户");
  return {
    scheduleId: Number(sch.id),
    routeId: Number(sch.route_id),
    count: created.length,
    list: created,
    summary: listReviews({ routeId: sch.route_id }),
  };
}

module.exports = { listReviews, createReview, reviewedScheduleIds, createVirtualReviews };
