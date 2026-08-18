const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { mockOpenid, code2session, mockPrepay } = require("../src/services/wechat");

describe("wechat mock", () => {
  it("generates stable openid from code", () => {
    assert.equal(mockOpenid("abc"), mockOpenid("abc"));
    assert.notEqual(mockOpenid("abc"), mockOpenid("xyz"));
    assert.match(mockOpenid(""), /^demo_openid_/);
  });

  it("code2session returns demo session in mock mode", async () => {
    const sess = await code2session("js_code_1");
    assert.equal(sess.openid, mockOpenid("js_code_1"));
    assert.equal(sess.session_key, "demo_session");
  });

  it("code2session calls wechat when mock is disabled", async () => {
    const config = require("../src/config");
    const prev = { mock: config.wechat.mock, appId: config.wechat.appId };
    config.wechat.mock = false;
    config.wechat.appId = "wx_not_demo";
    const origFetch = global.fetch;
    global.fetch = async (url) => {
      assert.match(String(url), /jscode2session/);
      return { json: async () => ({ openid: "real_openid", session_key: "sk" }) };
    };
    try {
      const sess = await code2session("wx_code");
      assert.equal(sess.openid, "real_openid");
    } finally {
      config.wechat.mock = prev.mock;
      config.wechat.appId = prev.appId;
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
});
