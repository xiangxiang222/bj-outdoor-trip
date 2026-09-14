const { nanoid } = require("nanoid");
const { getDb } = require("../db");
const { maskName } = require("./biz");
const { attachAssetHost } = require("./helpers");

const PENDING_MINUTES = 30;

function fail(status, message, extra) {
  const err = new Error(message);
  err.status = status;
  if (extra) err.extra = extra;
  throw err;
}

function allocateByShare(caps, total) {
  const weights = (caps || []).map((n) => Math.max(0, Number(n) || 0));
  const sum = weights.reduce((a, b) => a + b, 0);
  const want = Math.min(Math.max(0, Math.round(Number(total) || 0)), sum);
  if (!weights.length || want <= 0 || sum <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (w / sum) * want);
  const floors = exact.map((x) => Math.floor(x));
  let rem = want - floors.reduce((a, b) => a + b, 0);
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (rem <= 0) break;
    if (floors[i] < weights[i]) {
      floors[i] += 1;
      rem -= 1;
    }
  }
  if (rem > 0) {
    for (let i = 0; i < floors.length && rem > 0; i += 1) {
      const room = weights[i] - floors[i];
      if (room <= 0) continue;
      const add = Math.min(room, rem);
      floors[i] += add;
      rem -= add;
    }
  }
  return floors;
}

function isEnrollmentCharge(row) {
  return row && Number(row.enrollment_id || 0) > 0 && String(row.scene || "") !== "member";
}

function leftoverOf(row) {
  return Math.max(0, Number(row.amount || 0) - Number(row.refunded_amount || 0));
}

function expireStalePendings(enrollmentId) {
  getDb()
    .prepare(
      `UPDATE payments SET status='cancelled'
       WHERE enrollment_id=? AND status='pending' AND IFNULL(scene,'')!='member'
       AND created_at < datetime('now','localtime','-30 minutes')`
    )
    .run(enrollmentId);
}

function chargeRows(enrollmentId) {
  return getDb()
    .prepare(
      `SELECT * FROM payments
       WHERE enrollment_id=? AND status='success' AND IFNULL(refund_of,0)=0 AND IFNULL(scene,'')!='member'
       ORDER BY id`
    )
    .all(enrollmentId)
    .filter(isEnrollmentCharge);
}

function collectedOf(enrollmentId) {
  return chargeRows(enrollmentId).reduce((sum, row) => sum + leftoverOf(row), 0);
}

function reservedOf(enrollmentId, { exceptUserId } = {}) {
  expireStalePendings(enrollmentId);
  const rows = getDb()
    .prepare(
      `SELECT user_id, amount FROM payments
       WHERE enrollment_id=? AND status='pending' AND IFNULL(scene,'')!='member'`
    )
    .all(enrollmentId);
  return rows.reduce((sum, row) => {
    if (exceptUserId && Number(row.user_id) === Number(exceptUserId)) return sum;
    return sum + Number(row.amount || 0);
  }, 0);
}

function dueAmount(en) {
  return Math.max(0, Number(en && en.pay_amount ? en.pay_amount : 0));
}

function remainingDue(en) {
  return Math.max(0, dueAmount(en) - collectedOf(en.id));
}

function remainingForPayer(en, payerId) {
  return Math.max(0, remainingDue(en) - reservedOf(en.id, { exceptUserId: payerId }));
}

function refundableOf(en) {
  const collected = collectedOf(en.id);
  if (collected > 0) return collected;
  if (en && en.pay_status === "paid" && Number(en.pay_amount || 0) > 0) return Number(en.pay_amount);
  return 0;
}

function payProgress(en) {
  const payAmount = dueAmount(en);
  const paidAmount = collectedOf(en.id);
  const remainAmount = en && en.pay_status === "paid" ? 0 : Math.max(0, payAmount - paidAmount);
  return { payAmount, paidAmount, remainAmount };
}

function collectedMapForSchedule(scheduleId) {
  const rows = getDb()
    .prepare(
      `SELECT enrollment_id AS id, IFNULL(SUM(amount - IFNULL(refunded_amount,0)),0) AS paid
       FROM payments
       WHERE schedule_id=? AND status='success' AND IFNULL(refund_of,0)=0 AND IFNULL(scene,'')!='member'
       GROUP BY enrollment_id`
    )
    .all(scheduleId);
  const map = {};
  for (const row of rows) map[row.id] = Number(row.paid || 0);
  return map;
}

function contributorsOf(enrollmentId) {
  return getDb()
    .prepare(
      `SELECT p.user_id, p.amount, p.remark, p.created_at, u.nickname
       FROM payments p LEFT JOIN users u ON u.id=p.user_id
       WHERE p.enrollment_id=? AND p.status='success' AND IFNULL(p.refund_of,0)=0 AND IFNULL(p.scene,'')!='member'
       ORDER BY p.id`
    )
    .all(enrollmentId)
    .map((row) => ({
      userId: row.user_id,
      nickname: row.nickname || "同行",
      amount: Number(row.amount || 0),
      remark: row.remark || "",
      createdAt: row.created_at,
    }));
}

function ensurePayShareToken(enrollmentId) {
  const db = getDb();
  const row = db.prepare("SELECT pay_share_token FROM enrollments WHERE id=?").get(enrollmentId);
  if (!row) fail(404, "报名不存在");
  if (row.pay_share_token) return row.pay_share_token;
  for (let i = 0; i < 6; i += 1) {
    const token = nanoid(10);
    try {
      db.prepare("UPDATE enrollments SET pay_share_token=? WHERE id=? AND (pay_share_token IS NULL OR pay_share_token='')").run(
        token,
        enrollmentId
      );
    } catch {
      continue;
    }
    const next = db.prepare("SELECT pay_share_token FROM enrollments WHERE id=?").get(enrollmentId);
    if (next && next.pay_share_token) return next.pay_share_token;
  }
  fail(500, "无法生成付款分享");
}

function parsePayYuan(raw, remaining) {
  const cap = Math.max(0, Number(remaining) || 0);
  if (raw == null || raw === "") return cap;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) fail(400, "金额须大于 0");
  const yuan = Math.round(n);
  if (Math.abs(n - yuan) > 1e-8) fail(400, "金额须为整数元");
  if (yuan > cap) fail(400, `超过待付余额 ¥${cap}`);
  return yuan;
}

function remarkForPay({ payerId, enrolleeId, amount, remainingBefore }) {
  const self = Number(payerId) === Number(enrolleeId);
  const portion = amount < remainingBefore;
  if (self) return portion ? "自己支付（分摊）" : "自己支付";
  return portion ? "众筹分摊" : "他人代付";
}

function planPayerRefunds(en, refundTotal) {
  const want = Math.max(0, Math.round(Number(refundTotal) || 0));
  if (want <= 0) return [];
  const charges = chargeRows(en.id).filter((row) => leftoverOf(row) > 0);
  if (!charges.length) {
    if (en.pay_status === "paid" && Number(en.pay_amount || 0) > 0) {
      return [
        {
          paymentId: 0,
          userId: en.user_id,
          amount: Math.min(want, Number(en.pay_amount)),
          tradeNo: "",
          transactionId: "",
          chargeAmount: Number(en.pay_amount),
        },
      ];
    }
    return [];
  }
  const leftovers = charges.map((row) => leftoverOf(row));
  const slices = allocateByShare(leftovers, want);
  return charges
    .map((row, i) => ({
      paymentId: row.id,
      userId: row.user_id,
      amount: slices[i],
      tradeNo: row.trade_no || "",
      transactionId: row.wechat_transaction_id || "",
      chargeAmount: Number(row.amount || 0),
    }))
    .filter((row) => row.amount > 0);
}

function enrollmentByPayToken(token) {
  const trimmed = String(token || "").trim();
  if (!trimmed) return null;
  return getDb().prepare("SELECT * FROM enrollments WHERE pay_share_token=?").get(trimmed);
}

function payShareView(token, { userId, req } = {}) {
  const en = enrollmentByPayToken(token);
  if (!en) fail(404, "付款分享不存在或已失效");
  const db = getDb();
  const sch = db.prepare("SELECT * FROM schedules WHERE id=?").get(en.schedule_id);
  const route = sch ? db.prepare("SELECT id, title, cover FROM routes WHERE id=?").get(sch.route_id) : null;
  const progress = payProgress(en);
  const owner = !!(userId && Number(userId) === Number(en.user_id));
  const canPay =
    en.status === "joined" &&
    en.pay_status === "unpaid" &&
    !(sch && sch.status === "cancelled") &&
    progress.remainAmount > 0;
  return {
    token: en.pay_share_token,
    enrollmentId: en.id,
    scheduleId: en.schedule_id,
    title: (route && route.title) || "行程",
    cover: attachAssetHost(req, route && route.cover),
    startDate: sch ? sch.start_date : "",
    travelerName: owner ? en.traveler_name : maskName(en.traveler_name),
    payStatus: en.pay_status,
    enrollmentStatus: en.status,
    cancelled: !!(sch && sch.status === "cancelled") || en.status === "cancelled",
    company: en.pay_status === "company_pending",
    isOwner: owner,
    canPay,
    payAmount: progress.payAmount,
    paidAmount: progress.paidAmount,
    remainAmount: progress.remainAmount,
    contributors: contributorsOf(en.id).map((row) => ({
      ...row,
      self: !!(userId && Number(userId) === Number(row.userId)),
    })),
  };
}

module.exports = {
  PENDING_MINUTES,
  allocateByShare,
  expireStalePendings,
  chargeRows,
  collectedOf,
  reservedOf,
  remainingDue,
  remainingForPayer,
  refundableOf,
  payProgress,
  collectedMapForSchedule,
  contributorsOf,
  ensurePayShareToken,
  parsePayYuan,
  remarkForPay,
  planPayerRefunds,
  leftoverOf,
  enrollmentByPayToken,
  payShareView,
};
