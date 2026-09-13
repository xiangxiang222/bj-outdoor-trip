const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { harness, loginUser, auth, ID } = require("./http");
const config = require("../src/config");
const { signMd5, objToXml, UNIFIED_ORDER_URL, ORDER_QUERY_URL } = require("../src/services/wechat");

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
  config.wechat.appId = "wx205ca387929c002a";
  config.wechat.appSecret = "live_secret_value";
  config.wechat.mchId = "17501360384";
  config.wechat.mchKey = LIVE_KEY;
  return () => Object.assign(config.wechat, prev);
}

function mockWechatPay(tradeState = "SUCCESS") {
  const orig = global.fetch;
  global.fetch = async (url, opts) => {
    const href = String(url);
    if (href.includes("jscode2session")) {
      return { json: async () => ({ openid: "oLIVEPAYOPENID", session_key: "sk" }) };
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
          }),
      };
    }
    throw new Error("unexpected fetch " + href);
  };
  return () => {
    global.fetch = orig;
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
    assert.equal(res.body.data.wechatAppId, "wx205ca387929c002a");
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
    const restoreFetch = mockWechatPay("SUCCESS");
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
      const tradeNo = charged.body.data.tradeNo;
      const params = {
        return_code: "SUCCESS",
        result_code: "SUCCESS",
        mch_id: "17501360384",
        out_trade_no: tradeNo,
      };
      params.sign = signMd5(params, LIVE_KEY);
      const notify = await agent.post("/api/pay/wechat/notify").set("Content-Type", "text/xml").send(objToXml(params)).expect(200);
      assert.match(String(notify.text), /SUCCESS/);
      const detail = await agent.get("/api/schedules/" + seed.individualScheduleId).expect(200);
      const row = (detail.body.data.chain || []).find((c) => c.userId === seed.userId);
      assert.equal(row.payStatus, "paid");
      const confirmed = await agent.post("/api/pay/confirm").set(auth(token)).send({ tradeNo }).expect(200);
      assert.equal(confirmed.body.data.already, true);
    } finally {
      restoreFetch();
      restorePay();
    }
  });

  it("opens membership only after wechat query succeeds", async () => {
    const restorePay = useLivePay();
    const restoreFetch = mockWechatPay("SUCCESS");
    try {
      const token = await loginUser(agent);
      seed.db.prepare("UPDATE users SET is_member=0, member_expire_at=NULL, member_gift_left=0 WHERE id=?").run(seed.userId);
      const charged = await agent.post("/api/member/buy").set(auth(token)).send({ code: "member_code" }).expect(200);
      assert.equal(charged.body.data.needPay, true);
      assert.equal(charged.body.data.user.isMember, false);
      await agent.post("/api/pay/confirm").set(auth(token)).send({ tradeNo: charged.body.data.tradeNo }).expect(200);
      const me = await agent.get("/api/me").set(auth(token)).expect(200);
      assert.equal(me.body.data.isMember, true);
    } finally {
      restoreFetch();
      restorePay();
    }
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
      const denied = await agent.post("/api/member/buy").set(auth(token)).send({}).expect(400);
      assert.match(denied.body.message, /密钥/);
    } finally {
      restorePay();
    }
  });
});
