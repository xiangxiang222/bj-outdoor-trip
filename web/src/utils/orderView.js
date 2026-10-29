import { isEndedTrip, isRecruitingTrip, isReviewTrip, isUnpaidTrip, isUpcomingTrip, recruitFacts, todayYmd, tripKindLabel } from "./trips";

export function orderShop(row) {
  const key = row?.kind || "";
  if (key === "activity" || row?.channel === "activity") return "同城局";
  if (key === "official") return "官方团";
  if (key === "company") return "公司团";
  if (key === "campus") return "高校团";
  if (key === "individual") return "个人拼团";
  return row?.kindLabel || tripKindLabel(row) || "同行者众";
}

export function orderSpec(row) {
  const when = [String(row?.start_date || row?.startDate || "").slice(0, 10), row?.meetup_time].filter(Boolean).join(" ");
  const where = row?.meetup_point || row?.city || "";
  return [when, where].filter(Boolean).join(" · ");
}

export function orderMoney(row) {
  if (row?.channel === "activity" && Number(row.pay_amount || row.payAmount || 0) === 0) return "免费";
  if (row?.pay_status === "unpaid" && Number(row.remainAmount || 0) > 0) {
    return Number(row.paidAmount || 0) > 0
      ? `已付 ¥${row.paidAmount} / ¥${row.payAmount || row.pay_amount}`
      : "¥" + (row.remainAmount || row.pay_amount || 0);
  }
  const amount = Number(row?.payAmount ?? row?.pay_amount ?? 0);
  return amount > 0 ? "¥" + amount : "免费";
}

function isOverdueOpen(row, today) {
  if (!row || row.channel === "activity" || row.status !== "joined") return false;
  if (isEndedTrip(row, today)) return false;
  if (row.schedule_status === "cancelled" || row.schedule_status === "finished") return false;
  if (row.guaranteed === true || row.schedule_status === "confirmed" || row.schedule_status === "full") return false;
  const date = String(row.start_date || row.startDate || "").slice(0, 10);
  if (!date || date >= today) return false;
  return row.pay_status === "paid" || row.pay_status === "company_pending" || Number(row.pay_amount || row.payAmount || 0) === 0;
}

export function orderBadge(row, today = todayYmd()) {
  if (!row) return { key: "", label: "" };
  if (row.refundProgress || row.pay_status === "refunded") return { key: "refund", label: "已退款" };
  if (row.status === "cancelled" || row.schedule_status === "cancelled") return { key: "cancelled", label: "已取消" };
  if (row.status === "waitlist") return { key: "waitlist", label: "候补中" };
  if (row.status === "applied") return { key: "applied", label: "已报名待确认" };
  if (isUnpaidTrip(row)) return { key: "unpaid", label: "待付款" };
  if (isRecruitingTrip(row, today)) return { key: "recruiting", label: "待成团" };
  if (isOverdueOpen(row, today)) return { key: "overdue", label: "待处理" };
  if (isReviewTrip(row, today)) return { key: "review", label: "待评价" };
  if (isEndedTrip(row, today)) return { key: "done", label: "已结束" };
  if (row.status === "joined" && isUpcomingTrip(row, today)) return { key: "depart", label: "待出行" };
  if (row.status === "joined" || row.reviewed) return { key: "done", label: "已完成" };
  return { key: row.status || "", label: "已报名" };
}

export function orderHint(row, today = todayYmd()) {
  const badge = orderBadge(row, today);
  if (badge.key === "refund") return row.refundProgress?.text || "已退款";
  if (badge.key === "cancelled") return "报名已取消";
  if (badge.key === "waitlist") return "满员候补中，有人取消后按顺序递补";
  if (badge.key === "applied") return "已报名，待确认出行名单";
  if (badge.key === "unpaid") return "请尽快支付，超时名额可能释放";
  if (badge.key === "recruiting") return recruitFacts(row, today).line;
  if (badge.key === "overdue") return "出发日已过，等并团或解散退款";
  if (badge.key === "depart") return orderSpec(row);
  if (badge.key === "review") return "行程已结束，可以写一句评价";
  return "这次报名已完成";
}

export function canReorder(row, today = todayYmd()) {
  if (!row?.route_id) return false;
  const key = orderBadge(row, today).key;
  return key === "refund" || key === "cancelled" || key === "done" || key === "review";
}

export function priceLines(row) {
  const due = Number(row?.payAmount ?? row?.pay_amount ?? 0);
  const insurance = Number(row?.insurance_fee || 0);
  const trip = insurance > 0 && insurance < due ? due - insurance : due;
  const lines = [{ label: "团费", value: trip }];
  if (insurance > 0) lines.push({ label: "保险", value: insurance });
  return { lines, due };
}

export function payMethodLabel(row) {
  if (!row) return "";
  if (row.pay_status === "unpaid" || row.pay_status === "pending") return "待支付";
  if (row.pay_status === "company_pending") return "公司统一支付";
  const channel = row.pay_channel || "";
  if (channel === "wallet") return "余额支付";
  if (channel === "wechat" || channel === "wechat_company") return "微信支付";
  if (Number(row.pay_amount || row.payAmount || 0) === 0) return "免费";
  return "在线支付";
}

export function placedLabel(row) {
  const raw = String(row?.created_at || row?.createdAt || "").trim();
  if (!raw) return "";
  return raw.replace("T", " ").slice(0, 16);
}

export function orderNo(row) {
  const raw = String(row?.created_at || row?.createdAt || row?.start_date || row?.startDate || "").replace(/\D/g, "");
  const day = (raw.slice(0, 8) || "00000000").slice(0, 8);
  const id = String(Math.abs(parseInt(row?.id, 10) || 0)).padStart(8, "0");
  return (day + id).slice(0, 16);
}

export function maskTravelerPhone(phone) {
  const s = String(phone || "");
  if (s.length < 7) return s;
  return s.slice(0, 3) + "****" + s.slice(-4);
}

function ymd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function orderPlacedOn(row) {
  const raw = String(row?.created_at || row?.createdAt || "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  return String(row?.start_date || row?.startDate || "").slice(0, 10);
}

export function orderTimePresets(now = new Date()) {
  const y = now.getFullYear();
  const years = [1, 2, 3, 4].map((n) => ({ key: String(y - n), label: `${y - n}年` }));
  return {
    quick: [
      { key: "1m", label: "1个月内" },
      { key: "3m", label: "3个月内" },
      { key: "year", label: "今年" },
    ],
    years: years.slice(0, 2),
    extra: years.slice(2),
  };
}

export function matchOrderTime(row, filter, now = new Date()) {
  const preset = String(filter?.preset || "");
  const start = String(filter?.start || "");
  const end = String(filter?.end || "");
  if (!preset && !start && !end) return true;
  const day = orderPlacedOn(row);
  if (!day) return false;
  if (start && day < start) return false;
  if (end && day > end) return false;
  if (start || end) return true;
  if (preset === "1m") {
    const from = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    return day >= ymd(from) && day <= ymd(now);
  }
  if (preset === "3m") {
    const from = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
    return day >= ymd(from) && day <= ymd(now);
  }
  if (preset === "year") return day.startsWith(String(now.getFullYear()));
  if (/^\d{4}$/.test(preset)) return day.startsWith(preset);
  return true;
}

export function matchOrderQuery(row, query) {
  const text = String(query || "").trim().toLowerCase();
  if (!text) return true;
  const hay = [row?.title, row?.city, row?.meetup_point, row?.traveler_name, row?.kindLabel, orderShop(row)].join(" ").toLowerCase();
  return hay.includes(text);
}
