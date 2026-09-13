const { request } = require("./request");

function payArgs(wechatPay) {
  return {
    timeStamp: String(wechatPay.timeStamp),
    nonceStr: wechatPay.nonceStr,
    package: wechatPay.package,
    signType: wechatPay.signType || "MD5",
    paySign: wechatPay.paySign,
  };
}

async function ensureWechatCode() {
  const login = await wx.login();
  if (!login || !login.code) {
    const err = new Error("微信登录失败");
    throw err;
  }
  return login.code;
}

async function invokeWechatPay(data) {
  if (!data || !data.needPay || !data.wechatPay || data.wechatPay.mock) return data;
  try {
    await wx.requestPayment(payArgs(data.wechatPay));
  } catch (e) {
    const msg = (e && e.errMsg) || e.message || "";
    if (String(msg).indexOf("cancel") >= 0) {
      const err = new Error("已取消支付");
      throw err;
    }
    throw e;
  }
  const confirmed = await request("/pay/confirm", "POST", { tradeNo: data.tradeNo });
  return Object.assign({}, data, confirmed.data || {}, { needPay: false, mock: false });
}

async function buyMembership() {
  const code = await ensureWechatCode();
  const res = await request("/member/buy", "POST", { code });
  const paid = await invokeWechatPay(res.data);
  return paid.user || res.data.user;
}

module.exports = { invokeWechatPay, ensureWechatCode, payArgs, buyMembership };
