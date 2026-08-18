const { getDb } = require("../db");
const { cancelEnrollment } = require("./enroll");

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

function deleteAccount(userId) {
  const db = getDb();
  const user = db.prepare("SELECT * FROM users WHERE id=?").get(userId);
  if (!user) fail(404, "账号不存在");
  if (user.deleted_at) fail(400, "账号已注销");

  const enrollments = db
    .prepare("SELECT id FROM enrollments WHERE user_id=? AND status!='cancelled'")
    .all(userId);
  for (const row of enrollments) {
    try {
      cancelEnrollment(row.id, userId, { force: true });
    } catch {
      db.prepare("UPDATE enrollments SET status='cancelled' WHERE id=?").run(row.id);
    }
  }

  db.prepare("DELETE FROM favorites WHERE user_id=?").run(userId);
  db.prepare(
    `UPDATE users SET
      phone=NULL,
      password_hash=NULL,
      wechat_openid=NULL,
      wechat_unionid=NULL,
      nickname='已注销用户',
      avatar='',
      gender=NULL,
      birthday=NULL,
      id_card=NULL,
      hometown=NULL,
      company_name=NULL,
      is_member=0,
      member_expire_at=NULL,
      points=0,
      deleted_at=datetime('now','localtime')
     WHERE id=?`
  ).run(userId);

  return { ok: true };
}

module.exports = { deleteAccount };
