const dayjs = require("dayjs");
const { getDb } = require("../db");
const { parseIdCard } = require("./idcard");
const { calcPayable } = require("./biz");
const { addPoints, enrolledCount, waitlistCount, quoteForSchedule, maybeMatchGuide } = require("./helpers");
const { sendSms } = require("./sms");
const { assertSeatAvailable, firstFreeSeat } = require("./seats");
const { kickVirtualSeat, trimVirtuals } = require("./virtual");
const { findReferrer, recordEnrollReferral } = require("./referral");
const { setFallbacks } = require("./fallback");
const {
  resolveCouponForEnroll,
  decideCouponPrice,
  attachCouponToEnrollment,
  redeemHeldForEnrollment,
  releaseCouponByEnrollment,
} = require("./coupons");
const config = require("../config");
const { assertComboEnroll, parseComboWant } = require("./combo");
const { assertEnrollLimit } = require("./eligibility");
const { resolveSupplies } = require("./supplies");

function fail(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

function pickInsurance(code) {
  const plans = config.insurance.plans;
  return plans.find((p) => p.code === (code || "none")) || plans[0];
}

function truthy(v) {
  return v === true || v === 1 || v === "true" || v === "1" || v === "on";
}

function enrollUser({
  userId,
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
  comboWant,
  supplies,
}) {
  const db = getDb();
  const user = db.prepare("SELECT * FROM users WHERE id=?").get(userId);
  if (!user) fail(401, "请先登录");
  const sch = db.prepare("SELECT * FROM schedules WHERE id=?").get(scheduleId);
  if (!sch) fail(400, "排期不存在");
  if (sch.status === "cancelled") fail(400, "该拼团已解散，无法报名");
  if ((sch.review_status || "approved") !== "approved") fail(400, "该团正在审核或未通过，暂不能报名");
  assertEnrollLimit(user, sch);
  assertComboEnroll(user, sch);
  const combo = sch.offer_type === "combo" ? parseComboWant(comboWant) : null;
  if (!travelerName || !travelerPhone) fail(400, "请填写出行人姓名和手机");
  if (!idCard) fail(400, "请填写身份证号，用于实名与籍贯统计");
  const parsed = parseIdCard(idCard);
  if (!parsed.valid) fail(400, parsed.error || "身份证号不正确");
  if (!emergencyName || !emergencyPhone) fail(400, "请填写紧急联系人姓名和手机");
  if (!/^1\d{10}$/.test(String(emergencyPhone))) fail(400, "紧急联系人手机号不正确");
  if (String(emergencyPhone) === String(travelerPhone)) fail(400, "紧急联系人不能与出行人使用同一手机号");
  if (!truthy(waiverAccepted)) fail(400, "请阅读并确认户外活动风险告知");
  if (!truthy(healthOk)) fail(400, "请确认本人健康状况适合本次活动");
  const exist = db
    .prepare("SELECT id FROM enrollments WHERE schedule_id=? AND upper(id_card)=? AND status!='cancelled'")
    .get(sch.id, parsed.idCard);
  if (exist) fail(400, "该身份证已在本团报名");

  const occupied = enrolledCount(sch.id);
  let waitlisted = occupied >= Number(sch.max_seats);
  let seat = null;
  if (waitlisted) {
    if (kickVirtualSeat(sch.id)) {
      waitlisted = false;
    } else {
      seat = null;
    }
  }
  if (!waitlisted) {
    if (seatNo) {
      try {
        seat = assertSeatAvailable(sch.id, sch.max_seats, seatNo);
      } catch (e) {
        if (kickVirtualSeat(sch.id)) seat = assertSeatAvailable(sch.id, sch.max_seats, seatNo);
        else throw e;
      }
    } else {
      seat = firstFreeSeat(sch.id, sch.max_seats);
      if (!seat && kickVirtualSeat(sch.id)) seat = firstFreeSeat(sch.id, sch.max_seats);
      if (!seat) waitlisted = true;
    }
  }
  const referrer = findReferrer(referrerCode);
  const referrerId = referrer && Number(referrer.id) !== Number(user.id) ? referrer.id : null;
  const quote = quoteForSchedule(sch, Math.max(waitlisted ? occupied : occupied + 1, 1), user);
  const company = sch.organizer_type === "company";
  const couponPack = couponCode
    ? resolveCouponForEnroll({ userId: user.id, couponCode, scheduleId: sch.id, company })
    : null;
  const couponDecision = couponPack
    ? decideCouponPrice({ quote, user, campaign: couponPack.campaign, waitlisted })
    : { applyCoupon: false, giftWouldApply: false, tripPrice: quote.tripPrice, memberPay: quote.price, couponPay: quote.price, reason: "" };
  const role = ["assistant", "photographer"].includes(String(joinMode || "")) ? String(joinMode) : "chain";
  const roleWaive = role !== "chain";
  const billed = roleWaive ? 0 : couponDecision.applyCoupon ? couponDecision.couponPay : Number(quote.price || 0);
  const payable =
    billed <= 0
      ? { price: 0, offsetYuan: 0, pointsUsed: 0, payAmount: 0 }
      : calcPayable({
          basePrice: billed,
          memberPrice: billed,
          isMember: false,
          points: 0,
          pointsConfig: config.points,
        });
  const insurance = pickInsurance(insuranceCode);
  const supply = resolveSupplies(supplies);
  let tripPay = payable.payAmount;
  let giftApplied = false;
  const memberTripPay = Number(quote.price || 0);
  if (
    !company &&
    !waitlisted &&
    quote.isMember &&
    Number(user.member_gift_left || 0) > 0 &&
    memberTripPay > 0 &&
    memberTripPay <= Number(config.member.giftMaxPrice || 100)
  ) {
    tripPay = 0;
    giftApplied = true;
    db.prepare("UPDATE users SET member_gift_left=member_gift_left-1 WHERE id=?").run(user.id);
  }
  const couponApplied = !!(couponPack && couponDecision.applyCoupon && !giftApplied);
  const payAmount = company ? 0 : tripPay + insurance.fee + supply.fee;
  const payStatus = company ? "company_pending" : payAmount === 0 ? "paid" : "unpaid";
  const status = waitlisted ? "waitlist" : "joined";
  const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
  const info = db
    .prepare(
      `INSERT INTO enrollments (schedule_id,user_id,traveler_name,traveler_phone,id_card,gender,birthday,hometown,traveler_type,pay_status,pay_amount,points_used,pay_channel,join_mode,status,waitlisted_at,seat_no,insurance_code,insurance_fee,emergency_name,emergency_phone,waiver_accepted_at,health_declared_at,referrer_user_id,auto_alt,combo_json,supplies_json,supplies_fee)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      sch.id,
      user.id,
      travelerName,
      travelerPhone,
      parsed.idCard,
      parsed.gender,
      parsed.birthday,
      parsed.hometown,
      travelerType || "adult",
      payStatus,
      payAmount,
      0,
      "",
      role,
      status,
      waitlisted ? now : null,
      seat,
      insurance.code,
      insurance.fee,
      String(emergencyName).trim(),
      String(emergencyPhone).trim(),
      now,
      now,
      referrerId,
      autoAlt ? 1 : 0,
      combo ? JSON.stringify(combo) : null,
      supply.items.length ? JSON.stringify(supply.items) : null,
      supply.fee
    );
  const enrollmentId = Number(info.lastInsertRowid);
  if (couponApplied) {
    attachCouponToEnrollment(couponPack.coupon.id, enrollmentId, waitlisted);
  }
  if (!waitlisted) {
    maybeMatchGuide(sch.id);
    trimVirtuals(sch.id);
  }
  if (referrerId && !waitlisted) recordEnrollReferral(referrerId, enrollmentId, payAmount);
  if (fallbackScheduleIds && fallbackScheduleIds.length) {
    try {
      setFallbacks(enrollmentId, user.id, { scheduleIds: fallbackScheduleIds, autoAlt });
    } catch {
      /* ignore invalid ids */
    }
  }
  const position = waitlisted ? waitlistCount(sch.id) : 0;
  return {
    enrollmentId,
    payStatus,
    status,
    waitlisted,
    waitlistPosition: position,
    seatNo: seat,
    insurance,
    supplies: supply,
    quote: {
      ...payable,
      payAmount,
      insuranceFee: insurance.fee,
      suppliesFee: supply.fee,
      giftApplied,
      originPrice: quote.originPrice,
      tripPrice: quote.tripPrice,
      couponApplied,
      couponSkipReason: couponPack && !couponApplied ? couponDecision.reason : "",
    },
    needPay: false,
    message: waitlisted
      ? `本车已满，已加入候补（第 ${position} 位），有人取消后自动递补`
      : company
        ? "已加入公司团，费用由公司统一支付"
        : roleWaive
          ? role === "photographer"
            ? "已报名摄影师，免个人团费"
            : "已报名辅助领队，免个人团费"
          : giftApplied
            ? "已用会员赠送名额占座，本团免费"
            : "已报名占座，费用待出行前支付",
  };
}

function promoteWaitlist(scheduleId) {
  const db = getDb();
  const sch = db.prepare("SELECT * FROM schedules WHERE id=?").get(scheduleId);
  if (!sch || sch.status === "cancelled") return null;
  if (enrolledCount(scheduleId) >= Number(sch.max_seats)) return null;
  const next = db
    .prepare("SELECT * FROM enrollments WHERE schedule_id=? AND status='waitlist' ORDER BY id LIMIT 1")
    .get(scheduleId);
  if (!next) return null;
  const seat = firstFreeSeat(scheduleId, sch.max_seats);
  db.prepare("UPDATE enrollments SET status='joined', promoted_at=datetime('now','localtime'), seat_no=? WHERE id=?").run(
    seat,
    next.id
  );
  redeemHeldForEnrollment(next.id);
  maybeMatchGuide(scheduleId);
  const route = db.prepare("SELECT title FROM routes WHERE id=?").get(sch.route_id);
  sendSms({
    phone: next.traveler_phone,
    scene: "waitlist",
    content: `【北野行】您候补的「${route?.title || "活动"}」${sch.start_date}已有空位，已为您递补占座。请留意集合通知。`,
    refType: "enrollment",
    refId: next.id,
  });
  return { enrollmentId: next.id, userId: next.user_id };
}

function cancelEnrollment(enrollmentId, userId, options = {}) {
  const db = getDb();
  const en = db.prepare("SELECT * FROM enrollments WHERE id=?").get(enrollmentId);
  if (!en) fail(404, "报名不存在");
  if (!options.admin && Number(en.user_id) !== Number(userId)) fail(403, "只能取消自己的报名");
  if (en.status === "cancelled") fail(400, "该报名已取消");

  const sch = db.prepare("SELECT * FROM schedules WHERE id=?").get(en.schedule_id);
  if (!sch) fail(400, "排期不存在");
  if (sch.status === "cancelled" && !options.force) fail(400, "拼团已解散，报名已取消");
  if (!options.force && !options.admin && !dayjs(sch.start_date).isAfter(dayjs(), "day")) {
    fail(400, "出发当天及之后不可取消报名");
  }

  const paid = en.pay_status === "paid" && Number(en.pay_amount || 0) > 0;
  const nextPay = paid ? "refunded" : en.pay_status;
  const wasJoined = en.status === "joined";

  const run = db.transaction(() => {
    db.prepare("UPDATE enrollments SET status='cancelled', pay_status=? WHERE id=?").run(nextPay, en.id);
    releaseCouponByEnrollment(en.id);
    if (paid) {
      db.prepare(
        `INSERT INTO payments (enrollment_id,user_id,schedule_id,amount,channel,status,trade_no,remark) VALUES (?,?,?,?,?,?,?,?)`
      ).run(
        en.id,
        en.user_id,
        sch.id,
        en.pay_amount,
        en.pay_channel || "wechat",
        "refunded",
        `C${Date.now()}${en.id}`,
        options.admin ? "后台取消报名退款" : "用户取消报名退款"
      );
      if (en.points_used) addPoints(en.user_id, en.points_used, "取消报名退还积分", "enrollment", en.id);
    }
    const n = enrolledCount(sch.id);
    if (n < sch.min_group_size && sch.guide_id) {
      db.prepare("UPDATE guides SET status='idle' WHERE id=? AND status='assigned'").run(sch.guide_id);
      db.prepare("UPDATE schedules SET guide_id=NULL, status='recruiting' WHERE id=?").run(sch.id);
    }
  });
  run();

  const promoted = wasJoined ? promoteWaitlist(sch.id) : null;

  return {
    enrollmentId: en.id,
    status: "cancelled",
    payStatus: nextPay,
    refunded: paid,
    refundAmount: paid ? Number(en.pay_amount) : 0,
    promoted: promoted ? { enrollmentId: promoted.enrollmentId } : null,
  };
}

function canCancelEnrollment(en, scheduleStatus, startDate) {
  return (
    en.status !== "cancelled" &&
    scheduleStatus !== "cancelled" &&
    dayjs(startDate).isAfter(dayjs(), "day")
  );
}

module.exports = { enrollUser, promoteWaitlist, cancelEnrollment, canCancelEnrollment };
