const { request, setAuth, showError } = require("../../utils/request");
const app = getApp();

Page({
  data: { user: {} },
  onShow() {
    this.setData({ user: app.globalData.user || {} });
    if (!app.globalData.token) {
      wx.navigateTo({ url: "/pages/login/login?redirect=" + encodeURIComponent("/pages/settings/settings") });
      return;
    }
    request("/me")
      .then((res) => {
        setAuth(app.globalData.token, res.data);
        this.setData({ user: res.data });
      })
      .catch(() => {});
  },
  go(e) {
    wx.navigateTo({ url: e.currentTarget.dataset.url });
  },
  out() {
    setAuth("", null);
    wx.switchTab({ url: "/pages/mine/mine" });
  },
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
          wx.switchTab({ url: "/pages/mine/mine" });
        } catch (e) {
          showError("注销失败", e);
        }
      },
    });
  },
});
