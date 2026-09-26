const { request, setAuth, showError } = require("../../utils/request");
const { maskPhone } = require("../../utils/labels");
const appearance = require("../../utils/appearance");
const app = getApp();

function uploadAvatar(filePath) {
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: app.globalData.baseUrl + "/api/upload",
      filePath,
      name: "file",
      header: { Authorization: app.globalData.token ? "Bearer " + app.globalData.token : "" },
      success(res) {
        try {
          const data = JSON.parse(res.data || "{}");
          if (data.ok && data.data && data.data.url) {
            resolve(data.data.url);
            return;
          }
          reject(new Error((data && data.message) || "上传失败"));
        } catch {
          reject(new Error("上传失败"));
        }
      },
      fail(err) {
        reject(new Error((err && err.errMsg) || "上传失败"));
      },
    });
  });
}
Page({
  data: {
    user: null,
    phone: "",
    nickHead: "友",
    coupon: null,
    leaderLabel: "领队申请",
    campusLabel: "校园认证",
    hub: { balance: 0, departCount: 0, upcomingCount: 0, waitlistCount: 0, unpaidCount: 0, reviewCount: 0, refundCount: 0, unreadCount: 0, couponCount: 0, couponExpireHint: "" },
    picker: false,
    defaults: [],
    iconBase: app.globalData.baseUrl + "/static/mine/",
    dark: false,
  },
  onShow() {
    const user = app.globalData.user;
    this.setData({
      user,
      phone: maskPhone(user && user.phone),
      nickHead: user && user.nickname ? user.nickname.slice(0, 1) : "友",
      leaderLabel: user && user.isLeader ? "领队已认证" : user && user.leaderStatus === "pending" ? "领队申请审核中" : "领队申请",
      campusLabel: user && user.isAlumni ? "校友已认证" : user && user.isStudent ? "学生已认证" : user && user.studentStatus === "pending" ? "校园认证审核中" : "校园认证",
      dark: appearance.isDark(),
      iconBase: app.globalData.baseUrl + "/static/mine/",
    });
    this.loadHub();
  },
  async loadHub() {
    if (!app.globalData.token) {
      this.setData({ coupon: null, hub: { balance: 0, departCount: 0, upcomingCount: 0, waitlistCount: 0, unpaidCount: 0, reviewCount: 0, refundCount: 0, unreadCount: 0, couponCount: 0, couponExpireHint: "" } });
      return;
    }
    try {
      const res = await request("/me/wallet");
      this.setData({ hub: res.data || {} });
    } catch {
      this.setData({ hub: { balance: (app.globalData.user && app.globalData.user.walletBalance) || 0, departCount: 0, upcomingCount: 0, waitlistCount: 0, unpaidCount: 0, reviewCount: 0, refundCount: 0, unreadCount: 0, couponCount: 0, couponExpireHint: "" } });
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
  async openAvatar() {
    if (!app.globalData.token) {
      wx.navigateTo({ url: "/pages/login/login?redirect=" + encodeURIComponent("/pages/mine/mine") });
      return;
    }
    this.setData({ picker: true });
    if (this.data.defaults.length) return;
    try {
      const res = await request("/avatars/defaults");
      this.setData({ defaults: res.data || [] });
    } catch (e) {
      showError("加载失败", e);
    }
  },
  closeAvatar() {
    this.setData({ picker: false });
  },
  noop() {},
  async pickDefault(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    await this.saveAvatar(url);
  },
  shoot() {
    this.pickImage(["camera"]);
  },
  album() {
    this.pickImage(["album"]);
  },
  pickImage(sourceType) {
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sourceType,
      sizeType: ["compressed"],
      success: async (res) => {
        const file = (res.tempFiles || [])[0];
        if (!file) return;
        wx.showLoading({ title: "上传中", mask: true });
        try {
          const url = await uploadAvatar(file.tempFilePath);
          await this.saveAvatar(url);
        } catch (e) {
          showError("上传失败", e);
        } finally {
          wx.hideLoading();
        }
      },
    });
  },
  async saveAvatar(url) {
    try {
      const res = await request("/me", "PUT", { avatar: url });
      setAuth(app.globalData.token, res.data);
      this.setData({
        user: res.data,
        picker: false,
        nickHead: res.data && res.data.nickname ? res.data.nickname.slice(0, 1) : "友",
      });
    } catch (e) {
      showError("保存失败", e);
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
  goOrders(e) {
    const tab = (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.tab) || "depart";
    app.globalData.ordersTab = tab;
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
  openMember() {
    if (!app.globalData.token) {
      wx.navigateTo({ url: "/pages/login/login?redirect=" + encodeURIComponent("/pages/member/member") });
      return;
    }
    wx.navigateTo({ url: "/pages/member/member" });
  },
});
