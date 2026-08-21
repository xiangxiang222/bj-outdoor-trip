const bcrypt = require("bcryptjs");
const dayjs = require("dayjs");
const { getDb } = require("../db");
const { makeIdCard } = require("./idcard");
const { firstFreeSeat } = require("./seats");
const { enrolledCount, virtualEnrolledCount, realEnrolledCount } = require("./helpers");

const SHARED_HASH = bcrypt.hashSync("123456", 8);

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

function nextVirtualPhone(index) {
  return `19988${String(100000 + index).slice(-6)}`;
}

function kickVirtualSeat(scheduleId) {
  const row = getDb()
    .prepare(
      `SELECT e.id FROM enrollments e
       JOIN users u ON u.id=e.user_id
       WHERE e.schedule_id=? AND e.status='joined' AND IFNULL(u.is_virtual,0)=1
       ORDER BY e.id DESC LIMIT 1`
    )
    .get(scheduleId);
  if (!row) return false;
  getDb().prepare("UPDATE enrollments SET status='cancelled' WHERE id=?").run(row.id);
  return true;
}

function trimVirtuals(scheduleId) {
  const db = getDb();
  const sch = db.prepare("SELECT * FROM schedules WHERE id=?").get(scheduleId);
  if (!sch) return 0;
  const real = realEnrolledCount(scheduleId);
  const virtuals = db
    .prepare(
      `SELECT e.id FROM enrollments e
       JOIN users u ON u.id=e.user_id
       WHERE e.schedule_id=? AND e.status='joined' AND IFNULL(u.is_virtual,0)=1
       ORDER BY e.id DESC`
    )
    .all(scheduleId);
  let drop = [];
  if (real >= Number(sch.min_group_size)) drop = virtuals;
  else if (virtuals.length > 3) drop = virtuals.slice(3);
  for (const row of drop) {
    db.prepare("UPDATE enrollments SET status='cancelled' WHERE id=?").run(row.id);
  }
  return drop.length;
}

function generateVirtualUsers({ count = 8, perSchedule = 3 } = {}) {
  const db = getDb();
  const n = Math.min(40, Math.max(1, Number(count) || 8));
  const cap = Math.min(12, Math.max(1, Number(perSchedule) || 3));
  const schedules = db
    .prepare(
      `SELECT * FROM schedules WHERE status!='cancelled' AND IFNULL(review_status,'approved')='approved'
       AND start_date>=date('now') ORDER BY start_date, id`
    )
    .all();
  if (!schedules.length) fail(400, "没有可报名的排期");
  let created = 0;
  let joined = 0;
  const existing = db.prepare("SELECT COUNT(*) AS c FROM users WHERE IFNULL(is_virtual,0)=1").get().c;
  for (let i = 0; i < n; i += 1) {
    const seq = existing + i + 1;
    const phone = nextVirtualPhone(seq);
    if (db.prepare("SELECT id FROM users WHERE phone=?").get(phone)) continue;
    const sex = seq % 2 === 1 ? "1" : "2";
    const birth = dayjs("1980-01-01").add(seq, "day").format("YYYYMMDD");
    const birthday = `${birth.slice(0, 4)}-${birth.slice(4, 6)}-${birth.slice(6, 8)}`;
    const idCard = makeIdCard("110101", birth, sex, "12");
    const info = db
      .prepare(
        `INSERT INTO users (phone,password_hash,nickname,gender,birthday,id_card,hometown,role,is_virtual,referral_code)
         VALUES (?,?,?,?,?,?,?,?,?,?)`
      )
      .run(phone, SHARED_HASH, `山友${seq}`, sex === "1" ? "male" : "female", birthday, idCard, "北京市", "user", 1, `VX${seq}`);
    const userId = Number(info.lastInsertRowid);
    created += 1;
    const sch = schedules[seq % schedules.length];
    const occupied = enrolledCount(sch.id);
    if (occupied >= Number(sch.max_seats)) continue;
    if (virtualEnrolledCount(sch.id) >= cap) continue;
    const seat = firstFreeSeat(sch.id, sch.max_seats);
    if (!seat) continue;
    db.prepare(
      `INSERT INTO enrollments (schedule_id,user_id,traveler_name,traveler_phone,id_card,gender,birthday,hometown,traveler_type,pay_status,pay_amount,join_mode,status,seat_no,insurance_code,emergency_name,emergency_phone,waiver_accepted_at,health_declared_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      sch.id,
      userId,
      `山友${seq}`,
      phone,
      idCard,
      sex === "1" ? "male" : "female",
      birthday,
      "北京市",
      "adult",
      "unpaid",
      0,
      "virtual",
      "joined",
      seat,
      "none",
      "虚拟紧急联系人",
      "13700000099",
      null,
      null
    );
    joined += 1;
  }
  return { created, joined, count: n };
}

module.exports = { kickVirtualSeat, trimVirtuals, generateVirtualUsers, nextVirtualPhone };
