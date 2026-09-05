const KINDS = [
  { key: "掼蛋", label: "掼蛋", emoji: "🃏", hint: "组局打牌" },
  { key: "跑步", label: "跑步", emoji: "🏃", hint: "夜跑约伴" },
  { key: "电影", label: "电影", emoji: "🎬", hint: "一起观影" },
  { key: "招募", label: "招募", emoji: "📣", hint: "社团招人" },
];
const WEEKDAY = ["日", "一", "二", "三", "四", "五", "六"];

function blobOf(row) {
  const tags = (row.playTags || []).map((t) => t.name || t).join(" ");
  const route = row.route || {};
  return [route.title, route.subtitle, route.category, row.notes, tags].filter(Boolean).join(" ");
}

function kindOf(row) {
  const text = blobOf(row);
  return KINDS.find((k) => text.includes(k.key)) || null;
}

function dateOf(iso) {
  const raw = String(iso || "").slice(0, 10);
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return { day: "--", weekday: "", month: "" };
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return {
    day: String(Number(m[3])),
    weekday: "周" + WEEKDAY[date.getDay()],
    month: String(Number(m[2])) + "月",
  };
}

function isThisWeek(iso) {
  const raw = String(iso || "").slice(0, 10);
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  date.setHours(0, 0, 0, 0);
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const offset = start.getDay() === 0 ? 6 : start.getDay() - 1;
  start.setDate(start.getDate() - offset);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return date >= start && date < end;
}

function decorate(row) {
  const kind = kindOf(row);
  const quote = row.quote || {};
  const price = Number(quote.tripPrice ?? quote.originPrice ?? 0);
  return {
    ...row,
    kindLabel: kind ? kind.label : "",
    dateBlock: dateOf(row.startDate),
    free: price === 0 || row.offerType === "free",
    price,
  };
}

module.exports = { KINDS, kindOf, dateOf, isThisWeek, decorate };
