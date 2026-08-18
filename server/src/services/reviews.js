const { getDb } = require("../db");
const { maskName } = require("./biz");

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

module.exports = { listReviews, createReview, reviewedScheduleIds };
