const { request, setAuth, showError } = require("../../utils/request");
const { invokeWechatPay, ensureWechatCode } = require("../../utils/pay");
const app = getApp();

Page({
  data: {
    data: { bills: [], balance: 0 },
    mode: "",
    topupAmount: "100",
    withdrawAmount: "",
    pin: "",
    quick: [50, 100, 200, 500],
    rule: { available: 0 },
    msg: "",
  },
  onShow() {
    this.load();
  },
  async load() {
    if (!app.globalData.token) {
      wx.navigateTo({ url: "/pages/login/login?redirect=" + encodeURIComponent("/pages/wallet/wallet") });
      return;
    }
    try {
      const res = await request("/me/wallet");
      const data = res.data || { bills: [] };
      const rule = data.withdrawRule || {};
      const balance = Number(data.balance || 0);
      const available = rule.available != null ? Number(rule.available) : Math.min(balance, 2000);
      this.setData({
        data,
        rule: { available },
        msg: "",
      });
    } catch (e) {
      this.setData({ msg: e.message || "加载失败" });
    }
  },
  showTopup() {
    this.setData({ mode: this.data.mode === "topup" ? "" : "topup" });
  },
  showWithdraw() {
    const next = this.data.mode === "withdraw" ? "" : "withdraw";
    const available = Number(this.data.rule.available || 0);
    this.setData({
      mode: next,
      withdrawAmount: next === "withdraw" && available > 0 ? String(available) : this.data.withdrawAmount,
    });
  },
  fillAll() {
    const available = Number(this.data.rule.available || 0);
    if (available > 0) this.setData({ withdrawAmount: String(available) });
  },
  setTopup(e) {
    this.setData({ topupAmount: e.detail.value });
  },
  pickTopup(e) {
    this.setData({ topupAmount: String(e.currentTarget.dataset.n) });
  },
  setWithdraw(e) {
    this.setData({ withdrawAmount: e.detail.value });
  },
  setPin(e) {
    this.setData({ pin: e.detail.value });
  },
  async topup() {
    try {
      const code = await ensureWechatCode();
      const res = await request("/me/wallet/topup", "POST", { amount: Number(this.data.topupAmount), code });
      await invokeWechatPay(res.data);
      if (res.data.user) setAuth(app.globalData.token, res.data.user);
      wx.showToast({ title: "已充值", icon: "none" });
      this.setData({ mode: "" });
      this.load();
    } catch (e) {
      showError("充值失败", e);
    }
  },
  async withdraw() {
    try {
      const res = await request("/me/wallet/withdraw", "POST", {
        amount: Number(this.data.withdrawAmount),
        pin: this.data.pin,
      });
      if (res.data.user) setAuth(app.globalData.token, res.data.user);
      wx.showToast({ title: "已提现到微信", icon: "none" });
      this.setData({ mode: "", pin: "" });
      this.load();
    } catch (e) {
      showError("提现失败", e);
    }
  },
  go(e) {
    wx.navigateTo({ url: e.currentTarget.dataset.url });
  },
});
