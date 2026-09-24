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

function requestPayment(args) {
  return new Promise((resolve, reject) => {
    wx.requestPayment({
      timeStamp: args.timeStamp,
      nonceStr: args.nonceStr,
      package: args.package,
      signType: args.signType || "MD5",
      paySign: args.paySign,
      success: resolve,
      fail(e) {
        const msg = (e && (e.errMsg || e.message)) || "微信支付没有完成";
        if (String(msg).indexOf("cancel") >= 0) {
          reject(new Error("已取消支付"));
          return;
        }
        reject(new Error(String(msg).replace(/^requestPayment:fail\s*/, "") || "微信支付没有完成"));
      },
    });
  });
}

async function invokeWechatPay(data) {
  if (!data || data.channel === "wallet" || !data.needPay || !data.wechatPay || data.wechatPay.mock) return data;
  const pay = data.wechatPay;
  if (!pay.paySign || !pay.package) {
    throw new Error("支付参数不完整，请稍后再试");
  }
  await requestPayment(payArgs(pay));
  const confirmed = await request("/pay/confirm", "POST", { tradeNo: data.tradeNo });
  return Object.assign({}, data, confirmed.data || {}, { needPay: false, mock: false });
}

function requestMerchantTransfer(data) {
  return new Promise((resolve, reject) => {
    if (typeof wx.requestMerchantTransfer !== "function") {
      reject(new Error("请更新微信后再确认收款"));
      return;
    }
    wx.requestMerchantTransfer({
      mchId: String(data.mchId || ""),
      appId: data.appId || "",
      package: data.packageInfo,
      success: resolve,
      fail(e) {
        const msg = (e && (e.errMsg || e.message)) || "未确认收款";
        if (String(msg).indexOf("cancel") >= 0) {
          reject(new Error("已取消收款，余额未扣"));
          return;
        }
        reject(new Error(String(msg).replace(/^requestMerchantTransfer:fail\s*/, "") || "未确认收款"));
      },
    });
  });
}

module.exports = { invokeWechatPay, ensureWechatCode, payArgs, requestMerchantTransfer };
