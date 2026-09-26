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

export function isWaitlistTrip(row) {
  return row?.status === "waitlist";
}

export function splitTrips(rows, today = todayYmd()) {
  const upcoming = [];
  const waitlist = [];
  const past = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (isWaitlistTrip(row) && isUpcomingTrip(row, today)) waitlist.push(row);
    else if (isUpcomingTrip(row, today)) upcoming.push(row);
    else past.push(row);
  }
  const byDate = (a, b) => String(a.start_date || a.startDate || "").localeCompare(String(b.start_date || b.startDate || ""));
  upcoming.sort(byDate);
  waitlist.sort(byDate);
  return { upcoming, waitlist, past };
}

export function isUnpaidTrip(row) {
  if (!row || row.status !== "joined") return false;
  if (row.schedule_status === "cancelled") return false;
  return row.pay_status === "unpaid" && Number(row.pay_amount || row.payAmount || 0) > 0;
}

export function isReviewTrip(row, today = todayYmd()) {
  if (!row || !row.canReview) return false;
  if (row.schedule_status === "cancelled") return false;
  return String(row.start_date || row.startDate || "").slice(0, 10) < today;
}

export function isRefundTrip(row) {
  return Boolean(row && row.refundProgress);
}

export function deskTrips(rows, today = todayYmd()) {
  const split = splitTrips(rows, today);
  const unpaid = [];
  const review = [];
  const refund = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (isUnpaidTrip(row)) unpaid.push(row);
    if (isReviewTrip(row, today)) review.push(row);
    if (isRefundTrip(row)) refund.push(row);
  }
  return {
    ...split,
    unpaid,
    review,
    refund,
    depart: split.upcoming.filter((row) => !isUnpaidTrip(row)),
  };
}

export function tripKindLabel(row) {
  if (row?.channel === "activity") return "同城局";
  const type = row?.kind || row?.organizerType || row?.organizer_type || "";
  if (type === "official") return "官方团";
  if (type === "company") return "公司团";
  if (type === "campus") return "高校团";
  return "个人拼团";
}
