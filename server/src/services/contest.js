const { getDb } = require("../db");
const { joinedEnrollment } = require("./aftertrip");

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

function mapPost(row, userId) {
  return {
    id: row.id,
    scheduleId: row.schedule_id,
    userId: row.user_id,
    name: row.nickname || "同行",
    url: row.url,
    caption: row.caption || "",
    votes: Number(row.votes || 0),
    mine: userId ? Number(row.user_id) === Number(userId) : false,
    voted: userId ? !!row.voted : false,
    createdAt: row.created_at,
  };
}

function listPosts(scheduleId, userId) {
  const rows = getDb()
    .prepare(
      `SELECT p.*, u.nickname,
        (SELECT COUNT(*) FROM contest_votes v WHERE v.post_id=p.id) AS votes,
        (SELECT COUNT(*) FROM contest_votes v WHERE v.post_id=p.id AND v.user_id=?) AS voted
       FROM contest_posts p
       LEFT JOIN users u ON u.id=p.user_id
       WHERE p.schedule_id=?
       ORDER BY votes DESC, p.id DESC`
    )
    .all(userId || 0, scheduleId);
  return rows.map((row) => mapPost(row, userId));
}

function submitPost(userId, scheduleId, { url, caption } = {}) {
  const sid = Number(scheduleId);
  const en = joinedEnrollment(userId, sid);
  if (!en) fail(400, "只有本团出行人可以参加评选");
  if (!en.completed_at) fail(400, "请先点「完成活动」再贴分享链接");
  const link = String(url || "").trim();
  if (!/^https?:\/\/\S+$/i.test(link)) fail(400, "请填写完整的社交媒体链接");
  const text = String(caption || "").trim().slice(0, 120);
  const db = getDb();
  const exist = db.prepare("SELECT id FROM contest_posts WHERE user_id=? AND schedule_id=?").get(userId, sid);
  if (exist) {
    db.prepare("UPDATE contest_posts SET url=?, caption=? WHERE id=?").run(link, text, exist.id);
    return listPosts(sid, userId).find((p) => p.id === exist.id);
  }
  const info = db.prepare("INSERT INTO contest_posts (schedule_id,user_id,url,caption) VALUES (?,?,?,?)").run(sid, userId, link, text);
  return listPosts(sid, userId).find((p) => p.id === Number(info.lastInsertRowid));
}

function votePost(userId, postId) {
  const db = getDb();
  const post = db.prepare("SELECT * FROM contest_posts WHERE id=?").get(postId);
  if (!post) fail(404, "评选不存在");
  if (Number(post.user_id) === Number(userId)) fail(400, "不能给自己的分享投票");
  if (!joinedEnrollment(userId, post.schedule_id)) fail(400, "只有本团出行人可以投票");
  try {
    db.prepare("INSERT INTO contest_votes (post_id,user_id) VALUES (?,?)").run(post.id, userId);
  } catch {
    fail(400, "已经投过这一条");
  }
  return listPosts(post.schedule_id, userId);
}

module.exports = { listPosts, submitPost, votePost };
