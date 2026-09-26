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

function isUnpaidTrip(row) {
  if (!row || row.status !== "joined") return false;
  if (row.schedule_status === "cancelled") return false;
  return row.pay_status === "unpaid" && Number(row.pay_amount || row.payAmount || 0) > 0;
}

function isReviewTrip(row, today) {
  today = today || todayYmd();
  if (!row || !row.canReview) return false;
  if (row.schedule_status === "cancelled") return false;
  return String(row.start_date || row.startDate || "").slice(0, 10) < today;
}

function isRefundTrip(row) {
  return Boolean(row && row.refundProgress);
}

function deskTrips(rows, today) {
  today = today || todayYmd();
  const split = splitTrips(rows, today);
  const unpaid = [];
  const review = [];
  const refund = [];
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    if (isUnpaidTrip(row)) unpaid.push(row);
    if (isReviewTrip(row, today)) review.push(row);
    if (isRefundTrip(row)) refund.push(row);
  });
  return Object.assign({}, split, {
    unpaid,
    review,
    refund,
    depart: split.upcoming.filter((row) => !isUnpaidTrip(row)),
  });
}

function tripKindLabel(row) {
  if (row && row.channel === "activity") return "同城局";
  const type = (row && (row.kind || row.organizerType || row.organizer_type)) || "";
  if (type === "official") return "官方团";
  if (type === "company") return "公司团";
  if (type === "campus") return "高校团";
  return "个人拼团";
}

module.exports = { todayYmd, isUpcomingTrip, isWaitlistTrip, splitTrips, deskTrips, isUnpaidTrip, isReviewTrip, isRefundTrip, tripKindLabel };
