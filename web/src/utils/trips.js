export function todayYmd(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function isUpcomingTrip(row, today = todayYmd()) {
  if (!row) return false;
  if (row.status === "cancelled" || row.schedule_status === "cancelled") return false;
  return String(row.start_date || row.startDate || "").slice(0, 10) >= today;
}

export function splitTrips(rows, today = todayYmd()) {
  const upcoming = [];
  const past = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (isUpcomingTrip(row, today)) upcoming.push(row);
    else past.push(row);
  }
  upcoming.sort((a, b) => String(a.start_date || a.startDate || "").localeCompare(String(b.start_date || b.startDate || "")));
  return { upcoming, past };
}

export function tripKindLabel(row) {
  return row?.channel === "activity" ? "同城局" : "山野团";
}
