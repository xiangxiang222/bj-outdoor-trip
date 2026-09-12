const { request } = require("../../utils/request");
const { couponCountdown } = require("../../utils/coupon-time");
const app = getApp();
Page({
  data: { code: "", data: null, err: "", ttl: null },
  onLoad(q) {
    this.setData({ code: (q.code || "").toUpperCase() });
    this.load();
    this.timer = setInterval(() => this.syncTtl(), 1000);
  },
  onUnload() {
    clearInterval(this.timer);
  },
  async load() {
    if (!this.data.code) {
      this.setData({ err: "缺少优惠券口令" });
      return;
    }
    try {
      const res = await request("/coupons/" + this.data.code);
      this.setData({ data: res.data, err: "" });
      this.syncTtl();
    } catch (e) {
      this.setData({ err: e.message || "优惠券不存在" });
    }
  },
  syncTtl() {
    const d = this.data.data;
    const mine = d && d.myCoupon;
    if (!mine || mine.status === "used" || mine.status === "held") {
      this.setData({ ttl: null });
      return;
    }
    this.setData({
      ttl: couponCountdown({
        ...mine,
        validHours: d.validHours,
        useEnd: d.useEnd,
      }),
    });
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
    if (d && d.claimable === false) {
      wx.showToast({ title: d.audience === "directed" ? "需后台发放" : "暂不可领取", icon: "none" });
      return;
    }
    try {
      const res = await request("/coupons/" + this.data.code + "/claim", "POST", {});
      this.setData({ data: res.data });
      this.syncTtl();
      this.goEnroll();
    } catch (e) {
      wx.showModal({ title: "领取失败", content: e.message, showCancel: false });
      this.load();
    }
  },
  goEnroll() {
    const id = this.data.data && this.data.data.scheduleId;
    const code = (this.data.data.myCoupon && this.data.data.myCoupon.code) || this.data.code;
    if (!id) {
      wx.switchTab({ url: "/pages/index/index" });
      return;
    }
    wx.navigateTo({ url: "/pages/enroll/enroll?id=" + id + "&coupon=" + code });
  },
  goTrip() {
    const id = this.data.data && this.data.data.scheduleId;
    if (!id) return;
    wx.navigateTo({ url: "/pages/schedule/schedule?id=" + id });
  },
});
