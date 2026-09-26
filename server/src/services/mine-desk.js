const dayjs = require("dayjs");
const { getDb } = require("../db");
const { attachAssetHost } = require("./helpers");

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

function phoneOf(value) {
  const text = String(value || "").trim();
  if (!/^1\d{10}$/.test(text)) fail(400, "请填写 11 位手机号");
  return text;
}

function pushUserNotice({ userId, kind, title, body, href, refType, refId } = {}) {
  const id = Number(userId);
  const k = String(kind || "").trim();
  const t = String(title || "").trim();
  if (!id || !k || !t) return null;
  const db = getDb();
  const ref = String(refType || "");
  const refNum = Number(refId) || 0;
  db.prepare("DELETE FROM user_notices WHERE user_id=? AND kind=? AND ref_type=? AND ref_id=?").run(id, k, ref, refNum);
  const info = db
    .prepare("INSERT INTO user_notices (user_id,kind,title,body,href,ref_type,ref_id) VALUES (?,?,?,?,?,?,?)")
    .run(id, k, t, String(body || "").trim(), String(href || "").trim(), ref, refNum);
  return db.prepare("SELECT * FROM user_notices WHERE id=?").get(info.lastInsertRowid);
}

function mapNotice(row) {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    href: row.href || "",
    createdAt: row.created_at,
    readAt: row.read_at || "",
    unread: !row.read_at,
  };
}

function listNotices(userId) {
  return getDb()
    .prepare("SELECT * FROM user_notices WHERE user_id=? ORDER BY id DESC LIMIT 50")
    .all(userId)
    .map(mapNotice);
}

function unreadCount(userId) {
  return getDb().prepare("SELECT COUNT(*) AS c FROM user_notices WHERE user_id=? AND read_at IS NULL").get(userId).c;
}

function markNoticeRead(userId, noticeId) {
  getDb()
    .prepare("UPDATE user_notices SET read_at=datetime('now','localtime') WHERE id=? AND user_id=? AND read_at IS NULL")
    .run(noticeId, userId);
  return listNotices(userId);
}

function markAllNoticesRead(userId) {
  getDb()
    .prepare("UPDATE user_notices SET read_at=datetime('now','localtime') WHERE user_id=? AND read_at IS NULL")
    .run(userId);
  return listNotices(userId);
}

function noticeJoined(scheduleId, notice) {
  const rows = getDb()
    .prepare(
      `SELECT DISTINCT e.user_id FROM enrollments e
       JOIN users u ON u.id=e.user_id
       WHERE e.schedule_id=? AND e.status='joined' AND IFNULL(u.is_virtual,0)=0`
    )
    .all(scheduleId);
  rows.forEach((row) => pushUserNotice({ ...notice, userId: row.user_id }));
}

function noticeFollowers(targetUserId, notice) {
  const rows = getDb()
    .prepare(
      `SELECT f.user_id FROM follows f
       JOIN users u ON u.id=f.user_id
       WHERE f.target_user_id=? AND IFNULL(u.is_virtual,0)=0 AND u.deleted_at IS NULL`
    )
    .all(targetUserId);
  rows.forEach((row) => pushUserNotice({ ...notice, userId: row.user_id }));
}

function recentViews(userId, req) {
  const rows = getDb()
    .prepare(
      `SELECT v.route_id AS id, MAX(v.created_at) AS seenAt, r.title, r.cover, r.region, r.days, r.subtitle
       FROM page_views v
       JOIN routes r ON r.id=v.route_id
       WHERE v.user_id=? AND v.route_id IS NOT NULL
       GROUP BY v.route_id
       ORDER BY seenAt DESC
       LIMIT 20`
    )
    .all(userId);
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    subtitle: row.subtitle || "",
    region: row.region || "",
    days: row.days,
    cover: attachAssetHost(req, row.cover),
    seenAt: row.seenAt,
  }));
}

function listCompanions(userId) {
  return getDb()
    .prepare("SELECT id, name, phone, emergency_name AS emergencyName, emergency_phone AS emergencyPhone FROM companions WHERE user_id=? ORDER BY id DESC")
    .all(userId);
}

function saveCompanion(userId, body = {}) {
  const name = String(body.name || "").trim();
  if (name.length < 1 || name.length > 20) fail(400, "请填写报名人称呼");
  const phone = phoneOf(body.phone);
  const emergencyName = String(body.emergencyName || body.emergency_name || "").trim();
  const emergencyPhone = String(body.emergencyPhone || body.emergency_phone || "").trim();
  if (emergencyPhone) phoneOf(emergencyPhone);
  if (emergencyPhone && emergencyPhone === phone) fail(400, "紧急联系人手机不能与出行人相同");
  const db = getDb();
  const count = db.prepare("SELECT COUNT(*) AS c FROM companions WHERE user_id=?").get(userId).c;
  const id = Number(body.id || 0);
  if (!id && count >= 20) fail(400, "常用报名人最多 20 位");
  if (id) {
    const row = db.prepare("SELECT id FROM companions WHERE id=? AND user_id=?").get(id, userId);
    if (!row) fail(404, "报名人不存在");
    db.prepare("UPDATE companions SET name=?, phone=?, emergency_name=?, emergency_phone=? WHERE id=?").run(
      name,
      phone,
      emergencyName,
      emergencyPhone,
      id
    );
  } else {
    db.prepare("INSERT INTO companions (user_id,name,phone,emergency_name,emergency_phone) VALUES (?,?,?,?,?)").run(
      userId,
      name,
      phone,
      emergencyName,
      emergencyPhone
    );
  }
  return listCompanions(userId);
}

function removeCompanion(userId, id) {
  getDb().prepare("DELETE FROM companions WHERE id=? AND user_id=?").run(id, userId);
  return listCompanions(userId);
}

function isFollowing(userId, targetUserId) {
  if (!userId || !targetUserId) return false;
  return Boolean(
    getDb().prepare("SELECT 1 FROM follows WHERE user_id=? AND target_user_id=?").get(userId, targetUserId)
  );
}

function followUser(userId, targetUserId) {
  const target = Number(targetUserId);
  if (!target || target === Number(userId)) fail(400, "不能关注自己");
  const person = getDb().prepare("SELECT id FROM users WHERE id=? AND deleted_at IS NULL").get(target);
  if (!person) fail(404, "用户不存在");
  getDb().prepare("INSERT OR IGNORE INTO follows (user_id,target_user_id) VALUES (?,?)").run(userId, target);
  return { followed: true };
}

function unfollowUser(userId, targetUserId) {
  getDb().prepare("DELETE FROM follows WHERE user_id=? AND target_user_id=?").run(userId, targetUserId);
  return { followed: false };
}

function listFollows(userId, req) {
  return getDb()
    .prepare(
      `SELECT u.id, u.nickname, u.avatar,
              (SELECT r.title FROM schedules s JOIN routes r ON r.id=s.route_id
               WHERE s.organizer_id=u.id AND s.status!='cancelled' AND s.start_date>=date('now','localtime')
               ORDER BY s.start_date LIMIT 1) AS nextTitle,
              (SELECT s.start_date FROM schedules s
               WHERE s.organizer_id=u.id AND s.status!='cancelled' AND s.start_date>=date('now','localtime')
               ORDER BY s.start_date LIMIT 1) AS nextDate
       FROM follows f JOIN users u ON u.id=f.target_user_id
       WHERE f.user_id=? AND u.deleted_at IS NULL
       ORDER BY f.created_at DESC`
    )
    .all(userId)
    .map((row) => ({
      id: row.id,
      nickname: row.nickname,
      avatar: attachAssetHost(req, row.avatar) || "",
      nextTitle: row.nextTitle || "",
      nextDate: row.nextDate || "",
    }));
}

function refundByEnrollment(userId) {
  const rows = getDb()
    .prepare(
      `SELECT enrollment_id, amount, channel, created_at
       FROM payments
       WHERE user_id=? AND IFNULL(refund_of,0)>0
       ORDER BY id DESC`
    )
    .all(userId);
  const map = new Map();
  for (const row of rows) {
    if (map.has(row.enrollment_id)) continue;
    const amount = Number(row.amount || 0);
    const wallet = row.channel === "wallet";
    map.set(row.enrollment_id, {
      amount,
      channel: wallet ? "wallet" : "wechat",
      at: row.created_at,
      text: wallet ? `已退回余额 ¥${amount}` : `已原路退回微信 ¥${amount}`,
    });
  }
  return map;
}

function parseAt(value) {
  return dayjs(String(value || "").trim().replace(" ", "T"));
}

function couponExpireHint(userId) {
  const rows = getDb()
    .prepare("SELECT expires_at FROM user_coupons WHERE user_id=? AND status='unused' AND IFNULL(expires_at,'')!=''")
    .all(userId);
  const now = dayjs();
  const tomorrow = dayjs().add(1, "day");
  const soon = rows.filter((row) => {
    const at = parseAt(row.expires_at);
    return at.isValid() && !at.isBefore(now) && at.diff(now, "hour") <= 48;
  });
  if (!soon.length) return "";
  const dueTomorrow = soon.filter((row) => parseAt(row.expires_at).isSame(tomorrow, "day"));
  if (dueTomorrow.length) return `${dueTomorrow.length} 张明天到期`;
  return `${soon.length} 张即将到期`;
}

function deskCounts(userId) {
  const db = getDb();
  const review = db
    .prepare(
      `SELECT COUNT(*) AS c FROM enrollments e
       JOIN schedules s ON s.id=e.schedule_id
       WHERE e.user_id=? AND e.status='joined' AND s.status!='cancelled'
         AND s.start_date<date('now','localtime')
         AND NOT EXISTS (SELECT 1 FROM reviews r WHERE r.user_id=e.user_id AND r.schedule_id=e.schedule_id)`
    )
    .get(userId).c;
  const refund = db
    .prepare("SELECT COUNT(DISTINCT enrollment_id) AS c FROM payments WHERE user_id=? AND IFNULL(refund_of,0)>0")
    .get(userId).c;
  return {
    reviewCount: review,
    refundCount: refund,
    unreadCount: unreadCount(userId),
    couponExpireHint: couponExpireHint(userId),
  };
}

module.exports = {
  pushUserNotice,
  listNotices,
  unreadCount,
  markNoticeRead,
  markAllNoticesRead,
  noticeJoined,
  noticeFollowers,
  recentViews,
  listCompanions,
  saveCompanion,
  removeCompanion,
  isFollowing,
  followUser,
  unfollowUser,
  listFollows,
  refundByEnrollment,
  couponExpireHint,
  deskCounts,
};
