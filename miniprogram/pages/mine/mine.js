const { request, setAuth, showError } = require("../../utils/request");
const app = getApp();
Page({
  data: { user: null, coupon: null },
  onShow() {
    this.setData({ user: app.globalData.user });
    this.loadCoupon();
  },
  async loadCoupon() {
    if (!app.globalData.token) {
      this.setData({ coupon: null });
      return;
    }
    try {
      const res = await request("/me/coupons");
      const rows = (res.data || []).filter((c) => c.status === "unused");
      this.setData({ coupon: rows[0] || null });
    } catch {
      this.setData({ coupon: null });
    }
  },
  goCoupon() {
    const c = this.data.coupon;
    if (c && c.campaignCode) wx.navigateTo({ url: "/pages/coupon/coupon?code=" + c.campaignCode });
  },
  goHome() {
    const u = this.data.user;
    if (u && u.id) wx.navigateTo({ url: "/pages/user/user?id=" + u.id });
  },
  goOfficial() {
    wx.navigateTo({ url: "/pages/official/official" });
  },
  login() { wx.navigateTo({ url: "/pages/login/login" }); },
  register() { wx.navigateTo({ url: "/pages/login/login?tab=register" }); },
  go(e) {
    const url = e.currentTarget.dataset.url;
    if (!app.globalData.token) {
      wx.navigateTo({ url: "/pages/login/login?redirect=" + encodeURIComponent(url) });
      return;
    }
    wx.navigateTo({ url });
  },
  async openMember() {
    if (!app.globalData.token) {
      wx.navigateTo({ url: "/pages/login/login?redirect=" + encodeURIComponent("/pages/member/member") });
      return;
    }
    if (app.globalData.user && app.globalData.user.isMember) {
      wx.navigateTo({ url: "/pages/member/member" });
      return;
    }
    try {
      const res = await request("/member/buy", "POST", {});
      setAuth(app.globalData.token, res.data.user);
      this.setData({ user: res.data.user });
      wx.navigateTo({ url: "/pages/member/member" });
    } catch (e) {
      showError("开通失败", e);
    }
  },
  out() { setAuth("", null); this.setData({ user: null }); },
  closeAccount() {
    wx.showModal({
      title: "注销账号",
      content: "注销后账号信息将被删除，未出行的报名会取消。同一手机号可以重新注册。",
      confirmColor: "#bc4749",
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await request("/me", "DELETE");
          setAuth("", null);
          this.setData({ user: null });
          wx.showToast({ title: "已注销", icon: "none" });
        } catch (e) {
          showError("注销失败", e);
        }
      },
    });
  },
});
