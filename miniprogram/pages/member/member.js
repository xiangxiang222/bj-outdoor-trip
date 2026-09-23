const { request, setAuth } = require("../../utils/request");

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
});
