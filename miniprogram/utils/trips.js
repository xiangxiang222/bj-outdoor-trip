function todayYmd(now) {
  now = now || new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + d;
}

function isUpcomingTrip(row, today) {
  today = today || todayYmd();
  if (!row) return false;
  if (row.status === "cancelled" || row.schedule_status === "cancelled") return false;
  return String(row.start_date || row.startDate || "").slice(0, 10) >= today;
}

function isWaitlistTrip(row) {
  return row && row.status === "waitlist";
}

function splitTrips(rows, today) {
  today = today || todayYmd();
  const upcoming = [];
  const waitlist = [];
  const past = [];
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    if (isWaitlistTrip(row) && isUpcomingTrip(row, today)) waitlist.push(row);
    else if (isUpcomingTrip(row, today)) upcoming.push(row);
    else past.push(row);
  });
  const byDate = (a, b) => String(a.start_date || a.startDate || "").localeCompare(String(b.start_date || b.startDate || ""));
  upcoming.sort(byDate);
  waitlist.sort(byDate);
  return { upcoming, waitlist, past };
}

function tripKindLabel(row) {
  return row && row.channel === "activity" ? "同城局" : "山野团";
}

module.exports = { todayYmd, isUpcomingTrip, isWaitlistTrip, splitTrips, tripKindLabel };
