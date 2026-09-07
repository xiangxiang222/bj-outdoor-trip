export const FEED_SORTS = [
  { key: "soon", label: "即将出发" },
  { key: "filling", label: "快满员" },
  { key: "new", label: "最新" },
];

export function cycleSort(current) {
  const keys = FEED_SORTS.map((s) => s.key);
  const i = Math.max(0, keys.indexOf(current));
  return keys[(i + 1) % keys.length];
}

export function sortLabel(key) {
  return FEED_SORTS.find((s) => s.key === key)?.label || "即将出发";
}

export function isListable(row) {
  if (!row) return false;
  if (row.status === "cancelled") return false;
  const review = row.reviewStatus || row.review_status || "approved";
  if (review && review !== "approved") return false;
  return true;
}

export function matchesQuery(row, q) {
  const s = String(q || "").trim().toLowerCase();
  if (!s) return true;
  const tags = (row.playTags || []).map((t) => t.name || t).join(" ");
  const blob = [
    row.route?.title,
    row.route?.subtitle,
    row.route?.description,
    row.route?.category,
    row.city,
    row.route?.region,
    row.organizerName,
    row.companyName,
    row.meetupPoint,
    row.notes,
    tags,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return blob.includes(s);
}

function startStamp(row) {
  return `${String(row.startDate || row.start_date || "")} ${String(row.meetupTime || row.meetup_time || "")}`;
}

export function fillRatio(row) {
  const max = Number(row.maxSeats || row.max_seats) || 0;
  const enrolled = Number(row.enrolled) || 0;
  if (max <= 0) return 0;
  return enrolled / max;
}

export function sortFeed(rows, sortKey) {
  const list = [...(Array.isArray(rows) ? rows : [])];
  if (sortKey === "filling") {
    list.sort((a, b) => fillRatio(b) - fillRatio(a) || startStamp(a).localeCompare(startStamp(b)));
  } else if (sortKey === "new") {
    list.sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
  } else {
    list.sort((a, b) => startStamp(a).localeCompare(startStamp(b)) || Number(a.id || 0) - Number(b.id || 0));
  }
  return list;
}

export function processFeed(rows, opts = {}) {
  const {
    query = "",
    sort = "soon",
    city = "",
    tag = "",
    date = "",
    festivalDates = null,
    offerFilter = "",
    monthKey = "",
    monthPicked = false,
    channel = null,
  } = opts;
  let list = (Array.isArray(rows) ? rows : []).filter(isListable);
  if (channel === "trip") list = list.filter((s) => (s.channel || "trip") !== "activity");
  if (channel === "activity") list = list.filter((s) => s.channel === "activity");
  if (city) list = list.filter((s) => s.city === city);
  if (date) list = list.filter((s) => (s.startDate || s.start_date) === date);
  if (festivalDates && festivalDates.size) {
    list = list.filter((s) => festivalDates.has(s.startDate || s.start_date));
  }
  if (tag) list = list.filter((s) => (s.playTags || []).some((t) => (t.name || t) === tag));
  if (offerFilter) list = list.filter((s) => s.offerType === offerFilter);
  if (monthPicked && !date && monthKey) {
    list = list.filter((s) => String(s.startDate || s.start_date || "").startsWith(monthKey));
  }
  list = list.filter((s) => matchesQuery(s, query));
  return sortFeed(list, sort);
}
