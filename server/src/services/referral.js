const QRCode = require("qrcode");
const { getDb } = require("../db");
const { publicBase } = require("./helpers");
const { ensureReferralCode } = require("./profile");
const config = require("../config");

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

function findReferrer(code) {
  if (!code) return null;
  const raw = String(code).trim().toUpperCase();
  if (!raw) return null;
  return getDb().prepare("SELECT * FROM users WHERE upper(referral_code)=? AND deleted_at IS NULL").get(raw);
}

function recordEnrollReferral(referrerId, enrollmentId, payAmount) {
  if (!referrerId || !enrollmentId) return null;
  const amount = Math.max(0, Math.round(Number(payAmount || 0) * Number(config.referral.enrollRate)));
  if (!amount) return null;
  const exist = getDb().prepare("SELECT id FROM referrals WHERE enrollment_id=?").get(enrollmentId);
  if (exist) return exist;
  const info = getDb()
    .prepare("INSERT INTO referrals (referrer_id, enrollment_id, amount, rate, status) VALUES (?,?,?,?,?)")
    .run(referrerId, enrollmentId, amount, config.referral.enrollRate, "pending");
  return { id: Number(info.lastInsertRowid), amount, status: "pending" };
}

function settleEnrollReferrals() {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT rf.* FROM referrals rf
       JOIN enrollments e ON e.id=rf.enrollment_id
       JOIN schedules s ON s.id=e.schedule_id
       WHERE rf.status='pending' AND e.status='joined' AND s.status!='cancelled'`
    )
    .all();
  for (const row of rows) {
    db.prepare("UPDATE referrals SET status='settled' WHERE id=?").run(row.id);
  }
  return rows.length;
}

async function referralCard(userId, req, { scheduleId } = {}) {
  const code = ensureReferralCode(userId);
  const base = publicBase(req);
  const path = scheduleId ? `/m/schedule/${scheduleId}?ref=${code}` : `/m?ref=${code}`;
  const url = `${base}${path}`;
  const qr = await QRCode.toDataURL(url);
  const db = getDb();
  const list = db
    .prepare(
      `SELECT rf.id, rf.amount, rf.status, rf.created_at AS createdAt, e.traveler_name, s.start_date, r.title
       FROM referrals rf
       JOIN enrollments e ON e.id=rf.enrollment_id
       JOIN schedules s ON s.id=e.schedule_id
       JOIN routes r ON r.id=s.route_id
       WHERE rf.referrer_id=? ORDER BY rf.id DESC LIMIT 50`
    )
    .all(userId);
  const earned = list.filter((x) => x.status === "settled").reduce((s, x) => s + Number(x.amount || 0), 0);
  const pending = list.filter((x) => x.status === "pending").reduce((s, x) => s + Number(x.amount || 0), 0);
  return {
    code,
    rate: config.referral.enrollRate,
    url,
    qr,
    count: list.length,
    earned,
    pending,
    list: list.map((x) => ({
      id: x.id,
      title: x.title,
      startDate: x.start_date,
      amount: x.amount,
      status: x.status,
      createdAt: x.createdAt,
    })),
  };
}

function groupQrPayload(text) {
  const value = String(text || "").trim();
  if (!value) return Promise.resolve("");
  return QRCode.toDataURL(value);
}

module.exports = {
  findReferrer,
  recordEnrollReferral,
  settleEnrollReferrals,
  referralCard,
  groupQrPayload,
  fail,
};
