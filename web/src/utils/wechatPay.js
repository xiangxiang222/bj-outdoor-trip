export function liveWechatPay(data) {
  return Boolean(data && data.needPay && data.wechatPay && !data.wechatPay.mock);
}

export const MINIPROGRAM_PAY_HINT = "请打开微信小程序「同行者众」完成支付";
