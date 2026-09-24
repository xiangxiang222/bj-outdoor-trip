const { request, setAuth, showError } = require("../../utils/request");
const { maskPhone } = require("../../utils/labels");
const app = getApp();

Page({
  data: { user: {}, phone: "", nickHead: "友" },
  onShow() {
    const cached = app.globalData.user || {};
    const nick = cached.nickname || "";
    this.setData({
      user: cached,
      phone: maskPhone(cached.phone),
      nickHead: nick ? nick.slice(0, 1) : "友",
    });
    if (!app.globalData.token) {
      wx.navigateTo({ url: "/pages/login/login?redirect=" + encodeURIComponent("/pages/settings/settings") });
      return;
    }
    request("/me")
      .then((res) => {
        setAuth(app.globalData.token, res.data);
        const user = res.data || {};
        const nick = user.nickname || "";
        this.setData({
          user,
          phone: maskPhone(user.phone),
          nickHead: nick ? nick.slice(0, 1) : "友",
        });
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
