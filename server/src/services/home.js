const dayjs = require("dayjs");
const { getDb } = require("../db");
const { attachAssetHost, resolveStoredMedia } = require("./helpers");
const { OFFER_TYPES } = require("./offer");

const TAG_PALETTE = ["#2d6a4f", "#bc4749", "#1d6a9f", "#c77d3a", "#6b4c9a", "#3d6b4f", "#8b5a2b", "#1b3a5f", "#40916c"];

const DEFAULT_PLAY_TAGS = [
  { name: "徒步", color: "#2d6a4f" },
  { name: "登山", color: "#bc4749" },
  { name: "玩水", color: "#1d6a9f" },
  { name: "亲子", color: "#c77d3a" },
  { name: "摄影", color: "#6b4c9a" },
  { name: "露营", color: "#3d6b4f" },
  { name: "文化", color: "#8b5a2b" },
  { name: "看星空", color: "#1b3a5f" },
  { name: "团建", color: "#40916c" },
];

const CITY_RULES = [
  ["怀柔", "怀柔"],
  ["延庆", "延庆"],
  ["昌平", "昌平"],
  ["密云", "密云"],
  ["房山", "房山"],
  ["门头沟", "门头沟"],
  ["海淀", "海淀"],
  ["朝阳", "朝阳"],
  ["通州", "通州"],
  ["大兴", "大兴"],
  ["丰台", "丰台"],
  ["石景山", "石景山"],
  ["平谷", "平谷"],
  ["蓟州", "蓟州"],
  ["涞源", "涞源"],
  ["乌兰", "乌兰布统"],
  ["围场", "围场"],
  ["承德", "承德"],
  ["赤峰", "赤峰"],
  ["野三坡", "野三坡"],
  ["涞水", "涞水"],
  ["秦皇岛", "秦皇岛"],
  ["五台", "五台山"],
  ["大同", "大同"],
  ["忻州", "忻州"],
  ["张家口", "张家口"],
  ["兴隆", "兴隆"],
  ["滦平", "滦平"],
];

function cityOf(region) {
  const s = String(region || "");
  for (const [key, name] of CITY_RULES) {
    if (s.includes(key)) return name;
  }
  const first = s.split(/[\/、,，\s]+/).filter(Boolean)[0];
  return first || "北京";
}

function randomTagColor() {
  return TAG_PALETTE[Math.floor(Math.random() * TAG_PALETTE.length)];
}

function parseIdList(raw) {
  try {
    const v = typeof raw === "string" ? JSON.parse(raw || "[]") : raw;
    return Array.isArray(v) ? v.map(Number).filter((n) => n > 0) : [];
  } catch {
    return [];
  }
}

function ensureDefaultPlayTags(db = getDb()) {
  const n = db.prepare("SELECT COUNT(*) AS c FROM play_tags").get().c;
  if (n) return;
  const insert = db.prepare("INSERT INTO play_tags (name, color, cover, sort_order, status) VALUES (?,?,?,?,?)");
  DEFAULT_PLAY_TAGS.forEach((t, i) => insert.run(t.name, t.color, "", i + 1, "on"));
}

function listPlayTags(db = getDb()) {
  ensureDefaultPlayTags(db);
  return db.prepare("SELECT * FROM play_tags WHERE status!='off' ORDER BY sort_order, id").all();
}

function mapPlayTag(row, req) {
  return {
    id: row.id,
    name: row.name,
    color: row.color || randomTagColor(),
    cover: attachAssetHost(req, row.cover) || "",
  };
}

function tagsForIds(ids, req, db = getDb()) {
  const all = listPlayTags(db);
  const set = new Set((ids || []).map(Number));
  return all.filter((t) => set.has(t.id)).map((t) => mapPlayTag(t, req));
}

function festivalsFrom(now = dayjs()) {
  const year = now.year();
  const next = year + 1;
  const all = [
    { key: "midautumn", name: "中秋", dates: [`${year}-09-25`, `${year}-09-26`, `${year}-09-27`] },
    { key: "national", name: "国庆", dates: [`${year}-10-01`, `${year}-10-02`, `${year}-10-03`, `${year}-10-04`, `${year}-10-05`, `${year}-10-06`, `${year}-10-07`] },
    { key: "newyear", name: "元旦", dates: [`${next}-01-01`, `${next}-01-02`, `${next}-01-03`] },
    { key: "spring", name: "春节", dates: [`${next}-02-06`, `${next}-02-07`, `${next}-02-08`, `${next}-02-09`, `${next}-02-10`, `${next}-02-11`, `${next}-02-12`] },
    { key: "qingming", name: "清明", dates: [`${next}-04-03`, `${next}-04-04`, `${next}-04-05`] },
    { key: "labor", name: "劳动节", dates: [`${next}-05-01`, `${next}-05-02`, `${next}-05-03`] },
    { key: "dragon", name: "端午", dates: [`${next}-06-09`, `${next}-06-10`, `${next}-06-11`] },
  ];
  const today = now.format("YYYY-MM-DD");
  return all
    .map((f) => ({
      ...f,
      dates: f.dates.filter((d) => d >= today).map((date) => ({ date, label: dayjs(date).format("M/D") })),
    }))
    .filter((f) => f.dates.length);
}

function monthsFrom(now = dayjs(), count = 12) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const d = now.add(i, "month");
    out.push({ key: d.format("YYYY-MM"), label: `${d.month() + 1}月`, year: d.year() });
  }
  return out;
}

function monthDays(monthKey, scheduleDates) {
  const start = dayjs(`${monthKey}-01`);
  const days = start.daysInMonth();
  const set = new Set(scheduleDates);
  const out = [];
  for (let i = 1; i <= days; i++) {
    const d = start.date(i);
    const date = d.format("YYYY-MM-DD");
    out.push({
      date,
      label: String(i),
      weekday: d.day(),
      count: scheduleDates.filter((x) => x === date).length,
      hasTrip: set.has(date),
    });
  }
  return out;
}

function approvedScheduleSql() {
  return "IFNULL(s.review_status,'approved')='approved' AND s.status!='cancelled'";
}

function buildHome(req) {
  const db = getDb();
  ensureDefaultPlayTags(db);
  const routes = db.prepare("SELECT * FROM routes WHERE status='on' ORDER BY id").all();
  const activityRouteIds = new Set(
    db.prepare("SELECT DISTINCT route_id FROM schedules WHERE IFNULL(channel,'trip')='activity'").all().map((r) => r.route_id)
  );
  const schedules = db
    .prepare(
      `SELECT s.*, r.title AS route_title, r.cover AS route_cover, r.days AS route_days, r.region AS route_region, r.gallery_json, r.code AS route_code
       FROM schedules s JOIN routes r ON r.id=s.route_id
       WHERE ${approvedScheduleSql()} AND s.start_date>=date('now','-1 day') AND IFNULL(s.channel,'trip')!='activity'
       ORDER BY s.start_date`
    )
    .all();

  const scenicSlides = [];
  const cityMap = new Map();
  const BEIJING_DISTRICTS = ["怀柔", "延庆", "昌平", "密云", "房山", "门头沟", "海淀", "朝阳", "通州", "大兴", "平谷"];

  function toSlide(r) {
    const url = attachAssetHost(req, resolveStoredMedia(r.cover, { code: r.code }));
    return { routeId: r.id, title: r.title, region: cityOf(r.region), url, code: r.code || "" };
  }

  function addCitySlide(name, slide) {
    if (!name || !slide) return;
    if (!cityMap.has(name)) cityMap.set(name, { name, slides: [], gallery: [], count: 0 });
    const row = cityMap.get(name);
    if (row.slides.some((s) => Number(s.routeId) === Number(slide.routeId))) return;
    row.slides.push(slide);
    row.gallery.push(slide.url);
  }

  for (const r of routes) {
    if (activityRouteIds.has(r.id)) continue;
    const slide = toSlide(r);
    scenicSlides.push(slide);
    addCitySlide(cityOf(r.region), slide);
  }
  for (const name of BEIJING_DISTRICTS) {
    if (!cityMap.has(name)) cityMap.set(name, { name, slides: [], gallery: [], count: 0 });
  }
  for (const s of schedules) {
    const name = s.city || cityOf(s.route_region);
    if (!cityMap.has(name)) cityMap.set(name, { name, slides: [], gallery: [], count: 0 });
    cityMap.get(name).count += 1;
  }

  const thumbsFor = (pred) =>
    schedules
      .filter((s) => pred(Number(s.route_days) || 1))
      .slice(0, 4)
      .map((s) => ({
        scheduleId: s.id,
        title: s.route_title,
        cover: attachAssetHost(req, resolveStoredMedia(s.route_cover, { code: s.route_code })),
      }));

  const durations = [
    { key: "1", days: 1, label: "1 日", hint: "当天往返", thumbs: thumbsFor((d) => d === 1) },
    { key: "2", days: 2, label: "2 日", hint: "过夜一晚", thumbs: thumbsFor((d) => d === 2) },
    { key: "3", days: 3, label: "3 日", hint: "小长假", thumbs: thumbsFor((d) => d === 3) },
    { key: "multi", days: "multi", label: "多日", hint: "深度出省", thumbs: thumbsFor((d) => d >= 4) },
  ];

  const scheduleDates = schedules.map((s) => s.start_date);
  const intros = [
    { title: "找一条山野路线，周末就出发", kicker: "同行者众" },
    { title: "约掼蛋、跑步、看电影也可以", kicker: "活动不只户外" },
    { title: "在山野，遇见爱", kicker: "同行者众" },
  ];
  const brandSlides = intros.map((intro, i) => {
    const src = scenicSlides[i % Math.max(scenicSlides.length, 1)] || { url: "", routeId: 0, code: "", title: "" };
    return { ...src, title: intro.title, kicker: intro.kicker };
  });
  return {
    brand: {
      kicker: "同行者众",
      lead: "在山野，遇见爱",
      slides: brandSlides,
      gallery: brandSlides.map((s) => s.url),
    },
    cities: [...cityMap.values()],
    tags: listPlayTags(db).map((t) => mapPlayTag(t, req)),
    festivals: festivalsFrom(),
    months: monthsFrom(),
    durations,
    offers: Object.values(OFFER_TYPES),
    calendarHint: "没团的日期可点「发团」提交审核。",
    monthDays: monthDays(dayjs().format("YYYY-MM"), scheduleDates),
  };
}

module.exports = {
  TAG_PALETTE,
  OFFER_TYPES,
  cityOf,
  randomTagColor,
  parseIdList,
  ensureDefaultPlayTags,
  listPlayTags,
  mapPlayTag,
  tagsForIds,
  festivalsFrom,
  monthsFrom,
  monthDays,
  approvedScheduleSql,
  buildHome,
};
