const dayjs = require("dayjs");
const { nanoid } = require("nanoid");
const { getDb } = require("../db");
const config = require("../config");
const { realEnrolledCount, paidJoinedCount, enrolledCount, maybeMatchGuide } = require("./helpers");
const { isListed } = require("./route-apply");
const { cityOf } = require("./home");
const { sendSms } = require("./sms");
const { clip, notifyUser } = require("./notify");

function personalBountyYuan() {
  return Math.max(0, Math.round(Number(config.personalTrip?.bounty || 200)));
}

function horizonDays(override) {
  const n = override != null ? Number(override) : Number(config.officialTrip?.horizonDays || 10);
  return Math.max(1, Math.min(31, n || 10));
}

function defaultMeetupTime() {
  return normTime(config.officialTrip?.meetupTime || "07:30");
}

function tripKindOf(type, channel) {
  if (channel === "activity") return { key: "activity", label: "同城局" };
  if (type === "official") return { key: "official", label: "官方" };
  if (type === "company") return { key: "company", label: "公司" };
  if (type === "campus") return { key: "campus", label: "高校" };
  return { key: "individual", label: "个人" };
}

function normTime(raw) {
  const m = String(raw || "").trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return "07:30";
  return `${String(Number(m[1])).padStart(2, "0")}:${m[2]}`;
}

function normPoint(raw) {
  return String(raw || "")
    .replace(/\s+/g, "")
    .replace(/[，,]/g, "")
    .trim();
}

function sameSlot(a, b) {
  return normPoint(a.meetup_point) === normPoint(b.meetup_point) && normTime(a.meetup_time) === normTime(b.meetup_time);
}

function parseMeetups(route) {
  try {
    const list = JSON.parse(route?.meetup_json || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function defaultMeetup(route) {
  const first = parseMeetups(route)[0] || {};
  const point = String(first.name || first.title || "").trim() || "东直门东方银座C口";
  const time = first.timeHint ? normTime(first.timeHint) : defaultMeetupTime();
  return { point, time };
}

function pickOfficialBus(routeId) {
  const db = getDb();
  let buses = db
    .prepare(
      `SELECT b.* FROM bus_types b JOIN route_buses rb ON rb.bus_type_id=b.id
       WHERE rb.route_id=? ORDER BY b.seats, b.sort_order`
    )
    .all(routeId);
  if (!buses.length) {
    buses = db.prepare("SELECT * FROM bus_types ORDER BY seats, sort_order").all();
  }
  if (!buses.length) return null;
  return buses.find((b) => Number(b.seats) >= 30) || buses[buses.length - 1];
}

function isActivityOnly(routeId) {
  const rows = getDb()
    .prepare("SELECT DISTINCT IFNULL(channel,'trip') AS c FROM schedules WHERE route_id=?")
    .all(routeId);
  return rows.length > 0 && rows.every((row) => row.c === "activity");
}

function listedMountainRoutes() {
  return getDb()
    .prepare("SELECT * FROM routes")
    .all()
    .filter((row) => isListed(row) && !isActivityOnly(row.id));
}

function findOfficial(routeId, startDate, point, time) {
  const rows = getDb()
    .prepare(
      `SELECT * FROM schedules WHERE route_id=? AND start_date=? AND organizer_type='official'
       AND status!='cancelled' AND IFNULL(channel,'trip')!='activity'`
    )
    .all(routeId, startDate);
  const probe = { meetup_point: point, meetup_time: time };
  return rows.find((row) => sameSlot(row, probe)) || null;
}

function createOfficialSchedule(route, startDate, meetup) {
  const db = getDb();
  const exist = findOfficial(route.id, startDate, meetup.point, meetup.time);
  if (exist) return { schedule: exist, created: false };
  const bus = pickOfficialBus(route.id);
  if (!bus) return { schedule: null, created: false };
  const days = Math.max(1, Number(route.days) || 1);
  const end = dayjs(startDate).add(days - 1, "day").format("YYYY-MM-DD");
  const minGroup = Math.max(1, Number(route.min_group_size) || 10);
  const info = db
    .prepare(
      `INSERT INTO schedules (route_id,start_date,end_date,organizer_type,organizer_id,organizer_name,company_name,bus_type_id,min_group_size,max_seats,meetup_point,meetup_time,status,share_token,notes,review_status,channel,city,heat_mode,heat_locked)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      route.id,
      startDate,
      end,
      "official",
      0,
      "同行者众",
      "同行者众",
      bus.id,
      minGroup,
      bus.seats,
      meetup.point,
      meetup.time,
      "recruiting",
      nanoid(10),
      "平台官方团，出行前一天会并入同集合点未成团的个人/公司/高校团。",
      "approved",
      "trip",
      cityOf(route.region),
      "auto",
      0
    );
  return {
    schedule: db.prepare("SELECT * FROM schedules WHERE id=?").get(info.lastInsertRowid),
    created: true,
  };
}

function ensureOfficialTrips({ now, days } = {}) {
  const start = dayjs(now || undefined).startOf("day");
  const horizon = horizonDays(days);
  const routes = listedMountainRoutes();
  const created = [];
  for (const route of routes) {
    const meetup = defaultMeetup(route);
    for (let i = 0; i < horizon; i += 1) {
      const date = start.add(i, "day").format("YYYY-MM-DD");
      const res = createOfficialSchedule(route, date, meetup);
      if (res.created && res.schedule) created.push(res.schedule.id);
    }
  }
  return { count: created.length, ids: created };
}

function isPrivate(sch) {
  return Boolean(String(sch.join_code || "").trim());
}

function isFormed(sch) {
  if (!sch || sch.status === "cancelled") return false;
  if (sch.status === "confirmed") return true;
  const need = Number(sch.min_group_size || 0);
  if (need <= 0) return false;
  return realEnrolledCount(sch.id) >= need;
}

function expandOfficialCapacity(scheduleId) {
  const db = getDb();
  const sch = db.prepare("SELECT * FROM schedules WHERE id=?").get(scheduleId);
  if (!sch || sch.organizer_type !== "official" || sch.status === "cancelled") return sch;
  const live = enrolledCount(sch.id);
  if (live <= Number(sch.max_seats || 0)) return sch;
  const buses = db.prepare("SELECT * FROM bus_types ORDER BY seats, sort_order").all();
  const fit = buses.find((b) => Number(b.seats) >= live) || buses[buses.length - 1] || null;
  const seats = Math.max(live, Number(fit?.seats || live));
  db.prepare("UPDATE schedules SET max_seats=?, bus_type_id=? WHERE id=?").run(seats, fit?.id || sch.bus_type_id, sch.id);
  return db.prepare("SELECT * FROM schedules WHERE id=?").get(sch.id);
}

function destTaken(destId, en) {
  const db = getDb();
  if (en.id_card) {
    const hit = db
      .prepare("SELECT id FROM enrollments WHERE schedule_id=? AND upper(id_card)=? AND status!='cancelled'")
      .get(destId, String(en.id_card).toUpperCase());
    return Boolean(hit);
  }
  if (en.user_id) {
    const hit = db
      .prepare("SELECT id FROM enrollments WHERE schedule_id=? AND user_id=? AND status!='cancelled'")
      .get(destId, en.user_id);
    return Boolean(hit);
  }
  return false;
}

function moveEnrollment(en, dest) {
  const db = getDb();
  if (destTaken(dest.id, en)) {
    db.prepare("UPDATE enrollments SET status='cancelled' WHERE id=? AND status!='cancelled'").run(en.id);
    return "skip";
  }
  db.prepare("UPDATE enrollments SET schedule_id=?, seat_no='' WHERE id=?").run(dest.id, en.id);
  db.prepare("UPDATE payments SET schedule_id=? WHERE enrollment_id=?").run(dest.id, en.id);
  return "moved";
}

function notifyMerged(en, dest, routeTitle) {
  const when = `${dest.start_date} ${dest.meetup_time || ""}`.trim();
  const point = dest.meetup_point || "";
  notifyUser({
    userId: en.user_id,
    phone: en.traveler_phone,
    scene: "merge",
    sms: `【同行者众】原团未成团，已并入「${routeTitle}」官方团。${when} ${point} 集合。`,
    wechat: {
      title: "已并入官方团",
      page: `pages/schedule/schedule?id=${dest.id}`,
      data: {
        thing1: clip(routeTitle, 20),
        time2: clip(when, 20),
        thing3: clip(point, 20),
        thing4: "原团未成团，已并入官方团",
      },
    },
    refType: "schedule",
    refId: dest.id,
  });
  try {
    require("./mine-desk").pushUserNotice({
      userId: en.user_id,
      kind: "merge",
      title: "集合点已变更",
      body: `原团未成团，已并入「${routeTitle}」。${when} ${point} 集合。`,
      href: `/m/schedule/${dest.id}`,
      refType: "schedule",
      refId: dest.id,
    });
  } catch {
    /* 并团短信不依赖站内信 */
  }
}

function mergeScheduleInto(source, dest) {
  const db = getDb();
  const enrollments = db.prepare("SELECT * FROM enrollments WHERE schedule_id=? AND status!='cancelled'").all(source.id);
  let moved = 0;
  for (const en of enrollments) {
    const person = en.user_id ? db.prepare("SELECT is_virtual FROM users WHERE id=?").get(en.user_id) : null;
    if (person && Number(person.is_virtual)) {
      db.prepare("UPDATE enrollments SET status='cancelled' WHERE id=? AND status!='cancelled'").run(en.id);
      continue;
    }
    if (moveEnrollment(en, dest) === "moved") {
      moved += 1;
      notifyMerged(en, dest, db.prepare("SELECT title FROM routes WHERE id=?").get(dest.route_id)?.title || "活动");
    }
  }
  db.prepare(
    `UPDATE schedules SET status='cancelled', cancel_reason=?, cancelled_at=datetime('now','localtime'), cancelled_by='system', cancelled_by_id=0, merged_into=? WHERE id=?`
  ).run("未成团，已并入官方团", dest.id, source.id);
  if (source.guide_id) {
    db.prepare("UPDATE guides SET status='idle' WHERE id=? AND status='assigned'").run(source.guide_id);
    db.prepare("UPDATE schedules SET guide_id=NULL WHERE id=?").run(source.id);
  }
  return moved;
}

function mergeDueTrips({ now } = {}) {
  const db = getDb();
  const tomorrow = dayjs(now || undefined).add(1, "day").format("YYYY-MM-DD");
  const sources = db
    .prepare(
      `SELECT * FROM schedules WHERE start_date=? AND status!='cancelled'
       AND IFNULL(review_status,'approved')='approved' AND IFNULL(channel,'trip')!='activity'
       AND IFNULL(organizer_type,'individual')!='official'`
    )
    .all(tomorrow)
    .filter((row) => !isPrivate(row) && !isFormed(row));
  let moved = 0;
  const mergedIds = [];
  const officialTouched = new Set();
  for (const source of sources) {
    const route = db.prepare("SELECT * FROM routes WHERE id=?").get(source.route_id);
    if (!route) continue;
    let official = findOfficial(source.route_id, source.start_date, source.meetup_point, source.meetup_time);
    if (!official) {
      const made = createOfficialSchedule(route, source.start_date, {
        point: source.meetup_point || defaultMeetup(route).point,
        time: normTime(source.meetup_time || defaultMeetup(route).time),
      });
      official = made.schedule;
    }
    if (!official) continue;
    moved += mergeScheduleInto(source, official);
    mergedIds.push(source.id);
    officialTouched.add(official.id);
  }
  const expanded = [];
  for (const id of officialTouched) {
    const before = db.prepare("SELECT max_seats FROM schedules WHERE id=?").get(id);
    const after = expandOfficialCapacity(id);
    if (after && before && Number(after.max_seats) > Number(before.max_seats)) expanded.push(id);
    try {
      require("./enroll").promoteWaitlist(id);
    } catch {
      /* 候补递补失败不影响并团 */
    }
    try {
      require("./virtual").trimVirtuals(id);
    } catch {
      /* 热度回补失败不影响并团 */
    }
    maybeMatchGuide(id);
  }
  return { date: tomorrow, sources: mergedIds, moved, expanded };
}

function markPersonalBounty(scheduleId) {
  const db = getDb();
  const sch = db.prepare("SELECT * FROM schedules WHERE id=?").get(scheduleId);
  if (!sch) return null;
  if ((sch.channel || "trip") === "activity") return null;
  if (sch.organizer_type !== "individual") return null;
  if (!Number(sch.organizer_id || 0)) return null;
  const amount = personalBountyYuan();
  db.prepare("UPDATE schedules SET bounty_status='pending', bounty_amount=? WHERE id=?").run(amount, sch.id);
  return amount;
}

function settlePersonalBounty(sch) {
  if (!sch || sch.status === "cancelled") return null;
  if ((sch.review_status || "approved") !== "approved") return null;
  if ((sch.channel || "trip") === "activity") return null;
  if (sch.organizer_type !== "individual") return null;
  if (!Number(sch.organizer_id || 0)) return null;
  if ((sch.bounty_status || "") !== "pending") return null;
  const need = Number(sch.min_group_size || 0);
  if (need <= 0 || paidJoinedCount(sch.id) < need) return null;
  const db = getDb();
  const amount = Number(sch.bounty_amount || personalBountyYuan());
  const locked = db
    .prepare("UPDATE schedules SET bounty_status='paying' WHERE id=? AND bounty_status='pending'")
    .run(sch.id);
  if (!locked.changes) return null;
  if (amount > 0) {
    const tradeNo = `TB${Date.now()}${sch.organizer_id}`.slice(0, 32);
    try {
      const info = db.prepare(
        "INSERT INTO payments (enrollment_id,user_id,schedule_id,amount,channel,status,trade_no,remark,scene) VALUES (?,?,?,?,?,?,?,?,?)"
      ).run(0, sch.organizer_id, sch.id, amount, "bounty", "success", tradeNo, "个人发团成团奖励", "trip_bounty");
      require("./wallet").credit(sch.organizer_id, amount, {
        reason: "个人发团成团奖励",
        scene: "trip_bounty",
        refType: "payment",
        refId: Number(info.lastInsertRowid),
      });
    } catch {
      db.prepare("UPDATE schedules SET bounty_status='pending' WHERE id=? AND bounty_status='paying'").run(sch.id);
      return null;
    }
  }
  db.prepare("UPDATE schedules SET bounty_status='paid', bounty_paid_at=datetime('now','localtime') WHERE id=?").run(sch.id);
  if (amount > 0) {
    const user = db.prepare("SELECT phone FROM users WHERE id=?").get(sch.organizer_id);
    const route = db.prepare("SELECT title FROM routes WHERE id=?").get(sch.route_id);
    if (user?.phone) {
      sendSms({
        phone: user.phone,
        scene: "trip",
        content: `【同行者众】你发的「${route?.title || "活动"}」已成团，奖励 ${amount} 元已入账钱包。`,
        refType: "schedule",
        refId: sch.id,
      });
    }
    return { amount, mock: true };
  }
  return { amount: 0, mock: true };
}

function runOfficialJobs(opts = {}) {
  const created = ensureOfficialTrips(opts);
  const merged = mergeDueTrips(opts);
  return { created, merged };
}

module.exports = {
  personalBountyYuan,
  tripKindOf,
  normTime,
  ensureOfficialTrips,
  mergeDueTrips,
  expandOfficialCapacity,
  markPersonalBounty,
  settlePersonalBounty,
  runOfficialJobs,
  findOfficial,
  createOfficialSchedule,
};
