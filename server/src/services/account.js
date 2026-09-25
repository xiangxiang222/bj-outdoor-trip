const dayjs = require("dayjs");
const { getDb } = require("../db");
const { cancelEnrollment } = require("./enroll");
const { refundableOf } = require("./pay-ledger");

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

async function deleteAccount(userId) {
  const db = getDb();
  const user = db.prepare("SELECT * FROM users WHERE id=?").get(userId);
  if (!user) fail(404, "账号不存在");
  if (user.deleted_at) fail(400, "账号已注销");

  if (Number(user.wallet_balance) > 0) {
    fail(400, "钱包还有余额，请先提现到微信零钱，到账后再注销");
  }
  const enrollments = db
    .prepare(
      `SELECT e.*, s.start_date, s.started_at
       FROM enrollments e JOIN schedules s ON s.id=e.schedule_id
       WHERE e.user_id=? AND e.status!='cancelled'`
    )
    .all(userId);
  const today = dayjs().startOf("day");
  const paidUpcoming = enrollments.filter((en) => {
    if (en.started_at) return false;
    const start = dayjs(en.start_date).startOf("day");
    if (!start.isValid() || start.isBefore(today)) return false;
    return refundableOf(en) > 0;
  });
  if (paidUpcoming.length) {
    fail(400, "还有已支付、尚未出发的行程。请先取消报名，等退款到账、钱包余额为 0 后再注销");
  }
  for (const row of enrollments) {
    if (refundableOf(row) > 0) continue;
    try {
      await cancelEnrollment(row.id, userId);
    } catch {
      db.prepare("UPDATE enrollments SET status='cancelled' WHERE id=?").run(row.id);
    }
  }

  db.prepare("DELETE FROM favorites WHERE user_id=?").run(userId);
  db.prepare("DELETE FROM bank_cards WHERE user_id=?").run(userId);
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
      real_name=NULL,
      id_verified=0,
      hometown=NULL,
      company_name=NULL,
      is_member=0,
      member_level=1,
      member_expire_at=NULL,
      points=0,
      wallet_balance=0,
      wallet_pin_hash=NULL,
      deleted_at=datetime('now','localtime')
     WHERE id=?`
  ).run(userId);

  return { ok: true };
}

module.exports = { deleteAccount };
