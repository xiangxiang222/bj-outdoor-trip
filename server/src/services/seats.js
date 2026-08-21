const { getDb } = require("../db");
const { maskName } = require("./biz");
const { lifeStageFromPerson } = require("./idcard");

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

function seatLayout(total) {
  const count = Math.max(1, Number(total) || 0);
  const cols = ["A", "B", "C", "D"];
  const seats = [];
  let n = 0;
  let row = 1;
  while (n < count) {
    for (const col of cols) {
      if (n >= count) break;
      n += 1;
      seats.push({ no: `${row}${col}`, row, col, aisleAfter: col === "B" });
    }
    row += 1;
  }
  return { total: count, cols, rows: row - 1, seats };
}

function parseLockedSeats(sch) {
  try {
    const raw = JSON.parse((sch && sch.locked_seats) || "[]");
    return Array.isArray(raw) ? raw.map((s) => String(s || "").toUpperCase()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function occupiedSeatNos(scheduleId) {
  return getDb()
    .prepare(
      "SELECT seat_no FROM enrollments WHERE schedule_id=? AND status='joined' AND seat_no IS NOT NULL AND seat_no!=''"
    )
    .all(scheduleId)
    .map((row) => row.seat_no);
}

function firstFreeSeat(scheduleId, maxSeats) {
  const taken = new Set(occupiedSeatNos(scheduleId));
  const sch = getDb().prepare("SELECT locked_seats FROM schedules WHERE id=?").get(scheduleId) || {};
  const locked = new Set(parseLockedSeats(sch));
  for (const seat of seatLayout(maxSeats).seats) {
    if (!taken.has(seat.no) && !locked.has(seat.no)) return seat.no;
  }
  return null;
}

function assertSeatAvailable(scheduleId, maxSeats, seatNo, { currentEnrollmentId } = {}) {
  const layout = seatLayout(maxSeats);
  const hit = layout.seats.find((s) => s.no === String(seatNo || "").toUpperCase());
  if (!hit) {
    fail(400, "座位号无效");
  }
  const sch = getDb().prepare("SELECT locked_seats FROM schedules WHERE id=?").get(scheduleId) || {};
  const locked = new Set(parseLockedSeats(sch));
  if (locked.has(hit.no)) fail(400, "该座位已锁定");
  const holder = getDb()
    .prepare(
      "SELECT id FROM enrollments WHERE schedule_id=? AND status='joined' AND seat_no=? AND id!=?"
    )
    .get(scheduleId, hit.no, currentEnrollmentId || 0);
  if (holder) fail(400, "该座位已被占用");
  return hit.no;
}

function occupantView(row) {
  if (!row) return null;
  const stage = lifeStageFromPerson({ idCard: row.id_card, birthday: row.birthday });
  const name = maskName(row.traveler_name || row.nickname);
  return {
    enrollmentId: row.id,
    userId: row.user_id || null,
    name,
    initial: String(name || "友").slice(0, 1),
    gender: row.gender || "",
    lifeStage: stage.label || "",
    avatar: row.avatar || "",
    payStatus: row.pay_status || "",
  };
}

function scheduleSeats(scheduleId) {
  const db = getDb();
  const sch = db.prepare("SELECT * FROM schedules WHERE id=?").get(scheduleId);
  if (!sch) return null;
  const layout = seatLayout(sch.max_seats);
  const locked = new Set(parseLockedSeats(sch));
  const taken = db
    .prepare(
      `SELECT e.id, e.seat_no, e.traveler_name, e.user_id, e.status, e.gender, e.birthday, e.id_card, e.pay_status, u.avatar, u.nickname
       FROM enrollments e LEFT JOIN users u ON u.id=e.user_id
       WHERE e.schedule_id=? AND e.status='joined' AND e.seat_no IS NOT NULL AND e.seat_no!=''`
    )
    .all(scheduleId);
  const byNo = new Map(taken.map((row) => [row.seat_no, row]));
  return {
    scheduleId: sch.id,
    maxSeats: sch.max_seats,
    lockedSeats: [...locked],
    layout,
    seats: layout.seats.map((seat) => {
      const occ = byNo.get(seat.no);
      const isLocked = locked.has(seat.no);
      return {
        ...seat,
        taken: !!occ || isLocked,
        locked: isLocked,
        enrollmentId: occ?.id || null,
        userId: occ?.user_id || null,
        occupant: occupantView(occ),
      };
    }),
  };
}

function setLockedSeats(scheduleId, seatNos) {
  const db = getDb();
  const sch = db.prepare("SELECT * FROM schedules WHERE id=?").get(scheduleId);
  if (!sch) fail(404, "排期不存在");
  const valid = new Set(seatLayout(sch.max_seats).seats.map((s) => s.no));
  const occupied = new Set(occupiedSeatNos(scheduleId));
  const next = [];
  for (const raw of seatNos || []) {
    const no = String(raw || "").toUpperCase();
    if (!no) continue;
    if (!valid.has(no)) fail(400, "座位号无效");
    if (occupied.has(no)) fail(400, "不能锁定已占用座位");
    if (!next.includes(no)) next.push(no);
  }
  db.prepare("UPDATE schedules SET locked_seats=? WHERE id=?").run(JSON.stringify(next), scheduleId);
  return parseLockedSeats(db.prepare("SELECT locked_seats FROM schedules WHERE id=?").get(scheduleId));
}

function toggleLockedSeat(scheduleId, seatNo, locked) {
  const db = getDb();
  const sch = db.prepare("SELECT * FROM schedules WHERE id=?").get(scheduleId);
  if (!sch) fail(404, "排期不存在");
  const no = String(seatNo || "").toUpperCase();
  const current = parseLockedSeats(sch);
  const next = locked ? [...new Set([...current, no])] : current.filter((s) => s !== no);
  return setLockedSeats(scheduleId, next);
}

function assignSeat(scheduleId, enrollmentId, toSeatNo) {
  const db = getDb();
  const sch = db.prepare("SELECT * FROM schedules WHERE id=?").get(scheduleId);
  if (!sch) fail(404, "排期不存在");
  const to = String(toSeatNo || "").toUpperCase();
  const valid = seatLayout(sch.max_seats).seats.find((s) => s.no === to);
  if (!valid) fail(400, "座位号无效");
  const en = db.prepare("SELECT * FROM enrollments WHERE id=? AND schedule_id=? AND status='joined'").get(enrollmentId, scheduleId);
  if (!en) fail(400, "报名不存在或未占座");
  const locked = new Set(parseLockedSeats(sch));
  const holder = db
    .prepare("SELECT * FROM enrollments WHERE schedule_id=? AND status='joined' AND seat_no=? AND id!=?")
    .get(scheduleId, to, en.id);
  if (!holder && locked.has(to)) fail(400, "该座位已锁定");
  const from = en.seat_no || "";
  if (holder && !from) fail(400, "请先给该乘客指定座位再对调");
  const run = db.transaction(() => {
    if (holder) {
      db.prepare("UPDATE enrollments SET seat_no=? WHERE id=?").run(from, holder.id);
    }
    db.prepare("UPDATE enrollments SET seat_no=? WHERE id=?").run(to, en.id);
  });
  run();
  return {
    enrollmentId: en.id,
    seatNo: to,
    swappedWith: holder ? holder.id : null,
  };
}

module.exports = {
  seatLayout,
  occupiedSeatNos,
  firstFreeSeat,
  assertSeatAvailable,
  scheduleSeats,
  parseLockedSeats,
  setLockedSeats,
  toggleLockedSeat,
  assignSeat,
};
