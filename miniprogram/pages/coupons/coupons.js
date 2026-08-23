const { request } = require("../../utils/request");
const app = getApp();
Page({
  data: { list: [] },
  onShow() {
    if (!app.globalData.token) {
      wx.redirectTo({ url: "/pages/login/login?redirect=" + encodeURIComponent("/pages/coupons/coupons") });
      return;
    }
    request("/me/coupons").then((r) => this.setData({ list: r.data || [] })).catch(() => this.setData({ list: [] }));
  },
  open(e) {
    const code = e.currentTarget.dataset.code;
    const status = e.currentTarget.dataset.status;
    const schedule = e.currentTarget.dataset.schedule;
    if (status === "unused" && code) {
      wx.navigateTo({ url: "/pages/coupon/coupon?code=" + code });
      return;
    }
    if (schedule) wx.navigateTo({ url: "/pages/schedule/schedule?id=" + schedule });
  },
});
