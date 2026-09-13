const dayjs = require("dayjs");
const { getDb } = require("../db");
const { addPoints } = require("./helpers");
const config = require("../config");

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

module.exports = { grantMembership };
