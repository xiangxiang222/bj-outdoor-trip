import { processFeed } from "./feedList";

const KINDS = [
  { key: "掼蛋", label: "掼蛋", hint: "以牌会友", slug: "cards", icon: "cards", title: "好牌友，一桌就熟", description: "先看玩法与经验要求，找到适合自己的那一桌。", notice: "请提前说清打法、时长与茶位费用，不组织现金输赢。", publishLabel: "发起掼蛋局", titlePlaceholder: "例如：周五下班后的新手掼蛋局", descriptionPlaceholder: "介绍打法、轮换方式、活动安排，以及茶位或其他费用。",
    fields: [
      { key: "level", label: "经验要求", placeholder: "例如：新手友好，会基础规则即可", required: true },
      { key: "rules", label: "打法规则", placeholder: "例如：四人一桌，搭档轮换，现场讲解规则", required: true },
      { key: "duration", label: "预计时长", placeholder: "例如：2 小时", required: false },
      { key: "cost", label: "费用说明", placeholder: "例如：免费参加，茶位自理", required: true }
    ] },
  { key: "跑步", label: "跑步", hint: "一起迈步", slug: "run", icon: "run", title: "步调相近，一起向前", description: "距离和配速先说清，找到适合自己的跑步搭子。", notice: "按自身状态选择距离与配速，查看路线和装备要求后再报名。", publishLabel: "发起约跑", titlePlaceholder: "例如：朝阳公园 5 公里轻松夜跑", descriptionPlaceholder: "介绍热身、路线与补给安排，写清是否等人和天气变动计划。",
    fields: [
      { key: "distance", label: "跑步距离", placeholder: "例如：5 公里，可按体力提前结束", required: true },
      { key: "pace", label: "参考配速", placeholder: "例如：6分30秒～7分/公里，不竞速", required: true },
      { key: "route", label: "跑步路线", placeholder: "例如：朝阳公园南门集合，沿园内环线", required: true },
      { key: "equipment", label: "装备提示", placeholder: "例如：跑鞋、饮水，夜跑请带反光装备", required: false }
    ] },
  { key: "电影", label: "电影", hint: "同看一场", slug: "movie", icon: "film", title: "一场电影，多一个同频的人", description: "先选想看的影片，再核对影院、场次与购票方式。", notice: "报名活动不等于购买电影票，请以发起人写明的购票安排为准。", publishLabel: "发起观影", titlePlaceholder: "例如：周末一起看一场电影", descriptionPlaceholder: "介绍集合安排、观影后的交流，以及改期或散场安排。",
    fields: [
      { key: "film", label: "影片名称", placeholder: "填写本次观影的具体片名", required: true },
      { key: "session", label: "影院与场次", placeholder: "填写影院、影厅及电影开场时间", required: true },
      { key: "tickets", label: "购票方式", placeholder: "例如：自行购票，报名费用不含电影票", required: true },
      { key: "agreement", label: "观影约定", placeholder: "例如：开场前 20 分钟集合，观影后自由交流", required: false }
    ] },
  { key: "招募", label: "社团", hint: "找到同好", slug: "club", icon: "community", title: "让热爱，找到自己的圈子", description: "了解社团做什么、招募谁，再报名参加这次见面。", notice: "报名参加本次招募活动，是否入会由社团另行确认。", publishLabel: "发起社团招募", titlePlaceholder: "例如：校园摄影社新朋友见面会", descriptionPlaceholder: "介绍社团日常、本次活动流程、后续联系与入会方式。",
    fields: [
      { key: "organization", label: "社团名称", placeholder: "填写发起招募的社团或兴趣小组", required: true },
      { key: "audience", label: "招募对象", placeholder: "例如：对摄影感兴趣的在校师生，不限经验", required: true },
      { key: "content", label: "参与内容", placeholder: "例如：作品交流、校园拍摄和新成员介绍", required: true },
      { key: "requirements", label: "报名要求", placeholder: "例如：无需专业设备，带手机即可", required: false }
    ] },
];
const WEEKDAY = ["日", "一", "二", "三", "四", "五", "六"];
const DAY = 86400000;
function kindByKey(key) {
  return KINDS.find((k) => k.key === key) || null;
}
function exactKind(value) {
  const key = String(value || "").trim();
  return kindByKey(key) || ({ 社团: kindByKey("招募"), 社团招募: kindByKey("招募"), 夜跑: kindByKey("跑步"), 慢跑: kindByKey("跑步"), 约跑: kindByKey("跑步"), 观影: kindByKey("电影"), 看电影: kindByKey("电影"), 打牌: kindByKey("掼蛋") })[key] || null;
}
function kindOf(row) {
  if (!row) return null;
  const route = row.route || {};
  const explicit = exactKind(row.activityKind) || exactKind(route.category) || exactKind(row.category);
  if (explicit) return explicit;
  const tags = [].concat(row.playTags || [], route.tags || []);
  for (const tag of tags) {
    const hit = exactKind(typeof tag === "string" ? tag : tag && tag.name);
    if (hit) return hit;
  }
  const text = [route.title, route.subtitle, row.title, row.notes].filter(Boolean).join(" ");
  if (/掼蛋|打牌/.test(text)) return kindByKey("掼蛋");
  if (/跑步|夜跑|慢跑|约跑/.test(text)) return kindByKey("跑步");
  if (/电影|观影/.test(text)) return kindByKey("电影");
  if (/招募|社团/.test(text)) return kindByKey("招募");
  return null;
}
function chinaDay(now) {
  const stamp = now == null ? Date.now() : new Date(now).getTime();
  return new Date(stamp + 8 * 3600000).toISOString().slice(0, 10);
}
function dayStamp(iso) {
  const raw = String(iso || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return NaN;
  const stamp = Date.parse(raw + "T00:00:00Z");
  return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === raw ? stamp : NaN;
}
function dateOf(iso) {
  const raw = String(iso || "").slice(0, 10);
  const stamp = dayStamp(raw);
  if (!Number.isFinite(stamp)) return { day: "--", weekday: "", month: "", label: raw };
  return { day: String(Number(raw.slice(8))), weekday: "周" + WEEKDAY[new Date(stamp).getUTCDay()], month: Number(raw.slice(5, 7)) + "月", label: raw };
}
function isThisWeek(iso, now) {
  const stamp = dayStamp(iso);
  const today = dayStamp(chinaDay(now));
  const weekday = new Date(today).getUTCDay();
  const start = today - ((weekday + 6) % 7) * DAY;
  return stamp >= start && stamp < start + 7 * DAY;
}
function activityEnded(row, now) {
  if (!row) return true;
  if (["cancelled", "finished", "completed", "ended"].includes(row.status) || row.startedAt || row.started_at || row.completedAt || row.completed_at) return true;
  const date = String(row.startDate || row.start_date || "").slice(0, 10);
  if (!Number.isFinite(dayStamp(date))) return true;
  const today = chinaDay(now);
  if (date < today) return true;
  const time = String(row.meetupTime || row.meetup_time || "").trim();
  if (date !== today || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return false;
  return Date.parse(date + "T" + time + ":00+08:00") <= (now == null ? Date.now() : new Date(now).getTime());
}
function priceOf(row) {
  const q = (row && row.quote) || {};
  const number = Number(q.tripPrice != null ? q.tripPrice : q.price != null ? q.price : q.originPrice != null ? q.originPrice : 0);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}
function activityFacts(row, now) {
  row = row || {};
  const enrolled = Math.max(0, Number(row.enrolled) || 0);
  const max = Math.max(0, Number(row.maxSeats || row.max_seats) || 0);
  const min = Math.max(0, Number(row.minGroupSize || row.min_group_size || (row.route && row.route.minGroupSize)) || 0);
  const remaining = row.remain != null && Number.isFinite(Number(row.remain)) ? Math.max(0, Number(row.remain)) : Math.max(0, max - enrolled);
  const full = max > 0 && remaining <= 0;
  const ended = activityEnded(row, now);
  const leftToForm = Math.max(0, min - enrolled);
  const date = dateOf(row.startDate || row.start_date);
  const price = priceOf(row);
  return {
    phase: ended ? "已结束" : full ? "已满员" : min > 0 ? leftToForm > 0 ? "还差 " + leftToForm + " 人成局" : "已成局" : "报名中",
    progress: "已报名 " + enrolled + " 人",
    capacity: full ? "可候补" : max > 0 ? "余 " + remaining + " 位" : "",
    dateLabel: date.month + date.day + "日 " + date.weekday,
    timeLabel: String(row.meetupTime || row.meetup_time || "").trim(),
    place: row.meetupPoint || row.meetup_point || row.city || "",
    price, free: price === 0, remaining, enrolled, min, max, ended, full,
    progressPercent: max > 0 ? Math.min(100, Math.round(enrolled / max * 100)) : 0
  };
}
function activityRows(rows, opts, now) {
  opts = opts || {};
  let list = processFeed(rows, { channel: "activity", query: opts.query || "", city: opts.city || "", sort: opts.sort || "soon" })
    .filter((row) => !activityEnded(row, now));
  if (opts.kind) list = list.filter((row) => kindOf(row) && kindOf(row).key === opts.kind);
  const today = chinaDay(now);
  const todayStamp = dayStamp(today);
  if (opts.time === "today") list = list.filter((row) => String(row.startDate || row.start_date).slice(0, 10) === today);
  if (opts.time === "week") list = list.filter((row) => isThisWeek(row.startDate || row.start_date, now));
  if (opts.time === "weekend") {
    const weekday = new Date(todayStamp).getUTCDay();
    const first = weekday === 0 ? todayStamp - DAY : todayStamp + ((6 - weekday + 7) % 7) * DAY;
    list = list.filter((row) => {
      const stamp = dayStamp(row.startDate || row.start_date);
      return stamp >= Math.max(todayStamp, first) && stamp <= first + DAY;
    });
  }
  if (opts.freeOnly) list = list.filter((row) => priceOf(row) === 0);
  if (opts.availableOnly) list = list.filter((row) => !activityFacts(row, now).full);
  return list;
}
function discoveryCities(rows, now) {
  return Array.from(new Set(activityRows(rows, {}, now).map((row) => String(row.city || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "zh-CN"));
}
function filterActivities(rows, kind) {
  const list = Array.isArray(rows) ? rows : [];
  return kind ? list.filter((row) => kindOf(row) && kindOf(row).key === kind) : list;
}
function composeActivityDescription(key, details, description) {
  const kind = kindByKey(key);
  if (!kind) return String(description || "").trim();
  const lines = kind.fields.map((field) => {
    const value = String((details || {})[field.key] || "").trim().replace(/[\r\n]+/g, " ");
    return value ? field.label + "：" + value.slice(0, 120) : "";
  }).filter(Boolean);
  return (lines.length ? "【活动信息】\n" + lines.join("\n") + "\n\n" : "") + String(description || "").trim();
}
function activityDetails(row) {
  const description = String((row && row.route && row.route.description) || (row && row.description) || "");
  if (!description.startsWith("【活动信息】\n")) return [];
  const head = description.slice(7).split("\n\n")[0];
  const kind = kindOf(row);
  const fields = kind ? kind.fields : KINDS.reduce((all, k) => all.concat(k.fields), []);
  return head.split("\n").map((line) => {
    const split = line.indexOf("：");
    const label = line.slice(0, split);
    const value = line.slice(split + 1).trim();
    return split > 0 && value && fields.some((field) => field.label === label) ? { label, value } : null;
  }).filter(Boolean).slice(0, 4);
}
function activityBody(row) {
  const description = String((row && row.route && row.route.description) || (row && row.description) || "");
  if (!description.startsWith("【活动信息】\n") || !activityDetails(row).length) return description;
  const split = description.indexOf("\n\n");
  return split >= 0 ? description.slice(split + 2).trim() : "";
}
function validateActivityDetails(key, values) {
  const kind = kindByKey(key);
  if (!kind) return "请选择活动玩法";
  const field = kind.fields.find((item) => item.required && !String((values || {})[item.key] || "").trim());
  if (field) return "请填写" + field.label;
  if (kind.fields.some((item) => String((values || {})[item.key] || "").length > 120)) return "活动信息每项请控制在 120 字以内";
  return "";
}
function decorate(row) {
  const kind = kindOf(row);
  const facts = activityFacts(row);
  return Object.assign({}, row, { kindLabel: kind ? kind.label : "", kindKey: kind ? kind.key : "", kindIcon: kind ? kind.icon : "community", dateBlock: dateOf(row.startDate), free: facts.free, price: facts.price, activityFacts: facts });
}

export { KINDS as ACTIVITY_KINDS, kindOf as activityKindOf, dateOf as formatActivityDate, kindByKey, isThisWeek, filterActivities, chinaDay, activityEnded, activityRows, activityFacts, discoveryCities, composeActivityDescription, activityDetails, activityBody, validateActivityDetails };
