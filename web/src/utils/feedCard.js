import { formatActivityDate } from "./activityKind";

export function feedWhen(iso, time) {
  const d = formatActivityDate(iso);
  const md = d.month && d.day ? `${d.month.replace("月", "")}/${d.day}` : String(iso || "").slice(5);
  const t = String(time || "").trim();
  return [md, d.weekday, t].filter(Boolean).join(" ");
}

export function boardedLine(row, channel) {
  const activity = channel === "activity" || row?.channel === "activity";
  const remain = Number(row?.remain);
  if (Number.isFinite(remain) && remain <= 0) return "已满·可候补";
  const n = Number(row?.enrolled) || 0;
  if (n > 0) return activity ? `${n}人已报名` : `${n}人已上车`;
  if (Number.isFinite(remain)) return activity ? `余 ${remain} 人` : `余 ${remain} 座`;
  return "";
}

export function hostName(row) {
  if (!row) return "";
  if (row.organizerType === "company") return row.companyName || row.organizerName || "";
  return row.organizerName || row.companyName || "";
}

export function coverOf(row) {
  if (!row) return "";
  const g = row.gallery || row.route?.gallery || [];
  const first = g[0];
  if (typeof first === "string" && first) return first;
  if (first && typeof first === "object") return first.thumb || first.src || first.url || "";
  return row.route?.cover || row.cover || "";
}

export function taglineOf(row) {
  const tags = (row?.playTags || []).map((t) => t.name || t).filter(Boolean);
  if (tags.length) return tags.slice(0, 3).join(" · ");
  return row?.route?.subtitle || row?.eligibility?.label || "";
}

export function isFreeOffer(row) {
  const q = row?.quote || {};
  const price = Number(q.tripPrice ?? q.originPrice ?? 0);
  return price === 0 || row?.offerType === "free";
}

export function coverMark(row) {
  const t = String(row?.route?.title || row?.title || "").trim();
  return t.slice(0, 1) || "局";
}
