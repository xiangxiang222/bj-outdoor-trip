const fs = require("fs");
const path = require("path");
const { getDb } = require("../db");
const { pickTier } = require("./biz");
const config = require("../config");
const dayjs = require("dayjs");
const { applyOfferQuote, liveMemberPrice } = require("./offer");

function isMember(user) {
  if (!user) return false;
  if (!user.is_member) return false;
  if (!user.member_expire_at) return true;
  return !dayjs(user.member_expire_at).isBefore(dayjs(), "day");
}

function isStudent(user) {
  return !!(user && (user.student_status === "approved" || user.is_student === 1));
}

function enrolledCount(scheduleId, includeCancelled = false) {
  const db = getDb();
  const sql = includeCancelled
    ? "SELECT COUNT(*) AS c FROM enrollments WHERE schedule_id=?"
    : "SELECT COUNT(*) AS c FROM enrollments WHERE schedule_id=? AND status='joined'";
  const row = db.prepare(sql).get(scheduleId);
  return row.c;
}

function realEnrolledCount(scheduleId) {
  return getDb()
    .prepare(
      `SELECT COUNT(*) AS c FROM enrollments e
       LEFT JOIN users u ON u.id=e.user_id
       WHERE e.schedule_id=? AND e.status='joined' AND IFNULL(u.is_virtual,0)=0`
    )
    .get(scheduleId).c;
}

function virtualEnrolledCount(scheduleId) {
  return getDb()
    .prepare(
      `SELECT COUNT(*) AS c FROM enrollments e
       JOIN users u ON u.id=e.user_id
       WHERE e.schedule_id=? AND e.status='joined' AND IFNULL(u.is_virtual,0)=1`
    )
    .get(scheduleId).c;
}

function waitlistCount(scheduleId) {
  const row = getDb()
    .prepare("SELECT COUNT(*) AS c FROM enrollments WHERE schedule_id=? AND status='waitlist'")
    .get(scheduleId);
  return row.c;
}

function loadRouteBundle(routeId) {
  const db = getDb();
  const route = db.prepare("SELECT * FROM routes WHERE id=?").get(routeId);
  if (!route) return null;
  const tiers = db.prepare("SELECT * FROM route_price_tiers WHERE route_id=? ORDER BY min_people").all(routeId);
  const buses = db.prepare(
    "SELECT b.* FROM bus_types b JOIN route_buses rb ON rb.bus_type_id=b.id WHERE rb.route_id=? ORDER BY b.sort_order"
  ).all(routeId);
  return { route, tiers, buses };
}

function quoteForSchedule(schedule, people, user) {
  const bundle = loadRouteBundle(schedule.route_id);
  if (!bundle) {
    return { people, tierMin: 0, price: 0, originPrice: 0, memberPrice: 0, studentPrice: 0, tripPrice: 0, isMember: isMember(user), isStudent: isStudent(user) };
  }
  const tier = pickTier(
    bundle.tiers.map((t) => ({ minPeople: t.min_people, price: t.price, memberPrice: t.member_price })),
    people
  );
  const member = isMember(user);
  const student = isStudent(user);
  const origin = Number(tier.price);
  return applyOfferQuote(
    {
      people,
      tierMin: tier.minPeople,
      price: member ? liveMemberPrice(origin) : origin,
      originPrice: origin,
      memberPrice: liveMemberPrice(origin),
      isMember: member,
      isStudent: student,
    },
    schedule,
    member,
    student
  );
}

function maybeMatchGuide(scheduleId) {
  const db = getDb();
  const sch = db.prepare("SELECT * FROM schedules WHERE id=?").get(scheduleId);
  if (!sch || sch.guide_id || sch.status === "cancelled") return sch;
  const n = realEnrolledCount(scheduleId);
  if (n < sch.min_group_size) return sch;
  const route = db.prepare("SELECT * FROM routes WHERE id=?").get(sch.route_id);
  if (!route) {
    db.prepare("UPDATE schedules SET status=? WHERE id=?").run("confirmed", scheduleId);
    return db.prepare("SELECT * FROM schedules WHERE id=?").get(scheduleId);
  }
  const guides = db.prepare("SELECT * FROM guides WHERE status!='off'").all();
  const hit =
    guides.find((g) => (g.specialties || "").includes(route.category)) ||
    guides.find((g) => g.status === "idle") ||
    guides[0];
  if (hit) {
    db.prepare("UPDATE schedules SET guide_id=?, status=? WHERE id=?").run(hit.id, "confirmed", scheduleId);
    db.prepare("UPDATE guides SET status='assigned' WHERE id=?").run(hit.id);
    db.prepare("INSERT OR IGNORE INTO schedule_leaders (schedule_id, slot, guide_id, status) VALUES (?,?,?,?)").run(
      scheduleId,
      1,
      hit.id,
      "assigned"
    );
  } else {
    db.prepare("UPDATE schedules SET status=? WHERE id=?").run("confirmed", scheduleId);
  }
  return db.prepare("SELECT * FROM schedules WHERE id=?").get(scheduleId);
}

function addPoints(userId, delta, reason, refType, refId) {
  const db = getDb();
  const user = db.prepare("SELECT points FROM users WHERE id=?").get(userId);
  const balance = (user?.points || 0) + delta;
  db.prepare("UPDATE users SET points=? WHERE id=?").run(balance, userId);
  db.prepare("INSERT INTO points_ledger (user_id,delta,balance,reason,ref_type,ref_id) VALUES (?,?,?,?,?,?)").run(
    userId,
    delta,
    balance,
    reason,
    refType,
    refId || null
  );
  return balance;
}

function publicBase(req) {
  const forwardedHost = String(req.get?.("x-forwarded-host") || "")
    .split(",")[0]
    .trim();
  const host = forwardedHost || req.get?.("host") || "127.0.0.1:3780";
  const forwardedProto = String(req.get?.("x-forwarded-proto") || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  const proto = forwardedProto === "https" || forwardedProto === "http" ? forwardedProto : req.protocol || "http";
  return `${proto}://${host}`;
}

function attachAssetHost(req, url) {
  if (!url) return url;
  const publicUrl = publicMediaUrl(url);
  if (/^https:\/\//i.test(publicUrl)) return publicUrl;
  const base = publicBase(req);
  if (publicUrl.startsWith("http")) {
    return publicUrl.replace(/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/i, base);
  }
  return `${base}${publicUrl}`;
}

function photoKeyFromUrl(url) {
  const m = String(url || "").match(/\/static\/photos\/([^/?#]+)\.(jpe?g|png|webp|svg)$/i);
  return m ? m[1] : "";
}

function staticRel(url) {
  const m = String(url || "").match(/\/static\/[^?#]+/);
  return m ? m[0].replace(/^\//, "") : "";
}

function mediaExists(rel) {
  if (!rel) return false;
  try {
    const p = path.join(config.publicDir, rel);
    return fs.existsSync(p) && fs.statSync(p).size > 1000;
  } catch {
    return false;
  }
}

function resolveStoredMedia(url, { code } = {}) {
  const raw = String(url || "");
  const key = photoKeyFromUrl(raw);
  if (key && mediaExists(`static/photos/${key}.jpg`)) return `/static/photos/${key}.jpg`;
  const rel = staticRel(raw);
  if (rel && mediaExists(rel)) return `/${rel}`;
  if (code && mediaExists(`static/routes/${code}.svg`)) return `/static/routes/${code}.svg`;
  return raw;
}

function publicMediaUrl(url) {
  return resolveStoredMedia(url);
}

module.exports = {
  isMember,
  isStudent,
  enrolledCount,
  realEnrolledCount,
  virtualEnrolledCount,
  waitlistCount,
  loadRouteBundle,
  quoteForSchedule,
  maybeMatchGuide,
  addPoints,
  attachAssetHost,
  publicMediaUrl,
  resolveStoredMedia,
  publicBase,
  config,
};
