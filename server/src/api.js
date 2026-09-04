const fs = require("fs");
const path = require("path");
const express = require("express");
const bcrypt = require("bcryptjs");
const { nanoid } = require("nanoid");
const dayjs = require("dayjs");
const QRCode = require("qrcode");
const multer = require("multer");
const { getDb, toRoute } = require("./db");
const config = require("./config");
const { signUser, signAdmin, signGuide, authUser, optionalUser, authAdmin, authGuide } = require("./middleware/auth");
const { parseIdCard, maskIdCard, lifeStageFromPerson } = require("./services/idcard");
const { buildDemographics } = require("./services/biz");
const { code2session } = require("./services/wechat");
const { dissolveSchedule, dissolveAllSchedules } = require("./services/dissolve");
const { enrollUser, cancelEnrollment, canCancelEnrollment } = require("./services/enroll");
const { scheduleSeats, setLockedSeats, toggleLockedSeat, assignSeat, pickMySeat } = require("./services/seats");
const { forecast } = require("./services/weather");
const { listSplits, createSplitsForSchedule } = require("./services/split");
const { listReviews, createReview, reviewedScheduleIds } = require("./services/reviews");
const { cancelPolicy, waiverText, faqs, meetupMap, contacts, officialAccounts, commonRules, leaderRecruitCopy } = require("./services/policy");
const {
  buildHome,
  cityOf,
  parseIdList,
  listPlayTags,
  mapPlayTag,
  tagsForIds,
  monthDays,
  randomTagColor,
} = require("./services/home");
const { offerMeta, liveMemberPrice, liveStudentPrice, flagOn } = require("./services/offer");
const { publicUserProfile, payEnrollment, updateScheduleTrip, chainItem, galleryOfSchedule } = require("./services/trip");
const { addPhoto, removePhoto, ensureReferralCode } = require("./services/profile");
const { leadersOf, applyLeader, settleLeaderRewards, recruitPayload } = require("./services/leaders");
const { referralCard, groupQrPayload, settleEnrollReferrals } = require("./services/referral");
const { optionsForSchedule, setFallbacks, listFallbacks } = require("./services/fallback");
const { generateVirtualUsers, setVirtualUsersForSchedule } = require("./services/virtual");
const { deleteAccount } = require("./services/account");
const { createCaptcha, codesMatch } = require("./services/captcha");
const {
  createCampaign,
  updateCampaign,
  claimCampaign,
  grantCoupons,
  publicGet,
  publicSummaryForSchedule,
  listMine,
  listAdmin,
  adminDetail,
  sharePayload,
  loadCampaign,
} = require("./services/coupons");
const {
  publicStaff,
  getStaff,
  listStaff,
  createStaff,
  updateStaff,
  deleteStaff,
  changeOwnPassword,
} = require("./services/staff");
const {
  isMember,
  isStudent,
  enrolledCount,
  realEnrolledCount,
  virtualEnrolledCount,
  waitlistCount,
  loadRouteBundle,
  resolveStoredMedia,
  quoteForSchedule,
  maybeMatchGuide,
  addPoints,
  attachAssetHost,
} = require("./services/helpers");

const router = express.Router();
const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

function uploadsDir() {
  const dir = path.join(config.publicDir, "static", "uploads");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const uploadImage = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir()),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || "").toLowerCase();
      cb(null, `${Date.now()}-${nanoid(8)}${IMAGE_EXTS.has(ext) ? ext : ".jpg"}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const ok = IMAGE_EXTS.has(ext) || /^image\/(jpeg|png|webp|gif)$/i.test(file.mimetype || "");
    cb(ok ? null : new Error("只支持 jpg / png / webp / gif"), ok);
  },
});

function db() {
  return getDb();
}

function userPublic(u, req) {
  if (!u) return null;
  return {
    id: u.id,
    phone: u.phone,
    nickname: u.nickname,
    avatar: attachAssetHost(req, u.avatar) || "",
    gender: u.gender,
    birthday: u.birthday,
    hometown: u.hometown,
    isMember: isMember(u),
    memberExpireAt: u.member_expire_at,
    memberGiftLeft: Number(u.member_gift_left || 0),
    points: u.points,
    companyName: u.company_name,
    role: u.role,
    isStudent: isStudent(u),
    studentStatus: u.student_status || "",
    school: u.school || "",
    groupStatus: u.group_status || "",
    groupName: u.group_name || "",
    groupKind: u.group_kind || "",
    referralCode: ensureReferralCode(u.id),
    idCardMasked: maskIdCard(u.id_card),
  };
}

function grantMembership(userId) {
  const user = db().prepare("SELECT * FROM users WHERE id=?").get(userId);
  const expire = dayjs(user.member_expire_at).isAfter(dayjs()) ? dayjs(user.member_expire_at) : dayjs();
  const next = expire.add(config.member.durationDays, "day").format("YYYY-MM-DD");
  db().prepare("UPDATE users SET is_member=1, member_expire_at=?, member_gift_left=COALESCE(member_gift_left,0)+? WHERE id=?").run(
    next,
    config.member.giftTrips || 1,
    userId
  );
  addPoints(userId, config.member.annualFee, "开通会员赠送积分", "member", userId);
  return db().prepare("SELECT * FROM users WHERE id=?").get(userId);
}

function mapRoute(row, req, extra) {
  const r = toRoute(row, extra);
  r.cover = attachAssetHost(req, resolveStoredMedia(r.cover, { code: r.code }));
  const seen = new Set();
  r.gallery = (r.gallery || [])
    .map((g) => resolveStoredMedia(g, { code: r.code }))
    .filter((g) => {
      if (!g || seen.has(g)) return false;
      seen.add(g);
      return true;
    })
    .map((g) => attachAssetHost(req, g));
  return r;
}

function mapRouteSummary(row, req, extra) {
  const r = mapRoute(row, req, extra);
  return {
    id: r.id,
    code: r.code,
    title: r.title,
    subtitle: r.subtitle,
    days: r.days,
    distanceKm: r.distanceKm,
    difficulty: r.difficulty,
    category: r.category,
    region: r.region,
    season: r.season,
    tags: r.tags,
    cover: r.cover,
    minGroupSize: r.minGroupSize,
    fromPrice: extra.fromPrice,
    memberFromPrice: extra.memberFromPrice,
    studentFromPrice: extra.studentFromPrice,
    priceTiers: extra.priceTiers,
    upcoming: extra.upcoming,
    playTags: extra.playTags || [],
  };
}

function mapBus(bus, sch, req) {
  if (!bus) return null;
  const photos = [];
  if (bus.photo) photos.push(attachAssetHost(req, bus.photo));
  if (sch?.bus_photo) photos.push(attachAssetHost(req, sch.bus_photo));
  return {
    id: bus.id,
    name: bus.name,
    seats: bus.seats,
    description: bus.description,
    photo: photos[0] || "",
    photos,
    plateNo: (sch && sch.plate_no) || "",
  };
}

function scheduleView(sch, req) {
  const route = db().prepare("SELECT * FROM routes WHERE id=?").get(sch.route_id);
  const bus = db().prepare("SELECT * FROM bus_types WHERE id=?").get(sch.bus_type_id);
  const guideRow = sch.guide_id ? db().prepare("SELECT * FROM guides WHERE id=?").get(sch.guide_id) : null;
  const guide = publicGuideCard(guideRow, req);
  const live = enrolledCount(sch.id);
  const enrolled = sch.status === "cancelled" ? enrolledCount(sch.id, true) : live;
  const people = Math.max(live || enrolled, 1);
  const quote = quoteForSchedule(sch, live || sch.min_group_size, null);
  const cost =
    (sch.cost_transport || 0) +
    (sch.cost_ticket || 0) +
    (sch.cost_hotel || 0) +
    (sch.cost_meal || 0) +
    (sch.cost_guide || 0) +
    (sch.cost_other || 0);
    const revenue = db().prepare("SELECT IFNULL(SUM(pay_amount),0) AS s FROM enrollments WHERE schedule_id=? AND status='joined'").get(sch.id).s;
  const mappedRoute = mapRoute(route, req);
  const meetup = meetupMap(sch.meetup_point);
  let lockedCount = 0;
  try {
    const locked = JSON.parse(sch.locked_seats || "[]");
    lockedCount = Array.isArray(locked) ? locked.length : 0;
  } catch {
    lockedCount = 0;
  }
  const realLive = realEnrolledCount(sch.id);
  const virtualLive = virtualEnrolledCount(sch.id);
  const leaders = leadersOf(sch.id, req);
  return {
    id: sch.id,
    routeId: sch.route_id,
    route: mappedRoute,
    gallery: galleryOfSchedule(mappedRoute, req),
    startDate: sch.start_date,
    endDate: sch.end_date,
    organizerType: sch.organizer_type,
    organizerId: sch.organizer_id,
    organizerName: sch.organizer_name,
    companyName: sch.company_name,
    bus: mapBus(bus, sch, req),
    minGroupSize: sch.min_group_size,
    maxSeats: sch.max_seats,
    meetupPoint: sch.meetup_point,
    meetupTime: sch.meetup_time,
    meetupMapUrl: meetup.url,
    meetupLat: meetup.lat,
    meetupLng: meetup.lng,
    meetupPrecise: meetup.precise,
    status: sch.status,
    cancelReason: sch.cancel_reason || "",
    cancelledAt: sch.cancelled_at || "",
    cancelledBy: sch.cancelled_by || "",
    shareToken: sch.share_token,
    notes: sch.notes,
    consultGroup: sch.consult_group || "",
    enrolled,
    waitlistCount: waitlistCount(sch.id),
    remain: Math.max(0, sch.max_seats - live - lockedCount),
    quote,
    people,
    guide,
    leaders,
    leaderRecruitCopy,
    ...(req.adminId
      ? { realEnrolled: realLive, virtualEnrolled: virtualLive }
      : {}),
    canEnrollDirect: Math.max(0, sch.max_seats - live - lockedCount) > 0 || virtualLive > 0,
    cost,
    cost,
    costBreakdown: {
      transport: sch.cost_transport,
      ticket: sch.cost_ticket,
      hotel: sch.cost_hotel,
      meal: sch.cost_meal,
      guide: sch.cost_guide,
      other: sch.cost_other,
    },
    revenue,
    profit: revenue - cost,
    guaranteed: sch.status !== "cancelled" && realLive >= Number(sch.min_group_size),
    city: sch.city || cityOf(mappedRoute?.region),
    channel: sch.channel === "activity" ? "activity" : "trip",
    memberPriceOn: flagOn(sch.member_price_on),
    studentPriceOn: flagOn(sch.student_price_on),
    offerType: quote.offerType || sch.offer_type || "full",
    offerLabel: quote.offerLabel || offerMeta(sch.offer_type).label,
    offerColor: quote.offerColor || offerMeta(sch.offer_type).color,
    playTags: resolvePlayTags(sch, mappedRoute, req),
    reviewStatus: sch.review_status || "approved",
  };
}

function resolvePlayTags(sch, route, req) {
  let ids = parseIdList(sch.play_tags_json);
  if (!ids.length && route) {
    const names = new Set([route.category, ...((route.tags || []).map(String))]);
    ids = listPlayTags().filter((t) => names.has(t.name)).map((t) => t.id);
  }
  return tagsForIds(ids, req);
}

function applyScheduleExtras(id, body, route) {
  const offerType = offerMeta(body.offerType || body.offer_type).key;
  const offerPrice = body.offerPrice == null || body.offerPrice === "" ? null : Number(body.offerPrice);
  const reviewStatus = body.reviewStatus || body.review_status || "approved";
  const playTagIds = Array.isArray(body.playTagIds) ? body.playTagIds : parseIdList(body.play_tags_json);
  const city = body.city || cityOf(route?.region);
  const channel = body.channel === "activity" ? "activity" : "trip";
  const memberOn = flagOn(body.memberPriceOn ?? body.member_price_on) ? 1 : 0;
  const studentOn = flagOn(body.studentPriceOn ?? body.student_price_on) ? 1 : 0;
  db()
    .prepare(
      "UPDATE schedules SET offer_type=?, offer_price=?, review_status=?, play_tags_json=?, city=?, channel=?, member_price_on=?, student_price_on=? WHERE id=?"
    )
    .run(offerType, offerPrice, reviewStatus, JSON.stringify(playTagIds), city, channel, memberOn, studentOn, id);
}

router.get("/meta", (req, res) => {
  res.json({
    ok: true,
    data: {
      name: "同行者众",
      slogan: "在山野，遇见爱",
      studentDiscountRate: config.student.discountRate,
      smsDemoCode: config.demoSmsCode,
      wechatPayMock: config.wechat.mock,
      memberAnnualFee: config.member.annualFee,
      memberDiscountRate: config.member.discountRate,
      memberGiftMaxPrice: config.member.giftMaxPrice,
      memberCopy: "限时开通会员 年费 99元 赠送一次100以内的团 线路享受额外95折",
      points: config.points,
      insurance: config.insurance.plans,
      days: [1, 2, 3, 5],
      cancelPolicy,
      waiverText,
      faqs,
      contacts,
      officialAccounts,
      commonRules,
      leaderRecruitCopy,
      referralRate: config.referral.enrollRate,
      leaderReward: config.referral.leaderReward,
      offers: Object.values(require("./services/offer").OFFER_TYPES),
    },
  });
});

router.get("/home", (req, res) => {
  const data = buildHome(req);
  if (req.query.month) {
    const dates = db()
      .prepare(
        "SELECT start_date FROM schedules WHERE IFNULL(review_status,'approved')='approved' AND status!='cancelled'"
      )
      .all()
      .map((r) => r.start_date);
    data.monthDays = monthDays(String(req.query.month), dates);
  }
  res.json({ ok: true, data });
});

router.get("/play-tags", (req, res) => {
  res.json({ ok: true, data: listPlayTags().map((t) => mapPlayTag(t, req)) });
});

router.post("/auth/sms", (req, res) => {
  const { phone, scene } = req.body || {};
  if (!/^1\d{10}$/.test(phone || "")) return res.status(400).json({ ok: false, message: "手机号不正确" });
  const code = config.demoSmsCode;
  const expire = dayjs().add(10, "minute").format("YYYY-MM-DD HH:mm:ss");
  db().prepare("INSERT INTO sms_codes (phone,code,scene,expire_at) VALUES (?,?,?,?)").run(phone, code, scene || "login", expire);
  res.json({ ok: true, message: "验证码已发送（演示环境固定验证码）", data: { demoCode: code } });
});

function consumeSms(phone, code, scene) {
  const row = db()
    .prepare("SELECT * FROM sms_codes WHERE phone=? AND code=? AND scene=? AND used=0 AND expire_at>=datetime('now','localtime') ORDER BY id DESC LIMIT 1")
    .get(phone, code, scene);
  if (!row) return false;
  db().prepare("UPDATE sms_codes SET used=1 WHERE id=?").run(row.id);
  return true;
}

const captchaPngs = new Map();

function consumeCaptcha(token, input) {
  const row = db()
    .prepare("SELECT * FROM captchas WHERE token=? AND used=0 AND expire_at>=datetime('now','localtime')")
    .get(token);
  if (!row) return false;
  db().prepare("UPDATE captchas SET used=1 WHERE id=?").run(row.id);
  captchaPngs.delete(token);
  return codesMatch(row.code, input);
}

router.get("/auth/captcha", (_req, res) => {
  const { code, image, png } = createCaptcha();
  const token = nanoid(16);
  const expire = dayjs().add(5, "minute").format("YYYY-MM-DD HH:mm:ss");
  db().prepare("DELETE FROM captchas WHERE used=1 OR expire_at < datetime('now','localtime')").run();
  db().prepare("INSERT INTO captchas (token,code,expire_at) VALUES (?,?,?)").run(token, code, expire);
  captchaPngs.set(token, png);
  res.set("Cache-Control", "no-store");
  res.json({ ok: true, data: { token, image } });
});

router.get("/auth/captcha-image/:token", (req, res) => {
  const png = captchaPngs.get(req.params.token);
  if (!png) return res.status(404).json({ ok: false, message: "验证码已失效" });
  res.set("Content-Type", "image/png");
  res.set("Cache-Control", "no-store");
  res.send(png);
});

router.post("/auth/register", (req, res) => {
  const { phone, password, nickname, captchaToken, captcha } = req.body || {};
  if (!/^1\d{10}$/.test(phone || "")) return res.status(400).json({ ok: false, message: "手机号不正确" });
  if (!password || password.length < 6) return res.status(400).json({ ok: false, message: "密码至少 6 位" });
  const exists = db().prepare("SELECT id FROM users WHERE phone=? AND deleted_at IS NULL").get(phone);
  if (exists) return res.status(400).json({ ok: false, message: "手机号已注册" });
  if (!consumeCaptcha(captchaToken, captcha)) return res.status(400).json({ ok: false, message: "验证码错误或已过期" });
  const info = db()
    .prepare("INSERT INTO users (phone,password_hash,nickname) VALUES (?,?,?)")
    .run(phone, bcrypt.hashSync(password, 10), nickname || `北野行${phone.slice(-4)}`);
  const user = db().prepare("SELECT * FROM users WHERE id=?").get(info.lastInsertRowid);
  res.json({ ok: true, data: { token: signUser(user), user: userPublic(user, req) } });
});

router.post("/auth/login", (req, res) => {
  const { phone, password, captchaToken, captcha } = req.body || {};
  if (!consumeCaptcha(captchaToken, captcha)) return res.status(400).json({ ok: false, message: "验证码错误或已过期" });
  const user = db().prepare("SELECT * FROM users WHERE phone=? AND deleted_at IS NULL").get(phone);
  if (!user || !user.password_hash || !bcrypt.compareSync(password || "", user.password_hash)) {
    return res.status(400).json({ ok: false, message: "手机号或密码错误" });
  }
  res.json({ ok: true, data: { token: signUser(user), user: userPublic(user, req) } });
});

router.post("/auth/login-sms", (req, res) => {
  const { phone, code } = req.body || {};
  if (!consumeSms(phone, code, "login")) return res.status(400).json({ ok: false, message: "验证码错误或已过期" });
  let user = db().prepare("SELECT * FROM users WHERE phone=? AND deleted_at IS NULL").get(phone);
  if (!user) {
    const info = db().prepare("INSERT INTO users (phone,nickname) VALUES (?,?)").run(phone, `北野行${phone.slice(-4)}`);
    user = db().prepare("SELECT * FROM users WHERE id=?").get(info.lastInsertRowid);
  }
  res.json({ ok: true, data: { token: signUser(user), user: userPublic(user, req) } });
});

router.post("/auth/wechat", async (req, res) => {
  const { code, nickname, avatar } = req.body || {};
  const sess = await code2session(code || `demo_${Date.now()}`);
  if (sess.errcode) return res.status(400).json({ ok: false, message: sess.errmsg || "微信登录失败" });
  let user = db().prepare("SELECT * FROM users WHERE wechat_openid=? AND deleted_at IS NULL").get(sess.openid);
  if (!user) {
    const info = db()
      .prepare("INSERT INTO users (nickname,avatar,wechat_openid,wechat_unionid) VALUES (?,?,?,?)")
      .run(nickname || "微信用户", avatar || "", sess.openid, sess.unionid || "");
    user = db().prepare("SELECT * FROM users WHERE id=?").get(info.lastInsertRowid);
  }
  res.json({ ok: true, data: { token: signUser(user), user: userPublic(user, req) } });
});

router.get("/me", authUser, (req, res) => {
  const user = db().prepare("SELECT * FROM users WHERE id=?").get(req.userId);
  res.json({ ok: true, data: userPublic(user, req) });
});

router.get("/me/coupons", authUser, (req, res) => {
  res.json({ ok: true, data: listMine(req.userId) });
});

router.get("/coupons/:code", optionalUser, (req, res) => {
  try {
    const user = req.userId ? db().prepare("SELECT * FROM users WHERE id=?").get(req.userId) : null;
    res.json({ ok: true, data: publicGet(req.params.code, user, req) });
  } catch (e) {
    res.status(e.status || 500).json({ ok: false, message: e.message });
  }
});

router.post("/coupons/:code/claim", authUser, (req, res) => {
  try {
    const user = db().prepare("SELECT * FROM users WHERE id=?").get(req.userId);
    const claimed = claimCampaign(req.userId, req.params.code);
    res.json({
      ok: true,
      data: publicGet(claimed.campaign.code, user, req),
      message: claimed.already ? "已领取过该券" : "领取成功",
    });
  } catch (e) {
    res.status(e.status || 500).json({ ok: false, message: e.message });
  }
});

router.get("/me/trips", authUser, (req, res) => {
  const rows = db()
    .prepare(
      `SELECT e.id, e.status, e.seat_no, e.insurance_code, e.pay_status, e.pay_amount, e.schedule_id,
              s.start_date, s.end_date, s.meetup_point, s.meetup_time, s.status AS schedule_status,
              s.route_id, r.title, r.cover, r.region, r.equipment, r.days
       FROM enrollments e
       JOIN schedules s ON s.id=e.schedule_id
       JOIN routes r ON r.id=s.route_id
       WHERE e.user_id=? AND e.status IN ('joined','waitlist') AND s.status!='cancelled'
         AND s.start_date>=date('now','-1 day')
       ORDER BY s.start_date, e.id`
    )
    .all(req.userId)
    .map((row) => ({
      id: row.id,
      scheduleId: row.schedule_id,
      routeId: row.route_id,
      title: row.title,
      cover: attachAssetHost(req, row.cover),
      region: row.region,
      days: row.days,
      startDate: row.start_date,
      endDate: row.end_date,
      meetupPoint: row.meetup_point,
      meetupTime: row.meetup_time,
      meetupMapUrl: meetupMap(row.meetup_point).url,
      status: row.status,
      seatNo: row.seat_no,
      insurance: row.insurance_code,
      payStatus: row.pay_status,
      payAmount: row.pay_amount,
      packingList: String(row.equipment || "")
        .split(/[、，,;；/\n]+/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 2),
    }));
  res.json({ ok: true, data: rows });
});

router.delete("/me", authUser, (req, res) => {
  try {
    deleteAccount(req.userId);
    res.json({ ok: true, data: { deleted: true } });
  } catch (e) {
    res.status(e.status || 500).json({ ok: false, message: e.message });
  }
});

router.get("/me/referral", authUser, async (req, res) => {
  try {
    settleEnrollReferrals();
    settleLeaderRewards();
    const data = await referralCard(req.userId, req, { scheduleId: req.query.scheduleId });
    res.json({ ok: true, data });
  } catch (e) {
    res.status(e.status || 500).json({ ok: false, message: e.message });
  }
});

router.post("/me/photos", authUser, (req, res) => {
  try {
    const data = addPhoto(req.userId, (req.body || {}).url);
    res.json({ ok: true, data });
  } catch (e) {
    res.status(e.status || 500).json({ ok: false, message: e.message });
  }
});

router.delete("/me/photos/:id", authUser, (req, res) => {
  try {
    const data = removePhoto(req.userId, req.params.id);
    res.json({ ok: true, data });
  } catch (e) {
    res.status(e.status || 500).json({ ok: false, message: e.message });
  }
});

router.put("/me", authUser, (req, res) => {
  const { nickname, gender, birthday, idCard, companyName, avatar } = req.body || {};
  const parsed = idCard ? parseIdCard(idCard) : {};
  db().prepare(
    `UPDATE users SET nickname=COALESCE(?,nickname), gender=COALESCE(?,gender), birthday=COALESCE(?,birthday),
     id_card=COALESCE(?,id_card), hometown=COALESCE(?,hometown), company_name=COALESCE(?,company_name), avatar=COALESCE(?,avatar) WHERE id=?`
  ).run(nickname, gender, birthday || parsed.birthday, idCard, parsed.hometown, companyName, avatar, req.userId);
  const user = db().prepare("SELECT * FROM users WHERE id=?").get(req.userId);
  res.json({ ok: true, data: userPublic(user, req) });
});

router.post("/me/student", authUser, (req, res) => {
  const school = String((req.body || {}).school || "").trim();
  if (!school) return res.status(400).json({ ok: false, message: "请填写学校" });
  db().prepare("UPDATE users SET school=?, student_status='pending', is_student=0 WHERE id=?").run(school, req.userId);
  const next = db().prepare("SELECT * FROM users WHERE id=?").get(req.userId);
  res.json({ ok: true, data: userPublic(next, req), message: "已提交学生认证，待后台审核" });
});

router.post("/me/group", authUser, (req, res) => {
  const name = String((req.body || {}).name || (req.body || {}).groupName || "").trim();
  const kind = String((req.body || {}).kind || (req.body || {}).groupKind || "组织").trim();
  if (!name) return res.status(400).json({ ok: false, message: "请填写团体名称" });
  db().prepare("UPDATE users SET group_name=?, group_kind=?, group_status='pending' WHERE id=?").run(name, kind, req.userId);
  const next = db().prepare("SELECT * FROM users WHERE id=?").get(req.userId);
  res.json({ ok: true, data: userPublic(next, req), message: "已提交团体认证，待后台审核" });
});

router.post("/feedback", authUser, (req, res) => {
  const kind = (req.body || {}).kind === "bug" ? "bug" : "suggest";
  const content = String((req.body || {}).content || "").trim();
  if (content.length < 4) return res.status(400).json({ ok: false, message: "请写清楚建议或问题" });
  db().prepare("INSERT INTO feedbacks (user_id,kind,content) VALUES (?,?,?)").run(req.userId, kind, content);
  res.json({ ok: true, message: "已收到，谢谢反馈" });
});

router.get("/weather", async (req, res) => {
  try {
    const data = await forecast({ region: req.query.region || req.query.place, date: req.query.date });
    res.json({ ok: true, data });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message || "天气暂不可用" });
  }
});

router.get("/users/:id", (req, res) => {
  const user = db().prepare("SELECT * FROM users WHERE id=? AND deleted_at IS NULL").get(req.params.id);
  const data = publicUserProfile(user, req);
  if (!data) return res.status(404).json({ ok: false, message: "用户不存在" });
  res.json({ ok: true, data });
});

router.get("/buses", (req, res) => {
  const data = db()
    .prepare("SELECT * FROM bus_types ORDER BY sort_order")
    .all()
    .map((b) => ({ ...b, photo: attachAssetHost(req, b.photo) || "" }));
  res.json({ ok: true, data });
});

function publicGuideCard(g, req) {
  if (!g) return null;
  return {
    id: g.id,
    name: g.name,
    gender: g.gender || "",
    years: Number(g.years) || 0,
    languages: g.languages || "",
    specialties: g.specialties || "",
    rating: Number(g.rating) || 0,
    bio: g.bio || "",
    avatar: attachAssetHost(req, g.avatar) || "",
  };
}

function guideProfile(g, req) {
  const card = publicGuideCard(g, req);
  const tripCount = db().prepare("SELECT COUNT(*) AS n FROM schedules WHERE guide_id=? AND status!='cancelled'").get(g.id).n;
  const upcoming = db()
    .prepare(
      `SELECT s.id, s.start_date, s.end_date, s.status, r.title, r.cover, r.region
       FROM schedules s JOIN routes r ON r.id=s.route_id
       WHERE s.guide_id=? AND s.status!='cancelled' AND s.start_date>=date('now','-1 day')
       ORDER BY s.start_date LIMIT 8`
    )
    .all(g.id)
    .map((row) => ({
      id: row.id,
      startDate: row.start_date,
      endDate: row.end_date,
      status: row.status,
      title: row.title,
      region: row.region,
      cover: attachAssetHost(req, row.cover),
    }));
  return { ...card, tripCount, upcoming };
}

router.get("/guides", (req, res) => {
  const rows = db()
    .prepare("SELECT * FROM guides WHERE status!='off' ORDER BY rating DESC, id")
    .all()
    .map((g) => publicGuideCard(g, req));
  res.json({ ok: true, data: rows });
});

router.get("/guides/recruit", optionalUser, (req, res) => {
  settleLeaderRewards();
  res.json({ ok: true, data: recruitPayload(req.userId) });
});

router.get("/guides/:id", (req, res) => {
  const g = db().prepare("SELECT * FROM guides WHERE id=?").get(req.params.id);
  if (!g || g.status === "off") return res.status(404).json({ ok: false, message: "导游不存在" });
  res.json({ ok: true, data: guideProfile(g, req) });
});

router.get("/routes", (req, res) => {
  const { days, category, q, difficulty, tag, city } = req.query;
  let sql = "SELECT * FROM routes WHERE status='on'";
  const args = [];
  if (String(days) === "multi") {
    sql += " AND days>=4";
  } else if (days) {
    sql += " AND days=?";
    args.push(Number(days));
  }
  if (category) {
    sql += " AND category=?";
    args.push(category);
  }
  if (tag) {
    sql += " AND (category=? OR tags_json LIKE ?)";
    args.push(tag, `%${tag}%`);
  }
  if (city) {
    sql += " AND region LIKE ?";
    args.push(`%${city}%`);
  }
  if (difficulty) {
    sql += " AND difficulty=?";
    args.push(difficulty);
  }
  if (q) {
    sql += " AND (title LIKE ? OR region LIKE ? OR tags_json LIKE ?)";
    args.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  sql += " ORDER BY days, id";
  const rows = db().prepare(sql).all(...args);
  const data = rows.map((row) => {
    const tiers = db().prepare("SELECT * FROM route_price_tiers WHERE route_id=? ORDER BY min_people").all(row.id);
    const schedules = db().prepare("SELECT id,start_date,status FROM schedules WHERE route_id=? AND start_date>=date('now') AND status!='cancelled' AND IFNULL(review_status,'approved')='approved' ORDER BY start_date LIMIT 3").all(row.id);
    const mapped = mapRoute(row, req);
    const names = new Set([mapped.category, ...(mapped.tags || [])]);
    const playTags = listPlayTags().filter((t) => names.has(t.name)).map((t) => mapPlayTag(t, req));
    return mapRouteSummary(row, req, {
      fromPrice: tiers[0]?.price,
      memberFromPrice: liveMemberPrice(tiers[0]?.price),
      studentFromPrice: liveStudentPrice(tiers[0]?.price),
      priceTiers: tiers.map((t) => ({ minPeople: t.min_people, price: t.price, memberPrice: liveMemberPrice(t.price), studentPrice: liveStudentPrice(t.price) })),
      upcoming: schedules,
      playTags,
    });
  });
  res.json({ ok: true, data });
});

router.get("/routes/:id", optionalUser, (req, res) => {
  const row = db().prepare("SELECT * FROM routes WHERE id=?").get(req.params.id);
  if (!row) return res.status(404).json({ ok: false, message: "线路不存在" });
  const bundle = loadRouteBundle(row.id);
  const schedules = db()
    .prepare("SELECT * FROM schedules WHERE route_id=? AND start_date>=date('now','-1 day') AND status!='cancelled' AND IFNULL(review_status,'approved')='approved' ORDER BY start_date")
    .all(row.id)
    .map((s) => scheduleView(s, req));
  let favored = false;
  if (req.userId) {
    favored = !!db().prepare("SELECT 1 FROM favorites WHERE user_id=? AND route_id=?").get(req.userId, row.id);
  }
  const mapped = mapRoute(row, req);
  const names = new Set([mapped.category, ...(mapped.tags || [])]);
  const playTags = listPlayTags().filter((t) => names.has(t.name)).map((t) => mapPlayTag(t, req));
  res.json({
    ok: true,
    data: mapRoute(row, req, {
      priceTiers: bundle.tiers.map((t) => ({ minPeople: t.min_people, maxPeople: t.max_people, price: t.price, memberPrice: liveMemberPrice(t.price), studentPrice: liveStudentPrice(t.price) })),
      buses: bundle.buses,
      schedules,
      favored,
      playTags,
    }),
  });
});

router.get("/schedules", (req, res) => {
  const { routeId, organizerType, city, tag, offerType, month, date, channel } = req.query;
  let sql = "SELECT * FROM schedules WHERE start_date>=date('now','-1 day') AND status!='cancelled' AND IFNULL(review_status,'approved')='approved'";
  const args = [];
  if (routeId) {
    sql += " AND route_id=?";
    args.push(routeId);
  }
  if (organizerType) {
    sql += " AND organizer_type=?";
    args.push(organizerType);
  }
  if (offerType) {
    sql += " AND IFNULL(offer_type,'full')=?";
    args.push(offerType);
  }
  if (date) {
    sql += " AND start_date=?";
    args.push(date);
  }
  if (month) {
    sql += " AND start_date LIKE ?";
    args.push(`${month}%`);
  }
  if (channel === "activity" || channel === "trip") {
    sql += " AND IFNULL(channel,'trip')=?";
    args.push(channel);
  }
  sql += " ORDER BY start_date";
  let rows = db().prepare(sql).all(...args).map((s) => scheduleView(s, req));
  if (city) rows = rows.filter((s) => s.city === city);
  if (tag) rows = rows.filter((s) => (s.playTags || []).some((t) => t.name === tag || String(t.id) === String(tag)));
  res.json({ ok: true, data: rows });
});

router.get("/schedules/:id", optionalUser, async (req, res) => {
  const sch = db().prepare("SELECT * FROM schedules WHERE id=?").get(req.params.id);
  if (!sch) return res.status(404).json({ ok: false, message: "排期不存在" });
  const includeCancelled = sch.status === "cancelled";
  const chainSql = includeCancelled
    ? `SELECT e.id,e.user_id,e.traveler_name,e.gender,e.pay_status,e.traveler_type,e.status,e.seat_no,e.created_at,e.birthday,e.id_card,u.avatar
       FROM enrollments e LEFT JOIN users u ON u.id=e.user_id WHERE e.schedule_id=? ORDER BY CASE e.status WHEN 'joined' THEN 0 WHEN 'waitlist' THEN 1 ELSE 2 END, e.id`
    : `SELECT e.id,e.user_id,e.traveler_name,e.gender,e.pay_status,e.traveler_type,e.status,e.seat_no,e.created_at,e.birthday,e.id_card,u.avatar
       FROM enrollments e LEFT JOIN users u ON u.id=e.user_id WHERE e.schedule_id=? AND e.status!='cancelled' ORDER BY CASE e.status WHEN 'joined' THEN 0 WHEN 'waitlist' THEN 1 ELSE 2 END, e.id`;
  const chain = db()
    .prepare(chainSql)
    .all(sch.id)
    .map((e, i) => chainItem(e, i, req));
  const groupText = sch.consult_group || contacts.officialWechat;
  let myEnrollment = null;
  if (req.userId) {
    const mine = db()
      .prepare(
        "SELECT * FROM enrollments WHERE schedule_id=? AND user_id=? AND status IN ('joined','waitlist') ORDER BY id DESC LIMIT 1"
      )
      .get(sch.id, req.userId);
    if (mine) {
      myEnrollment = {
        id: mine.id,
        status: mine.status,
        seatNo: mine.seat_no || "",
        autoAlt: !!mine.auto_alt,
        fallbacks: listFallbacks(mine.id),
      };
    }
  }
  res.json({
    ok: true,
    data: {
      ...scheduleView(sch, req),
      chain,
      isOrganizer: !!(req.userId && sch.organizer_id && Number(req.userId) === Number(sch.organizer_id)),
      consultGroupQr: await groupQrPayload(groupText),
      myEnrollment,
      fallbackOptions: optionsForSchedule(sch.id),
      coupon: publicSummaryForSchedule(sch.id, req),
    },
  });
});

router.get("/share/:token", (req, res) => {
  const sch = db().prepare("SELECT * FROM schedules WHERE share_token=?").get(req.params.token);
  if (!sch) return res.status(404).json({ ok: false, message: "分享已失效" });
  res.redirect(`/m/schedule/${sch.id}?token=${sch.share_token}`);
});

router.get("/schedules/:id/seats", optionalUser, (req, res) => {
  const data = scheduleSeats(req.params.id);
  if (!data) return res.status(404).json({ ok: false, message: "排期不存在" });
  data.seats = data.seats.map((seat) => ({
    ...seat,
    mine: !!(req.userId && seat.userId && Number(seat.userId) === Number(req.userId)),
    occupant: seat.occupant
      ? { ...seat.occupant, avatar: attachAssetHost(req, seat.occupant.avatar) || "" }
      : null,
  }));
  res.json({ ok: true, data });
});

router.post("/schedules/:id/seats/pick", authUser, (req, res) => {
  try {
    const data = pickMySeat(req.params.id, req.userId, (req.body || {}).seatNo);
    res.json({ ok: true, data });
  } catch (e) {
    res.status(e.status || 500).json({ ok: false, message: e.message });
  }
});

router.post("/schedules/:id/leaders/apply", authUser, (req, res) => {
  try {
    const data = applyLeader(req.params.id, req.userId, { leadRef: (req.body || {}).leadRef || req.query.leadRef });
    res.json({ ok: true, data, message: `已报名领队${data.slot}` });
  } catch (e) {
    res.status(e.status || 500).json({ ok: false, message: e.message });
  }
});

router.get("/guides/recruit", optionalUser, (req, res) => {
  settleLeaderRewards();
  res.json({ ok: true, data: recruitPayload(req.userId) });
});

router.post("/enrollments/:id/fallbacks", authUser, (req, res) => {
  try {
    const body = req.body || {};
    const data = setFallbacks(req.params.id, req.userId, {
      scheduleIds: body.scheduleIds || body.fallbackScheduleIds,
      autoAlt: body.autoAlt,
    });
    res.json({ ok: true, data });
  } catch (e) {
    res.status(e.status || 500).json({ ok: false, message: e.message });
  }
});

router.get("/schedules/:id/poster", async (req, res) => {
  const sch = db().prepare("SELECT * FROM schedules WHERE id=?").get(req.params.id);
  if (!sch) return res.status(404).json({ ok: false, message: "排期不存在" });
  const url = `${req.protocol}://${req.get("host")}/m/schedule/${sch.id}?token=${sch.share_token}`;
  const qr = await QRCode.toDataURL(url);
  res.json({ ok: true, data: { url, qr } });
});

router.post("/schedules", authUser, (req, res) => {
  const user = db().prepare("SELECT * FROM users WHERE id=?").get(req.userId);
  const { routeId, startDate, organizerType, busTypeId, minGroupSize, meetupPoint, meetupTime, notes, companyName } = req.body || {};
  const route = db().prepare("SELECT * FROM routes WHERE id=?").get(routeId);
  if (!route) return res.status(400).json({ ok: false, message: "线路不存在" });
  const bus = db().prepare("SELECT * FROM bus_types WHERE id=?").get(busTypeId);
  if (!bus) return res.status(400).json({ ok: false, message: "请选择车型" });
  if (!startDate) return res.status(400).json({ ok: false, message: "请选择出发日期" });
  const type = organizerType === "company" ? "company" : "individual";
  if (type === "company" && !(companyName || user.company_name)) {
    return res.status(400).json({ ok: false, message: "公司开团请填写公司名称" });
  }
  const end = dayjs(startDate).add(route.days - 1, "day").format("YYYY-MM-DD");
  const info = db()
    .prepare(
      `INSERT INTO schedules (route_id,start_date,end_date,organizer_type,organizer_id,organizer_name,company_name,bus_type_id,min_group_size,max_seats,meetup_point,meetup_time,status,share_token,notes)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      route.id,
      startDate,
      end,
      type,
      user.id,
      user.nickname,
      companyName || user.company_name,
      bus.id,
      minGroupSize || route.min_group_size,
      bus.seats,
      meetupPoint || (JSON.parse(route.meetup_json || "[]")[0] || {}).name,
      meetupTime || "07:30",
      "recruiting",
      nanoid(10),
      notes || ""
    );
  applyScheduleExtras(info.lastInsertRowid, { ...(req.body || {}), reviewStatus: "approved" }, route);
  const sch = db().prepare("SELECT * FROM schedules WHERE id=?").get(info.lastInsertRowid);
  res.json({ ok: true, data: scheduleView(sch, req) });
});

function dissolveHandler(actor) {
  return (req, res) => {
    try {
      const data = dissolveSchedule(req.params.id, {
        reason: (req.body || {}).reason,
        actor,
        actorId: actor === "admin" ? req.adminId : req.userId,
      });
      res.json({ ok: true, data });
    } catch (e) {
      res.status(e.status || 500).json({ ok: false, message: e.message });
    }
  };
}

router.post("/schedules/:id/dissolve", authUser, dissolveHandler("organizer"));

router.post("/upload", authUser, (req, res) => {
  uploadImage.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ ok: false, message: err.message || "上传失败" });
    if (!req.file) return res.status(400).json({ ok: false, message: "请选择图片" });
    res.json({ ok: true, data: { url: `/static/uploads/${req.file.filename}` } });
  });
});

router.post("/trips", authUser, (req, res) => {
  const user = db().prepare("SELECT * FROM users WHERE id=?").get(req.userId);
  const b = req.body || {};
  const title = String(b.title || "").trim();
  if (!title) return res.status(400).json({ ok: false, message: "请填写线路标题" });
  if (!b.startDate) return res.status(400).json({ ok: false, message: "请选择出发日期" });
  const bus = db().prepare("SELECT * FROM bus_types WHERE id=?").get(b.busTypeId);
  if (!bus) return res.status(400).json({ ok: false, message: "请选择车型" });
  const days = String(b.days) === "multi" ? 5 : Number(b.days) || 1;
  const city = b.city || "北京";
  const playTagIds = Array.isArray(b.playTagIds) ? b.playTagIds.map(Number).filter((n) => n > 0) : [];
  const tagNames = tagsForIds(playTagIds, req).map((t) => t.name);
  const originPrice = Number(b.originPrice || b.price || 0);
  if (originPrice < 0) return res.status(400).json({ ok: false, message: "价格不正确" });
  const memberPrice = liveMemberPrice(originPrice);
  const type = b.organizerType === "company" ? "company" : "individual";
  if (type === "company" && !(b.companyName || user.company_name)) {
    return res.status(400).json({ ok: false, message: "公司开团请填写公司名称" });
  }
  const cover = b.cover || "";
  const routeInfo = db()
    .prepare(
      `INSERT INTO routes (code,title,subtitle,days,distance_km,difficulty,category,region,season,tags_json,cover,gallery_json,min_group_size,description,highlights_json,itinerary_json,fee_include,fee_exclude,equipment,notices,meetup_json,status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      `U${Date.now()}`,
      title,
      b.subtitle || "",
      days,
      Number(b.distanceKm) || 0,
      b.difficulty || "休闲",
      tagNames[0] || b.category || "山水",
      city,
      b.season || "四季",
      JSON.stringify(tagNames),
      cover,
      JSON.stringify(cover ? [cover] : []),
      Number(b.minGroupSize) || 10,
      b.description || "",
      JSON.stringify(b.highlights || []),
      JSON.stringify(b.itinerary || []),
      b.feeInclude || "",
      b.feeExclude || "",
      b.equipment || "",
      b.notices || "",
      JSON.stringify(b.meetupPoint ? [{ id: "custom", name: b.meetupPoint }] : []),
      "pending"
    );
  const routeId = Number(routeInfo.lastInsertRowid);
  db()
    .prepare("INSERT INTO route_price_tiers (route_id,min_people,max_people,price,member_price) VALUES (?,?,?,?,?)")
    .run(routeId, 10, null, originPrice || 0, memberPrice || 0);
  db().prepare("INSERT INTO route_buses (route_id, bus_type_id) VALUES (?,?)").run(routeId, bus.id);
  const route = db().prepare("SELECT * FROM routes WHERE id=?").get(routeId);
  const end = dayjs(b.startDate).add(days - 1, "day").format("YYYY-MM-DD");
  const schInfo = db()
    .prepare(
      `INSERT INTO schedules (route_id,start_date,end_date,organizer_type,organizer_id,organizer_name,company_name,bus_type_id,min_group_size,max_seats,meetup_point,meetup_time,status,share_token,notes)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      routeId,
      b.startDate,
      end,
      type,
      user.id,
      user.nickname,
      b.companyName || user.company_name,
      bus.id,
      Number(b.minGroupSize) || 10,
      bus.seats,
      b.meetupPoint || "",
      b.meetupTime || "07:30",
      "recruiting",
      nanoid(10),
      b.notes || ""
    );
  applyScheduleExtras(
    schInfo.lastInsertRowid,
    {
      offerType: b.offerType,
      offerPrice: b.offerType === "free" ? 0 : b.offerPrice,
      playTagIds,
      city,
      channel: b.channel,
      memberPriceOn: b.memberPriceOn,
      studentPriceOn: b.studentPriceOn,
      reviewStatus: "pending",
    },
    route
  );
  const sch = db().prepare("SELECT * FROM schedules WHERE id=?").get(schInfo.lastInsertRowid);
  res.json({ ok: true, data: { ...scheduleView(sch, req), message: "已提交，待管理员审核后才会出现在首页" } });
});

router.post("/enroll", authUser, (req, res) => {
  try {
    const {
      scheduleId,
      travelerName,
      travelerPhone,
      idCard,
      travelerType,
      seatNo,
      insuranceCode,
      emergencyName,
      emergencyPhone,
      waiverAccepted,
      healthOk,
      referrerCode,
      autoAlt,
      fallbackScheduleIds,
      couponCode,
      joinMode,
    } = req.body || {};
    const data = enrollUser({
      userId: req.userId,
      scheduleId,
      travelerName,
      travelerPhone,
      idCard,
      travelerType,
      seatNo,
      insuranceCode,
      emergencyName,
      emergencyPhone,
      waiverAccepted,
      healthOk,
      referrerCode: referrerCode || req.query.ref,
      autoAlt,
      fallbackScheduleIds,
      couponCode: couponCode || req.query.coupon,
      joinMode,
    });
    res.json({ ok: true, data });
  } catch (e) {
    res.status(e.status || 500).json({ ok: false, message: e.message });
  }
});

router.post("/pay/for-enrollment", authUser, (req, res) => {
  try {
    const enrollmentId = Number((req.body || {}).enrollmentId);
    const data = payEnrollment(enrollmentId, req.userId);
    res.json({ ok: true, data });
  } catch (e) {
    res.status(e.status || 500).json({ ok: false, message: e.message });
  }
});

router.post("/pay/mock-success", authUser, (req, res) => {
  const { tradeNo, enrollmentId, scene } = req.body || {};
  if (scene === "member") {
    return res.json({ ok: true, data: userPublic(grantMembership(req.userId), req) });
  }
  const pay = db().prepare("SELECT * FROM payments WHERE trade_no=? OR enrollment_id=?").get(tradeNo || "", enrollmentId || 0);
  if (!pay) return res.status(400).json({ ok: false, message: "支付单不存在" });
  db().prepare("UPDATE payments SET status='success' WHERE id=?").run(pay.id);
  const en = db().prepare("SELECT * FROM enrollments WHERE id=?").get(pay.enrollment_id);
  db().prepare("UPDATE enrollments SET pay_status='paid', pay_channel='wechat' WHERE id=?").run(en.id);
  if (en.points_used) addPoints(en.user_id, -en.points_used, "积分抵现", "enrollment", en.id);
  const earn = Math.floor(pay.amount * (isMember(db().prepare("SELECT * FROM users WHERE id=?").get(en.user_id)) ? config.member.pointsBonus : 1));
  addPoints(en.user_id, earn, "参加活动积分", "enrollment", en.id);
  maybeMatchGuide(en.schedule_id);
  res.json({ ok: true, data: { enrollmentId: en.id, payStatus: "paid" } });
});

router.post("/pay/company-settle", authUser, (req, res) => {
  const { scheduleId } = req.body || {};
  const sch = db().prepare("SELECT * FROM schedules WHERE id=?").get(scheduleId);
  if (!sch) return res.status(400).json({ ok: false, message: "排期不存在" });
  if (sch.status === "cancelled") return res.status(400).json({ ok: false, message: "该拼团已解散" });
  if (sch.organizer_id !== req.userId) return res.status(403).json({ ok: false, message: "仅开团公司可统一支付" });
  const pending = db().prepare("SELECT * FROM enrollments WHERE schedule_id=? AND pay_status='company_pending' AND status='joined'").all(sch.id);
  const quote = quoteForSchedule(sch, enrolledCount(sch.id), null);
  let total = 0;
  for (const en of pending) {
    const amount = quote.originPrice + Number(en.insurance_fee || 0);
    total += amount;
    db().prepare("UPDATE enrollments SET pay_status='paid', pay_amount=?, pay_channel='wechat_company' WHERE id=?").run(amount, en.id);
    db().prepare("INSERT INTO payments (enrollment_id,user_id,schedule_id,amount,channel,status,trade_no,remark) VALUES (?,?,?,?,?,?,?,?)").run(
      en.id,
      req.userId,
      sch.id,
      amount,
      "wechat",
      "success",
      `CO${Date.now()}${en.id}`,
      "公司统一微信支付"
    );
  }
  let splits = null;
  try {
    splits = createSplitsForSchedule(sch.id, { remark: "公司统一支付后分账" });
  } catch (e) {
    if (e.status !== 400) throw e;
  }
  res.json({ ok: true, data: { count: pending.length, total, price: quote.originPrice, splits: splits?.splits || [] } });
});

router.get("/orders", authUser, (req, res) => {
  const reviewed = reviewedScheduleIds(req.userId);
  const rows = db()
    .prepare(
      `SELECT e.*, s.start_date, s.end_date, s.organizer_type, s.status AS schedule_status, s.route_id, r.title, r.cover, r.days
       FROM enrollments e JOIN schedules s ON s.id=e.schedule_id JOIN routes r ON r.id=s.route_id
       WHERE e.user_id=? ORDER BY e.id DESC`
    )
    .all(req.userId)
    .map((e) => ({
      ...e,
      cover: attachAssetHost(req, e.cover),
      idCard: maskIdCard(e.id_card),
      canCancel: canCancelEnrollment(e, e.schedule_status, e.start_date),
      reviewed: reviewed.has(e.schedule_id),
      canReview: e.status === "joined" && !reviewed.has(e.schedule_id),
    }));
  res.json({ ok: true, data: rows });
});

router.post("/orders/:id/cancel", authUser, (req, res) => {
  try {
    const data = cancelEnrollment(Number(req.params.id), req.userId);
    res.json({ ok: true, data });
  } catch (e) {
    res.status(e.status || 500).json({ ok: false, message: e.message });
  }
});

router.get("/schedules/:id/demographics", optionalUser, (req, res) => {
  const list = db().prepare("SELECT * FROM enrollments WHERE schedule_id=? AND status='joined'").all(req.params.id);
  res.json({ ok: true, data: buildDemographics(list) });
});

router.post("/member/buy", authUser, (req, res) => {
  const tradeNo = `M${dayjs().format("YYYYMMDDHHmmss")}${req.userId}`;
  db().prepare("INSERT INTO payments (enrollment_id,user_id,schedule_id,amount,channel,status,trade_no,remark) VALUES (0,?,0,?,?,?,?,?)").run(
    req.userId,
    config.member.annualFee,
    "wechat",
    "success",
    tradeNo,
    "会员年费"
  );
  const user = grantMembership(req.userId);
  res.json({
    ok: true,
    data: {
      tradeNo,
      amount: config.member.annualFee,
      user: userPublic(user, req),
    },
  });
});

router.get("/points", authUser, (req, res) => {
  const list = db().prepare("SELECT * FROM points_ledger WHERE user_id=? ORDER BY id DESC LIMIT 50").all(req.userId);
  const user = db().prepare("SELECT points FROM users WHERE id=?").get(req.userId);
  res.json({ ok: true, data: { points: user.points, list } });
});

router.post("/favorites/:routeId", authUser, (req, res) => {
  db().prepare("INSERT OR IGNORE INTO favorites (user_id,route_id) VALUES (?,?)").run(req.userId, req.params.routeId);
  res.json({ ok: true });
});

router.delete("/favorites/:routeId", authUser, (req, res) => {
  db().prepare("DELETE FROM favorites WHERE user_id=? AND route_id=?").run(req.userId, req.params.routeId);
  res.json({ ok: true });
});

router.get("/favorites", authUser, (req, res) => {
  const rows = db()
    .prepare("SELECT r.* FROM favorites f JOIN routes r ON r.id=f.route_id WHERE f.user_id=?")
    .all(req.userId)
    .map((r) => mapRoute(r, req));
  res.json({ ok: true, data: rows });
});

router.get("/routes/:id/reviews", (req, res) => {
  const row = db().prepare("SELECT id FROM routes WHERE id=?").get(req.params.id);
  if (!row) return res.status(404).json({ ok: false, message: "线路不存在" });
  res.json({ ok: true, data: listReviews({ routeId: row.id }) });
});

router.get("/schedules/:id/reviews", (req, res) => {
  const sch = db().prepare("SELECT id FROM schedules WHERE id=?").get(req.params.id);
  if (!sch) return res.status(404).json({ ok: false, message: "排期不存在" });
  res.json({ ok: true, data: listReviews({ scheduleId: sch.id }) });
});

router.post("/reviews", authUser, (req, res) => {
  try {
    const data = createReview(req.userId, req.body || {});
    res.json({ ok: true, data });
  } catch (e) {
    res.status(e.status || 500).json({ ok: false, message: e.message });
  }
});

function publicGuide(g, req) {
  if (!g) return null;
  return { ...publicGuideCard(g, req), phone: g.phone, status: g.status };
}

router.post("/guide/login", (req, res) => {
  const { phone, captchaToken, captcha } = req.body || {};
  if (!consumeCaptcha(captchaToken, captcha)) return res.status(400).json({ ok: false, message: "验证码错误或已过期" });
  const guide = db().prepare("SELECT * FROM guides WHERE phone=?").get(phone);
  if (!guide || guide.status === "off") return res.status(400).json({ ok: false, message: "未找到导游账号" });
  res.json({ ok: true, data: { token: signGuide(guide), ...publicGuide(guide, req) } });
});

router.get("/guide/me", authGuide, (req, res) => {
  res.json({ ok: true, data: publicGuide(req.guide, req) });
});

router.get("/guide/schedules", authGuide, (req, res) => {
  const rows = db()
    .prepare("SELECT * FROM schedules WHERE guide_id=? ORDER BY start_date")
    .all(req.guideId)
    .map((s) => scheduleView(s, req));
  res.json({ ok: true, data: rows });
});

router.get("/guide/schedules/:id", authGuide, (req, res) => {
  const sch = db().prepare("SELECT * FROM schedules WHERE id=? AND guide_id=?").get(req.params.id, req.guideId);
  if (!sch) return res.status(404).json({ ok: false, message: "未分配该团" });
  const roster = db()
    .prepare("SELECT * FROM enrollments WHERE schedule_id=? AND status='joined' ORDER BY id")
    .all(sch.id)
    .map((e) => guideRosterItem(e, req));
  res.json({ ok: true, data: { ...scheduleView(sch, req), roster } });
});

router.get("/guide/schedules/:id/travelers/:enrollmentId", authGuide, (req, res) => {
  const sch = ensureGuideSchedule(req, res);
  if (!sch) return;
  const en = db()
    .prepare("SELECT * FROM enrollments WHERE id=? AND schedule_id=? AND status='joined'")
    .get(req.params.enrollmentId, sch.id);
  if (!en) return res.status(404).json({ ok: false, message: "名单中没有该游客" });
  const user = en.user_id ? db().prepare("SELECT * FROM users WHERE id=? AND deleted_at IS NULL").get(en.user_id) : null;
  const routeRow = db().prepare("SELECT title FROM routes WHERE id=?").get(sch.route_id);
  res.json({
    ok: true,
    data: {
      ...guideRosterItem(en, req),
      profile: publicUserProfile(user, req),
      schedule: { id: sch.id, title: routeRow?.title || "", startDate: sch.start_date },
    },
  });
});

router.post("/guide/schedules/:id/checkin", authGuide, (req, res) => {
  const sch = db().prepare("SELECT * FROM schedules WHERE id=? AND guide_id=?").get(req.params.id, req.guideId);
  if (!sch) return res.status(404).json({ ok: false, message: "未分配该团" });
  const enrollmentId = Number((req.body || {}).enrollmentId);
  const en = db().prepare("SELECT * FROM enrollments WHERE id=? AND schedule_id=? AND status='joined'").get(enrollmentId, sch.id);
  if (!en) return res.status(400).json({ ok: false, message: "报名不存在或已取消" });
  db().prepare("UPDATE enrollments SET checkin_at=datetime('now','localtime'), checkin_by=? WHERE id=?").run(req.guideId, en.id);
  const updated = db().prepare("SELECT checkin_at FROM enrollments WHERE id=?").get(en.id);
  res.json({ ok: true, data: { enrollmentId: en.id, checkinAt: updated.checkin_at } });
});

function ensureGuideSchedule(req, res) {
  const sch = db().prepare("SELECT * FROM schedules WHERE id=? AND guide_id=?").get(req.params.id, req.guideId);
  if (!sch) {
    res.status(404).json({ ok: false, message: "未分配该团" });
    return null;
  }
  return sch;
}

function guideRosterItem(e, req) {
  const user = e.user_id ? db().prepare("SELECT * FROM users WHERE id=?").get(e.user_id) : null;
  const alive = user && !user.deleted_at;
  const stage = lifeStageFromPerson({ idCard: e.id_card, birthday: e.birthday || user?.birthday });
  return {
    id: e.id,
    userId: e.user_id || null,
    name: e.traveler_name,
    nickname: alive ? user.nickname || "" : "",
    avatar: alive ? attachAssetHost(req, user.avatar) || "" : "",
    phone: e.traveler_phone,
    gender: e.gender || (alive ? user.gender : "") || "",
    hometown: e.hometown || (alive ? user.hometown : "") || "",
    lifeStage: stage.label || "",
    seatNo: e.seat_no,
    payStatus: e.pay_status,
    insurance: e.insurance_code,
    emergencyName: e.emergency_name,
    emergencyPhone: e.emergency_phone,
    checkinAt: e.checkin_at,
    idCard: maskIdCard(e.id_card),
  };
}

router.put("/guide/schedules/:id/trip", authGuide, (req, res) => {
  if (!ensureGuideSchedule(req, res)) return;
  try {
    const sch = updateScheduleTrip(req.params.id, req.body || {});
    res.json({ ok: true, data: scheduleView(sch, req) });
  } catch (e) {
    res.status(e.status || 500).json({ ok: false, message: e.message });
  }
});

router.post("/guide/schedules/:id/seats/lock", authGuide, (req, res) => {
  if (!ensureGuideSchedule(req, res)) return;
  try {
    const b = req.body || {};
    const lockedSeats = Array.isArray(b.lockedSeats)
      ? setLockedSeats(req.params.id, b.lockedSeats)
      : toggleLockedSeat(req.params.id, b.seatNo, b.locked !== false);
    res.json({ ok: true, data: { lockedSeats, seats: scheduleSeats(req.params.id) } });
  } catch (e) {
    res.status(e.status || 500).json({ ok: false, message: e.message });
  }
});

router.post("/guide/schedules/:id/seats/assign", authGuide, (req, res) => {
  if (!ensureGuideSchedule(req, res)) return;
  try {
    const b = req.body || {};
    const data = assignSeat(req.params.id, Number(b.enrollmentId), b.seatNo);
    res.json({ ok: true, data });
  } catch (e) {
    res.status(e.status || 500).json({ ok: false, message: e.message });
  }
});

function staffAdminOnly(req, res) {
  if (req.adminRole !== "admin") {
    res.status(403).json({ ok: false, message: "仅管理员可管理后台账号" });
    return false;
  }
  return true;
}

function managedUser(id) {
  const user = db().prepare("SELECT * FROM users WHERE id=?").get(id);
  if (!user || user.deleted_at) return null;
  return user;
}

function adminUserView(user) {
  return {
    id: user.id,
    phone: user.phone,
    nickname: user.nickname,
    gender: user.gender,
    is_member: user.is_member,
    isMember: isMember(user),
    isStudent: isStudent(user),
    studentStatus: user.student_status || "",
    school: user.school || "",
    groupStatus: user.group_status || "",
    groupName: user.group_name || "",
    member_expire_at: user.member_expire_at,
    points: user.points,
    company_name: user.company_name,
    created_at: user.created_at,
  };
}

router.post("/admin/login", (req, res) => {
  const { username, password } = req.body || {};
  const admin = db().prepare("SELECT * FROM admin_users WHERE username=?").get(username);
  if (!admin || !bcrypt.compareSync(password || "", admin.password_hash)) {
    return res.status(400).json({ ok: false, message: "账号或密码错误" });
  }
  if ((admin.status || "on") === "off") {
    return res.status(400).json({ ok: false, message: "账号已停用" });
  }
  res.json({ ok: true, data: { token: signAdmin(admin), ...publicStaff(admin) } });
});

router.get("/admin/me", authAdmin, (req, res) => {
  res.json({ ok: true, data: publicStaff(getStaff(req.adminId)) });
});

router.put("/admin/me/password", authAdmin, (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body || {};
    res.json({ ok: true, data: changeOwnPassword(req.adminId, oldPassword, newPassword) });
  } catch (e) {
    res.status(e.status || 500).json({ ok: false, message: e.message });
  }
});

router.get("/admin/staff", authAdmin, (req, res) => {
  if (!staffAdminOnly(req, res)) return;
  res.json({ ok: true, data: listStaff() });
});

router.post("/admin/staff", authAdmin, (req, res) => {
  if (!staffAdminOnly(req, res)) return;
  try {
    res.json({ ok: true, data: createStaff(req.body || {}) });
  } catch (e) {
    res.status(e.status || 500).json({ ok: false, message: e.message });
  }
});

router.put("/admin/staff/:id", authAdmin, (req, res) => {
  if (!staffAdminOnly(req, res)) return;
  try {
    res.json({ ok: true, data: updateStaff(Number(req.params.id), req.body || {}, req.adminId) });
  } catch (e) {
    res.status(e.status || 500).json({ ok: false, message: e.message });
  }
});

router.delete("/admin/staff/:id", authAdmin, (req, res) => {
  if (!staffAdminOnly(req, res)) return;
  try {
    res.json({ ok: true, data: deleteStaff(Number(req.params.id), req.adminId) });
  } catch (e) {
    res.status(e.status || 500).json({ ok: false, message: e.message });
  }
});

router.get("/admin/dashboard", authAdmin, (req, res) => {
  const routeCount = db().prepare("SELECT COUNT(*) c FROM routes").get().c;
  const userCount = db().prepare("SELECT COUNT(*) c FROM users WHERE deleted_at IS NULL").get().c;
  const enrollCount = db().prepare("SELECT COUNT(*) c FROM enrollments WHERE status!='cancelled'").get().c;
  const revenue = db().prepare("SELECT IFNULL(SUM(pay_amount),0) s FROM enrollments WHERE pay_status='paid'").get().s;
  const pending = db().prepare("SELECT IFNULL(SUM(1),0) s FROM enrollments WHERE pay_status='company_pending' AND status='joined'").get().s;
  const byRoute = db()
    .prepare(
      `SELECT r.id, r.title, r.days, COUNT(e.id) AS people, IFNULL(SUM(CASE WHEN e.pay_status='paid' THEN e.pay_amount ELSE 0 END),0) AS revenue
       FROM routes r
       LEFT JOIN schedules s ON s.route_id=r.id
       LEFT JOIN enrollments e ON e.schedule_id=s.id AND e.status!='cancelled'
       GROUP BY r.id ORDER BY people DESC`
    )
    .all();
  const byDay = db()
    .prepare(
      `SELECT r.days, COUNT(e.id) people, IFNULL(SUM(CASE WHEN e.pay_status='paid' THEN e.pay_amount ELSE 0 END),0) revenue
       FROM routes r LEFT JOIN schedules s ON s.route_id=r.id
       LEFT JOIN enrollments e ON e.schedule_id=s.id AND e.status!='cancelled'
       GROUP BY r.days ORDER BY r.days`
    )
    .all();
  res.json({ ok: true, data: { routeCount, userCount, enrollCount, revenue, pending, byRoute, byDay } });
});

router.post("/admin/upload", authAdmin, (req, res) => {
  uploadImage.single("file")(req, res, (err) => {
    if (err) {
      const message = err.code === "LIMIT_FILE_SIZE" ? "图片不能超过 5MB" : err.message || "上传失败";
      return res.status(400).json({ ok: false, message });
    }
    if (!req.file) return res.status(400).json({ ok: false, message: "请选择图片" });
    res.json({ ok: true, data: { url: `/static/uploads/${req.file.filename}` } });
  });
});

router.get("/admin/play-tags", authAdmin, (req, res) => {
  res.json({ ok: true, data: db().prepare("SELECT * FROM play_tags ORDER BY sort_order, id").all().map((t) => mapPlayTag(t, req)) });
});

router.post("/admin/play-tags", authAdmin, (req, res) => {
  const b = req.body || {};
  const name = String(b.name || "").trim();
  if (!name) return res.status(400).json({ ok: false, message: "请填写标签名" });
  const info = db()
    .prepare("INSERT INTO play_tags (name, color, cover, sort_order, status) VALUES (?,?,?,?,?)")
    .run(name, b.color || randomTagColor(), b.cover || "", Number(b.sortOrder) || 99, "on");
  res.json({ ok: true, data: mapPlayTag(db().prepare("SELECT * FROM play_tags WHERE id=?").get(info.lastInsertRowid), req) });
});

router.put("/admin/play-tags/:id", authAdmin, (req, res) => {
  const row = db().prepare("SELECT * FROM play_tags WHERE id=?").get(req.params.id);
  if (!row) return res.status(404).json({ ok: false, message: "标签不存在" });
  const b = req.body || {};
  db()
    .prepare("UPDATE play_tags SET name=?, color=?, cover=?, sort_order=?, status=? WHERE id=?")
    .run(b.name || row.name, b.color || row.color, b.cover == null ? row.cover : b.cover, b.sortOrder == null ? row.sort_order : b.sortOrder, b.status || row.status, row.id);
  res.json({ ok: true, data: mapPlayTag(db().prepare("SELECT * FROM play_tags WHERE id=?").get(row.id), req) });
});

router.delete("/admin/play-tags/:id", authAdmin, (req, res) => {
  db().prepare("UPDATE play_tags SET status='off' WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

router.get("/admin/routes", authAdmin, (req, res) => {
  const rows = db()
    .prepare("SELECT * FROM routes ORDER BY id")
    .all()
    .map((r) => {
      const tiers = db().prepare("SELECT * FROM route_price_tiers WHERE route_id=? ORDER BY min_people").all(r.id);
      return mapRoute(r, req, { priceTiers: tiers });
    });
  res.json({ ok: true, data: rows });
});

router.post("/admin/routes", authAdmin, (req, res) => {
  const b = req.body || {};
  const info = db()
    .prepare(
      `INSERT INTO routes (code,title,subtitle,days,distance_km,difficulty,category,region,season,tags_json,cover,gallery_json,min_group_size,description,highlights_json,itinerary_json,fee_include,fee_exclude,equipment,notices,meetup_json,status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      b.code || `R${Date.now()}`,
      b.title,
      b.subtitle || "",
      b.days || 1,
      b.distanceKm || 0,
      b.difficulty || "休闲",
      b.category || "山水",
      b.region || "北京周边",
      b.season || "四季",
      JSON.stringify(b.tags || []),
      b.cover || "",
      JSON.stringify(b.gallery || []),
      b.minGroupSize || 10,
      b.description || "",
      JSON.stringify(b.highlights || []),
      JSON.stringify(b.itinerary || []),
      b.feeInclude || "",
      b.feeExclude || "",
      b.equipment || "",
      b.notices || "",
      JSON.stringify(b.meetupPoints || []),
      b.status || "on"
    );
  const id = Number(info.lastInsertRowid);
  (b.priceTiers || []).forEach((t) => {
    db().prepare("INSERT INTO route_price_tiers (route_id,min_people,max_people,price,member_price) VALUES (?,?,?,?,?)").run(id, t.minPeople, t.maxPeople || null, t.price, t.memberPrice || t.price);
  });
  (b.buses || []).forEach((busId) => db().prepare("INSERT INTO route_buses (route_id,bus_type_id) VALUES (?,?)").run(id, busId));
  res.json({ ok: true, data: { id } });
});

router.put("/admin/routes/:id", authAdmin, (req, res) => {
  const b = req.body || {};
  const id = req.params.id;
  db().prepare(
    `UPDATE routes SET title=?, subtitle=?, days=?, distance_km=?, difficulty=?, category=?, region=?, season=?, tags_json=?, cover=?, gallery_json=?, min_group_size=?, description=?, highlights_json=?, itinerary_json=?, fee_include=?, fee_exclude=?, equipment=?, notices=?, meetup_json=?, status=? WHERE id=?`
  ).run(
    b.title,
    b.subtitle,
    b.days,
    b.distanceKm,
    b.difficulty,
    b.category,
    b.region,
    b.season,
    JSON.stringify(b.tags || []),
    b.cover,
    JSON.stringify(b.gallery || []),
    b.minGroupSize,
    b.description,
    JSON.stringify(b.highlights || []),
    JSON.stringify(b.itinerary || []),
    b.feeInclude,
    b.feeExclude,
    b.equipment,
    b.notices,
    JSON.stringify(b.meetupPoints || []),
    b.status || "on",
    id
  );
  if (b.priceTiers) {
    db().prepare("DELETE FROM route_price_tiers WHERE route_id=?").run(id);
    b.priceTiers.forEach((t) => {
      db().prepare("INSERT INTO route_price_tiers (route_id,min_people,max_people,price,member_price) VALUES (?,?,?,?,?)").run(id, t.minPeople, t.maxPeople || null, t.price, t.memberPrice || t.price);
    });
  }
  if (b.buses) {
    db().prepare("DELETE FROM route_buses WHERE route_id=?").run(id);
    b.buses.forEach((busId) => db().prepare("INSERT INTO route_buses (route_id,bus_type_id) VALUES (?,?)").run(id, busId));
  }
  res.json({ ok: true });
});

router.delete("/admin/routes/:id", authAdmin, (req, res) => {
  db().prepare("UPDATE routes SET status='off' WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

router.post("/admin/schedules", authAdmin, (req, res) => {
  const admin = db().prepare("SELECT * FROM admin_users WHERE id=?").get(req.adminId);
  const { routeId, startDate, organizerType, busTypeId, minGroupSize, meetupPoint, meetupTime, notes, companyName } = req.body || {};
  const route = db().prepare("SELECT * FROM routes WHERE id=?").get(routeId);
  if (!route) return res.status(400).json({ ok: false, message: "线路不存在" });
  if (!startDate) return res.status(400).json({ ok: false, message: "请选择出发日期" });
  const bus = db().prepare("SELECT * FROM bus_types WHERE id=?").get(busTypeId);
  if (!bus) return res.status(400).json({ ok: false, message: "请选择车型" });
  const type = organizerType === "company" ? "company" : "individual";
  const end = dayjs(startDate).add(route.days - 1, "day").format("YYYY-MM-DD");
  const info = db()
    .prepare(
      `INSERT INTO schedules (route_id,start_date,end_date,organizer_type,organizer_id,organizer_name,company_name,bus_type_id,min_group_size,max_seats,meetup_point,meetup_time,status,share_token,notes)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      route.id,
      startDate,
      end,
      type,
      0,
      admin.name,
      companyName || "",
      bus.id,
      minGroupSize || route.min_group_size,
      bus.seats,
      meetupPoint || "",
      meetupTime || "07:30",
      "recruiting",
      nanoid(10),
      notes || ""
    );
  applyScheduleExtras(info.lastInsertRowid, { ...(req.body || {}), reviewStatus: "approved" }, route);
  const createdId = info.lastInsertRowid;
  const virtualRaw = (req.body || {}).virtualCount;
  let virtual = null;
  if (virtualRaw != null && virtualRaw !== "" && Number(virtualRaw) > 0) {
    try {
      virtual = setVirtualUsersForSchedule(createdId, virtualRaw);
    } catch (e) {
      const view = scheduleView(db().prepare("SELECT * FROM schedules WHERE id=?").get(createdId), req);
      return res.status(e.status || 400).json({
        ok: false,
        message: `拼团已发布，但虚拟报名未写入：${e.message}`,
        data: view,
      });
    }
  }
  const view = scheduleView(db().prepare("SELECT * FROM schedules WHERE id=?").get(createdId), req);
  res.json({
    ok: true,
    data: view,
    message: virtual ? `已发布，并设置 ${virtual.count} 名虚拟报名` : undefined,
  });
});

router.get("/admin/schedules", authAdmin, (req, res) => {
  const rows = db().prepare("SELECT * FROM schedules ORDER BY start_date DESC").all().map((s) => scheduleView(s, req));
  res.json({ ok: true, data: rows });
});

router.post("/admin/schedules/dissolve-all", authAdmin, (req, res) => {
  try {
    const data = dissolveAllSchedules({
      reason: (req.body || {}).reason,
      actorId: req.adminId,
    });
    res.json({ ok: true, data });
  } catch (e) {
    res.status(e.status || 500).json({ ok: false, message: e.message });
  }
});

router.post("/admin/schedules/:id/review", authAdmin, (req, res) => {
  const sch = db().prepare("SELECT * FROM schedules WHERE id=?").get(req.params.id);
  if (!sch) return res.status(404).json({ ok: false, message: "排期不存在" });
  const status = (req.body || {}).status === "rejected" ? "rejected" : "approved";
  db().prepare("UPDATE schedules SET review_status=? WHERE id=?").run(status, sch.id);
  if (status === "approved") {
    db().prepare("UPDATE routes SET status='on' WHERE id=? AND status='pending'").run(sch.route_id);
  }
  res.json({ ok: true, data: scheduleView(db().prepare("SELECT * FROM schedules WHERE id=?").get(sch.id), req) });
});

router.post("/admin/schedules/:id/dissolve", authAdmin, dissolveHandler("admin"));

router.put("/admin/schedules/:id/cost", authAdmin, (req, res) => {
  const b = req.body || {};
  db().prepare(
    "UPDATE schedules SET cost_transport=?, cost_ticket=?, cost_hotel=?, cost_meal=?, cost_guide=?, cost_other=? WHERE id=?"
  ).run(b.transport || 0, b.ticket || 0, b.hotel || 0, b.meal || 0, b.guide || 0, b.other || 0, req.params.id);
  res.json({ ok: true, data: scheduleView(db().prepare("SELECT * FROM schedules WHERE id=?").get(req.params.id), req) });
});

router.put("/admin/schedules/:id/trip", authAdmin, (req, res) => {
  try {
    const exists = db().prepare("SELECT id FROM schedules WHERE id=?").get(req.params.id);
    if (!exists) return res.status(404).json({ ok: false, message: "排期不存在" });
    const sch = updateScheduleTrip(req.params.id, req.body || {});
    res.json({ ok: true, data: scheduleView(sch, req) });
  } catch (e) {
    res.status(e.status || 500).json({ ok: false, message: e.message });
  }
});

router.post("/admin/schedules/:id/seats/lock", authAdmin, (req, res) => {
  try {
    const exists = db().prepare("SELECT id FROM schedules WHERE id=?").get(req.params.id);
    if (!exists) return res.status(404).json({ ok: false, message: "排期不存在" });
    const b = req.body || {};
    const lockedSeats = Array.isArray(b.lockedSeats)
      ? setLockedSeats(req.params.id, b.lockedSeats)
      : toggleLockedSeat(req.params.id, b.seatNo, b.locked !== false);
    res.json({ ok: true, data: { lockedSeats, seats: scheduleSeats(req.params.id) } });
  } catch (e) {
    res.status(e.status || 500).json({ ok: false, message: e.message });
  }
});

router.post("/admin/schedules/:id/seats/assign", authAdmin, (req, res) => {
  try {
    const exists = db().prepare("SELECT id FROM schedules WHERE id=?").get(req.params.id);
    if (!exists) return res.status(404).json({ ok: false, message: "排期不存在" });
    const b = req.body || {};
    const data = assignSeat(req.params.id, Number(b.enrollmentId), b.seatNo);
    res.json({ ok: true, data });
  } catch (e) {
    res.status(e.status || 500).json({ ok: false, message: e.message });
  }
});

router.post("/admin/schedules/:id/settle", authAdmin, (req, res) => {
  const sch = db().prepare("SELECT * FROM schedules WHERE id=?").get(req.params.id);
  if (!sch) return res.status(400).json({ ok: false, message: "排期不存在" });
  if (sch.status === "cancelled") return res.status(400).json({ ok: false, message: "该拼团已解散" });
  const pending = db().prepare("SELECT * FROM enrollments WHERE schedule_id=? AND pay_status='company_pending' AND status='joined'").all(sch.id);
  const quote = quoteForSchedule(sch, enrolledCount(sch.id), null);
  for (const en of pending) {
    const amount = quote.originPrice + Number(en.insurance_fee || 0);
    db().prepare("UPDATE enrollments SET pay_status='paid', pay_amount=?, pay_channel='wechat_company' WHERE id=?").run(amount, en.id);
  }
  maybeMatchGuide(sch.id);
  let splits = null;
  try {
    splits = createSplitsForSchedule(sch.id, { remark: "后台结算后分账" });
  } catch (e) {
    if (e.status !== 400) throw e;
  }
  res.json({ ok: true, data: { count: pending.length, price: quote.originPrice, splits: splits?.splits || [] } });
});

router.get("/admin/schedules/:id/splits", authAdmin, (req, res) => {
  res.json({ ok: true, data: listSplits(req.params.id) });
});

router.post("/admin/schedules/:id/split", authAdmin, (req, res) => {
  try {
    const data = createSplitsForSchedule(req.params.id, { remark: "后台发起分账" });
    res.json({ ok: true, data });
  } catch (e) {
    res.status(e.status || 500).json({ ok: false, message: e.message });
  }
});

router.get("/admin/coupons", authAdmin, (req, res) => {
  res.json({ ok: true, data: listAdmin(req.query.scheduleId || req.query.schedule_id) });
});

router.post("/admin/coupons", authAdmin, (req, res) => {
  try {
    const data = createCampaign(req.body || {});
    res.json({ ok: true, data });
  } catch (e) {
    res.status(e.status || 500).json({ ok: false, message: e.message });
  }
});

router.get("/admin/coupons/:id", authAdmin, async (req, res) => {
  try {
    const data = adminDetail(req.params.id, req);
    data.share = await sharePayload(loadCampaign(req.params.id), req);
    delete data.req;
    res.json({ ok: true, data });
  } catch (e) {
    res.status(e.status || 500).json({ ok: false, message: e.message });
  }
});

router.put("/admin/coupons/:id", authAdmin, (req, res) => {
  try {
    const data = updateCampaign(req.params.id, req.body || {});
    res.json({ ok: true, data });
  } catch (e) {
    res.status(e.status || 500).json({ ok: false, message: e.message });
  }
});

router.post("/admin/coupons/:id/grant", authAdmin, (req, res) => {
  try {
    const data = grantCoupons(req.params.id, req.body || {}, req);
    res.json({ ok: true, data, message: `已发放 ${data.granted} 张` });
  } catch (e) {
    res.status(e.status || 500).json({ ok: false, message: e.message });
  }
});

router.get("/admin/enrollments", authAdmin, (req, res) => {
  const { scheduleId, payStatus, status, q } = req.query;
  let sql = `SELECT e.*, s.start_date, r.title FROM enrollments e JOIN schedules s ON s.id=e.schedule_id JOIN routes r ON r.id=s.route_id WHERE 1=1`;
  const args = [];
  if (scheduleId) {
    sql += " AND e.schedule_id=?";
    args.push(scheduleId);
  }
  if (payStatus) {
    sql += " AND e.pay_status=?";
    args.push(payStatus);
  }
  if (status) {
    sql += " AND e.status=?";
    args.push(status);
  }
  if (q) {
    sql += " AND (e.traveler_name LIKE ? OR e.traveler_phone LIKE ? OR r.title LIKE ?)";
    const like = `%${String(q).trim()}%`;
    args.push(like, like, like);
  }
  sql += " ORDER BY e.id DESC";
  const rows = db().prepare(sql).all(...args).map((e) => ({ ...e, id_card: maskIdCard(e.id_card) }));
  res.json({ ok: true, data: rows });
});

router.post("/admin/enrollments/:id/cancel", authAdmin, (req, res) => {
  try {
    const data = cancelEnrollment(Number(req.params.id), 0, { admin: true, force: true });
    res.json({ ok: true, data });
  } catch (e) {
    res.status(e.status || 500).json({ ok: false, message: e.message });
  }
});

router.get("/admin/users", authAdmin, (req, res) => {
  const q = String(req.query.q || "").trim();
  let sql =
    "SELECT id,phone,nickname,gender,is_member,member_expire_at,points,company_name,created_at,IFNULL(is_virtual,0) AS is_virtual,student_status,school,group_status,group_name FROM users WHERE deleted_at IS NULL";
  const args = [];
  if (q) {
    sql += " AND (IFNULL(phone,'') LIKE ? OR IFNULL(nickname,'') LIKE ? OR IFNULL(company_name,'') LIKE ?)";
    const like = `%${q}%`;
    args.push(like, like, like);
  }
  sql += " ORDER BY id DESC";
  const rows = db()
    .prepare(sql)
    .all(...args)
    .map((u) => ({
      ...u,
      isMember: isMember(u),
      isStudent: isStudent(u),
      studentStatus: u.student_status || "",
      groupStatus: u.group_status || "",
      groupName: u.group_name || "",
      isVirtual: !!u.is_virtual,
    }));
  res.json({ ok: true, data: rows });
});

function virtualUsersHandler(req, res) {
  try {
    const body = req.body || {};
    const scheduleId = req.params.id || body.scheduleId || body.schedule_id;
    const data = generateVirtualUsers({ scheduleId, count: body.count });
    const extra = data.capped ? `（座位上限 ${data.maxVirtual}，已按可报名人数截取）` : "";
    res.json({ ok: true, data, message: `已将本团虚拟报名设为 ${data.count} 人${extra}` });
  } catch (e) {
    res.status(e.status || 500).json({ ok: false, message: e.message });
  }
}

router.post("/admin/virtual-users", authAdmin, virtualUsersHandler);
router.post("/admin/schedules/:id/virtual-users", authAdmin, virtualUsersHandler);

router.post("/admin/users/:id/verify", authAdmin, (req, res) => {
  const user = managedUser(req.params.id);
  if (!user) return res.status(404).json({ ok: false, message: "用户不存在" });
  const kind = (req.body || {}).kind;
  const action = (req.body || {}).action || "approve";
  if (kind === "student") {
    if (action === "approve") db().prepare("UPDATE users SET student_status='approved', is_student=1 WHERE id=?").run(user.id);
    else db().prepare("UPDATE users SET student_status='rejected', is_student=0 WHERE id=?").run(user.id);
  } else if (kind === "group") {
    if (action === "approve") db().prepare("UPDATE users SET group_status='approved' WHERE id=?").run(user.id);
    else db().prepare("UPDATE users SET group_status='rejected' WHERE id=?").run(user.id);
  } else {
    return res.status(400).json({ ok: false, message: "请选择学生或团体认证" });
  }
  const next = db().prepare("SELECT * FROM users WHERE id=?").get(user.id);
  res.json({ ok: true, data: adminUserView(next) });
});

router.post("/admin/users/:id/member", authAdmin, (req, res) => {
  const user = managedUser(req.params.id);
  if (!user) return res.status(404).json({ ok: false, message: "用户不存在" });
  const action = (req.body || {}).action || "grant";
  if (action === "revoke") {
    db().prepare("UPDATE users SET is_member=0, member_expire_at=NULL WHERE id=?").run(user.id);
  } else if (action === "grant") {
    grantMembership(user.id);
  } else {
    return res.status(400).json({ ok: false, message: "操作无效" });
  }
  const next = db().prepare("SELECT * FROM users WHERE id=?").get(user.id);
  res.json({ ok: true, data: adminUserView(next) });
});

router.post("/admin/users/:id/points", authAdmin, (req, res) => {
  const user = managedUser(req.params.id);
  if (!user) return res.status(404).json({ ok: false, message: "用户不存在" });
  const delta = Number((req.body || {}).delta);
  const reason = String((req.body || {}).reason || "").trim();
  if (!Number.isInteger(delta) || delta === 0) {
    return res.status(400).json({ ok: false, message: "请填写非零整数积分" });
  }
  if (!reason) return res.status(400).json({ ok: false, message: "请填写调整原因" });
  if ((user.points || 0) + delta < 0) return res.status(400).json({ ok: false, message: "积分不足" });
  addPoints(user.id, delta, reason, "admin", req.adminId);
  const next = db().prepare("SELECT * FROM users WHERE id=?").get(user.id);
  res.json({ ok: true, data: adminUserView(next) });
});

router.post("/admin/users/:id/close", authAdmin, (req, res) => {
  try {
    deleteAccount(Number(req.params.id));
    res.json({ ok: true, data: { deleted: true } });
  } catch (e) {
    res.status(e.status || 500).json({ ok: false, message: e.message });
  }
});

router.get("/admin/schedules/:id/demographics", authAdmin, (req, res) => {
  const list = db().prepare("SELECT * FROM enrollments WHERE schedule_id=? AND status='joined'").all(req.params.id);
  res.json({ ok: true, data: buildDemographics(list) });
});

module.exports = router;
