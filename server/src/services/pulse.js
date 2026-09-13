const crypto = require("crypto");
const dayjs = require("dayjs");
const { getDb } = require("../db");
const { maskName } = require("./biz");

const VIEW_THROTTLE_MIN = 10;
const VIEW_KEEP_DAYS = 14;
const FEED_DAYS = 14;
const VIEW_FEED_DAYS = 2;
const WATCHING_MIN = 8;
const FEED_LIMIT = 18;

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

function parseVisitorId(raw, fallbackSeed) {
  const s = String(raw || "").trim();
  if (/^[A-Za-z0-9_-]{8,64}$/.test(s)) return s;
  return crypto.createHash("sha1").update(String(fallbackSeed || "anon")).digest("hex").slice(0, 16);
}

function cityHint(hometown) {
  const s = String(hometown || "").trim();
  if (!s) return "";
  const municipalities = ["北京", "上海", "天津", "重庆"];
  for (const m of municipalities) {
    if (s.startsWith(m)) return m;
  }
  const hit = s.match(/省(.+?)(?:市|州|盟|地区|$)/);
  if (hit && hit[1]) return hit[1].replace(/市$/, "");
  return s.replace(/[省市县区]$/g, "").slice(0, 4);
}

function relativeTime(iso, now = dayjs()) {
  const t = dayjs(iso);
  if (!t.isValid()) return "刚刚";
  const mins = Math.max(0, now.diff(t, "minute"));
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins} 分钟前`;
  const hours = now.diff(t, "hour");
  if (hours < 24) return `${hours} 小时前`;
  if (hours < 48) return "昨天";
  return `${now.diff(t, "day")} 天前`;
}

function displayWho({ nickname, travelerName, hometown, fallback }) {
  const raw = String(travelerName || nickname || "").trim();
  const who = raw ? maskName(raw) : fallback || "一位同行";
  const place = cityHint(hometown);
  return { who, place, person: place ? `${who}（${place}）` : who };
}

function formatItem({ kind, who, place, timeAgo, title, rating }) {
  const person = place ? `${who}（${place}）` : who;
  const name = title || "这条线路";
  if (kind === "review") return `${person}${timeAgo}给${name}评了 ${rating || 5} 分`;
  if (kind === "open") return `${person}${timeAgo}开了一场${name}`;
  const verb = { view: "浏览了", enroll: "报名了", favorite: "收藏了" }[kind] || "关注了";
  return `${person}${timeAgo}${verb}${name}`;
}

function itemHref(kind, routeId, scheduleId) {
  if (scheduleId && (kind === "enroll" || kind === "open")) return `/m/schedule/${scheduleId}`;
  if (routeId) return `/m/route/${routeId}`;
  return "";
}

function pruneViews(db) {
  db.prepare("DELETE FROM page_views WHERE created_at < datetime('now','localtime', ?)").run(`-${VIEW_KEEP_DAYS} day`);
}

function recordView({ visitorId, userId, routeId, scheduleId, scope } = {}) {
  const db = getDb();
  pruneViews(db);
  const visitor = parseVisitorId(visitorId);
  let rid = Number(routeId) || 0;
  let sid = Number(scheduleId) || 0;
  if (scope === "home" || (!rid && !sid)) {
    rid = 0;
    sid = 0;
  } else if (sid) {
    const sch = db.prepare("SELECT id, route_id FROM schedules WHERE id=?").get(sid);
    if (!sch) fail(400, "排期不存在");
    sid = sch.id;
    rid = rid || sch.route_id;
  } else {
    const route = db.prepare("SELECT id FROM routes WHERE id=?").get(rid);
    if (!route) fail(400, "线路不存在");
    rid = route.id;
  }

  const last = db
    .prepare(
      `SELECT created_at FROM page_views
       WHERE visitor_id=? AND IFNULL(route_id,0)=? AND IFNULL(schedule_id,0)=?
       ORDER BY id DESC LIMIT 1`
    )
    .get(visitor, rid, sid);
  if (last && dayjs().diff(dayjs(last.created_at), "minute") < VIEW_THROTTLE_MIN) {
    return { recorded: false };
  }

  db.prepare("INSERT INTO page_views (visitor_id, user_id, route_id, schedule_id) VALUES (?,?,?,?)").run(
    visitor,
    userId || null,
    rid || null,
    sid || null
  );
  return { recorded: true };
}

function watchingNow({ scope, routeId, scheduleId, excludeVisitorId } = {}) {
  const db = getDb();
  const since = dayjs().subtract(WATCHING_MIN, "minute").format("YYYY-MM-DD HH:mm:ss");
  let sql = "SELECT COUNT(DISTINCT visitor_id) AS n FROM page_views WHERE created_at >= ?";
  const params = [since];
  if (excludeVisitorId) {
    sql += " AND visitor_id != ?";
    params.push(excludeVisitorId);
  }
  if (scope === "route" && routeId) {
    sql += " AND route_id = ?";
    params.push(routeId);
  } else if (scope === "schedule") {
    sql += " AND (IFNULL(schedule_id,0) = ? OR IFNULL(route_id,0) = ?)";
    params.push(Number(scheduleId) || 0, Number(routeId) || 0);
  }
  return Number(db.prepare(sql).get(...params).n || 0);
}

function pushRow(rows, row) {
  if (!row || !row.created_at) return;
  rows.push(row);
}

function collectEvents({ scope, routeId, scheduleId }) {
  const db = getDb();
  const since = dayjs().subtract(FEED_DAYS, "day").format("YYYY-MM-DD HH:mm:ss");
  const viewSince = dayjs().subtract(VIEW_FEED_DAYS, "day").format("YYYY-MM-DD HH:mm:ss");
  const rid = Number(routeId) || 0;
  const sid = Number(scheduleId) || 0;
  const home = scope !== "route" && scope !== "schedule";
  const channelSql = home ? " AND IFNULL(s.channel,'trip')!='activity' " : "";

  let routeSql = "";
  const routeParams = [];
  if (scope === "route" && rid) {
    routeSql = " AND r.id=? ";
    routeParams.push(rid);
  } else if (scope === "schedule" && (sid || rid)) {
    routeSql = " AND (IFNULL(s.id,0)=? OR r.id=?) ";
    routeParams.push(sid, rid);
  }

  const rows = [];
  const enrolls = db
    .prepare(
      `SELECT e.id, e.created_at, e.user_id, e.schedule_id, s.route_id, s.channel,
              COALESCE(NULLIF(u.nickname,''), e.traveler_name) AS nickname,
              e.traveler_name, COALESCE(NULLIF(u.hometown,''), e.hometown) AS hometown,
              r.title
       FROM enrollments e
       JOIN schedules s ON s.id=e.schedule_id
       JOIN routes r ON r.id=s.route_id
       LEFT JOIN users u ON u.id=e.user_id
       WHERE e.status='joined' AND e.created_at>=?
         AND IFNULL(s.review_status,'approved')='approved' AND s.status!='cancelled' AND r.status='on'
         AND (u.id IS NULL OR u.deleted_at IS NULL)
         ${channelSql} ${routeSql}
       ORDER BY e.id DESC LIMIT 40`
    )
    .all(since, ...routeParams);
  enrolls.forEach((row) => pushRow(rows, { ...row, kind: "enroll", sourceId: row.id }));

  const favRouteSql = scope === "route" && rid ? " AND r.id=? " : scope === "schedule" && rid ? " AND r.id=? " : "";
  const favParams = scope === "route" || scope === "schedule" ? [rid].filter(Boolean) : [];
  if (!(scope === "schedule" && !rid)) {
    const favs = db
      .prepare(
        `SELECT f.user_id, f.route_id, f.created_at, u.nickname, u.hometown, r.title
         FROM favorites f
         JOIN routes r ON r.id=f.route_id
         JOIN users u ON u.id=f.user_id
         WHERE f.created_at>=? AND r.status='on' AND u.deleted_at IS NULL
           ${home ? " AND EXISTS (SELECT 1 FROM schedules s WHERE s.route_id=r.id AND IFNULL(s.channel,'trip')!='activity' AND IFNULL(s.review_status,'approved')='approved')" : ""}
           ${favRouteSql}
         ORDER BY f.created_at DESC LIMIT 30`
      )
      .all(since, ...favParams);
    favs.forEach((row) =>
      pushRow(rows, { ...row, kind: "favorite", sourceId: `${row.user_id}-${row.route_id}`, schedule_id: null })
    );
  }

  const reviews = db
    .prepare(
      `SELECT rv.id, rv.created_at, rv.user_id, rv.schedule_id, rv.rating, s.route_id, s.channel,
              u.nickname, u.hometown, r.title
       FROM reviews rv
       JOIN schedules s ON s.id=rv.schedule_id
       JOIN routes r ON r.id=s.route_id
       LEFT JOIN users u ON u.id=rv.user_id
       WHERE rv.created_at>=? AND r.status='on' AND (u.id IS NULL OR u.deleted_at IS NULL)
         ${channelSql} ${routeSql}
       ORDER BY rv.id DESC LIMIT 30`
    )
    .all(since, ...routeParams);
  reviews.forEach((row) => pushRow(rows, { ...row, kind: "review", sourceId: row.id }));

  const opens = db
    .prepare(
      `SELECT s.id, s.created_at, s.organizer_id AS user_id, s.id AS schedule_id, s.route_id, s.channel,
              s.organizer_type, s.company_name, u.nickname, u.hometown, r.title
       FROM schedules s
       JOIN routes r ON r.id=s.route_id
       LEFT JOIN users u ON u.id=s.organizer_id
       WHERE s.created_at>=? AND IFNULL(s.review_status,'approved')='approved' AND s.status!='cancelled'
         AND r.status='on' AND IFNULL(s.organizer_id,0)>0
         ${channelSql} ${routeSql}
       ORDER BY s.id DESC LIMIT 20`
    )
    .all(since, ...routeParams);
  opens.forEach((row) => {
    const org =
      row.organizer_type === "company" || row.organizer_type === "campus"
        ? row.company_name || row.nickname
        : row.nickname;
    pushRow(rows, { ...row, kind: "open", sourceId: row.id, nickname: org, traveler_name: org });
  });

  const viewRouteSql =
    scope === "route" && rid ? " AND v.route_id=? " : scope === "schedule" && rid ? " AND v.route_id=? " : "";
  const viewParams = scope === "route" || scope === "schedule" ? (rid ? [rid] : []) : [];
  if (viewParams.length || home) {
    const views = db
      .prepare(
        `SELECT v.id, v.created_at, v.user_id, v.route_id, v.schedule_id, v.visitor_id,
                u.nickname, u.hometown, r.title
         FROM page_views v
         JOIN routes r ON r.id=v.route_id
         JOIN users u ON u.id=v.user_id
         WHERE v.created_at>=? AND v.user_id IS NOT NULL AND r.status='on' AND u.deleted_at IS NULL
           ${home ? " AND EXISTS (SELECT 1 FROM schedules s WHERE s.route_id=r.id AND IFNULL(s.channel,'trip')!='activity')" : ""}
           ${viewRouteSql}
         ORDER BY v.id DESC LIMIT 30`
      )
      .all(viewSince, ...viewParams);
    views.forEach((row) => pushRow(rows, { ...row, kind: "view", sourceId: row.id }));
  }

  return rows;
}

function listPulse({ scope, routeId, scheduleId, excludeUserId, excludeVisitorId } = {}) {
  const now = dayjs();
  const watching = watchingNow({ scope, routeId, scheduleId, excludeVisitorId });
  const watchingText = watching
    ? scope === "home" || !scope
      ? `此刻 ${watching} 人在逛`
      : `此刻 ${watching} 人在看`
    : "";

  const seen = new Set();
  const items = [];
  const rows = collectEvents({ scope: scope || "home", routeId, scheduleId }).sort((a, b) =>
    String(b.created_at).localeCompare(String(a.created_at))
  );

  for (const row of rows) {
    if (excludeUserId && Number(row.user_id) === Number(excludeUserId)) continue;
    if (row.kind === "view" && excludeVisitorId && row.visitor_id === excludeVisitorId) continue;
    const key = `${row.kind}:${row.user_id || 0}:${row.route_id || 0}:${row.schedule_id || 0}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const { who, place } = displayWho(row);
    const timeAgo = relativeTime(row.created_at, now);
    const kind = row.kind;
    const title = row.title || "";
    items.push({
      id: `${kind}-${row.sourceId}`,
      kind,
      who,
      place,
      verb: kind === "review" ? "评价了" : kind === "open" ? "开了一场" : kind === "enroll" ? "报名了" : kind === "favorite" ? "收藏了" : "浏览了",
      title,
      timeAgo,
      text: formatItem({ kind, who, place, timeAgo, title, rating: row.rating }),
      href: itemHref(kind, row.route_id, row.schedule_id),
      routeId: row.route_id || null,
      scheduleId: row.schedule_id || null,
      createdAt: row.created_at,
    });
    if (items.length >= FEED_LIMIT) break;
  }

  return { items, watchingNow: watching, watchingText };
}

module.exports = {
  parseVisitorId,
  cityHint,
  relativeTime,
  displayWho,
  formatItem,
  recordView,
  listPulse,
  VIEW_THROTTLE_MIN,
};
