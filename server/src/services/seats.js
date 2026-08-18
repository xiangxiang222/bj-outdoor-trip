const { getDb } = require("../db");

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
  for (const seat of seatLayout(maxSeats).seats) {
    if (!taken.has(seat.no)) return seat.no;
  }
  return null;
}

function assertSeatAvailable(scheduleId, maxSeats, seatNo, { currentEnrollmentId } = {}) {
  const layout = seatLayout(maxSeats);
  const hit = layout.seats.find((s) => s.no === String(seatNo || "").toUpperCase());
  if (!hit) {
    const err = new Error("座位号无效");
    err.status = 400;
    throw err;
  }
  const holder = getDb()
    .prepare(
      "SELECT id FROM enrollments WHERE schedule_id=? AND status='joined' AND seat_no=? AND id!=?"
    )
    .get(scheduleId, hit.no, currentEnrollmentId || 0);
  if (holder) {
    const err = new Error("该座位已被占用");
    err.status = 400;
    throw err;
  }
  return hit.no;
}

function scheduleSeats(scheduleId) {
  const db = getDb();
  const sch = db.prepare("SELECT * FROM schedules WHERE id=?").get(scheduleId);
  if (!sch) return null;
  const layout = seatLayout(sch.max_seats);
  const taken = db
    .prepare(
      "SELECT id, seat_no, traveler_name, user_id, status FROM enrollments WHERE schedule_id=? AND status='joined' AND seat_no IS NOT NULL AND seat_no!=''"
    )
    .all(scheduleId);
  const byNo = new Map(taken.map((row) => [row.seat_no, row]));
  return {
    scheduleId: sch.id,
    maxSeats: sch.max_seats,
    layout,
    seats: layout.seats.map((seat) => {
      const occ = byNo.get(seat.no);
      return {
        ...seat,
        taken: !!occ,
        enrollmentId: occ?.id || null,
        userId: occ?.user_id || null,
      };
    }),
  };
}

module.exports = { seatLayout, occupiedSeatNos, firstFreeSeat, assertSeatAvailable, scheduleSeats };
