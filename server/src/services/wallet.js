const bcrypt = require("bcryptjs");
const { getDb } = require("../db");
const config = require("../config");
const { maskName, maskPhone } = require("./biz");
const { maskIdCard } = require("./idcard");

const CARD_CLOSED = "已改为提现到微信零钱，不再支持绑定银行卡";

const SCENE_LABEL = {
  referral: "分享报名返点",
  trip_bounty: "个人发团奖励",
  route_bounty: "线路成团奖励",
  enrollment_pay: "报名支付",
  refund: "报名退款",
  topup: "微信支付充值",
  withdraw: "提现到微信零钱",
};

function fail(status, message, extra) {
  const err = new Error(message);
  err.status = status;
  if (extra) err.extra = extra;
  throw err;
}

function parseYuan(raw, { min = 1, max = 5000 } = {}) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) fail(400, "金额须大于 0");
  const yuan = Math.round(n);
  if (Math.abs(n - yuan) > 1e-8) fail(400, "金额须为整数元");
  if (yuan < min || yuan > max) fail(400, `金额须为 ${min}～${max} 元`);
  return yuan;
}

function pinDigits(raw) {
  const pin = String(raw || "").trim();
  if (!/^\d{6}$/.test(pin)) fail(400, "支付密码须为 6 位数字");
  return pin;
}

function balanceOf(userId) {
  const row = getDb().prepare("SELECT wallet_balance FROM users WHERE id=?").get(userId);
  return Number(row?.wallet_balance || 0);
}

function applyDelta(userId, delta, { reason, scene, refType, refId } = {}) {
  const amount = Math.round(Number(delta) || 0);
  if (!amount) fail(400, "金额须大于 0");
  const db = getDb();
  const run = db.transaction(() => {
    const user = db.prepare("SELECT wallet_balance FROM users WHERE id=?").get(userId);
    if (!user) fail(404, "账号不存在");
    const next = Number(user.wallet_balance || 0) + amount;
    if (next < 0) fail(400, "余额不足，请先充值");
    db.prepare("UPDATE users SET wallet_balance=? WHERE id=?").run(next, userId);
    const info = db
      .prepare(
        "INSERT INTO wallet_ledger (user_id,delta,balance,reason,scene,ref_type,ref_id) VALUES (?,?,?,?,?,?,?)"
      )
      .run(userId, amount, next, reason || SCENE_LABEL[scene] || "", scene || "", refType || "", refId || 0);
    return {
      id: Number(info.lastInsertRowid),
      delta: amount,
      balance: next,
      reason: reason || SCENE_LABEL[scene] || "",
      scene: scene || "",
    };
  });
  return run();
}

function credit(userId, amount, opts = {}) {
  const yuan = Math.round(Number(amount) || 0);
  if (yuan <= 0) return { balance: balanceOf(userId), skipped: true };
  return applyDelta(userId, yuan, opts);
}

function debit(userId, amount, opts = {}) {
  const yuan = Math.round(Number(amount) || 0);
  if (yuan <= 0) fail(400, "金额须大于 0");
  return applyDelta(userId, -yuan, opts);
}

function listBills(userId, limit = 50) {
  const n = Math.min(100, Math.max(1, Number(limit) || 50));
  return getDb()
    .prepare("SELECT * FROM wallet_ledger WHERE user_id=? ORDER BY id DESC LIMIT ?")
    .all(userId, n)
    .map(billView);
}

function billView(row) {
  return {
    id: row.id,
    delta: Number(row.delta || 0),
    balance: Number(row.balance || 0),
    reason: row.reason || SCENE_LABEL[row.scene] || "",
    scene: row.scene || "",
    refType: row.ref_type || "",
    refId: Number(row.ref_id || 0),
    createdAt: row.created_at,
  };
}

function addCard() {
  fail(400, CARD_CLOSED);
}

function removeCard() {
  fail(400, CARD_CLOSED);
}

function loadUser(userId) {
  const user = getDb().prepare("SELECT * FROM users WHERE id=?").get(userId);
  if (!user || user.deleted_at) fail(404, "账号不存在");
  return user;
}

function verifyPin(user, pin) {
  if (!user.wallet_pin_hash) fail(400, "请先设置支付密码");
  if (!bcrypt.compareSync(pinDigits(pin), user.wallet_pin_hash)) fail(400, "支付密码不正确");
}

function setPin(userId, body = {}) {
  const user = loadUser(userId);
  const pin = pinDigits(body.pin);
  if (user.wallet_pin_hash) {
    if (!body.oldPin) fail(400, "请填写原支付密码");
    verifyPin(user, body.oldPin);
  }
  getDb().prepare("UPDATE users SET wallet_pin_hash=? WHERE id=?").run(bcrypt.hashSync(pin, 10), userId);
  return { pinSet: true };
}

function resetPin(userId, body = {}) {
  const user = loadUser(userId);
  const want = String(body.idCard || body.id_card || "")
    .trim()
    .toUpperCase();
  const have = String(user.id_card || "")
    .trim()
    .toUpperCase();
  if (!have) fail(400, "请先完成实名后再重置支付密码");
  if (!want || want !== have) fail(400, "身份证号与实名信息不符");
  const pin = pinDigits(body.pin);
  getDb().prepare("UPDATE users SET wallet_pin_hash=? WHERE id=?").run(bcrypt.hashSync(pin, 10), userId);
  return { pinSet: true };
}

function withdraw(userId, body = {}) {
  const user = loadUser(userId);
  if (!user.id_card) fail(400, "提现前请先完成实名");
  verifyPin(user, body.pin);
  const bal = balanceOf(userId);
  if (bal <= 0) fail(400, "余额不足");
  const amount = parseYuan(body.amount, { min: 1, max: 200000 });
  if (amount > bal) fail(400, "余额不足");
  const mock = Boolean(config.wechat.mock);
  if (!mock && !user.wechat_openid) fail(400, "请先用微信登录后再提现到微信零钱");
  if (!mock) fail(400, "尚未开通微信商家转账到零钱，暂不能自动提现");
  const row = debit(userId, amount, {
    reason: "提现到微信零钱",
    scene: "withdraw",
    refType: "wechat",
    refId: 0,
  });
  return {
    amount,
    balance: row.balance,
    channel: "wechat",
    mock: true,
  };
}

function tripCounts(userId) {
  const db = getDb();
  const upcoming = db
    .prepare(
      `SELECT COUNT(*) AS c FROM enrollments e
       JOIN schedules s ON s.id=e.schedule_id
       WHERE e.user_id=? AND e.status='joined' AND s.status!='cancelled'
         AND s.start_date>=date('now','localtime')`
    )
    .get(userId).c;
  const waitlist = db
    .prepare(
      `SELECT COUNT(*) AS c FROM enrollments e
       JOIN schedules s ON s.id=e.schedule_id
       WHERE e.user_id=? AND e.status='waitlist' AND s.status!='cancelled'
         AND s.start_date>=date('now','localtime')`
    )
    .get(userId).c;
  const unpaid = db
    .prepare(
      `SELECT COUNT(*) AS c FROM enrollments e
       JOIN schedules s ON s.id=e.schedule_id
       WHERE e.user_id=? AND e.status='joined' AND e.pay_status='unpaid' AND s.status!='cancelled'
         AND IFNULL(e.pay_amount,0)>0`
    )
    .get(userId).c;
  const couponCount = db
    .prepare("SELECT COUNT(*) AS c FROM user_coupons WHERE user_id=? AND status='unused'")
    .get(userId).c;
  return { upcoming, waitlist, unpaid, couponCount };
}

function snapshot(userId) {
  const user = loadUser(userId);
  const counts = tripCounts(userId);
  return {
    balance: Number(user.wallet_balance || 0),
    pinSet: Boolean(user.wallet_pin_hash),
    realNamed: Boolean(user.id_card),
    realName: maskName(user.nickname || user.leader_name || ""),
    phoneMasked: maskPhone(user.phone),
    idCardMasked: maskIdCard(user.id_card),
    gender: user.gender || "",
    points: Number(user.points || 0),
    wechatBound: Boolean(user.wechat_openid),
    withdrawChannel: "wechat",
    bills: listBills(userId),
    upcomingCount: counts.upcoming,
    waitlistCount: counts.waitlist,
    unpaidCount: counts.unpaid,
    couponCount: counts.couponCount,
  };
}

function hasLedger(db, refType, refId) {
  if (!refType || !refId) return false;
  return Boolean(db.prepare("SELECT id FROM wallet_ledger WHERE ref_type=? AND ref_id=?").get(refType, refId));
}

function backfillHistoricCredits(db) {
  const pays = db
    .prepare(
      `SELECT * FROM payments
       WHERE status='success' AND (
         scene IN ('trip_bounty','route_bounty','wallet_topup')
         OR (channel='bounty' AND IFNULL(scene,'')!='')
       )`
    )
    .all();
  for (const row of pays) {
    if (hasLedger(db, "payment", row.id)) continue;
    const amount = Math.round(Number(row.amount || 0));
    if (amount <= 0 || !row.user_id) continue;
    const scene = row.scene === "wallet_topup" ? "topup" : row.scene || "trip_bounty";
    try {
      credit(row.user_id, amount, {
        reason: row.remark || SCENE_LABEL[scene] || "奖励入账",
        scene,
        refType: "payment",
        refId: row.id,
      });
    } catch {
      /* 历史补账失败不影响启动 */
    }
  }
  const refs = db.prepare("SELECT * FROM referrals WHERE status='settled'").all();
  for (const row of refs) {
    if (hasLedger(db, "referral", row.id)) continue;
    const amount = Math.round(Number(row.amount || 0));
    if (amount <= 0 || !row.referrer_id) continue;
    try {
      credit(row.referrer_id, amount, {
        reason: "分享报名返点",
        scene: "referral",
        refType: "referral",
        refId: row.id,
      });
    } catch {
      /* ignore */
    }
  }
}

module.exports = {
  SCENE_LABEL,
  fail,
  parseYuan,
  balanceOf,
  credit,
  debit,
  listBills,
  addCard,
  removeCard,
  setPin,
  resetPin,
  verifyPin,
  withdraw,
  snapshot,
  backfillHistoricCredits,
};
