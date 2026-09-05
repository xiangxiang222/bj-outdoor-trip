export const ACTIVITY_KINDS = [
  { key: "掼蛋", label: "掼蛋", emoji: "🃏", hint: "组局打牌" },
  { key: "跑步", label: "跑步", emoji: "🏃", hint: "夜跑约伴" },
  { key: "电影", label: "电影", emoji: "🎬", hint: "一起观影" },
  { key: "招募", label: "招募", emoji: "📣", hint: "社团招人" },
];

const WEEKDAY = ["日", "一", "二", "三", "四", "五", "六"];

function blobOf(row) {
  const tags = (row.playTags || []).map((t) => t.name || t).join(" ");
  return [row.route?.title, row.route?.subtitle, row.route?.category, row.notes, tags].filter(Boolean).join(" ");
}

export function activityKindOf(row) {
  const text = blobOf(row);
  return ACTIVITY_KINDS.find((k) => text.includes(k.key)) || null;
}

export function filterActivities(rows, kind) {
  const list = Array.isArray(rows) ? rows : [];
  if (!kind) return list;
  return list.filter((row) => activityKindOf(row)?.key === kind);
}

export function formatActivityDate(iso) {
  const raw = String(iso || "").slice(0, 10);
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return { day: "--", weekday: "", month: "", label: raw };
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return {
    day: String(Number(m[3])),
    weekday: "周" + WEEKDAY[date.getDay()],
    month: String(Number(m[2])) + "月",
    label: raw,
  };
}

export function isThisWeek(iso, now = new Date()) {
  const raw = String(iso || "").slice(0, 10);
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  date.setHours(0, 0, 0, 0);
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const offset = start.getDay() === 0 ? 6 : start.getDay() - 1;
  start.setDate(start.getDate() - offset);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return date >= start && date < end;
}
