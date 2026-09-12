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
    row.eligibility?.label,
    ...(row.eligibility?.schools || []),
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

export const HOST_KINDS = [
  { key: "", label: "全部团" },
  { key: "company", label: "公司" },
  { key: "campus", label: "高校" },
  { key: "individual", label: "个人" },
];

export function companyNameOf(row) {
  return String(row?.companyName || row?.company_name || "").trim();
}

export function schoolsOf(row) {
  const list = (Array.isArray(row?.eligibility?.schools) ? row.eligibility.schools : [])
    .map((s) => String(s || "").trim())
    .filter(Boolean);
  const organizer = row?.organizerType || row?.organizer_type || "";
  const host = companyNameOf(row);
  if (organizer === "campus" && host && !list.includes(host)) list.unshift(host);
  return list;
}

export function isCampusTrip(row) {
  const organizer = row?.organizerType || row?.organizer_type || "";
  if (organizer === "campus") return true;
  const el = row?.eligibility || {};
  return !!(el.studentOnly || el.alumniOk || el.enabled || schoolsOf(row).length);
}

export function matchesHost(row, opts = {}) {
  const kind = String(opts.hostKind || "");
  const company = String(opts.companyName || "").trim();
  const school = String(opts.school || "").trim();
  const organizer = row?.organizerType || row?.organizer_type || "individual";
  if (kind === "company" && organizer !== "company") return false;
  if (kind === "campus" && !isCampusTrip(row)) return false;
  if (kind === "individual" && (organizer === "company" || isCampusTrip(row))) return false;
  if (company && companyNameOf(row) !== company) return false;
  if (school && !schoolsOf(row).includes(school)) return false;
  return true;
}

export function hostFacets(rows) {
  const companies = [];
  const schools = [];
  const seenC = new Set();
  const seenS = new Set();
  for (const row of (Array.isArray(rows) ? rows : []).filter(isListable)) {
    const organizer = row?.organizerType || row?.organizer_type || "";
    const company = companyNameOf(row);
    if (organizer === "company" && company && !seenC.has(company)) {
      seenC.add(company);
      companies.push(company);
    }
    for (const school of schoolsOf(row)) {
      if (!seenS.has(school)) {
        seenS.add(school);
        schools.push(school);
      }
    }
  }
  return { companies, schools };
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
    hostKind = "",
    companyName = "",
    school = "",
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
  if (hostKind || companyName || school) {
    list = list.filter((s) => matchesHost(s, { hostKind, companyName, school }));
  }
  list = list.filter((s) => matchesQuery(s, query));
  return sortFeed(list, sort);
}
