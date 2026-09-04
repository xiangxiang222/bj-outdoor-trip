const { request } = require("../../utils/request");

Page({
  data: { list: [] },
  onShow() {
    request("/schedules?channel=activity")
      .then((r) => this.setData({ list: (r && r.data) || [] }))
      .catch(() => this.setData({ list: [] }));
  },
  go(e) {
    wx.navigateTo({ url: "/pages/schedule/schedule?id=" + e.currentTarget.dataset.id });
  },
  goPublish() {
    const app = getApp();
    const url = "/pages/publish/publish?channel=activity";
    if (!app.globalData.token) {
      wx.navigateTo({ url: "/pages/login/login?redirect=" + encodeURIComponent(url) });
      return;
    }
    wx.navigateTo({ url });
  },
});
