const { getDb } = require("../db");
const { pickTier } = require("./biz");
const config = require("../config");
const dayjs = require("dayjs");
const { applyOfferQuote, liveMemberPrice } = require("./offer");
const { PHOTO } = require("../seed/routes-data");
const { COMMONS_FILES, commonsUrl } = require("../seed/fetch-place-photos");

function isMember(user) {
  if (!user) return false;
  if (!user.is_member) return false;
  if (!user.member_expire_at) return true;
  return !dayjs(user.member_expire_at).isBefore(dayjs(), "day");
}

function enrolledCount(scheduleId, includeCancelled = false) {
  const db = getDb();
  const sql = includeCancelled
    ? "SELECT COUNT(*) AS c FROM enrollments WHERE schedule_id=?"
    : "SELECT COUNT(*) AS c FROM enrollments WHERE schedule_id=? AND status='joined'";
  const row = db.prepare(sql).get(scheduleId);
  return row.c;
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
    return { people, tierMin: 0, price: 0, originPrice: 0, memberPrice: 0, isMember: isMember(user) };
  }
  const tier = pickTier(
    bundle.tiers.map((t) => ({ minPeople: t.min_people, price: t.price, memberPrice: t.member_price })),
    people
  );
  const member = isMember(user);
  const origin = Number(tier.price);
  return applyOfferQuote(
    {
      people,
      tierMin: tier.minPeople,
      price: member ? liveMemberPrice(origin) : origin,
      originPrice: origin,
      memberPrice: liveMemberPrice(origin),
      isMember: member,
    },
    schedule,
    member
  );
}

function maybeMatchGuide(scheduleId) {
  const db = getDb();
  const sch = db.prepare("SELECT * FROM schedules WHERE id=?").get(scheduleId);
  if (!sch || sch.guide_id || sch.status === "cancelled") return sch;
  const n = enrolledCount(scheduleId);
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

function publicMediaUrl(url) {
  const key = photoKeyFromUrl(url);
  if (!key) return url;
  const remote = PHOTO[key];
  if (typeof remote === "string" && remote.startsWith("https://")) return remote;
  const fileTitle = COMMONS_FILES[key];
  if (fileTitle) return commonsUrl(fileTitle);
  return url;
}

module.exports = {
  isMember,
  enrolledCount,
  waitlistCount,
  loadRouteBundle,
  quoteForSchedule,
  maybeMatchGuide,
  addPoints,
  attachAssetHost,
  publicMediaUrl,
  config,
};
