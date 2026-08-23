const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const dayjs = require("dayjs");
const { getDb } = require("../db");
const { CITIES, makeIdCard, parseIdCard } = require("./idcard");
const { firstFreeSeat, parseLockedSeats } = require("./seats");
const { enrolledCount, virtualEnrolledCount, realEnrolledCount, quoteForSchedule } = require("./helpers");
const config = require("../config");

const SHARED_HASH = bcrypt.hashSync("123456", 8);

const SURNAMES = "王李张刘陈杨赵黄周吴徐孙马朱胡郭何高林罗郑梁谢宋唐韩冯邓曹彭曾肖田董袁潘于蒋蔡余杜叶程魏苏吕丁任沈姚卢姜崔钟谭陆汪范金石廖贾夏韦付方白邹孟熊秦邱江尹薛闫段雷侯龙史陶黎贺顾毛郝龚邵".split(
  ""
);
const MALE_GIVEN = [
  "伟",
  "强",
  "磊",
  "洋",
  "勇",
  "军",
  "杰",
  "涛",
  "超",
  "明",
  "浩",
  "宇",
  "鹏",
  "辉",
  "刚",
  "平",
  "建华",
  "志强",
  "晓东",
  "海峰",
  "子轩",
  "浩然",
  "俊杰",
  "嘉豪",
  "文博",
  "思远",
  "梓豪",
  "天佑",
  "博文",
  "晨阳",
  "立轩",
  "一鸣",
  "嘉伟",
  "永康",
  "振华",
  "昊然",
  "子墨",
  "金龙",
];
const FEMALE_GIVEN = [
  "芳",
  "娜",
  "敏",
  "静",
  "丽",
  "艳",
  "娟",
  "霞",
  "婷",
  "雪",
  "倩",
  "颖",
  "悦",
  "佳",
  "琳",
  "欣",
  "雨桐",
  "诗涵",
  "佳怡",
  "思琪",
  "梦瑶",
  "晓燕",
  "美玲",
  "雅婷",
  "欣怡",
  "梓涵",
  "若溪",
  "婉清",
  "慧敏",
  "晓梅",
  "雪梅",
  "佳宁",
  "雨萱",
  "可欣",
  "丽娟",
  "玉兰",
];
const NICK_POOL = [
  "周末出门",
  "想去山里",
  "走走停停",
  "晴天出发",
  "城里吹吹风",
  "带相机走走",
  "北漂周末",
  "慢慢走啊",
  "户外散步",
  "去看看山",
  "不宅周末",
  "山野散步",
  "周末不加班",
  "随便走走",
  "喜欢爬山",
  "想看日出",
  "周末有空",
  "出门晒晒",
  "走走就好",
  "想呼吸空气",
];
const PHONE_PREFIXES = [
  "130",
  "131",
  "132",
  "133",
  "135",
  "136",
  "137",
  "138",
  "139",
  "150",
  "151",
  "152",
  "155",
  "156",
  "157",
  "158",
  "159",
  "166",
  "176",
  "177",
  "178",
  "180",
  "181",
  "182",
  "183",
  "185",
  "186",
  "187",
  "188",
  "189",
  "191",
  "198",
];
const REGION_CODES = Object.keys(CITIES).map((code) => `${code}01`);

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

function randInt(min, maxInclusive) {
  return crypto.randomInt(min, maxInclusive + 1);
}

function pick(list) {
  return list[randInt(0, list.length - 1)];
}

function pickAge() {
  const r = randInt(1, 100);
  if (r <= 12) return randInt(22, 25);
  if (r <= 55) return randInt(26, 35);
  if (r <= 85) return randInt(36, 45);
  return randInt(46, 52);
}

function personName(gender) {
  const surname = pick(SURNAMES);
  const given = pick(gender === "male" ? MALE_GIVEN : FEMALE_GIVEN);
  return `${surname}${given}`;
}

function nicknameOf(fullName) {
  const last = fullName.slice(-1);
  const roll = randInt(1, 100);
  if (roll <= 42) return fullName;
  if (roll <= 60) return `小${last}`;
  if (roll <= 74) return `阿${last}`;
  return pick(NICK_POOL);
}

function uniquePhone(db) {
  for (let i = 0; i < 80; i += 1) {
    const phone = `${pick(PHONE_PREFIXES)}${String(randInt(0, 99999999)).padStart(8, "0")}`;
    if (phone.startsWith("19988")) continue;
    if (db.prepare("SELECT id FROM users WHERE phone=?").get(phone)) continue;
    if (db.prepare("SELECT id FROM enrollments WHERE traveler_phone=? OR emergency_phone=?").get(phone, phone)) continue;
    return phone;
  }
  fail(500, "无法生成不重复手机号");
}

function uniquePerson(db, gender) {
  for (let i = 0; i < 80; i += 1) {
    const region = pick(REGION_CODES);
    const birth = dayjs()
      .subtract(pickAge(), "year")
      .subtract(randInt(0, 280), "day")
      .format("YYYYMMDD");
    const seq = String(randInt(10, 99));
    const sexDigit = gender === "male" ? pick(["1", "3", "5", "7", "9"]) : pick(["0", "2", "4", "6", "8"]);
    const idCard = makeIdCard(region, birth, sexDigit, seq);
    if (db.prepare("SELECT id FROM users WHERE id_card=?").get(idCard)) continue;
    if (db.prepare("SELECT id FROM enrollments WHERE upper(id_card)=?").get(idCard.toUpperCase())) continue;
    const parsed = parseIdCard(idCard);
    if (!parsed.valid) continue;
    return parsed;
  }
  fail(500, "无法生成不重复身份证");
}

function pickInsurancePlan() {
  const r = randInt(1, 100);
  if (r <= 55) return config.insurance.plans.find((p) => p.code === "outdoor") || config.insurance.plans[0];
  if (r <= 68) return config.insurance.plans.find((p) => p.code === "plus") || config.insurance.plans[0];
  return config.insurance.plans[0];
}

function recentStamp() {
  return dayjs().subtract(randInt(3, 96), "hour").subtract(randInt(0, 50), "minute").format("YYYY-MM-DD HH:mm:ss");
}

function lockedCountOf(sch) {
  return parseLockedSeats(sch).length;
}

function maxVirtualFor(sch) {
  const real = realEnrolledCount(sch.id);
  return Math.max(0, Number(sch.max_seats) - real - lockedCountOf(sch));
}

function joinedVirtuals(scheduleId) {
  return getDb()
    .prepare(
      `SELECT e.id FROM enrollments e
       JOIN users u ON u.id=e.user_id
       WHERE e.schedule_id=? AND e.status='joined' AND IFNULL(u.is_virtual,0)=1
       ORDER BY e.id DESC`
    )
    .all(scheduleId);
}

function cancelledVirtuals(scheduleId) {
  return getDb()
    .prepare(
      `SELECT e.id FROM enrollments e
       JOIN users u ON u.id=e.user_id
       WHERE e.schedule_id=? AND e.status='cancelled' AND IFNULL(u.is_virtual,0)=1
       ORDER BY e.id ASC`
    )
    .all(scheduleId);
}

function payFields(sch) {
  const company = sch.organizer_type === "company";
  const quote = quoteForSchedule(sch, Math.max(enrolledCount(sch.id) + 1, 1), null);
  const insurance = pickInsurancePlan();
  const tripPay = company ? 0 : Number(quote.originPrice || quote.price || 0);
  const payAmount = company ? 0 : tripPay + Number(insurance.fee || 0);
  const payStatus = company ? "company_pending" : payAmount === 0 ? "paid" : "unpaid";
  return { insurance, payAmount, payStatus };
}

function kickVirtualSeat(scheduleId) {
  const row = getDb()
    .prepare(
      `SELECT e.id FROM enrollments e
       JOIN users u ON u.id=e.user_id
       WHERE e.schedule_id=? AND e.status='joined' AND IFNULL(u.is_virtual,0)=1
       ORDER BY e.id DESC LIMIT 1`
    )
    .get(scheduleId);
  if (!row) return false;
  getDb().prepare("UPDATE enrollments SET status='cancelled' WHERE id=?").run(row.id);
  return true;
}

function trimVirtuals() {
  return 0;
}

function restoreVirtual(sch, enrollmentId) {
  const db = getDb();
  const seat = firstFreeSeat(sch.id, sch.max_seats);
  if (!seat) return false;
  const pay = payFields(sch);
  db.prepare(
    "UPDATE enrollments SET status='joined', seat_no=?, pay_status=?, pay_amount=?, insurance_code=?, insurance_fee=? WHERE id=?"
  ).run(seat, pay.payStatus, pay.payAmount, pay.insurance.code, pay.insurance.fee, enrollmentId);
  return true;
}

function createVirtualEnrollment(sch) {
  const db = getDb();
  const seat = firstFreeSeat(sch.id, sch.max_seats);
  if (!seat) return false;
  const gender = randInt(1, 100) <= 58 ? "male" : "female";
  const parsed = uniquePerson(db, gender);
  const name = personName(parsed.gender);
  const nick = nicknameOf(name);
  const phone = uniquePhone(db);
  let emergencyName = personName(randInt(1, 100) <= 50 ? "male" : "female");
  if (emergencyName === name) emergencyName = personName(parsed.gender === "male" ? "female" : "male");
  const emergencyPhone = uniquePhone(db);
  const createdAt = recentStamp();
  const userInfo = db
    .prepare(
      `INSERT INTO users (phone,password_hash,nickname,gender,birthday,id_card,hometown,role,is_virtual,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    )
    .run(phone, SHARED_HASH, nick, parsed.gender, parsed.birthday, parsed.idCard, parsed.hometown, "user", 1, createdAt);
  const userId = Number(userInfo.lastInsertRowid);
  db.prepare("UPDATE users SET referral_code=? WHERE id=?").run(`BX${userId}`, userId);
  const pay = payFields(sch);
  const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
  db.prepare(
    `INSERT INTO enrollments (schedule_id,user_id,traveler_name,traveler_phone,id_card,gender,birthday,hometown,traveler_type,pay_status,pay_amount,points_used,pay_channel,join_mode,status,seat_no,insurance_code,insurance_fee,emergency_name,emergency_phone,waiver_accepted_at,health_declared_at,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    sch.id,
    userId,
    name,
    phone,
    parsed.idCard,
    parsed.gender,
    parsed.birthday,
    parsed.hometown,
    "adult",
    pay.payStatus,
    pay.payAmount,
    0,
    "",
    "virtual",
    "joined",
    seat,
    pay.insurance.code,
    pay.insurance.fee,
    emergencyName,
    emergencyPhone,
    now,
    now,
    createdAt
  );
  return true;
}

function setVirtualUsersForSchedule(scheduleId, count) {
  const db = getDb();
  const sch = db.prepare("SELECT * FROM schedules WHERE id=?").get(scheduleId);
  if (!sch) fail(404, "排期不存在");
  if (sch.status === "cancelled") fail(400, "该拼团已解散，无法设置虚拟报名");
  const requested = Number(count);
  if (!Number.isFinite(requested) || requested < 0) fail(400, "请填写虚拟报名人数");
  const want = Math.floor(requested);
  const cap = maxVirtualFor(sch);
  const target = Math.min(want, cap);
  let current = virtualEnrolledCount(sch.id);
  let created = 0;
  let joined = 0;
  let cancelled = 0;
  if (target < current) {
    const extras = joinedVirtuals(sch.id).slice(0, current - target);
    for (const row of extras) {
      db.prepare("UPDATE enrollments SET status='cancelled' WHERE id=?").run(row.id);
      cancelled += 1;
    }
  } else if (target > current) {
    const reusable = cancelledVirtuals(sch.id);
    for (const row of reusable) {
      if (virtualEnrolledCount(sch.id) >= target) break;
      if (restoreVirtual(sch, row.id)) joined += 1;
    }
    while (virtualEnrolledCount(sch.id) < target) {
      if (!createVirtualEnrollment(sch)) break;
      created += 1;
      joined += 1;
    }
  }
  current = virtualEnrolledCount(sch.id);
  return {
    scheduleId: Number(sch.id),
    requested: want,
    count: current,
    created,
    joined,
    cancelled,
    capped: want > cap,
    maxVirtual: cap,
  };
}

function generateVirtualUsers(opts = {}) {
  const scheduleId = opts.scheduleId || opts.schedule_id;
  if (!scheduleId) fail(400, "请指定行程 scheduleId，在该团设置虚拟报名人数");
  return setVirtualUsersForSchedule(scheduleId, opts.count);
}

module.exports = {
  kickVirtualSeat,
  trimVirtuals,
  generateVirtualUsers,
  setVirtualUsersForSchedule,
};
