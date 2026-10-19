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

function isGroupTrip(row) {
  return Boolean(row) && row.channel !== "activity";
}

export function isFormedTrip(row) {
  if (!isGroupTrip(row) || row.schedule_status === "cancelled" || row.status === "cancelled") return false;
  if (row.guaranteed === true || row.schedule_status === "confirmed" || row.schedule_status === "full" || row.schedule_status === "finished") {
    return true;
  }
  const min = Number(row.minGroupSize ?? row.min_group_size);
  const joined = Number(row.joinedCount ?? row.realEnrolled);
  return Number.isFinite(min) && min > 0 && Number.isFinite(joined) && joined >= min;
}

export function isRecruitingTrip(row) {
  if (!isGroupTrip(row) || row.status !== "joined") return false;
  if (row.schedule_status === "cancelled") return false;
  if (isUnpaidTrip(row) || isFormedTrip(row)) return false;
  return true;
}

export function recruitFacts(row, today = todayYmd()) {
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

export function isReviewTrip(row, today = todayYmd()) {
  if (!row || !row.canReview) return false;
  if (row.schedule_status === "cancelled") return false;
  if (isRecruitingTrip(row)) return false;
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
  const recruiting = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (isUnpaidTrip(row)) unpaid.push(row);
    if (isRecruitingTrip(row)) recruiting.push(row);
    if (isReviewTrip(row, today)) review.push(row);
    if (isRefundTrip(row)) refund.push(row);
  }
  const byDate = (a, b) => String(a.start_date || a.startDate || "").localeCompare(String(b.start_date || b.startDate || ""));
  recruiting.sort(byDate);
  return {
    ...split,
    past: split.past.filter((row) => !isRecruitingTrip(row)),
    unpaid,
    review,
    refund,
    recruiting,
    depart: split.upcoming.filter((row) => !isUnpaidTrip(row) && !isRecruitingTrip(row)),
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
