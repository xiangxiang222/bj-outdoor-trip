const dayjs = require("dayjs");
const { getDb } = require("../db");

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

function nowText() {
  return dayjs().format("YYYY-MM-DD HH:mm:ss");
}

function loadSchedule(scheduleId) {
  const sch = getDb().prepare("SELECT * FROM schedules WHERE id=?").get(Number(scheduleId));
  if (!sch) fail(404, "行程不存在");
  if (sch.status === "cancelled") fail(400, "本团已解散");
  return sch;
}

function actorRole(actor = {}) {
  return actor.role === "guide" ? "guide" : "admin";
}

function itineraryStops(scheduleId) {
  const sch = getDb().prepare("SELECT route_id FROM schedules WHERE id=?").get(Number(scheduleId));
  if (!sch) return [];
  const route = getDb().prepare("SELECT itinerary_json FROM routes WHERE id=?").get(sch.route_id);
  let items = [];
  try {
    items = JSON.parse(route?.itinerary_json || "[]");
  } catch {
    items = [];
  }
  if (!Array.isArray(items)) items = [];
  return items
    .map((item, index) => ({
      key: `stop-${index}`,
      kind: "stop",
      stopIndex: index,
      time: item?.time || "",
      title: String(item?.title || "").trim() || `行程 ${index + 1}`,
    }))
    .filter((item) => item.title);
}

function checkinStops(scheduleId) {
  return [{ key: "depart", kind: "depart", stopIndex: -1, time: "", title: "出发前上车" }, ...itineraryStops(scheduleId)];
}

function resolveStop(scheduleId, body = {}) {
  const stops = checkinStops(scheduleId);
  const key = String(body.stopKey || body.stop_key || "").trim();
  if (key) {
    const hit = stops.find((s) => s.key === key);
    if (!hit) fail(400, "请选择出发前或休息点");
    return hit;
  }
  if (body.kind === "depart" || body.stopIndex === -1 || body.stop_index === -1) {
    return stops[0];
  }
  if (body.stopIndex != null || body.stop_index != null) {
    const idx = Number(body.stopIndex ?? body.stop_index);
    const hit = stops.find((s) => s.stopIndex === idx);
    if (hit) return hit;
  }
  const title = String(body.title || "").trim().slice(0, 40);
  if (title) return { key: "custom", kind: "custom", stopIndex: -2, time: "", title };
  return stops[0];
}

function openSessionOf(scheduleId) {
  return getDb()
    .prepare("SELECT * FROM checkin_sessions WHERE schedule_id=? AND status='open' ORDER BY id DESC LIMIT 1")
    .get(Number(scheduleId));
}

function markedIdsOf(sessionId) {
  if (!sessionId) return new Set();
  return new Set(
    getDb()
      .prepare("SELECT enrollment_id AS id FROM checkin_marks WHERE session_id=?")
      .all(sessionId)
      .map((row) => Number(row.id))
  );
}

function joinedCount(scheduleId) {
  return Number(
    getDb()
      .prepare("SELECT COUNT(*) AS c FROM enrollments WHERE schedule_id=? AND status='joined'")
      .get(Number(scheduleId)).c || 0
  );
}

function mapSession(row, total) {
  const marked = markedIdsOf(row.id);
  return {
    id: row.id,
    kind: row.kind || "depart",
    stopIndex: Number(row.stop_index ?? -1),
    title: row.title || "签到",
    status: row.status || "open",
    openedAt: row.opened_at || "",
    confirmedAt: row.confirmed_at || "",
    markedCount: marked.size,
    total,
    markedIds: [...marked],
  };
}

function tripRunOf(scheduleId) {
  const sid = Number(scheduleId);
  const sch = getDb().prepare("SELECT * FROM schedules WHERE id=?").get(sid);
  if (!sch) fail(404, "行程不存在");
  const total = joinedCount(sid);
  const sessions = getDb()
    .prepare("SELECT * FROM checkin_sessions WHERE schedule_id=? ORDER BY id DESC")
    .all(sid)
    .map((row) => mapSession(row, total));
  const open = sessions.find((s) => s.status === "open") || null;
  return {
    startedAt: sch.started_at || "",
    startedBy: sch.started_by || "",
    stops: checkinStops(sid),
    sessions,
    openSession: open,
  };
}

function startTrip(scheduleId, actor = {}) {
  const sch = loadSchedule(scheduleId);
  if (sch.started_at) {
    return { startedAt: sch.started_at, already: true };
  }
  const now = nowText();
  getDb()
    .prepare("UPDATE schedules SET started_at=?, started_by=?, started_by_id=? WHERE id=?")
    .run(now, actorRole(actor), actor.id || 0, sch.id);
  return { startedAt: now, already: false };
}

function openCheckin(scheduleId, body = {}, actor = {}) {
  const sch = loadSchedule(scheduleId);
  if (openSessionOf(sch.id)) fail(400, "本轮签到还没确认，确认后再发起下一轮");
  const stop = resolveStop(sch.id, body);
  const now = nowText();
  const info = getDb()
    .prepare(
      `INSERT INTO checkin_sessions (schedule_id,kind,stop_index,title,status,opened_at,opened_by,opened_by_id)
       VALUES (?,?,?,?,?,?,?,?)`
    )
    .run(sch.id, stop.kind, stop.stopIndex, stop.title, "open", now, actorRole(actor), actor.id || 0);
  return tripRunOf(sch.id).sessions.find((s) => s.id === Number(info.lastInsertRowid));
}

function markCheckin(scheduleId, enrollmentId, actor = {}, sessionId) {
  const sch = loadSchedule(scheduleId);
  const en = getDb()
    .prepare("SELECT * FROM enrollments WHERE id=? AND schedule_id=? AND status='joined'")
    .get(Number(enrollmentId), sch.id);
  if (!en) fail(400, "报名不存在或已取消");
  let session = sessionId
    ? getDb().prepare("SELECT * FROM checkin_sessions WHERE id=? AND schedule_id=?").get(Number(sessionId), sch.id)
    : openSessionOf(sch.id);
  if (sessionId && !session) fail(404, "签到轮次不存在");
  if (session && session.status !== "open") fail(400, "本轮已确认，不能再改");
  const now = nowText();
  if (session) {
    getDb()
      .prepare(
        `INSERT INTO checkin_marks (session_id,enrollment_id,marked_at,marked_by,marked_by_id)
         VALUES (?,?,?,?,?)
         ON CONFLICT(session_id, enrollment_id) DO UPDATE SET marked_at=excluded.marked_at, marked_by=excluded.marked_by, marked_by_id=excluded.marked_by_id`
      )
      .run(session.id, en.id, now, actorRole(actor), actor.id || 0);
  }
  if (!en.checkin_at) {
    getDb()
      .prepare("UPDATE enrollments SET checkin_at=?, checkin_by=? WHERE id=?")
      .run(now, actor.id || 0, en.id);
  }
  const updated = getDb().prepare("SELECT checkin_at FROM enrollments WHERE id=?").get(en.id);
  return {
    enrollmentId: en.id,
    checkinAt: updated.checkin_at,
    sessionId: session ? session.id : 0,
  };
}

function unmarkCheckin(scheduleId, enrollmentId, actor = {}, sessionId) {
  const sch = loadSchedule(scheduleId);
  const session = sessionId
    ? getDb().prepare("SELECT * FROM checkin_sessions WHERE id=? AND schedule_id=?").get(Number(sessionId), sch.id)
    : openSessionOf(sch.id);
  if (!session) fail(400, "没有进行中的签到");
  if (session.status !== "open") fail(400, "本轮已确认，不能再改");
  getDb().prepare("DELETE FROM checkin_marks WHERE session_id=? AND enrollment_id=?").run(session.id, Number(enrollmentId));
  return tripRunOf(sch.id);
}

function confirmCheckin(scheduleId, sessionId, actor = {}) {
  const sch = loadSchedule(scheduleId);
  const session = getDb()
    .prepare("SELECT * FROM checkin_sessions WHERE id=? AND schedule_id=?")
    .get(Number(sessionId), sch.id);
  if (!session) fail(404, "签到轮次不存在");
  if (session.status === "confirmed") {
    return mapSession(session, joinedCount(sch.id));
  }
  const now = nowText();
  getDb()
    .prepare("UPDATE checkin_sessions SET status='confirmed', confirmed_at=?, confirmed_by=?, confirmed_by_id=? WHERE id=?")
    .run(now, actorRole(actor), actor.id || 0, session.id);
  return mapSession(getDb().prepare("SELECT * FROM checkin_sessions WHERE id=?").get(session.id), joinedCount(sch.id));
}

module.exports = {
  startTrip,
  openCheckin,
  markCheckin,
  unmarkCheckin,
  confirmCheckin,
  tripRunOf,
  checkinStops,
};
