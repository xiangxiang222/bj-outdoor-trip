const bcrypt = require("bcryptjs");
const { getDb } = require("../db");
const { maskName, maskPhone } = require("./biz");
const { maskIdCard } = require("./idcard");

const BANKS = [
  "工商银行",
  "建设银行",
  "农业银行",
  "中国银行",
  "交通银行",
  "招商银行",
  "邮储银行",
  "民生银行",
  "兴业银行",
  "浦发银行",
  "中信银行",
  "光大银行",
  "华夏银行",
  "北京银行",
  "其他",
];

const SCENE_LABEL = {
  referral: "分享报名返点",
  trip_bounty: "个人发团奖励",
  route_bounty: "线路成团奖励",
  enrollment_pay: "报名支付",
  refund: "报名退款",
  topup: "钱包充值",
  withdraw: "提现到银行卡",
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

function listCards(userId) {
  return getDb()
    .prepare("SELECT * FROM bank_cards WHERE user_id=? ORDER BY id DESC")
    .all(userId)
    .map(cardView);
}

function cardView(row) {
  return {
    id: row.id,
    holderName: maskName(row.holder_name),
    bankName: row.bank_name || "",
    last4: row.last4 || "",
    masked: row.card_no_masked || "",
    createdAt: row.created_at,
  };
}

function digitsOf(raw) {
  return String(raw || "").replace(/\D/g, "");
}

function maskCardNo(digits) {
  if (digits.length < 8) return `****${digits.slice(-4)}`;
  return `${digits.slice(0, 4)} **** **** ${digits.slice(-4)}`;
}

function normalizeBank(name) {
  const value = String(name || "").trim();
  if (BANKS.includes(value)) return value;
  if (value.length >= 2 && value.length <= 12) return value;
  fail(400, "请选择开户银行");
}

function addCard(userId, body = {}) {
  const holder = String(body.holderName || body.holder_name || "").trim();
  if (holder.length < 2 || holder.length > 20) fail(400, "请填写 2～20 字持卡人姓名");
  const digits = digitsOf(body.cardNo || body.card_no);
  if (digits.length < 13 || digits.length > 19) fail(400, "请填写 13～19 位银行卡号");
  const bankName = normalizeBank(body.bankName || body.bank_name);
  const db = getDb();
  const count = db.prepare("SELECT COUNT(*) AS c FROM bank_cards WHERE user_id=?").get(userId).c;
  if (count >= 3) fail(400, "最多绑定 3 张银行卡");
  const last4 = digits.slice(-4);
  const masked = maskCardNo(digits);
  const dup = db.prepare("SELECT id FROM bank_cards WHERE user_id=? AND last4=? AND bank_name=?").get(userId, last4, bankName);
  if (dup) fail(400, "该卡已绑定");
  const info = db
    .prepare("INSERT INTO bank_cards (user_id,holder_name,bank_name,last4,card_no_masked) VALUES (?,?,?,?,?)")
    .run(userId, holder, bankName, last4, masked);
  return cardView(db.prepare("SELECT * FROM bank_cards WHERE id=?").get(info.lastInsertRowid));
}

function removeCard(userId, cardId) {
  const db = getDb();
  const row = db.prepare("SELECT * FROM bank_cards WHERE id=? AND user_id=?").get(Number(cardId), userId);
  if (!row) fail(404, "银行卡不存在");
  db.prepare("DELETE FROM bank_cards WHERE id=?").run(row.id);
  return { deleted: true, id: row.id };
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
  const cards = listCards(userId);
  if (!cards.length) fail(400, "请先绑定银行卡");
  const cardId = Number(body.cardId || body.card_id || cards[0].id);
  const card = getDb().prepare("SELECT * FROM bank_cards WHERE id=? AND user_id=?").get(cardId, userId);
  if (!card) fail(404, "银行卡不存在");
  const bal = balanceOf(userId);
  if (bal <= 0) fail(400, "余额不足，请先充值");
  const amount = parseYuan(body.amount, { min: 1, max: 200000 });
  if (amount > bal) fail(400, "余额不足，请先充值");
  const row = debit(userId, amount, {
    reason: `提现到${card.bank_name}（尾号${card.last4}）`,
    scene: "withdraw",
    refType: "bank_card",
    refId: card.id,
  });
  return {
    amount,
    balance: row.balance,
    card: cardView(card),
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
    cards: listCards(userId),
    bills: listBills(userId),
    banks: BANKS,
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
  BANKS,
  SCENE_LABEL,
  fail,
  parseYuan,
  balanceOf,
  credit,
  debit,
  listBills,
  listCards,
  addCard,
  removeCard,
  setPin,
  resetPin,
  verifyPin,
  withdraw,
  snapshot,
  backfillHistoricCredits,
};
