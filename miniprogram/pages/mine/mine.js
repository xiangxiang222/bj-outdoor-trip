const { request, setAuth, showError } = require("../../utils/request");
const { buyMembership } = require("../../utils/pay");
const { maskPhone } = require("../../utils/labels");
const app = getApp();
Page({
  data: {
    user: null,
    phone: "",
    nickHead: "友",
    coupon: null,
    leaderLabel: "领队申请",
    campusLabel: "校园认证",
    hub: { balance: 0, upcomingCount: 0, waitlistCount: 0, unpaidCount: 0, couponCount: 0 },
  },
  onShow() {
    const user = app.globalData.user;
    this.setData({
      user,
      phone: maskPhone(user && user.phone),
      nickHead: user && user.nickname ? user.nickname.slice(0, 1) : "友",
      leaderLabel: user && user.isLeader ? "领队已认证" : user && user.leaderStatus === "pending" ? "领队申请审核中" : "领队申请",
      campusLabel: user && user.isAlumni ? "校友已认证" : user && user.isStudent ? "学生已认证" : user && user.studentStatus === "pending" ? "校园认证审核中" : "校园认证",
    });
    this.loadHub();
  },
  async loadHub() {
    if (!app.globalData.token) {
      this.setData({ coupon: null, hub: { balance: 0, upcomingCount: 0, waitlistCount: 0, unpaidCount: 0, couponCount: 0 } });
      return;
    }
    try {
      const res = await request("/me/wallet");
      this.setData({ hub: res.data || {} });
    } catch {
      this.setData({ hub: { balance: (app.globalData.user && app.globalData.user.walletBalance) || 0, upcomingCount: 0, waitlistCount: 0, unpaidCount: 0, couponCount: 0 } });
    }
    try {
      const me = await request("/me");
      setAuth(app.globalData.token, me.data);
      this.setData({
        user: me.data,
        phone: maskPhone(me.data && me.data.phone),
        nickHead: me.data && me.data.nickname ? me.data.nickname.slice(0, 1) : "友",
      });
    } catch {
      /* keep cached */
    }
  },
  goHome() {
    const u = this.data.user;
    if (u && u.id) wx.navigateTo({ url: "/pages/user/user?id=" + u.id });
  },
  goOfficial() {
    wx.navigateTo({ url: "/pages/official/official" });
  },
  goRoutes() {
    getApp().globalData.homeView = "routes";
    wx.switchTab({ url: "/pages/index/index" });
  },
  goOrders() {
    wx.switchTab({ url: "/pages/orders/orders" });
  },
  login() {
    wx.navigateTo({ url: "/pages/login/login" });
  },
  register() {
    wx.navigateTo({ url: "/pages/login/login?tab=register" });
  },
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
      const user = await buyMembership();
      setAuth(app.globalData.token, user);
      this.setData({ user });
      wx.navigateTo({ url: "/pages/member/member" });
    } catch (e) {
      showError("开通失败", e);
    }
  },
});
