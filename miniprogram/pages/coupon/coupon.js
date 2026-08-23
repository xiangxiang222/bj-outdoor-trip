const { request } = require("../../utils/request");
const app = getApp();
Page({
  data: { code: "", data: null, err: "" },
  onLoad(q) {
    this.setData({ code: (q.code || "").toUpperCase() });
    this.load();
  },
  async load() {
    if (!this.data.code) {
      this.setData({ err: "缺少优惠券口令" });
      return;
    }
    try {
      const res = await request("/coupons/" + this.data.code);
      this.setData({ data: res.data, err: "" });
    } catch (e) {
      this.setData({ err: e.message || "优惠券不存在" });
    }
  },
  async claim() {
    if (!app.globalData.token) {
      wx.redirectTo({
        url: "/pages/login/login?redirect=" + encodeURIComponent("/pages/coupon/coupon?code=" + this.data.code),
      });
      return;
    }
    const d = this.data.data;
    if (d && (d.claimedByMe || (d.myCoupon && (d.myCoupon.status === "used" || d.myCoupon.status === "held")))) {
      this.goEnroll();
      return;
    }
    try {
      const res = await request("/coupons/" + this.data.code + "/claim", "POST", {});
      this.setData({ data: res.data });
      this.goEnroll();
    } catch (e) {
      wx.showModal({ title: "领取失败", content: e.message, showCancel: false });
      this.load();
    }
  },
  goEnroll() {
    const id = this.data.data && this.data.data.scheduleId;
    if (!id) return;
    wx.navigateTo({ url: "/pages/enroll/enroll?id=" + id + "&coupon=" + this.data.code });
  },
  goTrip() {
    const id = this.data.data && this.data.data.scheduleId;
    if (!id) return;
    wx.navigateTo({ url: "/pages/schedule/schedule?id=" + id });
  },
});
