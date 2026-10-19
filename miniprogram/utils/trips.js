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

function isGroupTrip(row) {
  return Boolean(row) && row.channel !== "activity";
}

function isFormedTrip(row) {
  if (!isGroupTrip(row) || row.schedule_status === "cancelled" || row.status === "cancelled") return false;
  if (row.guaranteed === true || row.schedule_status === "confirmed" || row.schedule_status === "full" || row.schedule_status === "finished") {
    return true;
  }
  const min = Number(row.minGroupSize != null ? row.minGroupSize : row.min_group_size);
  const joined = Number(row.joinedCount != null ? row.joinedCount : row.realEnrolled);
  return Number.isFinite(min) && min > 0 && Number.isFinite(joined) && joined >= min;
}

function isRecruitingTrip(row, today) {
  if (!isGroupTrip(row) || row.status !== "joined") return false;
  if (row.schedule_status === "cancelled") return false;
  if (isUnpaidTrip(row) || isFormedTrip(row)) return false;
  const date = String(row.start_date || row.startDate || "").slice(0, 10);
  if (date && date < (today || todayYmd())) return false;
  return true;
}

function recruitFacts(row, today) {
  today = today || todayYmd();
  const amount = Number((row && (row.payAmount || row.pay_amount)) || 0);
  const paid = row && (row.pay_status === "paid" || Number(row.paidAmount || 0) > 0);
  const free = row && row.channel === "activity" && amount === 0;
  const money = free ? "免费" : paid ? "已支付 ¥" + amount : "";
  const gap = Math.max(0, Number((row && row.shortfall) || 0));
  const date = String((row && (row.start_date || row.startDate)) || "").slice(0, 10);
  const overdue = Boolean(date) && date < today;
  const parts = [money, gap > 0 ? "还差 " + gap + " 人" : "人数未齐"].filter(Boolean);
  return { money: money, gap: gap, date: date, overdue: overdue, line: parts.join(" · ") };
}

function showAfterActions(row) {
  if (!row) return false;
  if (row.channel === "activity") return true;
  return isFormedTrip(row);
}

function isReviewTrip(row, today) {
  today = today || todayYmd();
  if (!row || !row.canReview) return false;
  if (row.schedule_status === "cancelled") return false;
  if (isRecruitingTrip(row, today)) return false;
  if (isGroupTrip(row) && row.status === "joined" && !isFormedTrip(row)) return false;
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
  const recruiting = [];
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    if (isUnpaidTrip(row)) unpaid.push(row);
    if (isRecruitingTrip(row, today)) recruiting.push(row);
    if (isReviewTrip(row, today)) review.push(row);
    if (isRefundTrip(row)) refund.push(row);
  });
  const byDate = (a, b) => String(a.start_date || a.startDate || "").localeCompare(String(b.start_date || b.startDate || ""));
  recruiting.sort(byDate);
  return Object.assign({}, split, {
    past: split.past.filter((row) => !isRecruitingTrip(row, today)),
    unpaid,
    review,
    refund,
    recruiting,
    depart: split.upcoming.filter((row) => !isUnpaidTrip(row) && !isRecruitingTrip(row, today)),
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

module.exports = { todayYmd, isUpcomingTrip, isWaitlistTrip, splitTrips, deskTrips, isUnpaidTrip, isFormedTrip, isRecruitingTrip, isReviewTrip, isRefundTrip, showAfterActions, recruitFacts, tripKindLabel };
