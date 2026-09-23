const { request } = require("../../utils/request");
const app = getApp();

Page({
  data: {
    loaded: false,
    available: 0,
  },
  onShow() {
    this.load();
  },
  async load() {
    if (!app.globalData.token) return;
    try {
      const res = await request("/me/wallet");
      const data = res.data || {};
      const rule = data.withdrawRule || {};
      const balance = Number(data.balance || 0);
      this.setData({
        loaded: true,
        available: rule.available != null ? Number(rule.available) : Math.min(balance, 2000),
      });
    } catch (e) {
      /* 规则文案不依赖接口 */
    }
  },
  goWallet() {
    wx.redirectTo({ url: "/pages/wallet/wallet" });
  },
});
