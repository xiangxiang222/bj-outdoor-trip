const { request, setAuth, showError } = require("../../utils/request");
const { buyMembership } = require("../../utils/pay");
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
      const user = await buyMembership();
      setAuth(getApp().globalData.token, user);
      this.setData({ user });
      wx.showToast({ title: "开通成功", icon: "none" });
    } catch (e) {
      showError("开通失败", e);
    }
  },
});
