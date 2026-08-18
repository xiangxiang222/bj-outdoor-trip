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
const { signUser, signAdmin, authUser, optionalUser, authAdmin } = require("./middleware/auth");
const { parseIdCard, maskIdCard } = require("./services/idcard");
const { pickTier, calcPayable, buildDemographics, maskName } = require("./services/biz");
const { code2session } = require("./services/wechat");
const { dissolveSchedule, dissolveAllSchedules } = require("./services/dissolve");
const { enrollUser, cancelEnrollment, canCancelEnrollment } = require("./services/enroll");
const { scheduleSeats } = require("./services/seats");
const { deleteAccount } = require("./services/account");
const { createCaptcha, codesMatch } = require("./services/captcha");
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
  enrolledCount,
  waitlistCount,
  loadRouteBundle,
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
    points: u.points,
    companyName: u.company_name,
    role: u.role,
    idCardMasked: maskIdCard(u.id_card),
  };
}

function grantMembership(userId) {
  const user = db().prepare("SELECT * FROM users WHERE id=?").get(userId);
  const expire = dayjs(user.member_expire_at).isAfter(dayjs()) ? dayjs(user.member_expire_at) : dayjs();
  const next = expire.add(config.member.durationDays, "day").format("YYYY-MM-DD");
  db().prepare("UPDATE users SET is_member=1, member_expire_at=? WHERE id=?").run(next, userId);
  addPoints(userId, config.member.annualFee, "开通会员赠送积分", "member", userId);
  return db().prepare("SELECT * FROM users WHERE id=?").get(userId);
}

function mapRoute(row, req, extra) {
  const r = toRoute(row, extra);
  r.cover = attachAssetHost(req, r.cover);
  r.gallery = (r.gallery || []).map((g) => attachAssetHost(req, g));
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
    priceTiers: extra.priceTiers,
    upcoming: extra.upcoming,
  };
}

function scheduleView(sch, req) {
  const route = db().prepare("SELECT * FROM routes WHERE id=?").get(sch.route_id);
  const bus = db().prepare("SELECT * FROM bus_types WHERE id=?").get(sch.bus_type_id);
  const guide = sch.guide_id ? db().prepare("SELECT id,name,years,specialties,rating,bio FROM guides WHERE id=?").get(sch.guide_id) : null;
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
  return {
    id: sch.id,
    routeId: sch.route_id,
    route: mapRoute(route, req),
    startDate: sch.start_date,
    endDate: sch.end_date,
    organizerType: sch.organizer_type,
    organizerId: sch.organizer_id,
    organizerName: sch.organizer_name,
    companyName: sch.company_name,
    bus,
    minGroupSize: sch.min_group_size,
    maxSeats: sch.max_seats,
    meetupPoint: sch.meetup_point,
    meetupTime: sch.meetup_time,
    status: sch.status,
    cancelReason: sch.cancel_reason || "",
    cancelledAt: sch.cancelled_at || "",
    cancelledBy: sch.cancelled_by || "",
    shareToken: sch.share_token,
    notes: sch.notes,
    enrolled,
    waitlistCount: waitlistCount(sch.id),
    remain: Math.max(0, sch.max_seats - live),
    quote,
    people,
    guide,
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
  };
}

router.get("/meta", (req, res) => {
  res.json({
    ok: true,
    data: {
      name: "北野行",
      slogan: "说走就走的京郊山野",
      smsDemoCode: config.demoSmsCode,
      wechatPayMock: config.wechat.mock,
      memberAnnualFee: config.member.annualFee,
      points: config.points,
      days: [1, 2, 3, 5],
    },
  });
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

router.delete("/me", authUser, (req, res) => {
  try {
    deleteAccount(req.userId);
    res.json({ ok: true, data: { deleted: true } });
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

router.get("/buses", (_req, res) => {
  res.json({ ok: true, data: db().prepare("SELECT * FROM bus_types ORDER BY sort_order").all() });
});

router.get("/guides", (_req, res) => {
  res.json({ ok: true, data: db().prepare("SELECT id,name,years,specialties,rating,bio,status FROM guides").all() });
});

router.get("/routes", (req, res) => {
  const { days, category, q, difficulty } = req.query;
  let sql = "SELECT * FROM routes WHERE status='on'";
  const args = [];
  if (days) {
    sql += " AND days=?";
    args.push(Number(days));
  }
  if (category) {
    sql += " AND category=?";
    args.push(category);
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
    const schedules = db().prepare("SELECT id,start_date,status FROM schedules WHERE route_id=? AND start_date>=date('now') AND status!='cancelled' ORDER BY start_date LIMIT 3").all(row.id);
    return mapRouteSummary(row, req, {
      fromPrice: tiers[0]?.price,
      memberFromPrice: tiers[0]?.member_price,
      priceTiers: tiers.map((t) => ({ minPeople: t.min_people, price: t.price, memberPrice: t.member_price })),
      upcoming: schedules,
    });
  });
  res.json({ ok: true, data });
});

router.get("/routes/:id", optionalUser, (req, res) => {
  const row = db().prepare("SELECT * FROM routes WHERE id=?").get(req.params.id);
  if (!row) return res.status(404).json({ ok: false, message: "线路不存在" });
  const bundle = loadRouteBundle(row.id);
  const schedules = db()
    .prepare("SELECT * FROM schedules WHERE route_id=? AND start_date>=date('now','-1 day') AND status!='cancelled' ORDER BY start_date")
    .all(row.id)
    .map((s) => scheduleView(s, req));
  let favored = false;
  if (req.userId) {
    favored = !!db().prepare("SELECT 1 FROM favorites WHERE user_id=? AND route_id=?").get(req.userId, row.id);
  }
  res.json({
    ok: true,
    data: mapRoute(row, req, {
      priceTiers: bundle.tiers.map((t) => ({ minPeople: t.min_people, maxPeople: t.max_people, price: t.price, memberPrice: t.member_price })),
      buses: bundle.buses,
      schedules,
      favored,
    }),
  });
});

router.get("/schedules", (req, res) => {
  const { routeId, organizerType } = req.query;
  let sql = "SELECT * FROM schedules WHERE start_date>=date('now','-1 day') AND status!='cancelled'";
  const args = [];
  if (routeId) {
    sql += " AND route_id=?";
    args.push(routeId);
  }
  if (organizerType) {
    sql += " AND organizer_type=?";
    args.push(organizerType);
  }
  sql += " ORDER BY start_date";
  res.json({ ok: true, data: db().prepare(sql).all(...args).map((s) => scheduleView(s, req)) });
});

router.get("/schedules/:id", optionalUser, (req, res) => {
  const sch = db().prepare("SELECT * FROM schedules WHERE id=?").get(req.params.id);
  if (!sch) return res.status(404).json({ ok: false, message: "排期不存在" });
  const includeCancelled = sch.status === "cancelled";
  const chainSql = includeCancelled
    ? "SELECT id,traveler_name,gender,pay_status,traveler_type,status,seat_no,created_at FROM enrollments WHERE schedule_id=? ORDER BY CASE status WHEN 'joined' THEN 0 WHEN 'waitlist' THEN 1 ELSE 2 END, id"
    : "SELECT id,traveler_name,gender,pay_status,traveler_type,status,seat_no,created_at FROM enrollments WHERE schedule_id=? AND status!='cancelled' ORDER BY CASE status WHEN 'joined' THEN 0 WHEN 'waitlist' THEN 1 ELSE 2 END, id";
  const chain = db()
    .prepare(chainSql)
    .all(sch.id)
    .map((e, i) => ({
      index: i + 1,
      name: maskName(e.traveler_name),
      gender: e.gender,
      payStatus: e.pay_status,
      travelerType: e.traveler_type,
      status: e.status,
      waitlisted: e.status === "waitlist",
      seatNo: e.seat_no || "",
      createdAt: e.created_at,
    }));
  res.json({
    ok: true,
    data: {
      ...scheduleView(sch, req),
      chain,
      isOrganizer: !!(req.userId && sch.organizer_id && Number(req.userId) === Number(sch.organizer_id)),
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
    userId: undefined,
  }));
  res.json({ ok: true, data });
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

router.post("/enroll", authUser, (req, res) => {
  try {
    const { scheduleId, travelerName, travelerPhone, idCard, travelerType, seatNo } = req.body || {};
    const data = enrollUser({
      userId: req.userId,
      scheduleId,
      travelerName,
      travelerPhone,
      idCard,
      travelerType,
      seatNo,
    });
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
    total += quote.originPrice;
    db().prepare("UPDATE enrollments SET pay_status='paid', pay_amount=?, pay_channel='wechat_company' WHERE id=?").run(quote.originPrice, en.id);
    db().prepare("INSERT INTO payments (enrollment_id,user_id,schedule_id,amount,channel,status,trade_no,remark) VALUES (?,?,?,?,?,?,?,?)").run(
      en.id,
      req.userId,
      sch.id,
      quote.originPrice,
      "wechat",
      "success",
      `CO${Date.now()}${en.id}`,
      "公司统一微信支付"
    );
  }
  res.json({ ok: true, data: { count: pending.length, total, price: quote.originPrice } });
});

router.get("/orders", authUser, (req, res) => {
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

router.post("/reviews", authUser, (req, res) => {
  const { scheduleId, rating, content } = req.body || {};
  db().prepare("INSERT INTO reviews (schedule_id,user_id,rating,content) VALUES (?,?,?,?)").run(scheduleId, req.userId, rating || 5, content || "");
  res.json({ ok: true });
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
  res.json({ ok: true, data: scheduleView(db().prepare("SELECT * FROM schedules WHERE id=?").get(info.lastInsertRowid), req) });
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

router.post("/admin/schedules/:id/dissolve", authAdmin, dissolveHandler("admin"));

router.put("/admin/schedules/:id/cost", authAdmin, (req, res) => {
  const b = req.body || {};
  db().prepare(
    "UPDATE schedules SET cost_transport=?, cost_ticket=?, cost_hotel=?, cost_meal=?, cost_guide=?, cost_other=? WHERE id=?"
  ).run(b.transport || 0, b.ticket || 0, b.hotel || 0, b.meal || 0, b.guide || 0, b.other || 0, req.params.id);
  res.json({ ok: true, data: scheduleView(db().prepare("SELECT * FROM schedules WHERE id=?").get(req.params.id), req) });
});

router.post("/admin/schedules/:id/settle", authAdmin, (req, res) => {
  const sch = db().prepare("SELECT * FROM schedules WHERE id=?").get(req.params.id);
  if (!sch) return res.status(400).json({ ok: false, message: "排期不存在" });
  if (sch.status === "cancelled") return res.status(400).json({ ok: false, message: "该拼团已解散" });
  const pending = db().prepare("SELECT * FROM enrollments WHERE schedule_id=? AND pay_status='company_pending' AND status='joined'").all(sch.id);
  const quote = quoteForSchedule(sch, enrolledCount(sch.id), null);
  for (const en of pending) {
    db().prepare("UPDATE enrollments SET pay_status='paid', pay_amount=?, pay_channel='wechat_company' WHERE id=?").run(quote.originPrice, en.id);
  }
  maybeMatchGuide(sch.id);
  res.json({ ok: true, data: { count: pending.length, price: quote.originPrice } });
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
    "SELECT id,phone,nickname,gender,is_member,member_expire_at,points,company_name,created_at FROM users WHERE deleted_at IS NULL";
  const args = [];
  if (q) {
    sql += " AND (IFNULL(phone,'') LIKE ? OR IFNULL(nickname,'') LIKE ? OR IFNULL(company_name,'') LIKE ?)";
    const like = `%${q}%`;
    args.push(like, like, like);
  }
  sql += " ORDER BY id DESC";
  const rows = db().prepare(sql).all(...args).map((u) => ({ ...u, isMember: isMember(u) }));
  res.json({ ok: true, data: rows });
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
