const dayjs = require("dayjs");
const { customAlphabet } = require("nanoid");
const QRCode = require("qrcode");
const { getDb } = require("../db");
const { quoteForSchedule, enrolledCount, attachAssetHost, isMember } = require("./helpers");
const { sendSms } = require("./sms");
const config = require("../config");

const campaignNano = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 6);
const instanceNano = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 8);

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

function parseBound(value, endOfDay) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return endOfDay ? dayjs(raw).endOf("day") : dayjs(raw).startOf("day");
  }
  const d = dayjs(raw);
  return d.isValid() ? d : null;
}

function inWindow(start, end) {
  const now = dayjs();
  const from = parseBound(start, false);
  const to = parseBound(end, true);
  if (from && now.isBefore(from)) return false;
  if (to && now.isAfter(to)) return false;
  return true;
}

function parseValidHours(body, fallback = 0) {
  const raw = body.validHours != null ? body.validHours : body.valid_hours;
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 24 * 365) fail(400, "领取后有效时长不正确");
  return Math.round(n);
}

function parseNonNegInt(raw, fallback, max, message) {
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > max) fail(400, message);
  return Math.round(n);
}

function parseFlag(raw, fallback = 0) {
  if (raw === true || raw === 1 || raw === "1" || raw === "on") return 1;
  if (raw === false || raw === 0 || raw === "0" || raw === "off" || raw === "") return 0;
  if (raw == null) return fallback;
  return fallback;
}

function isUniversalCampaign(row) {
  return Number(row?.schedule_id || 0) === 0;
}

function parseIdleMonths(body, fallback = 0) {
  return parseNonNegInt(body.idleMonths != null ? body.idleMonths : body.idle_months, fallback, 120, "未参加月数不正确");
}

function parseMinTrips(body, fallback = 0) {
  return parseNonNegInt(body.minTrips != null ? body.minTrips : body.min_trips, fallback, 999, "出行次数不正确");
}

function ruleCutoff(idleMonths) {
  const n = Number(idleMonths || 0);
  if (!n) return "";
  return dayjs().subtract(n, "month").format("YYYY-MM-DD");
}

function tripStats(userId) {
  const rows = getDb()
    .prepare(
      `SELECT s.start_date, e.created_at
       FROM enrollments e
       LEFT JOIN schedules s ON s.id=e.schedule_id
       WHERE e.user_id=? AND e.status='joined'`
    )
    .all(userId);
  let lastDate = "";
  for (const row of rows) {
    const day = String(row.start_date || "").trim() || String(row.created_at || "").slice(0, 10);
    if (day && day > lastDate) lastDate = day;
  }
  return { trips: rows.length, lastDate };
}

function userMatchesRule(userId, campaign = {}) {
  const idle = Number(campaign.idle_months || campaign.idleMonths || 0);
  const min = Number(campaign.min_trips || campaign.minTrips || 0);
  if (!idle && !min) return true;
  const stats = tripStats(userId);
  if (min && stats.trips < min) return false;
  if (idle) {
    const cutoff = ruleCutoff(idle);
    if (stats.lastDate && stats.lastDate >= cutoff) return false;
  }
  return true;
}

function ruleHint(campaign) {
  const bits = [];
  const idle = Number(campaign?.idle_months || campaign?.idleMonths || 0);
  const min = Number(campaign?.min_trips || campaign?.minTrips || 0);
  if (idle) bits.push(`${idle}个月内未参加过活动`);
  if (min) bits.push(`至少参加过${min}次`);
  return bits.join("且");
}

function assertClaimRules(userId, campaign) {
  if (!userMatchesRule(userId, campaign)) {
    const hint = ruleHint(campaign);
    fail(400, hint ? `仅限${hint}的用户` : "不符合领取条件");
  }
}

function findRuleUsers({ idleMonths = 0, minTrips = 0, campaignId = 0 } = {}) {
  const db = getDb();
  const users = db.prepare("SELECT * FROM users WHERE deleted_at IS NULL AND IFNULL(is_virtual,0)=0").all();
  return users.filter((u) => {
    if (campaignId) {
      const hold = db.prepare("SELECT id FROM user_coupons WHERE campaign_id=? AND user_id=?").get(campaignId, u.id);
      if (hold) return false;
    }
    return userMatchesRule(u.id, { idle_months: idleMonths, min_trips: minTrips });
  });
}

function shufflePick(list, n) {
  const copy = [...(Array.isArray(list) ? list : [])];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.max(0, n));
}

function previewRuleTargets(query = {}) {
  const idleMonths = parseIdleMonths(query, 0);
  const minTrips = parseMinTrips(query, 0);
  const campaignId = Number(query.campaignId || query.campaign_id || 0);
  if (!idleMonths && !minTrips) {
    return { count: 0, idleMonths, minTrips, needRule: true };
  }
  const users = findRuleUsers({ idleMonths, minTrips, campaignId });
  return { count: users.length, idleMonths, minTrips, needRule: false };
}

function couponExpiresAt(campaign, from = dayjs()) {
  const hours = Number(campaign?.valid_hours || 0);
  if (!hours) return null;
  return from.add(hours, "hour").format("YYYY-MM-DD HH:mm:ss");
}

function effectiveUseEnd(coupon, campaign) {
  const ends = [];
  const inst = parseBound(coupon?.expires_at, false);
  if (inst) ends.push(inst);
  const camp = parseBound(campaign?.use_end, true);
  if (camp) ends.push(camp);
  if (!ends.length) return null;
  return ends.reduce((a, b) => (a.isBefore(b) ? a : b));
}

function instanceDTO(coupon) {
  if (!coupon) return null;
  return {
    code: coupon.code,
    status: coupon.status,
    usedEnrollmentId: coupon.used_enrollment_id || null,
    claimedAt: coupon.created_at || "",
    expiresAt: coupon.expires_at || "",
  };
}

function campaignLabel(row) {
  if (!row) return "";
  if (row.kind === "percent") {
    const fold = Number(row.value) / 10;
    const text = Number.isInteger(fold) ? String(fold) : String(fold);
    return `${text}折`;
  }
  return `减¥${Number(row.value)}`;
}

function remainOf(row) {
  return Math.max(0, Number(row.total || 0) - Number(row.claimed || 0));
}

function couponedTripPay(tripPrice, campaign) {
  const trip = Math.max(0, Math.round(Number(tripPrice || 0)));
  if (!campaign || trip <= 0) return trip;
  let next = trip;
  if (campaign.kind === "percent") {
    const rate = Number(campaign.value || 0) / 100;
    next = Math.round(trip * rate);
    const cap = Number(campaign.cap_amount || 0);
    const discount = trip - next;
    if (cap > 0 && discount > cap) next = trip - cap;
  } else {
    next = Math.max(0, trip - Number(campaign.value || 0));
  }
  const floor = Number(campaign.floor_price || 0);
  if (floor > 0) next = Math.max(next, floor);
  if (next > trip) next = trip;
  return next;
}

function loadCampaignByCode(code) {
  const c = String(code || "")
    .trim()
    .toUpperCase();
  if (!c) return null;
  return getDb().prepare("SELECT * FROM coupon_campaigns WHERE upper(code)=?").get(c);
}

function loadCampaign(id) {
  return getDb().prepare("SELECT * FROM coupon_campaigns WHERE id=?").get(id);
}

function newCampaignCode() {
  const db = getDb();
  for (let i = 0; i < 12; i++) {
    const code = campaignNano();
    const hit = db.prepare("SELECT id FROM coupon_campaigns WHERE code=?").get(code);
    if (!hit) return code;
  }
  fail(500, "优惠券码生成失败");
}

function parsePercentValue(body) {
  if (body.fold != null && body.fold !== "") {
    const fold = Number(body.fold);
    if (!Number.isFinite(fold) || fold < 1 || fold >= 10) fail(400, "折扣请填写 1–9.9 折");
    return Math.round(fold * 10);
  }
  const v = Number(body.value);
  if (!Number.isFinite(v) || v < 10 || v > 99) fail(400, "折扣请填写 1–9.9 折");
  return Math.round(v);
}

function createCampaign(body = {}) {
  const db = getDb();
  const rawSid = body.scheduleId != null ? body.scheduleId : body.schedule_id;
  const universal =
    body.universal === true ||
    body.universal === 1 ||
    body.universal === "1" ||
    rawSid === 0 ||
    rawSid === "0";
  let scheduleId = 0;
  if (!universal) {
    scheduleId = Number(rawSid);
    const sch = db.prepare("SELECT * FROM schedules WHERE id=?").get(scheduleId);
    if (!sch) fail(400, "排期不存在");
    if (sch.status === "cancelled") fail(400, "已解散的团不能发行优惠券");
    if (sch.organizer_type === "company") fail(400, "公司团不可发行优惠券");
    scheduleId = sch.id;
  }
  const kind = body.kind === "percent" ? "percent" : body.kind === "amount" ? "amount" : "";
  if (!kind) fail(400, "请选择折扣或满减");
  let value;
  let capAmount = Number(body.capAmount || body.cap_amount || 0);
  if (kind === "percent") {
    value = parsePercentValue(body);
    if (!Number.isFinite(capAmount) || capAmount < 1) fail(400, "折扣券请填写最高减免金额");
  } else {
    value = Number(body.value);
    if (!Number.isFinite(value) || value < 1) fail(400, "请填写减免金额");
    capAmount = capAmount > 0 ? capAmount : 0;
  }
  const total = Number(body.total);
  if (!Number.isFinite(total) || total < 1) fail(400, "请填写发行数量");
  const floorPrice = Math.max(0, Number(body.floorPrice || body.floor_price || 0) || 0);
  const name = String(body.name || "").trim() || `${campaignLabel({ kind, value })}券`;
  const audience =
    body.audience === "member" || body.audience === "directed" ? body.audience : "public";
  const code = newCampaignCode();
  const validHours = parseValidHours(body, 0);
  const idleMonths = parseIdleMonths(body, 0);
  const minTrips = parseMinTrips(body, 0);
  const stackMember = parseFlag(body.stackMember != null ? body.stackMember : body.stack_member, 0);
  const stackStudent = parseFlag(body.stackStudent != null ? body.stackStudent : body.stack_student, 0);
  const info = db
    .prepare(
      `INSERT INTO coupon_campaigns
        (code,schedule_id,name,kind,value,cap_amount,floor_price,total,claimed,per_user_limit,claim_start,claim_end,use_start,use_end,valid_hours,idle_months,min_trips,stack_member,stack_student,audience,status)
       VALUES (?,?,?,?,?,?,?,?,0,1,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      code,
      scheduleId,
      name,
      kind,
      value,
      capAmount,
      floorPrice,
      Math.round(total),
      body.claimStart || body.claim_start || null,
      body.claimEnd || body.claim_end || null,
      body.useStart || body.use_start || null,
      body.useEnd || body.use_end || null,
      validHours,
      idleMonths,
      minTrips,
      stackMember,
      stackStudent,
      audience,
      "on"
    );
  return publicAdminCampaign(loadCampaign(Number(info.lastInsertRowid)));
}

function updateCampaign(id, body = {}) {
  const db = getDb();
  const row = loadCampaign(id);
  if (!row) fail(404, "优惠券不存在");
  const status = body.status;
  if (status && !["on", "paused", "off"].includes(status)) fail(400, "状态不正确");
  let total = row.total;
  if (body.total != null && body.total !== "") {
    total = Number(body.total);
    if (!Number.isFinite(total) || total < Number(row.claimed || 0)) {
      fail(400, "发行数量不能小于已领取数量");
    }
  }
  const name = body.name != null ? String(body.name).trim() || row.name : row.name;
  const validHours =
    body.validHours !== undefined || body.valid_hours !== undefined
      ? parseValidHours(body, Number(row.valid_hours || 0))
      : Number(row.valid_hours || 0);
  const idleMonths =
    body.idleMonths !== undefined || body.idle_months !== undefined
      ? parseIdleMonths(body, Number(row.idle_months || 0))
      : Number(row.idle_months || 0);
  const minTrips =
    body.minTrips !== undefined || body.min_trips !== undefined
      ? parseMinTrips(body, Number(row.min_trips || 0))
      : Number(row.min_trips || 0);
  const stackMember =
    body.stackMember !== undefined || body.stack_member !== undefined
      ? parseFlag(body.stackMember != null ? body.stackMember : body.stack_member, Number(row.stack_member || 0))
      : Number(row.stack_member || 0);
  const stackStudent =
    body.stackStudent !== undefined || body.stack_student !== undefined
      ? parseFlag(body.stackStudent != null ? body.stackStudent : body.stack_student, Number(row.stack_student || 0))
      : Number(row.stack_student || 0);
  db.prepare(
    `UPDATE coupon_campaigns SET name=?, total=?, status=?, claim_start=?, claim_end=?, use_start=?, use_end=?, valid_hours=?, idle_months=?, min_trips=?, stack_member=?, stack_student=? WHERE id=?`
  ).run(
    name,
    Math.round(total),
    status || row.status,
    body.claimStart !== undefined ? body.claimStart || null : row.claim_start,
    body.claimEnd !== undefined ? body.claimEnd || null : row.claim_end,
    body.useStart !== undefined ? body.useStart || null : row.use_start,
    body.useEnd !== undefined ? body.useEnd || null : row.use_end,
    validHours,
    idleMonths,
    minTrips,
    stackMember,
    stackStudent,
    row.id
  );
  return publicAdminCampaign(loadCampaign(row.id));
}

function expireIfNeeded(coupon, campaign) {
  if (!coupon || coupon.status !== "unused") return coupon;
  const to = effectiveUseEnd(coupon, campaign);
  if (to && dayjs().isAfter(to)) {
    getDb().prepare("UPDATE user_coupons SET status='expired' WHERE id=?").run(coupon.id);
    return { ...coupon, status: "expired" };
  }
  return coupon;
}

function loadUserCouponByCode(code) {
  const c = String(code || "")
    .trim()
    .toUpperCase();
  if (!c) return null;
  return getDb().prepare("SELECT * FROM user_coupons WHERE upper(code)=?").get(c);
}

function couponOrigin(req) {
  if (!req) return "";
  return `${req.protocol}://${req.get("host")}`;
}

function couponSmsCountToday(phone) {
  const day = dayjs().format("YYYY-MM-DD");
  return getDb()
    .prepare("SELECT COUNT(*) AS c FROM sms_logs WHERE phone=? AND scene='coupon' AND created_at LIKE ?")
    .get(phone, `${day}%`).c;
}

function resolveGrantTargets(body = {}, campaign = null) {
  if (body.byRule || body.by_rule) {
    if (!campaign) fail(400, "优惠券不存在");
    const idleMonths = Number(campaign.idle_months || 0);
    const minTrips = Number(campaign.min_trips || 0);
    if (!idleMonths && !minTrips) fail(400, "请先设置参与时间或出行次数条件");
    const matched = findRuleUsers({ idleMonths, minTrips, campaignId: campaign.id });
    if (!matched.length) fail(400, "没有符合条件的用户");
    const remain = remainOf(campaign);
    const randomized = matched.length > remain;
    const picked = randomized ? shufflePick(matched, remain) : matched;
    return { targets: picked, matched: matched.length, randomized };
  }
  const db = getDb();
  const map = new Map();
  function add(user) {
    if (!user || user.deleted_at) return;
    if (Number(user.is_virtual || 0) === 1) return;
    map.set(Number(user.id), user);
  }
  for (const id of body.userIds || body.user_ids || []) {
    const user = db.prepare("SELECT * FROM users WHERE id=?").get(Number(id));
    if (!user || user.deleted_at) fail(400, `用户 ${id} 不存在`);
    add(user);
  }
  const phones = [];
  if (Array.isArray(body.phones)) phones.push(...body.phones);
  if (body.phonesText || body.phones_text) {
    String(body.phonesText || body.phones_text)
      .split(/[\s,，;；]+/)
      .forEach((p) => phones.push(p));
  }
  for (const raw of phones) {
    const phone = String(raw || "").trim();
    if (!phone) continue;
    if (!/^1\d{10}$/.test(phone)) fail(400, `手机号 ${phone} 不正确`);
    const user = db.prepare("SELECT * FROM users WHERE phone=? AND deleted_at IS NULL").get(phone);
    if (!user) fail(400, `手机号 ${phone} 未注册`);
    add(user);
  }
  if (body.allMembers || body.all_members) {
    const rows = db
      .prepare("SELECT * FROM users WHERE deleted_at IS NULL AND IFNULL(is_virtual,0)=0 AND is_member=1")
      .all();
    rows.filter((u) => isMember(u)).forEach(add);
  }
  return { targets: [...map.values()], matched: map.size, randomized: false };
}

function insertUserCoupon(campaignId, userId) {
  const db = getDb();
  const campaign = loadCampaign(campaignId);
  const instance = "U" + instanceNano();
  const info = db
    .prepare("INSERT INTO user_coupons (campaign_id,user_id,code,status,expires_at) VALUES (?,?,?,?,?)")
    .run(campaignId, userId, instance, "unused", couponExpiresAt(campaign));
  db.prepare("UPDATE coupon_campaigns SET claimed=claimed+1 WHERE id=?").run(campaignId);
  return db.prepare("SELECT * FROM user_coupons WHERE id=?").get(Number(info.lastInsertRowid));
}

function claimCampaign(userId, code) {
  const db = getDb();
  const run = db.transaction(() => {
    let campaign = loadCampaignByCode(code);
    let instance = null;
    if (!campaign) {
      instance = loadUserCouponByCode(code);
      if (!instance) fail(404, "优惠券不存在");
      if (Number(instance.user_id) !== Number(userId)) fail(403, "这不是你的优惠券");
      campaign = loadCampaign(instance.campaign_id);
    }
    if (!campaign) fail(404, "优惠券不存在");
    const exist =
      instance ||
      db.prepare("SELECT * FROM user_coupons WHERE campaign_id=? AND user_id=?").get(campaign.id, userId);
    if (exist) {
      return { campaign, coupon: expireIfNeeded(exist, campaign), already: true };
    }
    const audience = campaign.audience || "public";
    if (audience === "directed") fail(400, "该券需由后台发放");
    if (audience === "member") {
      const user = db.prepare("SELECT * FROM users WHERE id=?").get(userId);
      if (!isMember(user)) fail(400, "仅会员可领取");
    }
    if (campaign.status !== "on") fail(400, campaign.status === "paused" ? "该券已暂停领取" : "该券已停用");
    if (!inWindow(campaign.claim_start, campaign.claim_end)) fail(400, "不在领取时间内");
    if (Number(campaign.claimed) >= Number(campaign.total)) fail(400, "该券已领完");
    assertClaimRules(userId, campaign);
    const coupon = insertUserCoupon(campaign.id, userId);
    return { campaign: loadCampaign(campaign.id), coupon, already: false };
  });
  try {
    return run();
  } catch (e) {
    if (String(e.message || "").includes("UNIQUE")) {
      const campaign = loadCampaignByCode(code);
      const exist = campaign
        ? db.prepare("SELECT * FROM user_coupons WHERE campaign_id=? AND user_id=?").get(campaign.id, userId)
        : null;
      if (exist) return { campaign, coupon: exist, already: true };
    }
    throw e;
  }
}

function grantCoupons(campaignId, body = {}, req) {
  const db = getDb();
  const campaign = loadCampaign(campaignId);
  if (!campaign) fail(404, "优惠券不存在");
  if (campaign.status === "off") fail(400, "该券已停用");
  const picked = resolveGrantTargets(body, campaign);
  const targets = picked.targets || [];
  if (!targets.length) fail(400, "请选择用户、填写已注册手机号，按条件发放，或发给全部会员");
  const granted = [];
  let skipped = 0;
  const run = db.transaction(() => {
    for (const user of targets) {
      const exist = db.prepare("SELECT * FROM user_coupons WHERE campaign_id=? AND user_id=?").get(campaign.id, user.id);
      if (exist) {
        skipped += 1;
        continue;
      }
      const fresh = loadCampaign(campaign.id);
      if (Number(fresh.claimed) >= Number(fresh.total)) fail(400, "发放数量超过剩余张数");
      const coupon = insertUserCoupon(campaign.id, user.id);
      granted.push({
        userId: user.id,
        nickname: user.nickname,
        phone: user.phone,
        code: coupon.code,
      });
    }
  });
  run();
  const send = body.sms !== false && body.sms !== 0 && body.sms !== "0";
  let sms = 0;
  let skippedSms = 0;
  if (send && granted.length) {
    const sch = db.prepare("SELECT * FROM schedules WHERE id=?").get(campaign.schedule_id);
    const route = sch ? db.prepare("SELECT title FROM routes WHERE id=?").get(sch.route_id) : null;
    const origin = couponOrigin(req);
    const label = campaignLabel(campaign);
    const title = isUniversalCampaign(campaign) ? "全部个人拼团" : route?.title || "活动";
    const when = sch?.start_date ? `${sch.start_date}出发` : "";
    for (const row of granted) {
      if (!/^1\d{10}$/.test(row.phone || "")) {
        skippedSms += 1;
        continue;
      }
      if (couponSmsCountToday(row.phone) >= 1) {
        skippedSms += 1;
        continue;
      }
      const shortUrl = origin ? `${origin}/c/${row.code}` : `/c/${row.code}`;
      sendSms({
        phone: row.phone,
        scene: "coupon",
        content: `【同行者众】您的${label}已到账，用于「${title}」${when}：${shortUrl}`,
        refType: "coupon",
        refId: campaign.id,
      });
      sms += 1;
    }
  }
  return {
    campaign: publicAdminCampaign(loadCampaign(campaign.id)),
    granted: granted.length,
    skipped,
    sms,
    skippedSms,
    matched: picked.matched || targets.length,
    randomized: !!picked.randomized,
  };
}

function resolveCouponForEnroll({ userId, couponCode, scheduleId, company }) {
  if (!couponCode) return null;
  if (company) fail(400, "公司团不可使用优惠券");
  const db = getDb();
  let campaign = loadCampaignByCode(couponCode);
  let coupon = null;
  if (!campaign) {
    coupon = db
      .prepare("SELECT * FROM user_coupons WHERE upper(code)=?")
      .get(String(couponCode).trim().toUpperCase());
    if (!coupon) fail(400, "优惠券不存在");
    if (Number(coupon.user_id) !== Number(userId)) fail(403, "这不是你的优惠券");
    campaign = loadCampaign(coupon.campaign_id);
  }
  if (!campaign) fail(400, "优惠券不存在");
  if (!isUniversalCampaign(campaign) && Number(campaign.schedule_id) !== Number(scheduleId)) {
    fail(400, "该券不适用于本团");
  }
  if (campaign.status === "off") fail(400, "该券已停用");
  if (!coupon) {
    const claimed = claimCampaign(userId, campaign.code);
    coupon = claimed.coupon;
    campaign = claimed.campaign || campaign;
  }
  coupon = expireIfNeeded(coupon, campaign);
  if (coupon.status === "expired") fail(400, "优惠券已过期");
  if (coupon.status === "void") fail(400, "优惠券已作废");
  if (coupon.status === "used" || coupon.status === "held") fail(400, "该优惠券已占用");
  if (coupon.status !== "unused") fail(400, "优惠券不可用");
  if (!inWindow(campaign.use_start, campaign.use_end)) fail(400, "不在可用时间内");
  return { campaign, coupon };
}

function couponBasePrice(quote, campaign) {
  const trip = Number(quote.tripPrice != null ? quote.tripPrice : quote.price || 0);
  const stackMember = Number(campaign?.stack_member || campaign?.stackMember || 0) === 1;
  const stackStudent = Number(campaign?.stack_student || campaign?.stackStudent || 0) === 1;
  let base = trip;
  if (quote.isMember && stackMember) {
    base = Math.min(base, Number(quote.memberPrice != null ? quote.memberPrice : quote.price || trip));
  }
  if (quote.isStudent && stackStudent) {
    base = Math.min(base, Number(quote.studentPrice != null ? quote.studentPrice : quote.price || trip));
  }
  return base;
}

function decideCouponPrice({ quote, user, campaign, waitlisted }) {
  const tripPrice = Number(quote.tripPrice != null ? quote.tripPrice : quote.price || 0);
  const memberPay = Number(quote.price || 0);
  const couponPay = campaign ? couponedTripPay(couponBasePrice(quote, campaign), campaign) : memberPay;
  const giftMax = Number(config.member.giftMaxPrice || 100);
  const giftWouldApply =
    !waitlisted &&
    quote.isMember &&
    user &&
    Number(user.member_gift_left || 0) > 0 &&
    memberPay > 0 &&
    memberPay <= giftMax;
  if (giftWouldApply) {
    return {
      tripPrice,
      memberPay,
      couponPay,
      applyCoupon: false,
      giftWouldApply: true,
      reason: "将使用会员赠送名额，不核销优惠券",
    };
  }
  const applyCoupon = !!(campaign && couponPay < memberPay);
  let reason = "";
  if (!applyCoupon) {
    if (quote.isMember) reason = "会员价更优惠或相同，将不核销此券";
    else if (quote.isStudent) reason = "学生价更优惠或相同，将不核销此券";
    else reason = "券后价未低于团价";
  }
  return {
    tripPrice,
    memberPay,
    couponPay,
    applyCoupon,
    giftWouldApply: false,
    reason,
  };
}

function attachCouponToEnrollment(couponId, enrollmentId, waitlisted) {
  const db = getDb();
  db.prepare("UPDATE enrollments SET coupon_id=? WHERE id=?").run(couponId, enrollmentId);
  if (waitlisted) {
    db.prepare("UPDATE user_coupons SET status='held', used_enrollment_id=?, used_at=NULL WHERE id=?").run(
      enrollmentId,
      couponId
    );
  } else {
    db.prepare(
      "UPDATE user_coupons SET status='used', used_enrollment_id=?, used_at=datetime('now','localtime') WHERE id=?"
    ).run(enrollmentId, couponId);
  }
}

function redeemHeldForEnrollment(enrollmentId) {
  getDb()
    .prepare(
      "UPDATE user_coupons SET status='used', used_at=datetime('now','localtime') WHERE used_enrollment_id=? AND status='held'"
    )
    .run(enrollmentId);
}

function releaseCouponByEnrollment(enrollmentId) {
  getDb()
    .prepare(
      "UPDATE user_coupons SET status='unused', used_enrollment_id=NULL, used_at=NULL WHERE used_enrollment_id=? AND status IN ('used','held')"
    )
    .run(enrollmentId);
}

function scheduleCover(sch, req) {
  const route = getDb().prepare("SELECT cover, title FROM routes WHERE id=?").get(sch.route_id);
  return {
    id: sch.id,
    title: route?.title || "",
    startDate: sch.start_date,
    cover: req ? attachAssetHost(req, route?.cover || "") : route?.cover || "",
    organizerType: sch.organizer_type,
    status: sch.status,
  };
}

function publicCampaignDTO(row, req, extras = {}) {
  if (!row) return null;
  const sch = getDb().prepare("SELECT * FROM schedules WHERE id=?").get(row.schedule_id);
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    kind: row.kind,
    label: campaignLabel(row),
    capAmount: Number(row.cap_amount || 0),
    floorPrice: Number(row.floor_price || 0),
    total: Number(row.total || 0),
    claimed: Number(row.claimed || 0),
    remain: remainOf(row),
    status: row.status,
    claimStart: row.claim_start || "",
    claimEnd: row.claim_end || "",
    useStart: row.use_start || "",
    useEnd: row.use_end || "",
    validHours: Number(row.valid_hours || 0),
    idleMonths: Number(row.idle_months || 0),
    minTrips: Number(row.min_trips || 0),
    stackMember: Number(row.stack_member || 0) === 1,
    stackStudent: Number(row.stack_student || 0) === 1,
    universal: isUniversalCampaign(row),
    scheduleId: Number(row.schedule_id || 0),
    audience: row.audience || "public",
    schedule: sch ? scheduleCover(sch, req) : null,
    ...extras,
  };
}

function publicAdminCampaign(row) {
  if (!row) return null;
  return {
    ...publicCampaignDTO(row, null),
    value: Number(row.value),
    fold: row.kind === "percent" ? Number(row.value) / 10 : null,
  };
}

function quotePreview(campaign, user) {
  if (isUniversalCampaign(campaign)) return null;
  const sch = getDb().prepare("SELECT * FROM schedules WHERE id=?").get(campaign.schedule_id);
  if (!sch) return null;
  const occupied = enrolledCount(sch.id);
  const quote = quoteForSchedule(sch, Math.max(occupied + 1, 1), user);
  if (sch.organizer_type === "company") {
    return {
      tripPrice: Number(quote.tripPrice || 0),
      memberPay: Number(quote.price || 0),
      couponPay: Number(quote.price || 0),
      pay: Number(quote.price || 0),
      applyCoupon: false,
      giftWouldApply: false,
      originPrice: quote.originPrice,
      isMember: quote.isMember,
      reason: "公司团不可使用优惠券",
    };
  }
  const decided = decideCouponPrice({ quote, user, campaign, waitlisted: false });
  return {
    ...decided,
    pay: decided.giftWouldApply ? 0 : decided.applyCoupon ? decided.couponPay : decided.memberPay,
    originPrice: quote.originPrice,
    isMember: quote.isMember,
  };
}

function publicGet(code, user, req) {
  const raw = String(code || "")
    .trim()
    .toUpperCase();
  let campaign = loadCampaignByCode(raw);
  let instance = null;
  if (!campaign) {
    instance = loadUserCouponByCode(raw);
    if (!instance) fail(404, "优惠券不存在");
    if (!user) fail(401, "请先登录查看该券");
    if (Number(instance.user_id) !== Number(user.id)) fail(403, "这不是你的优惠券");
    campaign = loadCampaign(instance.campaign_id);
  }
  if (!campaign) fail(404, "优惠券不存在");
  let myCoupon = instance || null;
  if (user && !myCoupon) {
    const row = getDb()
      .prepare("SELECT * FROM user_coupons WHERE campaign_id=? AND user_id=?")
      .get(campaign.id, user.id);
    if (row) myCoupon = expireIfNeeded(row, campaign);
  } else if (myCoupon) {
    myCoupon = expireIfNeeded(myCoupon, campaign);
  }
  const quote = user ? quotePreview(campaign, user) : quotePreview(campaign, null);
  const audience = campaign.audience || "public";
  const already = !!(myCoupon && myCoupon.status !== "expired" && myCoupon.status !== "void");
  const memberOk = audience !== "member" || isMember(user);
  const ruleOk = !user || userMatchesRule(user.id, campaign);
  return publicCampaignDTO(campaign, req, {
    claimedByMe: already,
    myCoupon: instanceDTO(myCoupon),
    quote,
    claimable:
      audience !== "directed" &&
      memberOk &&
      ruleOk &&
      campaign.status === "on" &&
      remainOf(campaign) > 0 &&
      inWindow(campaign.claim_start, campaign.claim_end) &&
      !already,
  });
}

function publicSummaryForSchedule(scheduleId, req) {
  const pick = (row) => {
    if (!row || remainOf(row) <= 0) return null;
    if (!inWindow(row.claim_start, row.claim_end)) return null;
    return {
      code: row.code,
      name: row.name,
      label: campaignLabel(row),
      remain: remainOf(row),
      total: Number(row.total || 0),
      universal: isUniversalCampaign(row),
      url: req ? `${req.protocol}://${req.get("host")}/m/coupon/${row.code}` : `/m/coupon/${row.code}`,
    };
  };
  const trip = getDb()
    .prepare(
      `SELECT * FROM coupon_campaigns
       WHERE schedule_id=? AND status='on' AND audience='public'
       ORDER BY id DESC LIMIT 1`
    )
    .get(scheduleId);
  const hit = pick(trip);
  if (hit) return hit;
  const uni = getDb()
    .prepare(
      `SELECT * FROM coupon_campaigns
       WHERE IFNULL(schedule_id,0)=0 AND status='on' AND audience='public'
       ORDER BY id DESC LIMIT 1`
    )
    .get();
  return pick(uni);
}

function listMine(userId) {
  const rows = getDb()
    .prepare(
      `SELECT uc.*, c.name AS campaign_name, c.kind, c.value, c.schedule_id, c.status AS campaign_status,
              c.use_start, c.use_end, c.valid_hours, c.code AS campaign_code, r.title AS route_title, s.start_date
       FROM user_coupons uc
       JOIN coupon_campaigns c ON c.id=uc.campaign_id
       LEFT JOIN schedules s ON s.id=c.schedule_id
       LEFT JOIN routes r ON r.id=s.route_id
       WHERE uc.user_id=?
       ORDER BY uc.id DESC`
    )
    .all(userId);
  return rows.map((row) => {
    const live = expireIfNeeded(row, {
      use_end: row.use_end,
      use_start: row.use_start,
      valid_hours: row.valid_hours,
    });
    return {
      id: row.id,
      code: row.code,
      status: live.status,
      label: campaignLabel(row),
      name: row.campaign_name,
      scheduleId: Number(row.schedule_id || 0),
      routeTitle: Number(row.schedule_id || 0) === 0 ? "全部团" : row.route_title,
      startDate: row.start_date || "",
      campaignCode: row.campaign_code || "",
      claimedAt: row.created_at || "",
      expiresAt: row.expires_at || "",
      validHours: Number(row.valid_hours || 0),
      useEnd: row.use_end || "",
      universal: Number(row.schedule_id || 0) === 0,
    };
  });
}

function listAdmin(scheduleId) {
  const db = getDb();
  const sql = scheduleId
    ? `SELECT c.*, r.title AS route_title, s.start_date FROM coupon_campaigns c
       LEFT JOIN schedules s ON s.id=c.schedule_id LEFT JOIN routes r ON r.id=s.route_id
       WHERE c.schedule_id=? OR IFNULL(c.schedule_id,0)=0 ORDER BY c.id DESC`
    : `SELECT c.*, r.title AS route_title, s.start_date FROM coupon_campaigns c
       LEFT JOIN schedules s ON s.id=c.schedule_id LEFT JOIN routes r ON r.id=s.route_id
       ORDER BY c.id DESC`;
  const rows = scheduleId ? db.prepare(sql).all(scheduleId) : db.prepare(sql).all();
  return rows.map((row) => ({
    ...publicAdminCampaign(row),
    routeTitle: isUniversalCampaign(row) ? "全部团" : row.route_title,
    startDate: row.start_date || "",
  }));
}

function maskPhone(phone) {
  const s = String(phone || "");
  return s.replace(/^(\d{3})\d{4}(\d{4})$/, "$1****$2");
}

function adminDetail(id, req) {
  const row = loadCampaign(id);
  if (!row) fail(404, "优惠券不存在");
  const holders = getDb()
    .prepare(
      `SELECT uc.*, u.nickname, u.phone FROM user_coupons uc
       JOIN users u ON u.id=uc.user_id WHERE uc.campaign_id=? ORDER BY uc.id`
    )
    .all(row.id)
    .map((h) => ({
      id: h.id,
      code: h.code,
      status: h.status,
      nickname: h.nickname,
      phone: maskPhone(h.phone),
      usedEnrollmentId: h.used_enrollment_id || null,
      usedAt: h.used_at || "",
      createdAt: h.created_at,
      expiresAt: h.expires_at || "",
    }));
  return {
    campaign: publicAdminCampaign(row),
    holders,
  };
}

async function sharePayload(campaign, req) {
  const host = `${req.protocol}://${req.get("host")}`;
  const landingUrl = `${host}/m/coupon/${campaign.code}`;
  const shortUrl = `${host}/c/${campaign.code}`;
  const qr = await QRCode.toDataURL(shortUrl);
  return {
    landingUrl,
    shortUrl,
    qr,
    miniPath: `/pages/coupon/coupon?code=${campaign.code}`,
  };
}

module.exports = {
  campaignLabel,
  couponedTripPay,
  createCampaign,
  updateCampaign,
  claimCampaign,
  grantCoupons,
  resolveCouponForEnroll,
  decideCouponPrice,
  attachCouponToEnrollment,
  redeemHeldForEnrollment,
  releaseCouponByEnrollment,
  publicGet,
  publicSummaryForSchedule,
  listMine,
  listAdmin,
  adminDetail,
  sharePayload,
  loadCampaign,
  loadCampaignByCode,
  parseValidHours,
  couponExpiresAt,
  expireIfNeeded,
  effectiveUseEnd,
  previewRuleTargets,
  userMatchesRule,
  couponBasePrice,
};
