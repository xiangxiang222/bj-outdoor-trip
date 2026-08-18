const crypto = require("crypto");
const config = require("../config");

function mockOpenid(code) {
  return `demo_openid_${crypto.createHash("md5").update(String(code || "guest")).digest("hex").slice(0, 12)}`;
}

async function code2session(jsCode) {
  if (config.wechat.mock || !config.wechat.appId || config.wechat.appId.startsWith("wx_demo")) {
    return { openid: mockOpenid(jsCode), session_key: "demo_session", unionid: "" };
  }
  const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${config.wechat.appId}&secret=${config.wechat.appSecret}&js_code=${jsCode}&grant_type=authorization_code`;
  const res = await fetch(url);
  return res.json();
}

function mockPrepay(tradeNo, amountFen) {
  return {
    timeStamp: String(Math.floor(Date.now() / 1000)),
    nonceStr: crypto.randomBytes(8).toString("hex"),
    package: `prepay_id=mock_${tradeNo}`,
    signType: "MD5",
    paySign: "DEMO_PAY_SIGN",
    tradeNo,
    amountFen,
    mock: true,
  };
}

module.exports = { code2session, mockPrepay, mockOpenid };
