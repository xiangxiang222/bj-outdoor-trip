const { request } = require("../../utils/request");
const { invokeWechatPay, ensureWechatCode } = require("../../utils/pay");
const app = getApp();

function payLabel(data, amount) {
  const n = Number(amount);
  if (data && n === Number(data.remainAmount)) {
    return data.isOwner ? "自己支付 ¥" + n : "代付 ¥" + n;
  }
  if (n > 0) return "支付 ¥" + n;
  return "去支付";
}

Page({
  data: { token: "", data: null, amount: "", msg: "", err: "", payLabel: "去支付" },
  onLoad(q) {
    this.setData({ token: q.token || "" });
    this.load();
  },
  onShow() {
    if (this.data.token) this.load();
  },
  async load() {
    if (!this.data.token) {
      this.setData({ err: "缺少付款分享" });
      return;
    }
    try {
      const res = await request("/pay/share/" + this.data.token);
      const data = res.data || {};
      this.setData({
        data,
        amount: String(data.remainAmount || ""),
        err: "",
        payLabel: payLabel(data, data.remainAmount),
      });
    } catch (e) {
      this.setData({ err: e.message || "付款分享不存在" });
    }
  },
  setAmount(e) {
    const amount = e.detail.value;
    this.setData({ amount, payLabel: payLabel(this.data.data, amount) });
  },
  fillRemain() {
    const remain = this.data.data && this.data.data.remainAmount;
    this.setData({ amount: String(remain || ""), payLabel: payLabel(this.data.data, remain) });
  },
  async pay() {
    if (!app.globalData.token) {
      wx.navigateTo({
        url: "/pages/login/login?redirect=" + encodeURIComponent("/pages/pay/pay?token=" + this.data.token),
      });
      return;
    }
    this.setData({ msg: "" });
    try {
      const code = await ensureWechatCode();
      const res = await request("/pay/for-enrollment", "POST", {
        token: this.data.token,
        amount: Number(this.data.amount),
        code,
      });
      await invokeWechatPay(res.data);
      wx.showToast({
        title: res.data.payStatus === "paid" ? "已付清" : "已支付",
        icon: "none",
      });
      this.load();
    } catch (e) {
      this.setData({ msg: e.message || "支付失败" });
    }
  },
  goTrip() {
    const id = this.data.data && this.data.data.scheduleId;
    if (id) wx.navigateTo({ url: "/pages/schedule/schedule?id=" + id });
  },
  onShareAppMessage() {
    const d = this.data.data || {};
    return {
      title: (d.travelerName || "同行") + "的团费还差 ¥" + (d.remainAmount || 0),
      path: "/pages/pay/pay?token=" + this.data.token,
    };
  },
});
