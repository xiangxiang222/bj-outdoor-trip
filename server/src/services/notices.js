const dayjs = require("dayjs");
const { getDb } = require("../db");

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

function now() {
  return dayjs().format("YYYY-MM-DD HH:mm:ss");
}

function rewriteHref(href) {
  const value = String(href || "").trim();
  const old = value.match(/^\/admin\/users\?pending=(campus|group)&userId=(\d+)/);
  if (old) return `/admin/verify?kind=${old[1]}&userId=${old[2]}`;
  return value;
}

function safeHref(href, fallback = "/admin/verify") {
  const value = rewriteHref(href);
  return value.startsWith("/admin/") ? value : fallback;
}

function mapNotice(row) {
  if (!row) return null;
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    href: safeHref(row.href),
    refType: row.ref_type,
    refId: row.ref_id,
    createdAt: row.created_at,
    readAt: row.read_at || "",
    unread: !row.read_at,
  };
}

function pushNotice({ kind, title, body, href, refType, refId }) {
  const db = getDb();
  const k = String(kind || "").trim();
  const t = String(title || "").trim();
  if (!k || !t) return null;
  db.prepare(
    "DELETE FROM admin_notices WHERE kind=? AND ref_type=? AND ref_id=? AND read_at IS NULL"
  ).run(k, String(refType || ""), Number(refId) || 0);
  const result = db
    .prepare(
      "INSERT INTO admin_notices (kind,title,body,href,ref_type,ref_id) VALUES (?,?,?,?,?,?)"
    )
    .run(k, t, String(body || "").trim(), safeHref(href), String(refType || ""), Number(refId) || 0);
  return mapNotice(db.prepare("SELECT * FROM admin_notices WHERE id=?").get(result.lastInsertRowid));
}

function noticeCampus(user) {
  if (!user) return null;
  const who = user.nickname || user.phone || "用户";
  const school = String(user.school || "").trim();
  const kindLabel = user.campus_kind === "alumni" ? "校友" : "师生";
  return pushNotice({
    kind: "campus",
    title: "校园认证待审",
    body: school ? `${who} 申请${school}（${kindLabel}）认证` : `${who} 申请校园认证`,
    href: `/admin/verify?kind=campus&userId=${user.id}`,
    refType: "user",
    refId: user.id,
  });
}

function noticeGroup(user) {
  if (!user) return null;
  const who = user.nickname || user.phone || "用户";
  const name = String(user.group_name || "").trim();
  return pushNotice({
    kind: "group",
    title: "团体认证待审",
    body: name ? `${who} 申请认证团体「${name}」` : `${who} 申请团体认证`,
    href: `/admin/verify?kind=group&userId=${user.id}`,
    refType: "user",
    refId: user.id,
  });
}

function listNotices(limit = 30) {
  const rows = getDb()
    .prepare("SELECT * FROM admin_notices ORDER BY id DESC LIMIT ?")
    .all(Math.min(50, Math.max(1, Number(limit) || 30)));
  const unread = getDb().prepare("SELECT COUNT(*) AS c FROM admin_notices WHERE read_at IS NULL").get().c;
  return { list: rows.map(mapNotice), unread };
}

function markRead(id, adminId) {
  const db = getDb();
  const row = db.prepare("SELECT * FROM admin_notices WHERE id=?").get(id);
  if (!row) fail(404, "消息不存在");
  if (!row.read_at) {
    db.prepare("UPDATE admin_notices SET read_at=?, read_by=? WHERE id=?").run(now(), adminId || 0, id);
  }
  return mapNotice(db.prepare("SELECT * FROM admin_notices WHERE id=?").get(id));
}

function markAllRead(adminId) {
  getDb()
    .prepare("UPDATE admin_notices SET read_at=?, read_by=? WHERE read_at IS NULL")
    .run(now(), adminId || 0);
  return listNotices();
}

function resolveNotices(kind, refType, refId, adminId) {
  getDb()
    .prepare(
      "UPDATE admin_notices SET read_at=?, read_by=? WHERE kind=? AND ref_type=? AND ref_id=? AND read_at IS NULL"
    )
    .run(now(), adminId || 0, kind, refType, Number(refId) || 0);
}

module.exports = {
  pushNotice,
  noticeCampus,
  noticeGroup,
  listNotices,
  markRead,
  markAllRead,
  resolveNotices,
};
