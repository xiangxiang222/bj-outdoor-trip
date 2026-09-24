const { getDb } = require("../db");
const { addPoints, isMember, quoteForSchedule, realEnrolledCount, maybeMatchGuide } = require("./helpers");
const { grantMembership } = require("./member");
const config = require("../config");
const {
  payLive,
  yuanToFen,
  unifiedOrder,
  queryOrder,
  refundOrder,
  jsapiPayParams,
  xmlToObj,
  verifySign,
  notifyReply,
  code2session,
} = require("./wechat");
const {
  expireStalePendings,
  remainingDue,
  remainingForPayer,
  parsePayYuan,
  remarkForPay,
  planPayerRefunds,
  enrollmentByPayToken,
  leftoverOf,
} = require("./pay-ledger");

function fail(status, message, extra) {
  const err = new Error(message);
  err.status = status;
  if (extra) err.extra = extra;
  throw err;
}

function newTradeNo(prefix, userId) {
  return `${prefix}${Date.now()}${userId}`.slice(0, 32);
}

function pendingOf({ userId, enrollmentId, scene, amount }) {
  const db = getDb();
  if (scene === "member" || scene === "wallet_topup") {
    const row = db
      .prepare("SELECT * FROM payments WHERE user_id=? AND scene=? AND status='pending' ORDER BY id DESC LIMIT 1")
      .get(userId, scene);
    if (!row) return null;
    if (amount != null && Number(row.amount) !== Number(amount)) {
      db.prepare("UPDATE payments SET status='cancelled' WHERE id=?").run(row.id);
      return null;
    }
    return row;
  }
  const row = db
    .prepare(
      "SELECT * FROM payments WHERE enrollment_id=? AND user_id=? AND IFNULL(scene,'enrollment')='enrollment' AND status='pending' ORDER BY id DESC LIMIT 1"
    )
    .get(enrollmentId, userId);
  if (!row) return null;
  if (amount != null && Number(row.amount) !== Number(amount)) {
    db.prepare("UPDATE payments SET status='cancelled' WHERE id=?").run(row.id);
    return null;
  }
  return row;
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

function stampTransaction(tradeNo, transactionId) {
  if (!tradeNo || !transactionId) return;
  getDb().prepare("UPDATE payments SET wechat_transaction_id=? WHERE trade_no=?").run(String(transactionId), String(tradeNo));
}

function applyEnrollmentCharge(en, payerId, amount, opts = {}) {
  const db = getDb();
  const due = remainingDue(en);
  const charged = Number(amount) || 0;
  const applied = Math.min(charged, Math.max(due, 0));
  const excess = Math.max(0, charged - applied);
  const proxy = Number(payerId) !== Number(en.user_id);
  const tradeNo = opts.tradeNo || newTradeNo("P", payerId);
  const remark =
    opts.remark ||
    remarkForPay({ payerId, enrolleeId: en.user_id, amount: applied || charged, remainingBefore: due || charged });
  const channel = opts.channel === "wallet" ? "wallet" : "wechat";
  if (opts.paymentId) {
    db.prepare("UPDATE payments SET status='success', remark=?, channel=? WHERE id=?").run(remark, channel, opts.paymentId);
  } else {
    db.prepare(
      "INSERT INTO payments (enrollment_id,user_id,schedule_id,amount,channel,status,trade_no,remark,scene) VALUES (?,?,?,?,?,?,?,?,?)"
    ).run(en.id, payerId, en.schedule_id, charged, channel, "success", tradeNo, remark, "enrollment");
  }
  const nextEn = db.prepare("SELECT * FROM enrollments WHERE id=?").get(en.id);
  if (remainingDue(nextEn) <= 0 && Number(nextEn.pay_amount || 0) >= 0 && nextEn.pay_status !== "refunded") {
    db.prepare("UPDATE enrollments SET pay_status='paid', pay_channel=? WHERE id=?").run(channel, en.id);
  }
  const traveler = db.prepare("SELECT * FROM users WHERE id=?").get(en.user_id);
  const earn = Math.floor(applied * (isMember(traveler) ? config.member.pointsBonus : 1));
  if (earn > 0 && en.user_id) addPoints(en.user_id, earn, "参加活动积分", "enrollment", en.id);
  maybeMatchGuide(en.schedule_id);
  const fresh = db.prepare("SELECT * FROM enrollments WHERE id=?").get(en.id);
  return {
    enrollmentId: en.id,
    payStatus: fresh.pay_status,
    amount: applied,
    charged,
    excess,
    proxy,
    tradeNo,
    remainAmount: remainingDue(fresh),
    needPay: false,
    mock: true,
    paymentId: opts.paymentId || 0,
  };
}

function completeEnrollmentPay(en, payerId, amount, opts = {}) {
  return applyEnrollmentCharge(en, payerId, amount, opts);
}

function recordRefundSlice(en, slice, refundNo, remark) {
  const db = getDb();
  const channel = slice.channel === "wallet" ? "wallet" : "wechat";
  if (slice.paymentId) {
    db.prepare("UPDATE payments SET refunded_amount=IFNULL(refunded_amount,0)+? WHERE id=?").run(slice.amount, slice.paymentId);
  }
  db.prepare(
    `INSERT INTO payments (enrollment_id,user_id,schedule_id,amount,channel,status,trade_no,remark,scene,refund_of) VALUES (?,?,?,?,?,?,?,?,?,?)`
  ).run(
    en.id,
    slice.userId,
    en.schedule_id,
    slice.amount,
    channel,
    "refunded",
    refundNo,
    remark,
    "enrollment",
    slice.paymentId || 0
  );
}

async function refundEnrollmentToPayers(en, { amount, remark } = {}) {
  const plan = planPayerRefunds(en, amount);
  const results = [];
  for (const slice of plan) {
    const refundNo = newTradeNo("RF", slice.userId);
    if (slice.channel === "wallet") {
      require("./wallet").credit(slice.userId, slice.amount, {
        reason: remark || "报名退款",
        scene: "refund",
        refType: "enrollment",
        refId: en.id,
      });
    } else if (payLive() && slice.tradeNo) {
      await refundOrder({
        tradeNo: slice.tradeNo,
        transactionId: slice.transactionId,
        refundNo,
        totalFen: yuanToFen(slice.chargeAmount),
        refundFen: yuanToFen(slice.amount),
      });
    }
    recordRefundSlice(en, slice, refundNo, remark || "原路退款");
    results.push({
      userId: slice.userId,
      amount: slice.amount,
      tradeNo: refundNo,
      originalTradeNo: slice.tradeNo || "",
    });
  }
  return results;
}

async function refundPaymentExcess(pay, excess, remark) {
  if (excess <= 0 || !pay) return null;
  const leftover = leftoverOf(pay);
  const amount = Math.min(excess, leftover);
  if (amount <= 0) return null;
  const refundNo = newTradeNo("RX", pay.user_id);
  if (pay.channel === "wallet") {
    require("./wallet").credit(pay.user_id, amount, {
      reason: remark || "超额退回钱包",
      scene: "refund",
      refType: "payment",
      refId: pay.id,
    });
  } else if (payLive() && pay.trade_no) {
    await refundOrder({
      tradeNo: pay.trade_no,
      transactionId: pay.wechat_transaction_id,
      refundNo,
      totalFen: yuanToFen(pay.amount),
      refundFen: yuanToFen(amount),
    });
  }
  const en = { id: pay.enrollment_id, schedule_id: pay.schedule_id, user_id: pay.user_id, pay_status: "unpaid", pay_amount: 0 };
  recordRefundSlice(
    en,
    { paymentId: pay.id, userId: pay.user_id, amount, tradeNo: pay.trade_no, chargeAmount: pay.amount, channel: pay.channel },
    refundNo,
    remark || "超额原路退回"
  );
  return { userId: pay.user_id, amount, tradeNo: refundNo };
}

function loadEnrollmentForPay(enrollmentId, token) {
  const db = getDb();
  const en = token ? enrollmentByPayToken(token) : db.prepare("SELECT * FROM enrollments WHERE id=?").get(enrollmentId);
  if (!en) fail(token ? 404 : 404, token ? "付款分享不存在或已失效" : "报名不存在");
  if (en.status !== "joined") fail(400, "候补或已取消的报名不能支付");
  if (en.pay_status === "paid") fail(400, "该报名已支付");
  if (en.pay_status === "company_pending") fail(400, "公司团请由开团方统一支付");
  if (en.pay_status === "refunded") fail(400, "该报名已退款");
  const sch = db.prepare("SELECT * FROM schedules WHERE id=?").get(en.schedule_id);
  if (!sch || sch.status === "cancelled") fail(400, "该拼团已解散");
  if (!Number(en.pay_amount || 0)) {
    en.pay_amount = quoteForSchedule(sch, Math.max(realEnrolledCount(sch.id), 1), null).originPrice;
  }
  expireStalePendings(en.id);
  return { en, sch };
}

async function payEnrollment(enrollmentId, payerId, opts = {}) {
  const { en, sch } = loadEnrollmentForPay(enrollmentId, opts.token);
  const remaining = remainingForPayer(en, payerId);
  if (remaining <= 0) fail(400, "该报名已支付或他人正在支付");
  const amount = parsePayYuan(opts.amount, remaining);
  if (amount <= 0) fail(400, "该报名已支付");
  const remark = remarkForPay({
    payerId,
    enrolleeId: en.user_id,
    amount,
    remainingBefore: remaining,
    channel: opts.channel,
  });
  if (String(opts.channel || "") === "wallet") {
    const { debit, balanceOf } = require("./wallet");
    const charged = getDb().transaction(() => {
      debit(payerId, amount, {
        reason: remark,
        scene: "enrollment_pay",
        refType: "enrollment",
        refId: en.id,
      });
      return applyEnrollmentCharge(en, payerId, amount, { remark, channel: "wallet" });
    })();
    return { ...charged, channel: "wallet", walletBalance: balanceOf(payerId) };
  }
  await ensurePayerWechat(payerId, opts.code);
  if (config.wechat.mock || amount <= 0) {
    return applyEnrollmentCharge(en, payerId, amount, { remark });
  }
  if (!payLive()) fail(400, "未配置微信支付密钥，无法收款");
  const pending = pendingOf({ userId: payerId, enrollmentId: en.id, scene: "enrollment", amount });
  const row =
    pending ||
    insertPending({
      enrollmentId: en.id,
      userId: payerId,
      scheduleId: sch.id,
      amount,
      scene: "enrollment",
      remark,
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
  const next = getDb().prepare("SELECT * FROM enrollments WHERE id=?").get(en.id);
  return {
    ...charged,
    enrollmentId: en.id,
    payStatus: next.pay_status,
    proxy: Number(payerId) !== Number(en.user_id),
    remainAmount: remainingDue(next),
  };
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

async function buyWalletTopup(userId, opts = {}) {
  const { parseYuan, credit, balanceOf } = require("./wallet");
  const amount = parseYuan(opts.amount, { min: 1, max: 5000 });
  await ensurePayerWechat(userId, opts.code);
  if (config.wechat.mock) {
    const tradeNo = newTradeNo("W", userId);
    const info = getDb()
      .prepare(
        "INSERT INTO payments (enrollment_id,user_id,schedule_id,amount,channel,status,trade_no,remark,scene) VALUES (0,?,0,?,?,?,?,?,?)"
      )
      .run(userId, amount, "wechat", "success", tradeNo, "钱包充值", "wallet_topup");
    credit(userId, amount, {
      reason: "钱包充值",
      scene: "topup",
      refType: "payment",
      refId: Number(info.lastInsertRowid),
    });
    const user = getDb().prepare("SELECT * FROM users WHERE id=?").get(userId);
    return { tradeNo, amount, needPay: false, mock: true, balance: balanceOf(userId), user };
  }
  if (!payLive()) fail(400, "未配置微信支付密钥，无法收款");
  const pending = pendingOf({ userId, scene: "wallet_topup", amount });
  const row =
    pending ||
    insertPending({
      userId,
      amount,
      scene: "wallet_topup",
      remark: "钱包充值",
      tradeNo: newTradeNo("W", userId),
    });
  if (row.wechat_prepay_id) {
    return {
      needPay: true,
      mock: false,
      tradeNo: row.trade_no,
      amount: row.amount,
      wechatPay: jsapiPayParams(row.wechat_prepay_id),
      user: getDb().prepare("SELECT * FROM users WHERE id=?").get(userId),
    };
  }
  const charged = await jsapiCharge({
    userId,
    amount,
    body: "同行者众-钱包充值",
    tradeNo: row.trade_no,
    clientIp: opts.clientIp,
    paymentId: row.id,
  });
  return { ...charged, user: getDb().prepare("SELECT * FROM users WHERE id=?").get(userId) };
}

async function settleByTradeNo(tradeNo, extra = {}) {
  const db = getDb();
  stampTransaction(tradeNo, extra.transactionId);
  const pay = db.prepare("SELECT * FROM payments WHERE trade_no=?").get(tradeNo);
  if (!pay) fail(400, "支付单不存在");
  if (pay.status === "success") {
    return { already: true, pay };
  }
  if (pay.status === "refunded" || pay.status === "cancelled") {
    return { already: true, pay };
  }
  const scene = pay.scene || (pay.remark === "会员年费" ? "member" : "enrollment");
  if (scene === "member") {
    db.prepare("UPDATE payments SET status='success' WHERE id=?").run(pay.id);
    grantMembership(pay.user_id);
    return { already: false, pay: db.prepare("SELECT * FROM payments WHERE id=?").get(pay.id), scene: "member" };
  }
  if (scene === "wallet_topup") {
    const { credit } = require("./wallet");
    db.prepare("UPDATE payments SET status='success' WHERE id=?").run(pay.id);
    credit(pay.user_id, pay.amount, {
      reason: "钱包充值",
      scene: "topup",
      refType: "payment",
      refId: pay.id,
    });
    return { already: false, pay: db.prepare("SELECT * FROM payments WHERE id=?").get(pay.id), scene: "wallet_topup" };
  }
  const en = db.prepare("SELECT * FROM enrollments WHERE id=?").get(pay.enrollment_id);
  if (!en) fail(400, "报名不存在");
  if (en.status === "cancelled" || en.pay_status === "refunded" || remainingDue(en) <= 0) {
    db.prepare("UPDATE payments SET status='success' WHERE id=?").run(pay.id);
    const fresh = db.prepare("SELECT * FROM payments WHERE id=?").get(pay.id);
    await refundPaymentExcess(fresh, Number(fresh.amount || 0), "报名已结束，原路退回");
    return { already: true, pay: db.prepare("SELECT * FROM payments WHERE id=?").get(pay.id), scene: "enrollment" };
  }
  const result = applyEnrollmentCharge(en, pay.user_id, pay.amount, { paymentId: pay.id, tradeNo: pay.trade_no, remark: pay.remark });
  if (result.excess > 0) {
    const fresh = db.prepare("SELECT * FROM payments WHERE id=?").get(pay.id);
    await refundPaymentExcess(fresh, result.excess, "超额原路退回");
  }
  return { already: false, pay: db.prepare("SELECT * FROM payments WHERE id=?").get(pay.id), scene: "enrollment" };
}

async function handleWechatNotify(xml) {
  const data = xmlToObj(xml);
  if (!verifySign(data, config.wechat.mchKey)) return notifyReply(false, "签名失败");
  if (data.return_code !== "SUCCESS" || data.result_code !== "SUCCESS") return notifyReply(false, data.return_msg || "FAIL");
  if (data.mch_id && data.mch_id !== String(config.wechat.mchId)) return notifyReply(false, "商户号不匹配");
  if (!data.out_trade_no) return notifyReply(false, "缺少订单号");
  try {
    await settleByTradeNo(data.out_trade_no, { transactionId: data.transaction_id });
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
    await settleByTradeNo(tradeNo, { transactionId: data.transaction_id });
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
    remainAmount: en ? remainingDue(en) : 0,
  };
}

module.exports = {
  payEnrollment,
  buyMembership,
  buyWalletTopup,
  settleByTradeNo,
  handleWechatNotify,
  confirmTrade,
  completeEnrollmentPay,
  applyEnrollmentCharge,
  refundEnrollmentToPayers,
  applyWechatSession,
  ensurePayerWechat,
};
