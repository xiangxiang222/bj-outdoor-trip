function scheduleHasStarted(schedule, { ignorePlannedStart = false } = {}) {
  if (schedule.started_at || schedule.startedAt || schedule.completed_at || schedule.completedAt ||
      ["finished", "completed", "ended"].includes(schedule.status || schedule.schedule_status)) return true;
  if (ignorePlannedStart) return false;
  const date = String(schedule.start_date || schedule.startDate || "").slice(0, 10);
  const stamp = /^\d{4}-\d{2}-\d{2}$/.test(date) ? Date.parse(date + "T00:00:00Z") : NaN;
  if (!Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0, 10) !== date) return false;
  const beijing = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
  const time = String(schedule.meetup_time || schedule.meetupTime || "").trim();
  return date < beijing.slice(0, 10) || (date === beijing.slice(0, 10) && /^([01]\d|2[0-3]):[0-5]\d$/.test(time) && time <= beijing.slice(11, 16));
}

module.exports = { scheduleHasStarted };
