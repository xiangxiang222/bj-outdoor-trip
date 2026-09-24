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
  loginLive,
  uploadVirtualShipping,
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

function prepayReusable(row) {
  if (!row || !row.wechat_prepay_id) return false;
  const created = Date.parse(String(row.created_at || "").replace(" ", "T"));
  if (!Number.isFinite(created)) return true;
  return Date.now() - created < 110 * 60 * 1000;
}

async function placeJsapi(row, { userId, amount, body, clientIp, renew }) {
  if (prepayReusable(row)) {
    return {
      needPay: true,
      mock: false,
      tradeNo: row.trade_no,
      amount: row.amount,
      wechatPay: jsapiPayParams(row.wechat_prepay_id),
    };
  }
  let current = row;
  if (row.wechat_prepay_id) {
    getDb().prepare("UPDATE payments SET status='cancelled' WHERE id=? AND status='pending'").run(row.id);
    current = renew();
  }
  return jsapiCharge({
    userId,
    amount,
    body,
    tradeNo: current.trade_no,
    clientIp,
    paymentId: current.id,
  });
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
    } else if (slice.channel === "wechat" && payLive() && slice.tradeNo) {
      const orderTotal = getDb()
        .prepare(
          "SELECT IFNULL(SUM(amount),0) AS s FROM payments WHERE trade_no=? AND status='success' AND IFNULL(refund_of,0)=0 AND IFNULL(scene,'')!='company'"
        )
        .get(slice.tradeNo);
      const totalYuan = Number(orderTotal?.s || 0) || Number(slice.chargeAmount || 0);
      await refundOrder({
        tradeNo: slice.tradeNo,
        transactionId: slice.transactionId,
        refundNo,
        totalFen: yuanToFen(totalYuan),
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
  const charged = await placeJsapi(row, {
    userId: payerId,
    amount,
    body: "同行者众-团费",
    clientIp: opts.clientIp,
    renew: () =>
      insertPending({
        enrollmentId: en.id,
        userId: payerId,
        scheduleId: sch.id,
        amount,
        scene: "enrollment",
        remark,
        tradeNo: newTradeNo("P", payerId),
      }),
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
  const charged = await placeJsapi(row, {
    userId,
    amount,
    body: "同行者众-会员年费",
    clientIp: opts.clientIp,
    renew: () =>
      insertPending({
        userId,
        amount,
        scene: "member",
        remark: "会员年费",
        tradeNo: newTradeNo("M", userId),
      }),
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
  const charged = await placeJsapi(row, {
    userId,
    amount,
    body: "同行者众-钱包充值",
    clientIp: opts.clientIp,
    renew: () =>
      insertPending({
        userId,
        amount,
        scene: "wallet_topup",
        remark: "钱包充值",
        tradeNo: newTradeNo("W", userId),
      }),
  });
  return { ...charged, user: getDb().prepare("SELECT * FROM users WHERE id=?").get(userId) };
}

function applyCompanyShares(pay) {
  const db = getDb();
  let lines = [];
  try {
    lines = JSON.parse(pay.remark || "{}").lines || [];
  } catch {
    lines = [];
  }
  const sch = db.prepare("SELECT * FROM schedules WHERE id=?").get(pay.schedule_id);
  if (!sch || !lines.length) return;
  const channel = payLive() ? "wechat" : "company";
  const tx = db.transaction(() => {
    for (const line of lines) {
      const updated = db
        .prepare(
          "UPDATE enrollments SET pay_status='paid', pay_amount=?, pay_channel='wechat_company' WHERE id=? AND pay_status='company_pending'"
        )
        .run(line.amount, line.id);
      if (!updated.changes) continue;
      db.prepare(
        "INSERT INTO payments (enrollment_id,user_id,schedule_id,amount,channel,status,trade_no,remark,scene,wechat_transaction_id) VALUES (?,?,?,?,?,?,?,?,?,?)"
      ).run(
        line.id,
        line.userId,
        sch.id,
        line.amount,
        channel,
        "success",
        pay.trade_no,
        "公司统一支付",
        "company_share",
        pay.wechat_transaction_id || ""
      );
    }
  });
  tx();
  try {
    require("./split").createSplitsForSchedule(sch.id, { remark: "公司统一支付后分账" });
  } catch {
    /* 还没有实收时不分账 */
  }
  maybeMatchGuide(sch.id);
}

async function payCompanySchedule(userId, scheduleId, opts = {}) {
  const db = getDb();
  const sch = db.prepare("SELECT * FROM schedules WHERE id=?").get(scheduleId);
  if (!sch) fail(400, "排期不存在");
  if (sch.status === "cancelled") fail(400, "该拼团已解散");
  if (Number(sch.organizer_id) !== Number(userId)) fail(403, "仅开团公司可统一支付");
  const pending = db
    .prepare("SELECT * FROM enrollments WHERE schedule_id=? AND pay_status='company_pending' AND status='joined'")
    .all(sch.id);
  if (!pending.length) fail(400, "没有待统一支付的报名");
  const quote = quoteForSchedule(sch, Math.max(realEnrolledCount(sch.id), 1), null);
  const lines = pending.map((en) => ({
    id: en.id,
    userId: en.user_id,
    amount: quote.originPrice + Number(en.insurance_fee || 0) + Number(en.supplies_fee || 0),
  }));
  const total = lines.reduce((sum, line) => sum + line.amount, 0);
  const remark = JSON.stringify({ lines });
  if (config.wechat.mock) {
    const tradeNo = newTradeNo("CO", userId);
    applyCompanyShares({ remark, trade_no: tradeNo, schedule_id: sch.id, wechat_transaction_id: "" });
    return {
      count: lines.length,
      total,
      price: quote.originPrice,
      splits: require("./split").listSplits(sch.id),
      needPay: false,
      mock: true,
    };
  }
  await ensurePayerWechat(userId, opts.code);
  if (!payLive()) fail(400, "未配置微信支付密钥，无法收款");
  let row = db
    .prepare("SELECT * FROM payments WHERE user_id=? AND schedule_id=? AND scene='company' AND status='pending' ORDER BY id DESC")
    .get(userId, sch.id);
  if (row && Number(row.amount) !== total) {
    db.prepare("UPDATE payments SET status='cancelled' WHERE id=?").run(row.id);
    row = null;
  }
  if (!row) {
    row = insertPending({
      userId,
      scheduleId: sch.id,
      amount: total,
      scene: "company",
      remark,
      tradeNo: newTradeNo("CO", userId),
    });
  } else {
    db.prepare("UPDATE payments SET remark=? WHERE id=?").run(remark, row.id);
    row = db.prepare("SELECT * FROM payments WHERE id=?").get(row.id);
  }
  const charged = await placeJsapi(row, {
    userId,
    amount: total,
    body: "同行者众-公司统一支付",
    clientIp: opts.clientIp,
    renew: () =>
      insertPending({
        userId,
        scheduleId: sch.id,
        amount: total,
        scene: "company",
        remark,
        tradeNo: newTradeNo("CO", userId),
      }),
  });
  return { ...charged, count: lines.length, total, price: quote.originPrice, splits: [] };
}

async function settleByTradeNo(tradeNo, extra = {}) {
  const db = getDb();
  stampTransaction(tradeNo, extra.transactionId);
  const pay = db.prepare("SELECT * FROM payments WHERE trade_no=?").get(tradeNo);
  if (!pay) fail(400, "支付单不存在");
  if (pay.status === "success" || pay.status === "refunded") {
    return { already: true, pay };
  }
  const claimed = db
    .prepare("UPDATE payments SET status='settling' WHERE id=? AND status IN ('pending','cancelled')")
    .run(pay.id);
  if (claimed.changes !== 1) {
    const latest = db.prepare("SELECT * FROM payments WHERE id=?").get(pay.id);
    return { already: true, pay: latest };
  }
  const scene = pay.scene || (pay.remark === "会员年费" ? "member" : "enrollment");
  if (scene === "member") {
    db.prepare("UPDATE payments SET status='success' WHERE id=?").run(pay.id);
    grantMembership(pay.user_id);
    return { already: false, pay: db.prepare("SELECT * FROM payments WHERE id=?").get(pay.id), scene: "member" };
  }
  if (scene === "company") {
    db.prepare("UPDATE payments SET status='success' WHERE id=?").run(pay.id);
    applyCompanyShares(db.prepare("SELECT * FROM payments WHERE id=?").get(pay.id));
    return { already: false, pay: db.prepare("SELECT * FROM payments WHERE id=?").get(pay.id), scene: "company" };
  }
  if (scene === "wallet_topup") {
    const { credit } = require("./wallet");
    try {
      credit(pay.user_id, pay.amount, {
        reason: "钱包充值",
        scene: "topup",
        refType: "payment",
        refId: pay.id,
      });
    } catch (err) {
      db.prepare("UPDATE payments SET status=? WHERE id=?").run(pay.status, pay.id);
      throw err;
    }
    db.prepare("UPDATE payments SET status='success' WHERE id=?").run(pay.id);
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

function chargeOf(tradeNo) {
  return getDb()
    .prepare("SELECT * FROM payments WHERE trade_no=? AND IFNULL(refund_of,0)=0 ORDER BY id ASC LIMIT 1")
    .get(String(tradeNo || ""));
}

function shipmentDesc(pay) {
  if ((pay.scene || "") === "wallet_topup") return "钱包充值";
  if (pay.schedule_id) {
    const row = getDb()
      .prepare("SELECT r.title FROM schedules s JOIN routes r ON r.id=s.route_id WHERE s.id=?")
      .get(pay.schedule_id);
    if (row && row.title) return String(row.title).slice(0, 120);
  }
  return "同行者众";
}

async function reportSettledShipment(tradeNo) {
  const pay = chargeOf(tradeNo);
  if (!pay || pay.status !== "success" || !loginLive()) return;
  const user = getDb().prepare("SELECT wechat_openid FROM users WHERE id=?").get(pay.user_id);
  try {
    await uploadVirtualShipping({
      outTradeNo: pay.trade_no,
      transactionId: pay.wechat_transaction_id,
      openid: user && user.wechat_openid,
      itemDesc: shipmentDesc(pay),
    });
  } catch (err) {
    console.error("虚拟发货上报失败", pay.trade_no, err && err.message);
  }
}

function orderByTradeNo(tradeNo, userId) {
  const pay = chargeOf(tradeNo);
  if (!pay) fail(404, "订单不存在");
  if (Number(pay.user_id) !== Number(userId)) fail(403, "这不是你的订单");
  const trip = pay.schedule_id
    ? getDb()
        .prepare(
          "SELECT r.title, s.start_date FROM schedules s JOIN routes r ON r.id=s.route_id WHERE s.id=?"
        )
        .get(pay.schedule_id)
    : null;
  return {
    tradeNo: pay.trade_no,
    scene: pay.scene || "enrollment",
    status: pay.status,
    amount: pay.amount,
    title: shipmentDesc(pay),
    startDate: trip ? trip.start_date || "" : "",
    scheduleId: pay.schedule_id || 0,
  };
}

async function handleWechatNotify(xml) {
  const data = xmlToObj(xml);
  if (!verifySign(data, config.wechat.mchKey)) return notifyReply(false, "签名失败");
  if (data.return_code !== "SUCCESS" || data.result_code !== "SUCCESS") return notifyReply(false, data.return_msg || "FAIL");
  if (data.mch_id && data.mch_id !== String(config.wechat.mchId)) return notifyReply(false, "商户号不匹配");
  if (!data.out_trade_no) return notifyReply(false, "缺少订单号");
  try {
    await settleByTradeNo(data.out_trade_no, { transactionId: data.transaction_id });
    await reportSettledShipment(data.out_trade_no);
  } catch (err) {
    console.error("微信支付通知入账失败", data.out_trade_no, err && err.message);
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
  await reportSettledShipment(tradeNo);
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
  payCompanySchedule,
  settleByTradeNo,
  handleWechatNotify,
  confirmTrade,
  orderByTradeNo,
  completeEnrollmentPay,
  applyEnrollmentCharge,
  refundEnrollmentToPayers,
  applyWechatSession,
  ensurePayerWechat,
};
