const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  mockOpenid,
  code2session,
  mockPrepay,
  yuanToFen,
  signMd5,
  xmlToObj,
  objToXml,
  verifySign,
  loginLive,
  payLive,
} = require("../src/services/wechat");
const config = require("../src/config");

describe("wechat mock", () => {
  it("generates stable openid from code", () => {
    assert.equal(mockOpenid("abc"), mockOpenid("abc"));
    assert.notEqual(mockOpenid("abc"), mockOpenid("xyz"));
    assert.match(mockOpenid(""), /^demo_openid_/);
  });

  it("code2session returns demo session without AppSecret", async () => {
    const sess = await code2session("js_code_1");
    assert.equal(sess.openid, mockOpenid("js_code_1"));
    assert.equal(sess.session_key, "demo_session");
    assert.equal(loginLive(), false);
    assert.equal(payLive(), false);
  });

  it("code2session stays mock when pay mock is off but secret is demo", async () => {
    const prev = config.wechat.mock;
    config.wechat.mock = false;
    try {
      const sess = await code2session("still_demo");
      assert.equal(sess.openid, mockOpenid("still_demo"));
    } finally {
      config.wechat.mock = prev;
    }
  });

  it("code2session calls wechat when AppSecret is configured", async () => {
    const prev = { appId: config.wechat.appId, appSecret: config.wechat.appSecret };
    config.wechat.appId = "wx205ca387929c002a";
    config.wechat.appSecret = "live_secret_value";
    const origFetch = global.fetch;
    global.fetch = async (url) => {
      assert.match(String(url), /jscode2session/);
      assert.match(String(url), /wx205ca387929c002a/);
      return { json: async () => ({ openid: "real_openid", session_key: "sk" }) };
    };
    try {
      const sess = await code2session("wx_code");
      assert.equal(sess.openid, "real_openid");
    } finally {
      config.wechat.appId = prev.appId;
      config.wechat.appSecret = prev.appSecret;
      global.fetch = origFetch;
    }
  });

  it("mockPrepay returns demo pay params", () => {
    const p = mockPrepay("T123", 19900);
    assert.equal(p.mock, true);
    assert.equal(p.tradeNo, "T123");
    assert.equal(p.amountFen, 19900);
    assert.equal(p.package, "prepay_id=mock_T123");
    assert.equal(p.signType, "MD5");
  });

  it("signs and parses wechat xml", () => {
    assert.equal(yuanToFen(99), 9900);
    const params = { appid: "wxabc", mch_id: "123", nonce_str: "n1", body: "团费" };
    const key = "k".repeat(32);
    const sign = signMd5(params, key);
    assert.match(sign, /^[A-F0-9]{32}$/);
    const xml = objToXml({ ...params, sign });
    const parsed = xmlToObj(xml);
    assert.equal(parsed.appid, "wxabc");
    assert.equal(parsed.sign, sign);
    assert.equal(verifySign(parsed, key), true);
    assert.equal(verifySign({ ...parsed, sign: "DEAD" }, key), false);
  });
});
