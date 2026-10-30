const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { harness, loginUser, auth, ID, issueCaptcha } = require("./http");
const config = require("../src/config");
const { signMd5, objToXml, UNIFIED_ORDER_URL, ORDER_QUERY_URL } = require("../src/services/wechat");
const { shipmentRetryDelays, payEnrollment } = require("../src/services/payment");

const LIVE_KEY = "a".repeat(32);

function useLivePay() {
  const prev = {
    mock: config.wechat.mock,
    appId: config.wechat.appId,
    appSecret: config.wechat.appSecret,
    mchId: config.wechat.mchId,
    mchKey: config.wechat.mchKey,
  };
  config.wechat.mock = false;
  config.wechat.appId = "wx255ca387929c502a";
  config.wechat.appSecret = "live_secret_value";
  config.wechat.mchId = "1750196084";
  config.wechat.mchKey = LIVE_KEY;
  return () => Object.assign(config.wechat, prev);
}

function mockWechatPay(tradeState = "SUCCESS", mockOpts = {}) {
  const orig = global.fetch;
  const calls = [];
  global.fetch = async (url, opts) => {
    const href = String(url);
    calls.push(href);
    if (href.includes("jscode2session")) {
      return { json: async () => ({ openid: "oLIVEPAYOPENID", session_key: "sk" }) };
    }
    if (href.includes("cgi-bin/token")) {
      return { json: async () => ({ access_token: "test_token", expires_in: 7200 }) };
    }
    if (href.includes("upload_shipping_info")) {
      const body = JSON.parse(String(opts && opts.body));
      calls.push(body);
      const missing = mockOpts.missingShipOnce && calls.filter((item) => item && item.logistics_type === 3).length === 1;
      return { json: async () => (missing ? { errcode: 10060001, errmsg: "支付单不存在" } : { errcode: 0, errmsg: "ok" }) };
    }
    if (href === UNIFIED_ORDER_URL) {
      return { text: async () => objToXml({ return_code: "SUCCESS", result_code: "SUCCESS", prepay_id: "wx_prepay_live" }) };
    }
    if (href === ORDER_QUERY_URL) {
      const body = String(opts && opts.body);
      const tradeNo = (body.match(/<out_trade_no><!\[CDATA\[(.*?)\]\]>/) || [])[1] || "T1";
      return {
        text: async () =>
          objToXml({
            return_code: "SUCCESS",
            result_code: "SUCCESS",
            trade_state: tradeState,
            out_trade_no: tradeNo,
            transaction_id: "4200000001",
          }),
      };
    }
    throw new Error("unexpected fetch " + href);
  };
  return {
    calls,
    restore() {
      global.fetch = orig;
    },
  };
}

describe("wechat live pay", () => {
  let agent;
  let seed;

  beforeEach(() => {
    ({ agent, seed } = harness());
  });

  it("exposes app id on /meta while keeping mock pay in tests", async () => {
    const res = await agent.get("/api/meta").expect(200);
    assert.equal(res.body.data.wechatAppId, "wx255ca387929c502a");
    assert.equal(res.body.data.wechatPayMock, true);
    assert.equal(res.body.data.wechatPayLive, false);
  });

  it("binds wechat openid to a logged-in phone user", async () => {
    const token = await loginUser(agent);
    const bound = await agent.post("/api/auth/wechat").set(auth(token)).send({ code: "bind_code" }).expect(200);
    assert.equal(bound.body.data.bound, true);
    assert.equal(bound.body.data.user.wechatBound, true);
    assert.equal(bound.body.data.user.id, seed.userId);
  });

  it("creates a JSAPI order then settles enrollment after notify", async () => {
    const restorePay = useLivePay();
    const wechat = mockWechatPay("SUCCESS");
    try {
      const token = await loginUser(agent);
      await agent.post("/api/auth/wechat").set(auth(token)).send({ code: "pay_code" }).expect(200);
      const enrolled = await agent
        .post("/api/enroll")
        .set(auth(token))
        .send({
          scheduleId: seed.individualScheduleId,
          travelerName: "林北野",
          travelerPhone: "13800138000",
          idCard: ID.maleBj,
          emergencyName: "紧急联系人",
          emergencyPhone: "13700000002",
          waiverAccepted: true,
          healthOk: true,
        })
        .expect(200);
      const charged = await agent
        .post("/api/pay/for-enrollment")
        .set(auth(token))
        .send({ enrollmentId: enrolled.body.data.enrollmentId })
        .expect(200);
      assert.equal(charged.body.data.needPay, true);
      assert.equal(charged.body.data.payStatus, "unpaid");
      assert.equal(charged.body.data.wechatPay.package, "prepay_id=wx_prepay_live");
      assert.ok(charged.body.data.wechatPay.paySign);
      let unifiedCalls = 0;
      const origFetch = global.fetch;
      global.fetch = async (url, opts) => {
        if (String(url) === UNIFIED_ORDER_URL) unifiedCalls += 1;
        return origFetch(url, opts);
      };
      const again = await agent
        .post("/api/pay/for-enrollment")
        .set(auth(token))
        .send({ enrollmentId: enrolled.body.data.enrollmentId })
        .expect(200);
      assert.equal(again.body.data.tradeNo, charged.body.data.tradeNo);
      assert.equal(again.body.data.wechatPay.package, "prepay_id=wx_prepay_live");
      assert.equal(unifiedCalls, 0);
      global.fetch = origFetch;
      seed.db.prepare("UPDATE payments SET status='cancelled' WHERE trade_no=?").run(charged.body.data.tradeNo);
      const tradeNo = charged.body.data.tradeNo;
      const params = {
        return_code: "SUCCESS",
        result_code: "SUCCESS",
        mch_id: "1750196084",
        out_trade_no: tradeNo,
      };
      params.sign = signMd5(params, LIVE_KEY);
      const notify = await agent.post("/api/pay/wechat/notify").set("Content-Type", "text/xml").send(objToXml(params)).expect(200);
      assert.match(String(notify.text), /SUCCESS/);
      const shipped = wechat.calls.find((item) => item && item.logistics_type === 3);
      assert.equal(shipped.delivery_mode, 1);
      assert.equal(shipped.shipping_list.length, 1);
      assert.equal(shipped.payer.openid, "oLIVEPAYOPENID");
      assert.equal(shipped.order_key.out_trade_no, tradeNo);
      const detail = await agent.get("/api/schedules/" + seed.individualScheduleId).expect(200);
      const row = (detail.body.data.chain || []).find((c) => c.userId === seed.userId);
      assert.equal(row.payStatus, "paid");
      const confirmed = await agent.post("/api/pay/confirm").set(auth(token)).send({ tradeNo }).expect(200);
      assert.equal(confirmed.body.data.already, true);
    } finally {
      wechat.restore();
      restorePay();
    }
  });

  it("rechecks the shared balance before issuing concurrent helpers' WeChat prepayments", async () => {
    const restorePay = useLivePay();
    const wechat = mockWechatPay();
    try {
      seed.db.prepare("UPDATE users SET wechat_openid=? WHERE id=?").run("owner-openid",seed.userId);
      seed.db.prepare("UPDATE users SET wechat_openid=? WHERE id=?").run("helper-openid",seed.companyUserId);
      const enrollmentId = Number(seed.db.prepare("INSERT INTO enrollments(schedule_id,user_id,status,pay_status,pay_amount,campus_snapshot_json) VALUES (?,?,'joined','unpaid',100,?)")
        .run(seed.individualScheduleId,seed.userId,JSON.stringify({studentPrice:false})).lastInsertRowid);
      const attempts = await Promise.allSettled([
        payEnrollment(enrollmentId,seed.userId,{amount:80}),
        payEnrollment(enrollmentId,seed.companyUserId,{amount:80}),
      ]);
      assert.equal(attempts.filter((result) => result.status === "fulfilled").length,1);
      const rejected = attempts.find((result) => result.status === "rejected");
      assert.equal(rejected.reason.status,400);
      assert.match(rejected.reason.message,/超过待付余额 ¥20/);
      const payments = seed.db.prepare("SELECT amount,status FROM payments WHERE enrollment_id=?").all(enrollmentId);
      assert.deepEqual(payments,[{amount:80,status:"pending"}]);
      assert.equal(wechat.calls.filter((href) => href === UNIFIED_ORDER_URL).length,1);
    } finally {
      wechat.restore();
      restorePay();
    }
  });

  it("refuses to sell membership through wechat pay", async () => {
    const token = await loginUser(agent);
    const denied = await agent.post("/api/member/buy").set(auth(token)).send({ code: "member_code" });
    assert.equal(denied.status, 400);
    assert.match(String(denied.body.message || ""), /不在小程序内销售/);
  });

  it("rejects mock-success when live pay is on", async () => {
    const restorePay = useLivePay();
    try {
      const token = await loginUser(agent);
      await agent.post("/api/pay/mock-success").set(auth(token)).send({ tradeNo: "NOPE" }).expect(403);
    } finally {
      restorePay();
    }
  });

  it("asks for wechat login when live pay has no openid", async () => {
    const restorePay = useLivePay();
    try {
      const token = await loginUser(agent);
      const enrolled = await agent
        .post("/api/enroll")
        .set(auth(token))
        .send({
          scheduleId: seed.individualScheduleId,
          travelerName: "林北野",
          travelerPhone: "13800138000",
          idCard: ID.maleBj,
          emergencyName: "紧急联系人",
          emergencyPhone: "13700000002",
          waiverAccepted: true,
          healthOk: true,
        })
        .expect(200);
      const denied = await agent
        .post("/api/pay/for-enrollment")
        .set(auth(token))
        .send({ enrollmentId: enrolled.body.data.enrollmentId })
        .expect(400);
      assert.equal(denied.body.needWechat, true);
    } finally {
      restorePay();
    }
  });

  it("refuses live pay when merchant key is missing", async () => {
    const restorePay = useLivePay();
    config.wechat.mchKey = "";
    try {
      const token = await loginUser(agent);
      const enrolled = await agent
        .post("/api/enroll")
        .set(auth(token))
        .send({
          scheduleId: seed.individualScheduleId,
          travelerName: "林北野",
          travelerPhone: "13800138000",
          idCard: ID.maleBj,
          emergencyName: "紧急联系人",
          emergencyPhone: "13700000002",
          waiverAccepted: true,
          healthOk: true,
        })
        .expect(200);
      const denied = await agent
        .post("/api/pay/for-enrollment")
        .set(auth(token))
        .send({ enrollmentId: enrolled.body.data.enrollmentId })
        .expect(400);
      assert.match(denied.body.message, /密钥/);
    } finally {
      restorePay();
    }
  });
});

describe("enrollment pay share and crowdfund", () => {
  let agent;
  let seed;

  beforeEach(() => {
    ({ agent, seed } = harness());
  });

  async function enrollSelf() {
    const token = await loginUser(agent);
    const enrolled = await agent
      .post("/api/enroll")
      .set(auth(token))
      .send({
        scheduleId: seed.individualScheduleId,
        travelerName: "林北野",
        travelerPhone: "13800138000",
        idCard: ID.maleBj,
        emergencyName: "紧急联系人",
        emergencyPhone: "13700000002",
        waiverAccepted: true,
        healthOk: true,
      })
      .expect(200);
    return { token, enrollmentId: enrolled.body.data.enrollmentId, payShareToken: enrolled.body.data.payShareToken };
  }

  async function registerFriend() {
    const cap = await issueCaptcha(agent);
    const res = await agent
      .post("/api/auth/register")
      .send({ phone: "13600136008", password: "123456", nickname: "代付好友", captchaToken: cap.token, captcha: cap.code })
      .expect(200);
    return res.body.data.token;
  }

  it("lets the traveler pay remaining and exposes a share token", async () => {
    const { token, enrollmentId, payShareToken } = await enrollSelf();
    assert.ok(payShareToken);
    const share = await agent.get("/api/pay/share/" + payShareToken).expect(200);
    assert.equal(share.body.data.canPay, true);
    assert.ok(share.body.data.remainAmount > 0);
    const paid = await agent
      .post("/api/pay/for-enrollment")
      .set(auth(token))
      .send({ enrollmentId })
      .expect(200);
    assert.equal(paid.body.data.payStatus, "paid");
    assert.equal(paid.body.data.proxy, false);
    assert.equal(paid.body.data.remainAmount, 0);
    const row = seed.db.prepare("SELECT remark FROM payments WHERE enrollment_id=? AND status='success'").get(enrollmentId);
    assert.equal(row.remark, "自己支付");
    const shareAfter = await agent.get("/api/pay/share/" + payShareToken).set(auth(token)).expect(200);
    assert.equal(shareAfter.body.data.helpers.length, 0);
  });

  it("lets a friend pay the remaining amount as 代付", async () => {
    const { token, enrollmentId, payShareToken } = await enrollSelf();
    const friend = await registerFriend();
    const paid = await agent
      .post("/api/pay/for-enrollment")
      .set(auth(friend))
      .send({ token: payShareToken })
      .expect(200);
    assert.equal(paid.body.data.payStatus, "paid");
    assert.equal(paid.body.data.proxy, true);
    const row = seed.db.prepare("SELECT user_id, remark FROM payments WHERE enrollment_id=? AND status='success'").get(enrollmentId);
    assert.notEqual(Number(row.user_id), Number(seed.userId));
    assert.equal(row.remark, "他人代付");
    const share = await agent.get("/api/pay/share/" + payShareToken).set(auth(token)).expect(200);
    assert.equal(share.body.data.helpers.length, 1);
    assert.equal(share.body.data.helpers[0].nickname, "代付好友");
    assert.equal(share.body.data.helpers[0].remark, "他人代付");
    assert.equal(share.body.data.helpers[0].amount, paid.body.data.amount);
    const orders = await agent.get("/api/orders").set(auth(token)).expect(200);
    const mine = orders.body.data.find((item) => item.id === enrollmentId);
    assert.equal(mine.helpers.length, 1);
    assert.equal(mine.helpers[0].nickname, "代付好友");
  });

  it("accepts partial crowdfund payments until the fee is covered", async () => {
    const { token, enrollmentId, payShareToken } = await enrollSelf();
    const first = await agent
      .post("/api/pay/for-enrollment")
      .set(auth(token))
      .send({ enrollmentId, amount: 80 })
      .expect(200);
    assert.equal(first.body.data.payStatus, "unpaid");
    assert.equal(first.body.data.amount, 80);
    const friend = await registerFriend();
    const over = await agent.post("/api/pay/for-enrollment").set(auth(friend)).send({ token: payShareToken, amount: 999 });
    assert.equal(over.status, 400);
    const second = await agent
      .post("/api/pay/for-enrollment")
      .set(auth(friend))
      .send({ token: payShareToken, amount: first.body.data.remainAmount })
      .expect(200);
    assert.equal(second.body.data.payStatus, "paid");
    const detail = await agent.get("/api/schedules/" + seed.individualScheduleId).set(auth(token)).expect(200);
    assert.equal(detail.body.data.myEnrollment.remainAmount, 0);
    assert.equal(detail.body.data.chain[0].canPay, false);
    assert.equal(detail.body.data.myEnrollment.contributors.length, 2);
    assert.equal(detail.body.data.myEnrollment.helpers.length, 1);
    assert.equal(detail.body.data.myEnrollment.helpers[0].nickname, "代付好友");
    assert.equal(detail.body.data.myEnrollment.helpers[0].remark, "他人代付");
  });

  it("rechecks an in-flight payment after another helper pays from their wallet", async () => {
    const { enrollmentId } = await enrollSelf();
    seed.db.prepare("UPDATE enrollments SET pay_amount=100 WHERE id=?").run(enrollmentId);
    seed.db.prepare("UPDATE users SET wallet_balance=100 WHERE id=?").run(seed.companyUserId);
    const pendingWechat = payEnrollment(enrollmentId,seed.userId,{amount:80});
    const wallet = await payEnrollment(enrollmentId,seed.companyUserId,{amount:80,channel:"wallet"});
    assert.equal(wallet.remainAmount,20);
    await assert.rejects(pendingWechat,(error) => error.status === 400 && /超过待付余额 ¥20/.test(error.message));
    const charged = seed.db.prepare("SELECT SUM(amount) AS amount FROM payments WHERE enrollment_id=? AND status='success'").get(enrollmentId);
    assert.equal(charged.amount,80);
    assert.equal(seed.db.prepare("SELECT wallet_balance FROM users WHERE id=?").get(seed.companyUserId).wallet_balance,20);
  });

  it("refunds each crowdfund payer on cancel", async () => {
    const { token, enrollmentId } = await enrollSelf();
    await agent.post("/api/pay/for-enrollment").set(auth(token)).send({ enrollmentId, amount: 80 }).expect(200);
    const friend = await registerFriend();
    const rest = seed.db.prepare("SELECT pay_amount FROM enrollments WHERE id=?").get(enrollmentId).pay_amount - 80;
    await agent.post("/api/pay/for-enrollment").set(auth(friend)).send({ enrollmentId, amount: rest }).expect(200);
    const cancelled = await agent.post("/api/orders/" + enrollmentId + "/cancel").set(auth(token)).expect(200);
    assert.equal(cancelled.body.data.payStatus, "refunded");
    assert.equal(cancelled.body.data.refunded, true);
    assert.equal(cancelled.body.data.refunds.length, 2);
    const userIds = cancelled.body.data.refunds.map((row) => Number(row.userId)).sort();
    const friendId = seed.db.prepare("SELECT id FROM users WHERE phone='13600136008'").get().id;
    assert.deepEqual(userIds, [seed.userId, friendId].sort());
    const sum = cancelled.body.data.refunds.reduce((s, row) => s + row.amount, 0);
    assert.equal(sum, cancelled.body.data.refundAmount);
  });

  it("rejects an unknown pay share token", async () => {
    await agent.get("/api/pay/share/no-such-token").expect(404);
  });
});

describe("wechat order detail", () => {
  let agent;
  let seed;

  beforeEach(() => {
    ({ agent, seed } = harness());
  });

  it("only returns a settled payment's profile to its actual payer", async () => {
    const payer = await loginUser(agent);
    const other = await loginUser(agent, "13900139000");
    seed.db.prepare(
      "INSERT INTO payments (enrollment_id,user_id,schedule_id,amount,channel,status,trade_no,remark,scene) VALUES (0,?,0,10,'wallet','success','CONFIRM-PRIVATE','','wallet_topup')"
    ).run(seed.userId);
    await agent.post("/api/pay/confirm").send({ tradeNo:"CONFIRM-PRIVATE" }).expect(401);
    const denied = await agent.post("/api/pay/confirm").set(auth(other)).send({ tradeNo:"CONFIRM-PRIVATE" }).expect(403);
    assert.equal(denied.body.data, undefined);
    const confirmed = await agent.post("/api/pay/confirm").set(auth(payer)).send({ tradeNo:"CONFIRM-PRIVATE" }).expect(200);
    assert.equal(confirmed.body.data.user.id,seed.userId);
    assert.equal(confirmed.body.data.already,true);
  });

  it("lets a helper confirm their own prepayment but refuses the traveler before querying or settling it", async () => {
    const traveler = await loginUser(agent);
    const helper = await loginUser(agent, "13900139000");
    const restorePay = useLivePay();
    const wechat = mockWechatPay("SUCCESS");
    try {
      seed.db.prepare("UPDATE users SET wechat_openid=? WHERE id=?").run("helper-openid",seed.companyUserId);
      const enrollmentId = Number(seed.db.prepare("INSERT INTO enrollments(schedule_id,user_id,status,pay_status,pay_amount,campus_snapshot_json) VALUES (?,?,'joined','unpaid',100,?)")
        .run(seed.individualScheduleId,seed.userId,JSON.stringify({studentPrice:false})).lastInsertRowid);
      const payment = await agent.post("/api/pay/for-enrollment").set(auth(helper)).send({ enrollmentId,amount:80 }).expect(200);
      const tradeNo = payment.body.data.tradeNo;
      const denied = await agent.post("/api/pay/confirm").set(auth(traveler)).send({ tradeNo }).expect(403);
      assert.equal(denied.body.data,undefined);
      assert.equal(wechat.calls.filter((href) => href === ORDER_QUERY_URL).length,0);
      assert.equal(seed.db.prepare("SELECT status FROM payments WHERE trade_no=?").get(tradeNo).status,"pending");
      const confirmed = await agent.post("/api/pay/confirm").set(auth(helper)).send({ tradeNo }).expect(200);
      assert.equal(confirmed.body.data.user.id,seed.companyUserId);
      assert.equal(confirmed.body.data.remainAmount,20);
      assert.equal(wechat.calls.filter((href) => href === ORDER_QUERY_URL).length,1);
      assert.equal(seed.db.prepare("SELECT status FROM payments WHERE trade_no=?").get(tradeNo).status,"success");
    } finally {
      wechat.restore();
      restorePay();
    }
  });

  it("authorizes a company trade against the paying company rather than a participant", async () => {
    const participant = await loginUser(agent);
    const company = await loginUser(agent, "13900139000");
    const insert = seed.db.prepare("INSERT INTO payments (enrollment_id,user_id,schedule_id,amount,channel,status,trade_no,remark,scene) VALUES (0,?,?,20,'wallet','success','CONFIRM-COMPANY','',?)");
    insert.run(seed.companyUserId,seed.companyScheduleId,"company");
    await agent.post("/api/pay/confirm").set(auth(participant)).send({ tradeNo:"CONFIRM-COMPANY" }).expect(403);
    const confirmed = await agent.post("/api/pay/confirm").set(auth(company)).send({ tradeNo:"CONFIRM-COMPANY" }).expect(200);
    assert.equal(confirmed.body.data.user.id,seed.companyUserId);
  });

  it("opens a paid order by the wechat trade number for the payer", async () => {
    const token = await loginUser(agent);
    const title = seed.db.prepare("SELECT title FROM routes WHERE id=?").get(seed.routeId).title;
    seed.db
      .prepare(
        "INSERT INTO payments (enrollment_id,user_id,schedule_id,amount,channel,status,trade_no,remark,scene) VALUES (0,?,?,?,?,?,?,?,?)"
      )
      .run(seed.userId, seed.individualScheduleId, 199, "wechat", "success", "TN-ORDER-1", "", "enrollment");
    const res = await agent.get("/api/pay/order/" + encodeURIComponent("TN-ORDER-1")).set(auth(token)).expect(200);
    assert.equal(res.body.data.title, title);
    assert.equal(res.body.data.scheduleId, seed.individualScheduleId);
    assert.equal(res.body.data.amount, 199);
    assert.equal(res.body.data.status, "success");
    await agent.get("/api/pay/order/TN-ORDER-1").expect(401);
  });

  it("retries virtual shipping after WeChat says the ship order does not exist yet", async () => {
    const restorePay = useLivePay();
    const wechat = mockWechatPay("SUCCESS", { missingShipOnce: true });
    const prev = shipmentRetryDelays.slice();
    shipmentRetryDelays.splice(0, shipmentRetryDelays.length, 30, 30, 30);
    try {
      const token = await loginUser(agent);
      seed.db.prepare("UPDATE users SET wechat_openid=? WHERE id=?").run("oLIVEPAYOPENID", seed.userId);
      seed.db
        .prepare(
          "INSERT INTO payments (enrollment_id,user_id,schedule_id,amount,channel,status,trade_no,remark,scene,wechat_transaction_id) VALUES (0,?,?,?,?,?,?,?,?,?)"
        )
        .run(seed.userId, 0, 1, "wechat", "success", "TN-SHIP", "钱包充值", "wallet_topup", "4200000001");
      await agent.post("/api/pay/confirm").set(auth(token)).send({ tradeNo: "TN-SHIP" }).expect(200);
      await new Promise((resolve) => setTimeout(resolve, 80));
      const bodies = wechat.calls.filter((item) => item && item.logistics_type === 3);
      assert.equal(bodies.length, 2);
      assert.equal(bodies[1].order_key.order_number_type, 1);
      assert.equal(bodies[1].order_key.out_trade_no, "TN-SHIP");
    } finally {
      shipmentRetryDelays.splice(0, shipmentRetryDelays.length, ...prev);
      wechat.restore();
      restorePay();
    }
  });
});
