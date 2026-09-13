const { getDb } = require("../db");
const { addPoints, isMember, quoteForSchedule, enrolledCount, maybeMatchGuide } = require("./helpers");
const { grantMembership } = require("./member");
const config = require("../config");
const {
  payLive,
  yuanToFen,
  unifiedOrder,
  queryOrder,
  jsapiPayParams,
  xmlToObj,
  verifySign,
  notifyReply,
  code2session,
} = require("./wechat");

function fail(status, message, extra) {
  const err = new Error(message);
  err.status = status;
  if (extra) err.extra = extra;
  throw err;
}

function newTradeNo(prefix, userId) {
  return `${prefix}${Date.now()}${userId}`.slice(0, 32);
}

function pendingOf({ userId, enrollmentId, scene }) {
  const db = getDb();
  if (scene === "member") {
    return db
      .prepare("SELECT * FROM payments WHERE user_id=? AND scene='member' AND status='pending' ORDER BY id DESC LIMIT 1")
      .get(userId);
  }
  return db
    .prepare(
      "SELECT * FROM payments WHERE enrollment_id=? AND user_id=? AND scene='enrollment' AND status='pending' ORDER BY id DESC LIMIT 1"
    )
    .get(enrollmentId, userId);
}

function insertPending({ enrollmentId, userId, scheduleId, amount, scene, remark, tradeNo }) {
  const db = getDb();
  const info = db
    .prepare(
      "INSERT INTO payments (enrollment_id,user_id,schedule_id,amount,channel,status,trade_no,remark,scene) VALUES (?,?,?,?,?,?,?,?,?)"
    )
    .run(enrollmentId || 0, userId, scheduleId || 0, amount, "wechat", "pending", tradeNo, remark || "", scene);
  return db.prepare("SELECT * FROM payments WHERE id=?").get(info.lastInsertRowid);
}

function applyWechatSession(userId, sess) {
  const db = getDb();
  const taken = db.prepare("SELECT id FROM users WHERE wechat_openid=? AND deleted_at IS NULL").get(sess.openid);
  if (taken && Number(taken.id) !== Number(userId)) fail(400, "该微信已绑定其他账号");
  const me = db.prepare("SELECT wechat_openid, wechat_unionid FROM users WHERE id=?").get(userId);
  if (me.wechat_openid && me.wechat_openid !== sess.openid) fail(400, "当前账号已绑定其他微信");
  db.prepare("UPDATE users SET wechat_openid=?, wechat_unionid=? WHERE id=?").run(
    sess.openid,
    sess.unionid || me.wechat_unionid || "",
    userId
  );
}

async function ensurePayerWechat(userId, code) {
  if (code) {
    const sess = await code2session(code);
    if (sess.errcode) fail(400, sess.errmsg || "微信登录失败");
    if (!sess.openid) fail(400, "微信登录失败");
    applyWechatSession(userId, sess);
  }
  const user = getDb().prepare("SELECT * FROM users WHERE id=?").get(userId);
  if (payLive() && (!user || !user.wechat_openid)) fail(400, "请先用微信登录后再支付", { needWechat: true });
  return user;
}

function payerOpenid(userId) {
  const user = getDb().prepare("SELECT * FROM users WHERE id=?").get(userId);
  if (!user || !user.wechat_openid) fail(400, "请先用微信登录后再支付", { needWechat: true });
  return user;
}

async function jsapiCharge({ userId, amount, body, tradeNo, clientIp, paymentId }) {
  const user = payerOpenid(userId);
  const prepayId = await unifiedOrder({
    openid: user.wechat_openid,
    tradeNo,
    amountFen: yuanToFen(amount),
    body,
    clientIp,
  });
  getDb().prepare("UPDATE payments SET wechat_prepay_id=? WHERE id=?").run(prepayId, paymentId);
  return {
    needPay: true,
    mock: false,
    tradeNo,
    amount,
    wechatPay: jsapiPayParams(prepayId),
  };
}

function completeEnrollmentPay(en, payerId, amount, opts = {}) {
  const db = getDb();
  const proxy = Number(payerId) !== Number(en.user_id);
  db.prepare("UPDATE enrollments SET pay_status='paid', pay_channel='wechat' WHERE id=?").run(en.id);
  const tradeNo = opts.tradeNo || newTradeNo("P", payerId);
  if (opts.paymentId) {
    db.prepare("UPDATE payments SET status='success' WHERE id=?").run(opts.paymentId);
  } else {
    db.prepare(
      "INSERT INTO payments (enrollment_id,user_id,schedule_id,amount,channel,status,trade_no,remark,scene) VALUES (?,?,?,?,?,?,?,?,?)"
    ).run(en.id, payerId, en.schedule_id, amount, "wechat", "success", tradeNo, proxy ? "行程页代付" : "行程页支付", "enrollment");
  }
  const traveler = db.prepare("SELECT * FROM users WHERE id=?").get(en.user_id);
  const earn = Math.floor(amount * (isMember(traveler) ? config.member.pointsBonus : 1));
  if (earn > 0 && en.user_id) addPoints(en.user_id, earn, "参加活动积分", "enrollment", en.id);
  maybeMatchGuide(en.schedule_id);
  return {
    enrollmentId: en.id,
    payStatus: "paid",
    amount,
    proxy,
    tradeNo,
    needPay: false,
    mock: true,
  };
}

async function payEnrollment(enrollmentId, payerId, opts = {}) {
  const db = getDb();
  const en = db.prepare("SELECT * FROM enrollments WHERE id=?").get(enrollmentId);
  if (!en) fail(404, "报名不存在");
  if (en.status !== "joined") fail(400, "候补或已取消的报名不能支付");
  if (en.pay_status === "paid") fail(400, "该报名已支付");
  if (en.pay_status === "company_pending") fail(400, "公司团请由开团方统一支付");
  if (en.pay_status === "refunded") fail(400, "该报名已退款");
  const sch = db.prepare("SELECT * FROM schedules WHERE id=?").get(en.schedule_id);
  if (!sch || sch.status === "cancelled") fail(400, "该拼团已解散");
  const amount = Number(en.pay_amount || 0) || quoteForSchedule(sch, enrolledCount(sch.id), null).originPrice;
  await ensurePayerWechat(payerId, opts.code);
  if (config.wechat.mock || amount <= 0) {
    return completeEnrollmentPay(en, payerId, amount);
  }
  if (!payLive()) fail(400, "未配置微信支付密钥，无法收款");
  const pending = pendingOf({ userId: payerId, enrollmentId: en.id, scene: "enrollment" });
  const row =
    pending ||
    insertPending({
      enrollmentId: en.id,
      userId: payerId,
      scheduleId: sch.id,
      amount,
      scene: "enrollment",
      remark: Number(payerId) !== Number(en.user_id) ? "行程页代付" : "行程页支付",
      tradeNo: newTradeNo("P", payerId),
    });
  const charged = await jsapiCharge({
    userId: payerId,
    amount,
    body: "同行者众-团费",
    tradeNo: row.trade_no,
    clientIp: opts.clientIp,
    paymentId: row.id,
  });
  return { ...charged, enrollmentId: en.id, payStatus: "unpaid", proxy: Number(payerId) !== Number(en.user_id) };
}

async function buyMembership(userId, opts = {}) {
  const amount = config.member.annualFee;
  await ensurePayerWechat(userId, opts.code);
  if (config.wechat.mock) {
    const tradeNo = newTradeNo("M", userId);
    getDb()
      .prepare(
        "INSERT INTO payments (enrollment_id,user_id,schedule_id,amount,channel,status,trade_no,remark,scene) VALUES (0,?,0,?,?,?,?,?,?)"
      )
      .run(userId, amount, "wechat", "success", tradeNo, "会员年费", "member");
    const user = grantMembership(userId);
    return { tradeNo, amount, needPay: false, mock: true, user };
  }
  if (!payLive()) fail(400, "未配置微信支付密钥，无法收款");
  const pending = pendingOf({ userId, scene: "member" });
  const row =
    pending ||
    insertPending({
      userId,
      amount,
      scene: "member",
      remark: "会员年费",
      tradeNo: newTradeNo("M", userId),
    });
  const charged = await jsapiCharge({
    userId,
    amount,
    body: "同行者众-会员年费",
    tradeNo: row.trade_no,
    clientIp: opts.clientIp,
    paymentId: row.id,
  });
  return { ...charged, user: getDb().prepare("SELECT * FROM users WHERE id=?").get(userId) };
}

function settleByTradeNo(tradeNo) {
  const db = getDb();
  const pay = db.prepare("SELECT * FROM payments WHERE trade_no=?").get(tradeNo);
  if (!pay) fail(400, "支付单不存在");
  if (pay.status === "success") {
    return { already: true, pay };
  }
  const scene = pay.scene || (pay.remark === "会员年费" ? "member" : "enrollment");
  if (scene === "member") {
    db.prepare("UPDATE payments SET status='success' WHERE id=?").run(pay.id);
    grantMembership(pay.user_id);
    return { already: false, pay: db.prepare("SELECT * FROM payments WHERE id=?").get(pay.id), scene: "member" };
  }
  const en = db.prepare("SELECT * FROM enrollments WHERE id=?").get(pay.enrollment_id);
  if (!en) fail(400, "报名不存在");
  if (en.pay_status === "paid") {
    db.prepare("UPDATE payments SET status='success' WHERE id=?").run(pay.id);
    return { already: true, pay, scene: "enrollment" };
  }
  completeEnrollmentPay(en, pay.user_id, pay.amount, { paymentId: pay.id, tradeNo: pay.trade_no });
  return { already: false, pay: db.prepare("SELECT * FROM payments WHERE id=?").get(pay.id), scene: "enrollment" };
}

function handleWechatNotify(xml) {
  const data = xmlToObj(xml);
  if (!verifySign(data, config.wechat.mchKey)) return notifyReply(false, "签名失败");
  if (data.return_code !== "SUCCESS" || data.result_code !== "SUCCESS") return notifyReply(false, data.return_msg || "FAIL");
  if (data.mch_id && data.mch_id !== String(config.wechat.mchId)) return notifyReply(false, "商户号不匹配");
  if (!data.out_trade_no) return notifyReply(false, "缺少订单号");
  try {
    settleByTradeNo(data.out_trade_no);
  } catch {
    return notifyReply(false, "处理失败");
  }
  return notifyReply(true, "OK");
}

async function confirmTrade(tradeNo) {
  if (!tradeNo) fail(400, "缺少订单号");
  const db = getDb();
  const pay = db.prepare("SELECT * FROM payments WHERE trade_no=?").get(tradeNo);
  if (!pay) fail(400, "支付单不存在");
  if (pay.status !== "success") {
    if (!payLive()) fail(400, "当前为演示支付");
    const data = await queryOrder(tradeNo);
    if (data.trade_state !== "SUCCESS") fail(400, "尚未支付完成");
    settleByTradeNo(tradeNo);
  }
  const next = db.prepare("SELECT * FROM payments WHERE trade_no=?").get(tradeNo);
  const user = db.prepare("SELECT * FROM users WHERE id=?").get(next.user_id);
  const en = next.enrollment_id ? db.prepare("SELECT * FROM enrollments WHERE id=?").get(next.enrollment_id) : null;
  return {
    payStatus: en ? en.pay_status : next.status === "success" ? "paid" : "unpaid",
    tradeNo,
    scene: next.scene || "",
    already: pay.status === "success",
    user,
    enrollmentId: next.enrollment_id || 0,
  };
}

module.exports = {
  payEnrollment,
  buyMembership,
  settleByTradeNo,
  handleWechatNotify,
  confirmTrade,
  completeEnrollmentPay,
  applyWechatSession,
  ensurePayerWechat,
};
