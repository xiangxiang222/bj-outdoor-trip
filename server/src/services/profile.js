const { getDb } = require("../db");
const { parseIdCard, lifeStageFromPerson } = require("./idcard");
const { attachAssetHost } = require("./helpers");

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

function ensureReferralCode(userId) {
  const db = getDb();
  const u = db.prepare("SELECT id, referral_code FROM users WHERE id=?").get(userId);
  if (!u) return "";
  if (u.referral_code) return u.referral_code;
  const code = `BX${u.id}`;
  db.prepare("UPDATE users SET referral_code=? WHERE id=?").run(code, u.id);
  return code;
}

function albumOf(userId, req) {
  return getDb()
    .prepare("SELECT id, url, created_at AS createdAt FROM user_photos WHERE user_id=? ORDER BY id DESC LIMIT 24")
    .all(userId)
    .map((p) => ({ ...p, url: attachAssetHost(req, p.url) || p.url }));
}

function tripBuckets(userId, req) {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT e.id, e.status, e.schedule_id, s.start_date, s.end_date, s.status AS schedule_status,
              r.id AS route_id, r.title, r.cover, r.region, r.days
       FROM enrollments e
       JOIN schedules s ON s.id=e.schedule_id
       JOIN routes r ON r.id=s.route_id
       WHERE e.user_id=? AND e.status='joined' AND s.status!='cancelled'
       ORDER BY s.start_date DESC, e.id DESC`
    )
    .all(userId);
  const upcoming = [];
  const past = [];
  const today = new Date().toISOString().slice(0, 10);
  for (const row of rows) {
    const item = {
      id: row.id,
      scheduleId: row.schedule_id,
      routeId: row.route_id,
      title: row.title,
      cover: attachAssetHost(req, row.cover),
      region: row.region,
      days: row.days,
      startDate: row.start_date,
      endDate: row.end_date,
      status: row.status,
    };
    if (String(row.start_date) >= today) upcoming.push(item);
    else past.push(item);
  }
  const following = db
    .prepare(
      `SELECT r.id, r.title, r.cover, r.region, r.days
       FROM favorites f JOIN routes r ON r.id=f.route_id
       WHERE f.user_id=? AND r.status='on' ORDER BY f.created_at DESC LIMIT 20`
    )
    .all(userId)
    .map((r) => ({
      id: r.id,
      routeId: r.id,
      title: r.title,
      cover: attachAssetHost(req, r.cover),
      region: r.region,
      days: r.days,
    }));
  return { upcoming, past, following };
}

function publicUserProfile(user, req) {
  if (!user || user.deleted_at) return null;
  const parsed = user.id_card ? parseIdCard(user.id_card) : { valid: false };
  const stage = lifeStageFromPerson({ idCard: user.id_card, birthday: user.birthday });
  const tripCount = getDb()
    .prepare("SELECT COUNT(*) AS n FROM enrollments WHERE user_id=? AND status='joined'")
    .get(user.id).n;
  const trips = tripBuckets(user.id, req);
  return {
    id: user.id,
    nickname: user.nickname,
    avatar: attachAssetHost(req, user.avatar) || "",
    gender: user.gender || parsed.gender || "",
    lifeStage: stage.label || "",
    hometown: user.hometown || "",
    tripCount,
    album: albumOf(user.id, req),
    trips,
  };
}

function addPhoto(userId, url) {
  const trimmed = String(url || "").trim();
  if (!trimmed) fail(400, "请先上传照片");
  const n = getDb().prepare("SELECT COUNT(*) AS c FROM user_photos WHERE user_id=?").get(userId).c;
  if (n >= 24) fail(400, "相册最多 24 张");
  const info = getDb().prepare("INSERT INTO user_photos (user_id, url) VALUES (?,?)").run(userId, trimmed);
  return { id: Number(info.lastInsertRowid), url: trimmed };
}

function removePhoto(userId, photoId) {
  const row = getDb().prepare("SELECT * FROM user_photos WHERE id=? AND user_id=?").get(photoId, userId);
  if (!row) fail(404, "照片不存在");
  getDb().prepare("DELETE FROM user_photos WHERE id=?").run(photoId);
  return { deleted: true };
}

module.exports = {
  ensureReferralCode,
  albumOf,
  tripBuckets,
  publicUserProfile,
  addPhoto,
  removePhoto,
};
