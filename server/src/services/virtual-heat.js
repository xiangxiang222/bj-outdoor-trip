const dayjs = require("dayjs");
const { getDb } = require("../db");
const config = require("../config");
const { realEnrolledCount, virtualEnrolledCount } = require("./helpers");
const { parseLockedSeats } = require("./seats");

function heatConfig() {
  return config.virtualHeat || {};
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function lockedCountOf(sch) {
  return parseLockedSeats(sch).length;
}

function publishedAt(sch) {
  const raw = String(sch.created_at || "").trim();
  const t = raw ? dayjs(raw) : null;
  if (t && t.isValid()) return t;
  const start = dayjs(sch.start_date);
  return start.isValid() ? start.subtract(10, "day") : dayjs();
}

function startAt(sch) {
  const time = String(sch.meetup_time || "07:30").trim() || "07:30";
  const t = dayjs(`${sch.start_date} ${time}`);
  return t.isValid() ? t : dayjs(sch.start_date);
}

function isPrivate(sch) {
  return Boolean(String(sch.join_code || "").trim());
}

function isActivity(sch) {
  return (sch.channel || "trip") === "activity";
}

function heatEnabled(sch) {
  if (!sch || sch.status === "cancelled") return false;
  if (isActivity(sch) || isPrivate(sch)) return false;
  const mode = String(sch.heat_mode || "auto").trim() || "auto";
  return mode !== "off";
}

function heatLevels(sch, { real } = {}) {
  const cfg = heatConfig();
  const minGroup = Math.max(1, Number(sch.min_group_size) || 10);
  const maxSeats = Math.max(1, Number(sch.max_seats) || minGroup);
  const realN = real != null ? Number(real) : realEnrolledCount(sch.id);
  const locked = lockedCountOf(sch);
  const reserve = Math.max(1, Number(cfg.realReserve || 2));
  const floor = clamp(Math.round(minGroup * Number(cfg.floorRatio || 0.25)), 2, 5);
  let seed = clamp(Math.round(minGroup * Number(cfg.seedRatio || 0.45)), floor + 1, Math.max(floor + 1, minGroup - 2));
  seed = Math.min(seed, Math.max(floor, maxSeats - reserve));
  let ceiling = minGroup - 1 - realN;
  ceiling = Math.min(ceiling, maxSeats - realN - locked - reserve);
  ceiling = Math.max(0, ceiling);
  return { floor, seed, ceiling, minGroup, maxSeats, real: realN, locked, reserve };
}

function lerp(a, b, t) {
  return a + (b - a) * clamp(t, 0, 1);
}

function fillGoalShown(hoursOpen, floor, seed) {
  if (hoursOpen < 2) return floor;
  if (hoursOpen < 8) return lerp(floor, seed * 0.6, (hoursOpen - 2) / 6);
  if (hoursOpen < 18) return lerp(seed * 0.6, seed * 0.9, (hoursOpen - 8) / 10);
  if (hoursOpen < 24) return lerp(seed * 0.9, seed, (hoursOpen - 18) / 6);
  return seed;
}

function isNightQuiet(now) {
  if (!heatConfig().nightQuiet) return false;
  const minutes = now.hour() * 60 + now.minute();
  return minutes >= 30 && minutes < 6 * 60 + 30;
}

function targetVirtual(sch, now = dayjs()) {
  const levels = heatLevels(sch);
  const hoursOpen = Math.max(0, now.diff(publishedAt(sch), "minute") / 60);
  const hoursToStart = startAt(sch).diff(now, "minute") / 60;
  const fillHours = Number(heatConfig().fillHours || 24);
  const clearH = Number(heatConfig().clearVirtualHoursBeforeStart || 24);
  const stopH = Number(heatConfig().stopRefillHoursBeforeStart || 48);
  if (hoursToStart <= clearH) {
    return { ...levels, hoursOpen, hoursToStart, goalShown: levels.real, target: 0, reason: "clear" };
  }
  let goalShown = fillGoalShown(hoursOpen, levels.floor, levels.seed);
  if (hoursToStart <= 5 * 24) goalShown = Math.min(goalShown, levels.floor);
  goalShown = Math.round(goalShown);
  const yieldReal = (heatConfig().yieldMode || "replace") === "replace" ? levels.real : 0;
  let target = clamp(goalShown - yieldReal, 0, levels.ceiling);
  if (hoursToStart <= stopH && hoursOpen >= fillHours) {
    const current = virtualEnrolledCount(sch.id);
    target = Math.min(current, target);
  }
  const reason = hoursOpen < fillHours ? "fill" : "hold";
  return { ...levels, hoursOpen, hoursToStart, goalShown, target, reason };
}

function recentVirtualJoins(scheduleId, sinceText) {
  return Number(
    getDb()
      .prepare(
        `SELECT COUNT(*) AS c FROM enrollments e
         JOIN users u ON u.id=e.user_id
         WHERE e.schedule_id=? AND IFNULL(u.is_virtual,0)=1 AND e.status='joined' AND e.created_at>=?`
      )
      .get(scheduleId, sinceText).c || 0
  );
}

function lastVirtualJoinAt(scheduleId) {
  const row = getDb()
    .prepare(
      `SELECT e.created_at FROM enrollments e
       JOIN users u ON u.id=e.user_id
       WHERE e.schedule_id=? AND IFNULL(u.is_virtual,0)=1 AND e.status='joined'
       ORDER BY e.id DESC LIMIT 1`
    )
    .get(scheduleId);
  return row?.created_at || "";
}

function canAddNow(sch, now, { ignoreRate } = {}) {
  if (ignoreRate) return true;
  if (isNightQuiet(now) && realEnrolledCount(sch.id) + virtualEnrolledCount(sch.id) >= heatLevels(sch).floor) {
    return false;
  }
  const cfg = heatConfig();
  const last = lastVirtualJoinAt(sch.id);
  if (last && now.diff(dayjs(last), "minute") < Number(cfg.minIntervalMinutes || 8)) return false;
  const hourAgo = now.subtract(1, "hour").format("YYYY-MM-DD HH:mm:ss");
  if (recentVirtualJoins(sch.id, hourAgo) >= Number(cfg.maxPerHour || 3)) return false;
  return true;
}

function ensureIdle(need) {
  const { growVirtualPool, virtualPoolStats } = require("./virtual");
  const stats = virtualPoolStats();
  if (stats.idle >= need) return stats;
  const cap = Number(heatConfig().poolSize || 2000);
  const room = Math.max(0, cap - stats.total);
  const grow = Math.min(50, Math.max(0, need - stats.idle), room);
  if (grow < 1) return stats;
  try {
    return growVirtualPool(grow);
  } catch {
    return virtualPoolStats();
  }
}

function applyTarget(sch, target, { lock = false } = {}) {
  const { setVirtualUsersForSchedule } = require("./virtual");
  const want = Math.max(0, Math.floor(Number(target) || 0));
  if (want > virtualEnrolledCount(sch.id)) ensureIdle(want - virtualEnrolledCount(sch.id));
  return setVirtualUsersForSchedule(sch.id, want, { lock });
}

function snapshotOf(sch, now = dayjs()) {
  const current = virtualEnrolledCount(sch.id);
  const plan = targetVirtual(sch, now);
  return {
    enabled: heatEnabled(sch),
    locked: Boolean(Number(sch.heat_locked)),
    mode: String(sch.heat_mode || "auto") || "auto",
    yieldMode: heatConfig().yieldMode || "replace",
    real: plan.real,
    virtual: current,
    shown: plan.real + current,
    floor: plan.floor,
    seed: plan.seed,
    ceiling: plan.ceiling,
    target: plan.target,
    reason: plan.reason,
    hoursOpen: Number(plan.hoursOpen.toFixed(2)),
    hoursToStart: Number(plan.hoursToStart.toFixed(2)),
  };
}

function tickScheduleHeat(scheduleId, { now, ignoreRate, addBudget } = {}) {
  const db = getDb();
  const sch = db.prepare("SELECT * FROM schedules WHERE id=?").get(scheduleId);
  if (!sch) return null;
  const clock = now ? dayjs(now) : dayjs();
  if (sch.status === "cancelled" || clock.isAfter(startAt(sch), "minute")) {
    const current = virtualEnrolledCount(sch.id);
    if (current > 0) applyTarget(sch, 0, { lock: false });
    return { scheduleId: Number(sch.id), ...snapshotOf(db.prepare("SELECT * FROM schedules WHERE id=?").get(sch.id), clock), changed: current > 0 };
  }
  if (!heatEnabled(sch)) return { scheduleId: Number(sch.id), ...snapshotOf(sch, clock), changed: false };
  if (Number(sch.heat_locked) && targetVirtual(sch, clock).reason !== "clear") {
    return { scheduleId: Number(sch.id), ...snapshotOf(sch, clock), changed: false };
  }
  const plan = targetVirtual(sch, clock);
  let current = virtualEnrolledCount(sch.id);
  let next = current;
  if (plan.reason === "clear") {
    next = 0;
  } else if (current > plan.ceiling) {
    next = plan.ceiling;
  } else if (plan.target < current) {
    next = Math.max(plan.target, current - 2);
  } else if (plan.target > current) {
    const budget = addBudget == null ? 1 : addBudget;
    if (budget > 0 && canAddNow(sch, clock, { ignoreRate })) next = current + 1;
  }
  if (next !== current) applyTarget(sch, next, { lock: false });
  const after = db.prepare("SELECT * FROM schedules WHERE id=?").get(sch.id);
  return {
    scheduleId: Number(sch.id),
    ...snapshotOf(after, clock),
    changed: next !== current,
    added: Math.max(0, next - current),
  };
}

function recruitingTrips() {
  return getDb()
    .prepare(
      `SELECT * FROM schedules WHERE status!='cancelled' AND IFNULL(review_status,'approved')='approved'
       AND start_date>=date('now','localtime')`
    )
    .all();
}

function runHeatJobs({ now, ignoreRate } = {}) {
  const clock = now ? dayjs(now) : dayjs();
  const trips = recruitingTrips().filter((sch) => heatEnabled(sch) || virtualEnrolledCount(sch.id) > 0);
  trips.sort((a, b) => {
    const sa = realEnrolledCount(a.id) + virtualEnrolledCount(a.id);
    const sb = realEnrolledCount(b.id) + virtualEnrolledCount(b.id);
    if (sa !== sb) return sa - sb;
    const ao = a.organizer_type === "official" ? 0 : 1;
    const bo = b.organizer_type === "official" ? 0 : 1;
    if (ao !== bo) return ao - bo;
    return Number(a.id) - Number(b.id);
  });
  let budget = Number(heatConfig().maxAddPerTick || 20);
  const results = [];
  for (const sch of trips) {
    const row = tickScheduleHeat(sch.id, { now: clock, ignoreRate, addBudget: budget });
    if (row?.added) budget = Math.max(0, budget - row.added);
    if (row) results.push(row);
  }
  return { count: results.length, added: results.reduce((n, r) => n + Number(r.added || 0), 0), results };
}

module.exports = {
  heatConfig,
  heatEnabled,
  heatLevels,
  targetVirtual,
  snapshotOf,
  tickScheduleHeat,
  runHeatJobs,
};
