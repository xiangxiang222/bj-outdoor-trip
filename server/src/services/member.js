const dayjs = require("dayjs");
const { getDb } = require("../db");
const { addPoints } = require("./helpers");
const config = require("../config");
const { payLive, refundOrder, yuanToFen } = require("./wechat");

function grantMembership(userId) {
  const db = getDb();
  const user = db.prepare("SELECT * FROM users WHERE id=?").get(userId);
  const expire = dayjs(user.member_expire_at).isAfter(dayjs()) ? dayjs(user.member_expire_at) : dayjs();
  const next = expire.add(config.member.durationDays, "day").format("YYYY-MM-DD");
  db.prepare("UPDATE users SET is_member=1, member_expire_at=?, member_gift_left=COALESCE(member_gift_left,0)+? WHERE id=?").run(
    next,
    config.member.giftTrips || 1,
    userId
  );
  addPoints(userId, config.member.annualFee, "开通会员赠送积分", "member", userId);
  return db.prepare("SELECT * FROM users WHERE id=?").get(userId);
}

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

function revokeMembershipTerm(userId) {
  const db = getDb();
  const user = db.prepare("SELECT * FROM users WHERE id=?").get(userId);
  if (!user) fail(404, "用户不存在");
  const expire = dayjs(user.member_expire_at);
  const next = expire.isValid() ? expire.subtract(config.member.durationDays, "day") : dayjs();
  const still = next.isAfter(dayjs(), "day");
  const gift = Math.max(0, Number(user.member_gift_left || 0) - (config.member.giftTrips || 1));
  db.prepare("UPDATE users SET is_member=?, member_expire_at=?, member_gift_left=? WHERE id=?").run(
    still ? 1 : 0,
    still ? next.format("YYYY-MM-DD") : null,
    gift,
    userId
  );
  return db.prepare("SELECT * FROM users WHERE id=?").get(userId);
}

async function refundMembership(userId) {
  const db = getDb();
  const pay = db
    .prepare("SELECT * FROM payments WHERE user_id=? AND scene='member' AND status='success' ORDER BY id DESC LIMIT 1")
    .get(userId);
  if (!pay) fail(400, "没有可退的会员费");
  if (pay.channel === "wechat" && payLive() && pay.trade_no) {
    const refundNo = `MR${Date.now()}${userId}`.slice(0, 32);
    await refundOrder({
      tradeNo: pay.trade_no,
      transactionId: pay.wechat_transaction_id,
      refundNo,
      totalFen: yuanToFen(pay.amount),
      refundFen: yuanToFen(pay.amount),
    });
  }
  db.prepare("UPDATE payments SET status='refunded' WHERE id=? AND status='success'").run(pay.id);
  const granted = db
    .prepare("SELECT IFNULL(SUM(delta),0) AS s FROM points_ledger WHERE user_id=? AND ref_type='member' AND ref_id=? AND delta>0")
    .get(userId, userId);
  const take = Math.min(Number(granted?.s || 0), Number(db.prepare("SELECT points FROM users WHERE id=?").get(userId)?.points || 0));
  if (take > 0) addPoints(userId, -take, "退回会员赠送积分", "member", userId);
  return revokeMembershipTerm(userId);
}

module.exports = { grantMembership, refundMembership, revokeMembershipTerm };
