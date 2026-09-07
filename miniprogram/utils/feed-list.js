const FEED_SORTS = [
  { key: "soon", label: "即将出发" },
  { key: "filling", label: "快满员" },
  { key: "new", label: "最新" },
];

function cycleSort(current) {
  const keys = FEED_SORTS.map((s) => s.key);
  const i = Math.max(0, keys.indexOf(current));
  return keys[(i + 1) % keys.length];
}

function sortLabel(key) {
  const hit = FEED_SORTS.find((s) => s.key === key);
  return (hit && hit.label) || "即将出发";
}

function isListable(row) {
  if (!row) return false;
  if (row.status === "cancelled") return false;
  const review = row.reviewStatus || row.review_status || "approved";
  if (review && review !== "approved") return false;
  return true;
}

function matchesQuery(row, q) {
  const s = String(q || "").trim().toLowerCase();
  if (!s) return true;
  const tags = ((row && row.playTags) || []).map((t) => t.name || t).join(" ");
  const route = (row && row.route) || {};
  const blob = [route.title, route.subtitle, route.description, route.category, row.city, route.region, row.organizerName, row.companyName, row.meetupPoint, row.notes, tags]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return blob.indexOf(s) >= 0;
}

function startStamp(row) {
  return String((row && (row.startDate || row.start_date)) || "") + " " + String((row && (row.meetupTime || row.meetup_time)) || "");
}

function fillRatio(row) {
  const max = Number(row.maxSeats || row.max_seats) || 0;
  const enrolled = Number(row.enrolled) || 0;
  if (max <= 0) return 0;
  return enrolled / max;
}

function sortFeed(rows, sortKey) {
  const list = (Array.isArray(rows) ? rows : []).slice();
  if (sortKey === "filling") {
    list.sort((a, b) => fillRatio(b) - fillRatio(a) || startStamp(a).localeCompare(startStamp(b)));
  } else if (sortKey === "new") {
    list.sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
  } else {
    list.sort((a, b) => startStamp(a).localeCompare(startStamp(b)) || Number(a.id || 0) - Number(b.id || 0));
  }
  return list;
}

function processFeed(rows, opts) {
  opts = opts || {};
  let list = (Array.isArray(rows) ? rows : []).filter(isListable);
  if (opts.channel === "trip") list = list.filter((s) => (s.channel || "trip") !== "activity");
  if (opts.channel === "activity") list = list.filter((s) => s.channel === "activity");
  if (opts.city) list = list.filter((s) => s.city === opts.city);
  if (opts.date) list = list.filter((s) => (s.startDate || s.start_date) === opts.date);
  if (opts.festivalDates && opts.festivalDates.size) {
    list = list.filter((s) => opts.festivalDates.has(s.startDate || s.start_date));
  }
  if (opts.tag) list = list.filter((s) => (s.playTags || []).some((t) => (t.name || t) === opts.tag));
  if (opts.offerFilter) list = list.filter((s) => s.offerType === opts.offerFilter);
  if (opts.monthPicked && !opts.date && opts.monthKey) {
    list = list.filter((s) => String(s.startDate || s.start_date || "").indexOf(opts.monthKey) === 0);
  }
  if (opts.query) list = list.filter((s) => matchesQuery(s, opts.query));
  return sortFeed(list, opts.sort || "soon");
}

module.exports = { FEED_SORTS, cycleSort, sortLabel, isListable, matchesQuery, sortFeed, processFeed };
