const DAY = 86400000;

export function chinaDay(now = new Date()) {
  const stamp = new Date(now).getTime();
  return Number.isFinite(stamp) ? new Date(stamp + 8 * 3600000).toISOString().slice(0, 10) : "";
}

function validDay(value) {
  const day = String(value || "").slice(0, 10);
  const stamp = Date.parse(day + "T00:00:00Z");
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === day ? day : "";
}
function startOf(row) { return validDay(row && (row.startDate || row.start_date)); }

// Weekend means Saturday and Sunday in the current Monday–Sunday calendar week.
// It intentionally does not infer public holidays or compensatory working days.
export function weekendRange(key = "weekend", now = new Date()) {
  const today = chinaDay(now);
  if (!today || !["weekend", "nextweekend"].includes(key)) return { start: "", end: "" };
  const stamp = Date.parse(today + "T00:00:00Z");
  const weekday = new Date(stamp).getUTCDay();
  const monday = stamp - ((weekday + 6) % 7) * DAY;
  const saturday = monday + (key === "nextweekend" ? 12 : 5) * DAY;
  return {
    start: new Date(Math.max(stamp, saturday)).toISOString().slice(0, 10),
    end: new Date(saturday + DAY).toISOString().slice(0, 10),
  };
}

export function departureMonths(now = new Date()) {
  const today = chinaDay(now);
  if (!today) return [];
  const year = Number(today.slice(0, 4)), month = Number(today.slice(5, 7)) - 1;
  return Array.from({ length: 12 }, (_, offset) => {
    const date = new Date(Date.UTC(year, month + offset, 1));
    return { key: date.toISOString().slice(0, 7), label: (date.getUTCMonth() + 1) + "月", year: date.getUTCFullYear() };
  });
}

export function availableDepartures(rows, now = new Date()) {
  const today = chinaDay(now);
  const stamp = new Date(now).getTime();
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    if (!row || row.channel === "activity" || ["cancelled", "finished", "completed", "ended"].includes(row.status)) return false;
    if ((row.reviewStatus || row.review_status || "approved") !== "approved") return false;
    const day = startOf(row);
    if (!day || day < today) return false;
    const time = String(row.meetupTime || row.meetup_time || "").trim();
    if (day === today && /^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return Date.parse(day + "T" + time + ":00+08:00") > stamp;
    return true;
  });
}

export function matchesDepartureTime(row, selection = {}, now = new Date()) {
  const day = startOf(row);
  if (!day) return false;
  if (selection.date) return day === validDay(selection.date);
  if (selection.month) return /^\d{4}-(0[1-9]|1[0-2])$/.test(selection.month) && day.slice(0, 7) === selection.month;
  if (selection.festivalDates != null) {
    const dates = selection.festivalDates instanceof Set ? Array.from(selection.festivalDates) : selection.festivalDates;
    return Array.isArray(dates) && dates.some((value) => day === validDay(value && (value.date || value)));
  }
  if (selection.preset && selection.preset !== "any") {
    const range = weekendRange(selection.preset, now);
    return Boolean(range.start && day >= range.start && day <= range.end);
  }
  return true;
}

export function buildDepartureMonth(monthKey, rows = [], now = new Date()) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(monthKey || ""))) return [];
  const first = new Date(monthKey + "-01T00:00:00Z");
  const year = first.getUTCFullYear(), month = first.getUTCMonth();
  const count = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const leading = (first.getUTCDay() + 6) % 7;
  const length = Math.ceil((count + leading) / 7) * 7;
  const today = chinaDay(now);
  const counts = new Map();
  for (const row of availableDepartures(rows, now)) {
    const day = startOf(row);
    counts.set(day, (counts.get(day) || 0) + 1);
  }
  return Array.from({ length }, (_, index) => {
    const number = index - leading + 1;
    const blank = number < 1 || number > count;
    const date = blank ? "" : monthKey + "-" + String(number).padStart(2, "0");
    return { key: date || "blank-" + index, date, label: blank ? "" : String(number), disabled: blank || date < today, count: counts.get(date) || 0, blank, weekday: index % 7 + 1 };
  });
}
