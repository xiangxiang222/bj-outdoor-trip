const { isRecruitingTrip, isReviewTrip, isUnpaidTrip, isUpcomingTrip, recruitFacts, todayYmd, tripKindLabel } = require("./trips");

function orderShop(row) {
  const key = (row && row.kind) || "";
  if (key === "activity" || (row && row.channel === "activity")) return "同城局";
  if (key === "official") return "官方团";
  if (key === "company") return "公司团";
  if (key === "campus") return "高校团";
  if (key === "individual") return "个人拼团";
  return (row && row.kindLabel) || tripKindLabel(row) || "同行者众";
}

function orderSpec(row) {
  const when = [String((row && (row.start_date || row.startDate)) || "").slice(0, 10), row && row.meetup_time].filter(Boolean).join(" ");
  const where = (row && (row.meetup_point || row.city)) || "";
  return [when, where].filter(Boolean).join(" · ");
}

function orderMoney(row) {
  if (row && row.channel === "activity" && Number(row.pay_amount || row.payAmount || 0) === 0) return "免费";
  if (row && row.pay_status === "unpaid" && Number(row.remainAmount || 0) > 0) {
    return Number(row.paidAmount || 0) > 0
      ? "已付 ¥" + row.paidAmount + " / ¥" + (row.payAmount || row.pay_amount)
      : "¥" + (row.remainAmount || row.pay_amount || 0);
  }
  const amount = Number(row && (row.payAmount != null ? row.payAmount : row.pay_amount) || 0);
  return amount > 0 ? "¥" + amount : "免费";
}

function isOverdueOpen(row, today) {
  if (!row || row.channel === "activity" || row.status !== "joined") return false;
  if (row.schedule_status === "cancelled" || row.schedule_status === "finished") return false;
  if (row.guaranteed === true || row.schedule_status === "confirmed" || row.schedule_status === "full") return false;
  const date = String(row.start_date || row.startDate || "").slice(0, 10);
  if (!date || date >= today) return false;
  return row.pay_status === "paid" || row.pay_status === "company_pending" || Number(row.pay_amount || row.payAmount || 0) === 0;
}

function orderBadge(row, today) {
  const day = today || todayYmd();
  if (!row) return { key: "", label: "" };
  if (row.refundProgress || row.pay_status === "refunded") return { key: "refund", label: "已退款" };
  if (row.status === "cancelled" || row.schedule_status === "cancelled") return { key: "cancelled", label: "已取消" };
  if (row.status === "waitlist") return { key: "waitlist", label: "候补中" };
  if (row.status === "applied") return { key: "applied", label: "已报名待确认" };
  if (isUnpaidTrip(row)) return { key: "unpaid", label: "待付款" };
  if (isRecruitingTrip(row, day)) return { key: "recruiting", label: "待成团" };
  if (isOverdueOpen(row, day)) return { key: "overdue", label: "待处理" };
  if (isReviewTrip(row, day)) return { key: "review", label: "待评价" };
  if (row.status === "joined" && isUpcomingTrip(row, day)) return { key: "depart", label: "待出行" };
  if (row.status === "joined" || row.reviewed) return { key: "done", label: "已完成" };
  return { key: row.status || "", label: "已报名" };
}

function orderHint(row, today) {
  const badge = orderBadge(row, today);
  if (badge.key === "refund") return (row.refundProgress && row.refundProgress.text) || "已退款";
  if (badge.key === "cancelled") return "报名已取消";
  if (badge.key === "waitlist") return "满员候补中，有人取消后按顺序递补";
  if (badge.key === "applied") return "已报名，待确认出行名单";
  if (badge.key === "unpaid") return "请尽快支付，超时名额可能释放";
  if (badge.key === "recruiting") return recruitFacts(row, today || todayYmd()).line;
  if (badge.key === "overdue") return "出发日已过，等并团或解散退款";
  if (badge.key === "depart") return orderSpec(row);
  if (badge.key === "review") return "行程已结束，可以写一句评价";
  return "这次报名已完成";
}

function canReorder(row, today) {
  if (!row || !row.route_id) return false;
  const key = orderBadge(row, today).key;
  return key === "refund" || key === "cancelled" || key === "done" || key === "review";
}

function priceLines(row) {
  const due = Number(row && (row.payAmount != null ? row.payAmount : row.pay_amount) || 0);
  const insurance = Number((row && row.insurance_fee) || 0);
  const trip = insurance > 0 && insurance < due ? due - insurance : due;
  const lines = [{ label: "团费", value: trip, text: trip > 0 ? "¥" + trip : "免费" }];
  if (insurance > 0) lines.push({ label: "保险", value: insurance, text: "¥" + insurance });
  return { lines, due };
}

function payMethodLabel(row) {
  if (!row) return "";
  if (row.pay_status === "unpaid" || row.pay_status === "pending") return "待支付";
  if (row.pay_status === "company_pending") return "公司统一支付";
  const channel = row.pay_channel || "";
  if (channel === "wallet") return "余额支付";
  if (channel === "wechat" || channel === "wechat_company") return "微信支付";
  if (Number(row.pay_amount || row.payAmount || 0) === 0) return "免费";
  return "在线支付";
}

function placedLabel(row) {
  const raw = String((row && (row.created_at || row.createdAt)) || "").trim();
  if (!raw) return "";
  return raw.replace("T", " ").slice(0, 16);
}

function maskTravelerPhone(phone) {
  const s = String(phone || "");
  if (s.length < 7) return s;
  return s.slice(0, 3) + "****" + s.slice(-4);
}

function ymd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + d;
}

function orderPlacedOn(row) {
  const raw = String((row && (row.created_at || row.createdAt)) || "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  return String((row && (row.start_date || row.startDate)) || "").slice(0, 10);
}

function orderTimePresets(now) {
  const date = now || new Date();
  const y = date.getFullYear();
  const years = [1, 2, 3, 4].map((n) => ({ key: String(y - n), label: y - n + "年" }));
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

function matchOrderTime(row, filter, now) {
  const preset = String((filter && filter.preset) || "");
  const start = String((filter && filter.start) || "");
  const end = String((filter && filter.end) || "");
  if (!preset && !start && !end) return true;
  const day = orderPlacedOn(row);
  if (!day) return false;
  if (start && day < start) return false;
  if (end && day > end) return false;
  if (start || end) return true;
  const date = now || new Date();
  if (preset === "1m") {
    const from = new Date(date.getFullYear(), date.getMonth() - 1, date.getDate());
    return day >= ymd(from) && day <= ymd(date);
  }
  if (preset === "3m") {
    const from = new Date(date.getFullYear(), date.getMonth() - 3, date.getDate());
    return day >= ymd(from) && day <= ymd(date);
  }
  if (preset === "year") return day.startsWith(String(date.getFullYear()));
  if (/^\d{4}$/.test(preset)) return day.startsWith(preset);
  return true;
}

function matchOrderQuery(row, query) {
  const text = String(query || "").trim().toLowerCase();
  if (!text) return true;
  const hay = [row && row.title, row && row.city, row && row.meetup_point, row && row.traveler_name, row && row.kindLabel, orderShop(row)].join(" ").toLowerCase();
  return hay.indexOf(text) >= 0;
}

module.exports = {
  orderShop,
  orderSpec,
  orderMoney,
  orderBadge,
  orderHint,
  canReorder,
  priceLines,
  payMethodLabel,
  placedLabel,
  maskTravelerPhone,
  orderTimePresets,
  matchOrderTime,
  matchOrderQuery,
};
