function todayYmd(now = new Date()) {
  const date = new Date(new Date(now).getTime() + 8 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

function validTripDay(value) {
  const text = String(value || "").slice(0, 10);
  const stamp = Date.parse(text + "T00:00:00Z");
  return /^\d{4}-\d{2}-\d{2}$/.test(text) && Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === text ? text : "";
}

function tripEndDay(row) {
  if (!row) return "";
  const start = validTripDay(row.start_date || row.startDate);
  const end = validTripDay(row.end_date || row.endDate);
  return end && (!start || end >= start) ? end : start;
}

function completedTrip(row) {
  return Boolean(row && (row.completed === true || row.completed_at || row.completedAt || ["finished", "completed", "ended"].includes(row.schedule_status || row.scheduleStatus)));
}

function isEndedTrip(row, today = todayYmd()) {
  if (!row || row.status !== "joined" || row.schedule_status === "cancelled" || row.scheduleStatus === "cancelled" || row.pay_status === "refunded") return false;
  if (isGroupTrip(row) && !isFormedTrip(row)) return false;
  const end = tripEndDay(row);
  return completedTrip(row) || Boolean(end && end < today);
}

function isUpcomingTrip(row, today = todayYmd()) {
  if (!row || row.status === "cancelled" || row.schedule_status === "cancelled" || row.scheduleStatus === "cancelled" || completedTrip(row) || row.pay_status === "refunded") return false;
  const end = tripEndDay(row);
  return Boolean(end && end >= today);
}

function normalizeTripTab(raw) {
  const tab = String(raw || "");
  if (tab === "upcoming") return "depart";
  if (["completed", "finished", "past"].includes(tab)) return "ended";
  return ["all", "unpaid", "recruiting", "depart", "review", "waitlist", "refund", "ended"].includes(tab) ? tab : "";
}

function isWaitlistTrip(row) {
  return row?.status === "waitlist";
}

function splitTrips(rows, today = todayYmd()) {
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

function isUnpaidTrip(row) {
  if (!row || row.status !== "joined") return false;
  if (row.schedule_status === "cancelled") return false;
  return row.pay_status === "unpaid" && Number(row.pay_amount || row.payAmount || 0) > 0;
}

function isGroupTrip(row) {
  return Boolean(row) && row.channel !== "activity";
}

function isFormedTrip(row) {
  if (!isGroupTrip(row) || row.schedule_status === "cancelled" || row.status === "cancelled") return false;
  if (completedTrip(row) || row.guaranteed === true || row.schedule_status === "confirmed" || row.schedule_status === "full") {
    return true;
  }
  const min = Number(row.minGroupSize ?? row.min_group_size);
  const joined = Number(row.joinedCount ?? row.realEnrolled);
  return Number.isFinite(min) && min > 0 && Number.isFinite(joined) && joined >= min;
}

function isRecruitingTrip(row, today = todayYmd()) {
  if (!isGroupTrip(row) || row.status !== "joined") return false;
  if (row.schedule_status === "cancelled") return false;
  if (completedTrip(row) || isUnpaidTrip(row) || isFormedTrip(row)) return false;
  const date = String(row.start_date || row.startDate || "").slice(0, 10);
  if (date && date < today) return false;
  return true;
}

function recruitFacts(row, today = todayYmd()) {
  const amount = Number(row?.payAmount || row?.pay_amount || 0);
  const paid = row?.pay_status === "paid" || Number(row?.paidAmount || 0) > 0;
  const free = row?.channel === "activity" && amount === 0;
  const money = free ? "免费" : paid ? `已支付 ¥${amount}` : "";
  const gap = Math.max(0, Number(row?.shortfall ?? 0));
  const date = String(row?.start_date || row?.startDate || "").slice(0, 10);
  const overdue = Boolean(date) && date < today;
  const parts = [money, gap > 0 ? `还差 ${gap} 人` : "人数未齐"].filter(Boolean);
  return { money, gap, date, overdue, line: parts.join(" · ") };
}

function showAfterActions(row) {
  if (!row) return false;
  if (row.channel === "activity") return true;
  return isFormedTrip(row);
}

function isReviewTrip(row, today = todayYmd()) {
  return Boolean(row && row.canReview && isEndedTrip(row, today));
}

function isRefundTrip(row) {
  return Boolean(row && row.refundProgress);
}

function deskTrips(rows, today = todayYmd()) {
  const split = splitTrips(rows, today);
  const unpaid = [];
  const review = [];
  const refund = [];
  const recruiting = [];
  const ended = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (isUnpaidTrip(row)) unpaid.push(row);
    if (isRecruitingTrip(row, today)) recruiting.push(row);
    if (isReviewTrip(row, today)) review.push(row);
    if (isRefundTrip(row)) refund.push(row);
    if (isEndedTrip(row, today)) ended.push(row);
  }
  const byDate = (a, b) => String(a.start_date || a.startDate || "").localeCompare(String(b.start_date || b.startDate || ""));
  recruiting.sort(byDate);
  return {
    ...split,
    past: split.past.filter((row) => !isRecruitingTrip(row, today)),
    unpaid,
    review,
    refund,
    recruiting,
    ended: ended.sort((a, b) => tripEndDay(b).localeCompare(tripEndDay(a))),
    depart: split.upcoming.filter((row) => !isUnpaidTrip(row) && !isRecruitingTrip(row, today)),
  };
}

function tripKindLabel(row) {
  if (row?.channel === "activity") return "同城局";
  const type = row?.kind || row?.organizerType || row?.organizer_type || "";
  if (type === "official") return "官方团";
  if (type === "company") return "公司团";
  if (type === "campus") return "高校团";
  return "个人拼团";
}

module.exports = { todayYmd, tripEndDay, isEndedTrip, isUpcomingTrip, normalizeTripTab, isWaitlistTrip, splitTrips, isUnpaidTrip, isFormedTrip, isRecruitingTrip, recruitFacts, showAfterActions, isReviewTrip, isRefundTrip, deskTrips, tripKindLabel };
