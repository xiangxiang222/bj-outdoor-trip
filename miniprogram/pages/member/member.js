const { request, setAuth, showError } = require("../../utils/request");
Page({
  data: { user: null },
  onShow() {
    if (!getApp().globalData.token) {
      wx.redirectTo({ url: "/pages/login/login?redirect=" + encodeURIComponent("/pages/member/member") });
      return;
    }
    this.refresh();
  },
  async refresh() {
    try {
      const me = await request("/me");
      setAuth(getApp().globalData.token, me.data);
      this.setData({ user: me.data });
    } catch (e) {
      this.setData({ user: getApp().globalData.user });
    }
  },
  async buy() {
    try {
      const res = await request("/member/buy", "POST", {});
      setAuth(getApp().globalData.token, res.data.user);
      this.setData({ user: res.data.user });
      wx.showToast({ title: "开通成功", icon: "none" });
    } catch (e) {
      showError("开通失败", e);
    }
  },
});
